import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { createHash } from 'node:crypto';
import type { ChatPresence } from './chat-presence.types';

const newRedisConnection = (url: string) =>
  createClient({
    url,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 1000,
    commandOptions: { timeout: 3000 },
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries: number) =>
        retries >= 3 ? false : 100 * 2 ** retries,
    },
  });
type RedisConnection = ReturnType<typeof newRedisConnection>;

@Injectable()
export class ChatRedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(ChatRedisService.name);
  private publisher?: RedisConnection;
  private subscriber?: RedisConnection;
  private connection?: Promise<void>;
  adapter?: ReturnType<typeof createAdapter>;

  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return Boolean(this.config.get<string>('CHAT_REDIS_URL'));
  }

  connect(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.connection ??= this.open();
    return this.connection;
  }

  private async open() {
    const publisher = newRedisConnection(
      this.config.getOrThrow<string>('CHAT_REDIS_URL'),
    );
    const subscriber = newRedisConnection(
      this.config.getOrThrow<string>('CHAT_REDIS_URL'),
    );
    this.publisher = publisher;
    this.subscriber = subscriber;
    for (const client of [publisher, subscriber])
      client.on('error', () =>
        this.logger.warn('Chat Redis connection unavailable'),
      );
    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
      this.adapter = createAdapter(
        this.adapterClient(publisher),
        this.adapterClient(subscriber),
        {
          key: 'openbook:chat:socket.io',
        },
      );
    } catch {
      this.closeConnections();
      throw new Error('Chat Redis could not connect');
    }
  }

  private adapterClient(client: RedisConnection) {
    // The adapter intentionally does not await pub/sub operations. Handle their
    // failures here so a disconnect cannot become an unhandled rejection.
    const complete = (operation: Promise<unknown>) =>
      operation.catch(() => {
        this.logger.warn(
          'Chat live delivery unavailable; recover messages from history',
        );
      });
    return {
      publish: (...args: Parameters<RedisConnection['publish']>) =>
        client.publish(...args).catch(() => {
          this.logger.warn(
            'Chat live delivery unavailable; recover messages from history',
          );
          return 0;
        }),
      pSubscribe: (...args: Parameters<RedisConnection['pSubscribe']>) =>
        complete(client.pSubscribe(...args)),
      pUnsubscribe: (...args: Parameters<RedisConnection['pUnsubscribe']>) =>
        complete(client.pUnsubscribe(...args)),
      subscribe: (...args: Parameters<RedisConnection['subscribe']>) =>
        complete(client.subscribe(...args)),
      unsubscribe: (...args: Parameters<RedisConnection['unsubscribe']>) =>
        complete(client.unsubscribe(...args)),
      sendCommand: (...args: Parameters<RedisConnection['sendCommand']>) =>
        client.sendCommand(...args),
      on: (...args: Parameters<RedisConnection['on']>) => client.on(...args),
      off: (...args: Parameters<RedisConnection['off']>) => client.off(...args),
    };
  }

  async consume(key: string, windowMs: number): Promise<number> {
    if (!this.publisher?.isReady)
      throw new ServiceUnavailableException(
        'Chat rate limiting is unavailable',
      );
    try {
      const count = await this.publisher.eval(
        "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end; return n",
        { keys: [key], arguments: [String(windowMs)] },
      );
      if (typeof count !== 'number') throw new Error();
      return count;
    } catch {
      throw new ServiceUnavailableException(
        'Chat rate limiting is unavailable',
      );
    }
  }

  async presence(
    userId: string,
    lease: string,
    action: 'get' | 'touch' | 'remove',
    ttl: number,
  ): Promise<ChatPresence> {
    if (!this.publisher?.isReady)
      throw new ServiceUnavailableException('Chat presence is unavailable');
    try {
      const result: unknown = await this.publisher.eval(
        "local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now); if ARGV[1]=='touch' and tonumber(ARGV[3])>0 then redis.call('ZADD',KEYS[1],now+tonumber(ARGV[3]),ARGV[2]); redis.call('PEXPIRE',KEYS[1],60000); elseif ARGV[1]=='remove' or tonumber(ARGV[3])<=0 then redis.call('ZREM',KEYS[1],ARGV[2]); end; local last=redis.call('ZREVRANGE',KEYS[1],0,0,'WITHSCORES'); return {redis.call('ZCARD',KEYS[1]),last[2] or '0',now}",
        {
          keys: [
            `openbook:chat:presence:${createHash('sha256').update(userId).digest('hex')}`,
          ],
          arguments: [action, lease, String(Math.max(0, ttl))],
        },
      );
      if (!Array.isArray(result) || result.length !== 3) throw new Error();
      const [count, expires, observed] = result.map(Number);
      if (![count, expires, observed].every(Number.isFinite)) throw new Error();
      return {
        online: count > 0,
        expiresAt: count > 0 ? expires : null,
        observedAt: observed,
      };
    } catch {
      throw new ServiceUnavailableException('Chat presence is unavailable');
    }
  }

  private closeConnections() {
    for (const client of [this.publisher, this.subscriber])
      if (client?.isOpen) client.destroy();
  }

  async onApplicationShutdown() {
    await Promise.all(
      [this.publisher, this.subscriber].map(async (client) => {
        if (!client?.isOpen) return;
        try {
          await client.close();
        } catch {
          if (client.isOpen) client.destroy();
        }
      }),
    );
  }
}
