import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatRedisService } from './chat-redis.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { chatBlocked, chatMemberWhere, chatPeer } from './chat-policy';
import type { ChatPresence } from './chat-presence.types';

interface ConnectionLease {
  userId: string;
  id: string;
  tokenExpires: number;
  timer: ReturnType<typeof setInterval>;
  pending: boolean;
  stopped: boolean;
}

@Injectable()
export class ChatPresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatPresenceService.name);
  private readonly leases = new Map<string, ConnectionLease>();
  private readonly local = new Map<string, Map<string, number>>();
  private warnedAt = 0;
  private closing = false;
  private readonly updates = new Set<Promise<void>>();

  private track(operation: Promise<void>) {
    this.updates.add(operation);
    void operation.then(
      () => this.updates.delete(operation),
      () => this.updates.delete(operation),
    );
    return operation;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: ChatRedisService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  private async state(
    userId: string,
    lease: string,
    action: 'get' | 'touch' | 'remove',
    ttl = 45000,
  ): Promise<ChatPresence> {
    if (this.redis.enabled)
      return this.redis.presence(userId, lease, action, ttl);
    const now = Date.now();
    const entries = this.local.get(userId) ?? new Map<string, number>();
    for (const [id, expires] of entries) if (expires <= now) entries.delete(id);
    if (action === 'touch' && ttl > 0) entries.set(lease, now + ttl);
    if (action === 'remove' || ttl <= 0) entries.delete(lease);
    if (entries.size) this.local.set(userId, entries);
    else this.local.delete(userId);
    return {
      online: entries.size > 0,
      expiresAt: entries.size ? Math.max(...entries.values()) : null,
      observedAt: now,
    };
  }

  private async announce(userId: string, state: ChatPresence) {
    const [conversations, blocks] = await Promise.all([
      this.prisma.chatConversation.findMany({
        where: chatMemberWhere(userId),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 200,
        select: { firstUserId: true, secondUserId: true },
      }),
      this.prisma.socialBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const blocked = new Set(
      blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
    );
    const peers = conversations
      .map((conversation) =>
        conversation.firstUserId === userId
          ? conversation.secondUserId
          : conversation.firstUserId,
      )
      .filter((peer) => !blocked.has(peer));
    this.realtime.presence(peers, { userId, ...state });
  }

  private warn() {
    if (Date.now() - this.warnedAt > 30000) {
      this.warnedAt = Date.now();
      this.logger.warn('Chat presence update unavailable');
    }
  }

  private async pulse(entry: ConnectionLease) {
    if (entry.stopped || entry.pending) return;
    entry.pending = true;
    try {
      const state = await this.state(
        entry.userId,
        entry.id,
        'touch',
        Math.min(45000, entry.tokenExpires - Date.now()),
      );
      if (entry.stopped) {
        await this.state(entry.userId, entry.id, 'remove');
        return;
      }
      await this.announce(entry.userId, state);
    } catch {
      this.warn();
    } finally {
      entry.pending = false;
    }
  }

  async connect(userId: string, id: string, tokenExpires: number) {
    if (this.closing || this.leases.has(id)) return;
    const timer = setInterval(() => {
      const entry = this.leases.get(id);
      if (entry) void this.track(this.pulse(entry));
    }, 15000);
    timer.unref();
    const entry: ConnectionLease = {
      userId,
      id,
      tokenExpires,
      timer,
      pending: false,
      stopped: false,
    };
    this.leases.set(id, entry);
    await this.track(this.pulse(entry));
  }

  disconnect(id: string) {
    return this.track(this.release(id));
  }

  private async release(id: string) {
    const entry = this.leases.get(id);
    if (!entry) return;
    entry.stopped = true;
    clearInterval(entry.timer);
    this.leases.delete(id);
    try {
      await this.announce(
        entry.userId,
        await this.state(entry.userId, id, 'remove'),
      );
    } catch {
      this.warn();
    }
  }

  async peer(userId: string, conversationId: string) {
    const peer = await chatPeer(this.prisma, userId, conversationId);
    if (await chatBlocked(this.prisma, userId, peer))
      return {
        userId: peer,
        online: false,
        expiresAt: null,
        observedAt: Date.now(),
      };
    return { userId: peer, ...(await this.state(peer, '', 'get')) };
  }

  async typing(userId: string, conversationId: string, typing: boolean) {
    const peer = await chatPeer(this.prisma, userId, conversationId);
    if (await chatBlocked(this.prisma, userId, peer))
      throw new ForbiddenException('Messaging is unavailable');
    const update = {
      userId,
      conversationId,
      typing,
      expiresAt: Date.now() + 5000,
    };
    this.realtime.typing(peer, update);
    return update;
  }

  async onModuleDestroy() {
    this.closing = true;
    await Promise.all([...this.leases.keys()].map((id) => this.disconnect(id)));
    await Promise.allSettled([...this.updates]);
  }
}
