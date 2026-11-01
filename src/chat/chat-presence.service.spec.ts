import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { ChatRedisService } from './chat-redis.service';
import type { ChatRealtimeService } from './chat-realtime.service';
import { ChatPresenceService } from './chat-presence.service';

function setup() {
  const prisma = {
    chatConversation: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ firstUserId: 'alice', secondUserId: 'bob' }),
      findMany: vi.fn().mockResolvedValue([
        { firstUserId: 'alice', secondUserId: 'bob' },
        { firstUserId: 'alice', secondUserId: 'blocked' },
      ]),
    },
    socialBlock: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi
        .fn()
        .mockResolvedValue([{ blockerId: 'blocked', blockedId: 'alice' }]),
    },
  };
  const realtime = { presence: vi.fn(), typing: vi.fn() };
  const service = new ChatPresenceService(
    prisma as unknown as PrismaService,
    { enabled: false } as ChatRedisService,
    realtime as unknown as ChatRealtimeService,
  );
  return { prisma, realtime, service };
}

describe('private expiring online presence', () => {
  afterEach(() => vi.useRealTimers());
  it('stays online until the last authenticated device disconnects', async () => {
    const { service, realtime } = setup();
    await service.connect('alice', 'device1', Date.now() + 60000);
    await service.connect('alice', 'device2', Date.now() + 60000);
    expect((await service.peer('bob', 'conversation')).online).toBe(true);
    await service.disconnect('device1');
    expect((await service.peer('bob', 'conversation')).online).toBe(true);
    await service.disconnect('device2');
    expect((await service.peer('bob', 'conversation')).online).toBe(false);
    expect(
      realtime.presence.mock.calls.every(
        (call) => JSON.stringify(call[0]) === '["bob"]',
      ),
    ).toBe(true);
    await service.onModuleDestroy();
  });
  it('expires abandoned leases without exposing a lasting online status', async () => {
    vi.useFakeTimers();
    const { service } = setup();
    await service.connect('alice', 'device', Date.now() + 60000);
    vi.clearAllTimers();
    vi.advanceTimersByTime(45001);
    expect((await service.peer('bob', 'conversation')).online).toBe(false);
    await service.onModuleDestroy();
  });
  it('masks blocked presence and denies non-participant queries', async () => {
    const { service, prisma } = setup();
    await service.connect('alice', 'device', Date.now() + 60000);
    prisma.socialBlock.count.mockResolvedValue(1);
    expect((await service.peer('bob', 'conversation')).online).toBe(false);
    prisma.chatConversation.findFirst.mockResolvedValue(null);
    await expect(service.peer('outsider', 'conversation')).rejects.toThrow(
      'Conversation not found',
    );
    await service.onModuleDestroy();
  });
  it('sends expiring typing indicators only to the peer and honors blocks', async () => {
    const { service, prisma, realtime } = setup();
    const result = await service.typing('alice', 'conversation', true);
    expect(realtime.typing).toHaveBeenCalledWith(
      'bob',
      expect.objectContaining({ typing: true, userId: 'alice' }),
    );
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    prisma.socialBlock.count.mockResolvedValue(1);
    await expect(service.typing('alice', 'conversation', true)).rejects.toThrow(
      'Messaging is unavailable',
    );
  });
});
