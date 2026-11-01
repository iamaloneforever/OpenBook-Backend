import { CacheModule } from '@nestjs/cache-manager';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { Request } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookController } from './book.controller';
import { BookService } from './book.service';
import { BookFilesService } from './book-files.service';
import { UserController } from '../user/user.controller';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { OwnerGuard } from '../common/guards/auth/owner.guard';

describe('private response caching', () => {
  let app: INestApplication;
  const result = (userId: string) => ({ userId });
  const books = { findAll: vi.fn(result), findByTags: vi.fn(result) };
  const users = { getDashboard: vi.fn(result) };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [BookController, UserController],
      providers: [
        { provide: BookFilesService, useValue: { download: vi.fn() } },
        { provide: BookService, useValue: books },
        { provide: UserService, useValue: users },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest<Request>();
          const id = req.header('x-test-user');
          if (!id) throw new UnauthorizedException();
          req.user = { id };
          return true;
        },
      })
      .overrideGuard(OwnerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it.each(['/book', '/book/tags/search?tags=fiction', '/user/dashboard'])(
    'isolates %s between users while retaining same-user cache hits',
    async (url) => {
      for (const user of ['alice', 'bob', 'alice']) {
        const response = await request(app.getHttpServer() as Server)
          .get(url)
          .set('x-test-user', user)
          .expect(200);
        expect(response.body).toEqual({ userId: user });
      }
      const service = url.startsWith('/user')
        ? users.getDashboard
        : url.includes('tags')
          ? books.findByTags
          : books.findAll;
      expect(service).toHaveBeenCalledTimes(2);
      await request(app.getHttpServer() as Server)
        .get(url)
        .expect(401);
    },
  );

  it('keeps query parameters in the cache key', async () => {
    for (const page of [1, 2, 1]) {
      await request(app.getHttpServer() as Server)
        .get(`/book?page=${page}`)
        .set('x-test-user', 'alice')
        .expect(200);
    }
    expect(books.findAll).toHaveBeenCalledTimes(2);
  });
});
