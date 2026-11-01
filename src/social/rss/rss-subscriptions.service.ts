import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SocialDb } from '../social.select';
import { socialTransaction } from '../social-transaction';
import { parseFeed } from './feed-parser';
import type { ParsedFeed } from './feed-parser';
import { normalizeFeedUrl, SafeFeedFetcher } from './safe-feed-fetcher';

const COOLDOWN = 5 * 60_000;
const subscriptionSelect = {
  id: true,
  url: true,
  title: true,
  lastFetchedAt: true,
  nextRefreshAt: true,
  lastError: true,
  createdAt: true,
} satisfies Prisma.RssSubscriptionSelect;

@Injectable()
export class RssSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: SafeFeedFetcher,
  ) {}

  list(userId: string) {
    return this.prisma.rssSubscription.findMany({
      where: { userId },
      select: subscriptionSelect,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async subscribe(userId: string, rawUrl: string) {
    const url = normalizeFeedUrl(rawUrl).href;
    const existing = await this.prisma.rssSubscription.findUnique({
      where: { userId_url: { userId, url } },
      select: subscriptionSelect,
    });
    if (existing) return existing;
    if ((await this.prisma.rssSubscription.count({ where: { userId } })) >= 50)
      throw new UnprocessableEntityException(
        'A maximum of 50 RSS subscriptions is supported',
      );
    const fetched = await this.fetcher.fetch(url);
    const parsed = parseFeed(fetched.xml, fetched.finalUrl);
    try {
      return await socialTransaction(this.prisma, async (tx) => {
        if ((await tx.rssSubscription.count({ where: { userId } })) >= 50)
          throw new UnprocessableEntityException(
            'A maximum of 50 RSS subscriptions is supported',
          );
        const subscription = await tx.rssSubscription.create({
          data: {
            userId,
            url,
            title: parsed.title,
            nextRefreshAt: new Date(Date.now() + COOLDOWN),
          },
          select: subscriptionSelect,
        });
        await this.importEntries(tx, subscription.id, parsed);
        return subscription;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const subscription = await this.prisma.rssSubscription.findUnique({
          where: { userId_url: { userId, url } },
          select: subscriptionSelect,
        });
        if (subscription) return subscription;
      }
      throw error;
    }
  }

  async refresh(userId: string, id: string) {
    const now = new Date();
    const claimed = await this.prisma.rssSubscription.updateMany({
      where: { id, userId, nextRefreshAt: { lte: now } },
      data: { nextRefreshAt: new Date(now.getTime() + COOLDOWN) },
    });
    if (!claimed.count) {
      const own = await this.prisma.rssSubscription.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!own) throw new NotFoundException('RSS subscription not found');
      throw new HttpException(
        'This feed can be refreshed once every five minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const subscription = await this.prisma.rssSubscription.findFirst({
      where: { id, userId },
      select: { url: true },
    });
    if (!subscription)
      throw new NotFoundException('RSS subscription not found');
    let parsed: ParsedFeed;
    try {
      const fetched = await this.fetcher.fetch(subscription.url);
      parsed = parseFeed(fetched.xml, fetched.finalUrl);
    } catch {
      await this.prisma.rssSubscription.updateMany({
        where: { id, userId },
        data: { lastError: 'Feed could not be refreshed' },
      });
      throw new BadGatewayException(
        'Feed could not be refreshed; previously imported entries remain available',
      );
    }
    return socialTransaction(this.prisma, async (tx) => {
      const current = await tx.rssSubscription.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!current) throw new NotFoundException('RSS subscription not found');
      await this.importEntries(tx, id, parsed);
      return tx.rssSubscription.update({
        where: { id },
        data: {
          title: parsed.title,
          lastFetchedAt: new Date(),
          lastError: null,
        },
        select: subscriptionSelect,
      });
    });
  }

  async unsubscribe(userId: string, id: string) {
    await this.prisma.rssSubscription.deleteMany({ where: { id, userId } });
    return { subscribed: false };
  }

  async markRead(userId: string, id: string) {
    const updated = await this.prisma.rssEntry.updateMany({
      where: { id, subscription: { userId } },
      data: { readAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException('RSS entry not found');
    return { read: true };
  }

  async listEntries(
    userId: string,
    where: Prisma.RssEntryWhereInput = {},
    take = 50,
  ) {
    const entries = await this.prisma.rssEntry.findMany({
      where: { AND: [{ subscription: { userId } }, where] },
      select: {
        id: true,
        title: true,
        summary: true,
        url: true,
        tags: true,
        publishedAt: true,
        readAt: true,
        subscription: { select: { id: true, title: true } },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return entries.map((entry) => ({
      ...entry,
      type: 'rss' as const,
      createdAt: entry.publishedAt,
    }));
  }

  private async importEntries(
    tx: SocialDb,
    subscriptionId: string,
    parsed: ParsedFeed,
  ) {
    // Stable GUID hashes deduplicate refreshes. Existing read state remains intact.
    await tx.rssEntry.createMany({
      data: parsed.entries.map((entry) => ({ ...entry, subscriptionId })),
      skipDuplicates: true,
    });
    const retained = await tx.rssEntry.findMany({
      where: { subscriptionId },
      select: { id: true },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    await tx.rssEntry.deleteMany({
      where: {
        subscriptionId,
        id: { notIn: retained.map((entry) => entry.id) },
      },
    });
  }
}
