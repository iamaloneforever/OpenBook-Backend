import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { FeedMode } from './dto/social.dto';
import type { FeedQueryDto, SocialPageDto } from './dto/social.dto';
import { FeedCursorService } from './feed-cursor.service';
import {
  activityWeight,
  addInterest,
  emptyInterests,
  rankPosts,
} from './feed-ranking';
import { PostsService } from './posts.service';
import { RssSubscriptionsService } from './rss/rss-subscriptions.service';
import { compareFeedItems, toRankingPost } from './feed-item';
import type { FeedItem } from './feed-item';
import {
  requireVisiblePost,
  requireVisibleProfile,
  visiblePostWhere,
  visibleProfileWhere,
} from './social-policy';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly cursors: FeedCursorService,
    private readonly rss: RssSubscriptionsService,
  ) {}

  async get(userId: string, query: FeedQueryDto) {
    const profile = await this.prisma.socialProfile.findUnique({
      where: { userId },
      select: { personalizeFeed: true, isPublic: true },
    });
    const mode =
      query.mode === FeedMode.FOR_YOU &&
      (!profile?.isPublic || !profile.personalizeFeed)
        ? FeedMode.RECENT
        : query.mode;
    const scope = `feed:${mode}:${userId}`;
    if (mode !== FeedMode.FOR_YOU) {
      return this.chronological(
        {
          parentId: null,
          ...(mode === FeedMode.FOLLOWING
            ? {
                OR: [
                  { authorId: userId },
                  { author: { followers: { some: { followerId: userId } } } },
                ],
              }
            : {}),
        },
        userId,
        query,
        scope,
        mode,
        true,
      );
    }

    let cursor = query.cursor
      ? this.cursors.decode(query.cursor, scope)
      : undefined;
    if (cursor && !cursor.remaining)
      throw new BadRequestException('Invalid feed cursor');
    if (!cursor) {
      const now = new Date();
      const interests = await this.interests(userId, now);
      const since = new Date(now.getTime() - 30 * 86_400_000);
      const base: Prisma.SocialPostWhereInput = {
        parentId: null,
        createdAt: { gte: since, lte: now },
      };
      const topTags = [...interests.tags]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag]) => tag);
      // Bounded discovery plus dedicated follow/interest slots avoids global-volume starvation.
      const groups = await Promise.all([
        this.posts.list(base, userId, { take: 200 }),
        this.posts.list(
          { ...base, author: { followers: { some: { followerId: userId } } } },
          userId,
          { take: 50 },
        ),
        topTags.length
          ? this.posts.list({ ...base, tags: { hasSome: topTags } }, userId, {
              take: 50,
            })
          : [],
      ]);
      const rssEntries = await this.rss.listEntries(
        userId,
        { publishedAt: { gte: since, lte: now }, importedAt: { lte: now } },
        100,
      );
      const candidates: FeedItem[] = [
        ...new Map(groups.flat().map((post) => [post.id, post])).values(),
        ...rssEntries,
      ];
      cursor = {
        scope,
        issuedAt: now.getTime(),
        asOf: now.toISOString(),
        remaining: rankPosts(
          candidates.map(toRankingPost),
          interests,
          now,
        ).slice(0, 300),
      };
    }

    // Recheck visibility on every page, including profiles disabled or blocked after ranking.
    const [socialRows, rssRows] = await Promise.all([
      this.posts.list({ id: { in: cursor.remaining } }, userId, { take: 300 }),
      this.rss.listEntries(userId, { id: { in: cursor.remaining } }, 300),
    ]);
    const available: FeedItem[] = [...socialRows, ...rssRows];
    const byId = new Map(available.map((item) => [item.id, item]));
    const ids = cursor.remaining!.filter((id) => byId.has(id));
    const data = ids.slice(0, query.limit).map((id) => byId.get(id)!);
    const remaining = ids.slice(query.limit);
    return {
      data,
      nextCursor: remaining.length
        ? this.cursors.encode({ ...cursor, remaining })
        : null,
      mode,
    };
  }

  async profilePosts(
    handle: string,
    viewerId: string | undefined,
    query: SocialPageDto,
  ) {
    const profile = await requireVisibleProfile(this.prisma, handle, viewerId);
    return this.chronological(
      { authorId: profile.userId, parentId: null },
      viewerId,
      query,
      `profile:${profile.userId}:${viewerId ?? 'public'}`,
      FeedMode.RECENT,
    );
  }

  async replies(id: string, userId: string, query: SocialPageDto) {
    await requireVisiblePost(this.prisma, id, userId);
    return this.chronological(
      { parentId: id },
      userId,
      query,
      `replies:${id}:${userId}`,
      FeedMode.RECENT,
    );
  }

  private async chronological(
    where: Prisma.SocialPostWhereInput,
    viewerId: string | undefined,
    query: SocialPageDto,
    scope: string,
    mode: FeedMode,
    includeRss = false,
  ) {
    const cursor = query.cursor
      ? this.cursors.decode(query.cursor, scope)
      : undefined;
    if (cursor && !cursor.before)
      throw new BadRequestException('Invalid feed cursor');
    const asOf = cursor?.asOf ?? new Date().toISOString();
    const before = cursor?.before;
    const socialRows = await this.posts.list(
      {
        AND: [
          where,
          { createdAt: { lte: new Date(asOf) } },
          ...(before
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(before.createdAt) } },
                    {
                      createdAt: new Date(before.createdAt),
                      id: { lt: before.id },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      viewerId,
      { take: query.limit + 1 },
    );
    const rssRows =
      includeRss && viewerId
        ? await this.rss.listEntries(
            viewerId,
            {
              AND: [
                {
                  publishedAt: { lte: new Date(asOf) },
                  importedAt: { lte: new Date(asOf) },
                },
                ...(before
                  ? [
                      {
                        OR: [
                          { publishedAt: { lt: new Date(before.createdAt) } },
                          {
                            publishedAt: new Date(before.createdAt),
                            id: { lt: before.id },
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            query.limit + 1,
          )
        : [];
    const rows: FeedItem[] = [...socialRows, ...rssRows].sort(compareFeedItems);
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);
    const last = data.at(-1);
    const nextCursor =
      hasMore && last
        ? this.cursors.encode({
            scope,
            issuedAt: cursor?.issuedAt ?? Date.now(),
            asOf,
            before: { createdAt: last.createdAt.toISOString(), id: last.id },
          })
        : null;
    return { data, nextCursor, mode };
  }

  private async interests(userId: string, now: Date) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const recent = { gte: since, lte: now };
    const visible = visiblePostWhere(userId);
    const postInterest = { id: true, authorId: true, tags: true } as const;
    const [
      follows,
      likes,
      views,
      ownPosts,
      reading,
      ratings,
      subscriptions,
      readEntries,
    ] = await Promise.all([
      this.prisma.socialFollow.findMany({
        where: {
          followerId: userId,
          following: visibleProfileWhere(userId),
          createdAt: { lte: now },
        },
        select: { followingId: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.socialLike.findMany({
        where: { userId, createdAt: recent, post: visible },
        select: { createdAt: true, post: { select: postInterest } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.socialPostView.findMany({
        where: { userId, updatedAt: recent, post: visible },
        select: {
          updatedAt: true,
          postId: true,
          post: { select: postInterest },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      this.prisma.socialPost.findMany({
        where: { authorId: userId, createdAt: recent },
        select: { tags: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.bookProgress.findMany({
        where: { userId, updatedAt: recent },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          updatedAt: true,
          book: {
            select: {
              tags: { take: 50, select: { tag: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.rating.findMany({
        where: { userId, value: { gte: 4 }, createdAt: recent },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          createdAt: true,
          book: {
            select: {
              tags: { take: 50, select: { tag: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.rssSubscription.findMany({
        where: { userId },
        select: { id: true },
        take: 50,
      }),
      this.prisma.rssEntry.findMany({
        where: { subscription: { userId }, readAt: recent },
        select: { id: true, tags: true, readAt: true, subscriptionId: true },
        orderBy: { readAt: 'desc' },
        take: 100,
      }),
    ]);
    const interests = emptyInterests();
    interests.following = new Set(follows.map((follow) => follow.followingId));
    for (const subscription of subscriptions)
      interests.following.add(`rss:${subscription.id}`);
    for (const entry of readEntries) {
      interests.seen.add(entry.id);
      const weight = activityWeight(entry.readAt!, now, 1);
      addInterest(interests.authors, `rss:${entry.subscriptionId}`, weight);
      entry.tags.forEach((tag) => addInterest(interests.tags, tag, weight));
    }
    for (const like of likes) {
      interests.seen.add(like.post.id);
      const weight = activityWeight(like.createdAt, now, 3);
      addInterest(interests.authors, like.post.authorId, weight);
      like.post.tags.forEach((tag) => addInterest(interests.tags, tag, weight));
    }
    for (const view of views) {
      const weight = activityWeight(view.updatedAt, now, 0.5);
      addInterest(interests.authors, view.post.authorId, weight);
      view.post.tags.forEach((tag) => addInterest(interests.tags, tag, weight));
      interests.seen.add(view.postId);
    }
    for (const post of ownPosts) {
      post.tags.forEach((tag) =>
        addInterest(
          interests.tags,
          tag,
          activityWeight(post.createdAt, now, 2),
        ),
      );
    }
    for (const item of [
      ...reading.map((entry) => ({ ...entry, at: entry.updatedAt })),
      ...ratings.map((entry) => ({ ...entry, at: entry.createdAt })),
    ]) {
      for (const { tag } of item.book.tags) {
        addInterest(
          interests.tags,
          tag.name.normalize('NFKC').toLowerCase(),
          activityWeight(item.at, now, 2),
        );
      }
    }
    return interests;
  }
}
