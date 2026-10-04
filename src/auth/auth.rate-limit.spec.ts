import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from '../common/guards/auth/local-auth.guard';

describe('authentication rate limits', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('blocks repeated refresh attempts for the same token', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: 'ip', ttl: 60_000, limit: 100 },
          { name: 'account', ttl: 60_000, limit: 1_000 },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            refresh: vi.fn().mockResolvedValue({
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
            }),
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(LocalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer() as Server)
        .post('/auth/refresh')
        .set('Cookie', 'refreshToken=attempted-token')
        .send({ username: `bypass-${attempt}` })
        .expect(201);
    }

    const response = await request(app.getHttpServer() as Server)
      .post('/auth/refresh')
      .set('Cookie', 'refreshToken=attempted-token')
      .send({ username: 'another-bypass' })
      .expect(429);

    expect(response.body).toMatchObject({
      message: 'ThrottlerException: Too Many Requests',
    });
  });
});
