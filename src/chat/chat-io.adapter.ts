import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { configuredOrigins } from '../common/config/http.config';
import { ChatRedisService } from './chat-redis.service';
import { ChatRateLimitService } from './chat-rate-limit.service';

export class ChatIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService,
    private readonly redis: ChatRedisService,
    private readonly limits: ChatRateLimitService,
  ) {
    super(app, { maxConcurrentMessages: 1 });
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const origins = configuredOrigins(this.config.get<string>('CORS_ORIGINS'));
    const publicUrl = this.config.get<string>('SOCIAL_PUBLIC_URL');
    const trusted = new Set(origins);
    if (publicUrl) trusted.add(new URL(publicUrl).origin);
    const server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      maxHttpBufferSize: 16384,
      perMessageDeflate: false,
      connectTimeout: 5000,
      cors: { origin: origins, credentials: false },
      allowRequest: (request, callback) => {
        const origin = request.headers.origin;
        if (
          (origin !== undefined && !trusted.has(origin)) ||
          (origin === undefined &&
            request.headers['sec-fetch-site'] === 'cross-site') ||
          server.engine.clientsCount >= 1000
        ) {
          callback('Chat connection rejected', false);
          return;
        }
        void this.limits
          .consume('connect', request.socket.remoteAddress ?? 'unknown', 30)
          .then(
            () => callback(null, server.engine.clientsCount < 1000),
            () => callback('Chat connection rate limit exceeded', false),
          );
      },
    } as ServerOptions);
    if (this.redis.adapter) server.adapter(this.redis.adapter);
    return server;
  }
}

export async function configureChatSockets(
  app: import('@nestjs/common').INestApplication,
) {
  const redis = app.get(ChatRedisService);
  await redis.connect();
  app.useWebSocketAdapter(
    new ChatIoAdapter(
      app,
      app.get(ConfigService),
      redis,
      app.get(ChatRateLimitService),
    ),
  );
}
