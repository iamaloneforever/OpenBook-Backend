import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatRateLimitService } from './chat-rate-limit.service';
import type { ChatRedisService } from './chat-redis.service';

describe('chat rate limits', () => {
  afterEach(() => vi.useRealTimers());

  it('shares a budget across calls for the same account while isolating other accounts', async () => {
    const limits = new ChatRateLimitService({
      enabled: false,
    } as ChatRedisService);
    await limits.consume('send', 'alice', 2);
    await limits.consume('send', 'alice', 2);
    await expect(limits.consume('send', 'alice', 2)).rejects.toThrow(
      'Chat rate limit exceeded',
    );
    await expect(limits.consume('send', 'bob', 2)).resolves.toBeUndefined();
  });
  it('starts a fresh window after expiry', async () => {
    vi.useFakeTimers();
    const limits = new ChatRateLimitService({
      enabled: false,
    } as ChatRedisService);
    await limits.consume('send', 'alice', 1);
    vi.advanceTimersByTime(60000);
    await expect(limits.consume('send', 'alice', 1)).resolves.toBeUndefined();
  });
  it('uses a shared Redis counter without storing the raw account identity', async () => {
    const consume = vi.fn().mockResolvedValue(3);
    const limits = new ChatRateLimitService({
      enabled: true,
      consume,
    } as unknown as ChatRedisService);
    await expect(
      limits.consume('send', 'private-account-id', 2),
    ).rejects.toThrow('Chat rate limit exceeded');
    const args = consume.mock.calls[0] as unknown[];
    expect(String(args[0])).not.toContain('private-account-id');
  });
  it('does not fall back to per-process counters when configured Redis is unavailable', async () => {
    const consume = vi.fn().mockRejectedValue(new Error('Unavailable'));
    const limits = new ChatRateLimitService({
      enabled: true,
      consume,
    } as unknown as ChatRedisService);
    await expect(limits.consume('send', 'alice', 60)).rejects.toThrow(
      'Unavailable',
    );
  });
});
