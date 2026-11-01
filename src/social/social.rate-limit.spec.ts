import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { SocialController } from './social.controller';
import { ProfilesService } from './profiles.service';
import { PostsService } from './posts.service';
import { FeedService } from './feed.service';
import { RssSubscriptionsController } from './rss/rss-subscriptions.controller';
import { RssSubscriptionsService } from './rss/rss-subscriptions.service';

describe('social publishing rate limits', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it.each([
    {
      path: '/social/posts',
      body: { content: 'Hello' },
      limit: 20,
      method: 'create',
    },
    {
      path: '/social/rss/subscriptions',
      body: { url: 'https://example.com/rss' },
      limit: 10,
      method: 'subscribe',
    },
  ])('limits writes to $path', async ({ path, body, limit, method }) => {
    const write = vi.fn().mockResolvedValue({ id: 'created' });
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'ip', ttl: 60_000, limit: 1000 }]),
      ],
      controllers: [SocialController, RssSubscriptionsController],
      providers: [
        { provide: PostsService, useValue: { [method]: write } },
        { provide: RssSubscriptionsService, useValue: { [method]: write } },
        { provide: ProfilesService, useValue: {} },
        { provide: FeedService, useValue: {} },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<Request>().user = {
            id: 'c123456789012345678901234',
            username: 'reader',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    for (let attempt = 0; attempt < limit; attempt++) {
      await request(app.getHttpServer() as Server)
        .post(path)
        .send(body)
        .expect(201);
    }
    await request(app.getHttpServer() as Server)
      .post(path)
      .send(body)
      .expect(429);
    expect(write).toHaveBeenCalledTimes(limit);
  });
});
