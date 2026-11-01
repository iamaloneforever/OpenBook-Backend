import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ChatRedisService } from './chat-redis.service';

@Injectable()
export class ChatRateLimitService {
  private readonly windows = new Map<
    string,
    { count: number; expires: number }
  >();
  constructor(private readonly redis: ChatRedisService) {}

  async consume(
    scope: string,
    identity: string,
    limit: number,
    windowMs = 60000,
  ) {
    const key = `openbook:chat:limit:${scope}:${createHash('sha256').update(identity).digest('hex')}`;
    let count: number;
    if (this.redis.enabled) {
      count = await this.redis.consume(key, windowMs);
    } else {
      const now = Date.now();
      const existing = this.windows.get(key);
      if (existing && existing.expires > now) {
        count = ++existing.count;
      } else {
        if (this.windows.size >= 20000) {
          for (const [candidate, value] of this.windows)
            if (value.expires <= now) this.windows.delete(candidate);
          if (this.windows.size >= 20000)
            throw new ServiceUnavailableException(
              'Chat rate limiting is at capacity',
            );
        }
        this.windows.set(key, { count: 1, expires: now + windowMs });
        count = 1;
      }
    }
    if (count > limit) throw new HttpException('Chat rate limit exceeded', 429);
  }
}
