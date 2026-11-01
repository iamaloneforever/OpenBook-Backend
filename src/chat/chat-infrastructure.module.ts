import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatRedisService } from './chat-redis.service';
import { ChatRateLimitService } from './chat-rate-limit.service';

@Module({
  imports: [ConfigModule],
  providers: [ChatRedisService, ChatRateLimitService],
  exports: [ChatRedisService, ChatRateLimitService],
})
export class ChatInfrastructureModule {}
