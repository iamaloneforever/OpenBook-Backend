import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { BookService } from '../src/book/book.service';
import { JwtAuthGuard } from '../src/common/guards/auth/jwt-auth.guard';
import { OwnerGuard } from '../src/common/guards/auth/owner.guard';

describe('BookController (e2e)', () => {
  let app: INestApplication;

  const userId = 'c123456789012345678901230';
  const bookId = 'c123456789012345678901234';
  const missingBookId = 'c999999999999999999999999';

  const bookServiceMock = {
    findAll: vi.fn(),
    findOneWithProgress: vi.fn(),
    create: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    bookServiceMock.findAll.mockResolvedValue({
      data: [
        {
          id: bookId,
          title: 'Clean Code',
          author: 'Robert C. Martin',
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    });

    bookServiceMock.findOneWithProgress.mockResolvedValue({
      id: bookId,
      title: 'Clean Code',
      author: 'Robert C. Martin',
    });

    bookServiceMock.create.mockImplementation(
      (dto: Record<string, unknown>) => ({
        id: bookId,
        ...dto,
      }),
    );

    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BookService)
      .useValue(bookServiceMock)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<Request>();
          request.user = {
            id: userId,
            username: 'test',
          };
          return true;
        },
      })
      .overrideGuard(OwnerGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /book', () => {
    it('should return all books', async () => {
      const res = await request(app.getHttpServer()).get('/book').expect(200);

      const body = res.body as { data: Array<Record<string, unknown>> };

      expect(body.data[0]).toEqual({
        id: bookId,
        title: 'Clean Code',
        author: 'Robert C. Martin',
      });

      expect(bookServiceMock.findAll).toHaveBeenCalledOnce();
    });
  });

  describe('GET /book/:id', () => {
    it('should return a book', async () => {
      const res = await request(app.getHttpServer())
        .get(`/book/${bookId}`)
        .expect(200);

      expect(res.body).toEqual({
        id: bookId,
        title: 'Clean Code',
        author: 'Robert C. Martin',
      });

      expect(bookServiceMock.findOneWithProgress).toHaveBeenCalledWith(
        bookId,
        userId,
      );
      expect(bookServiceMock.findOneWithProgress).toHaveBeenCalledOnce();
    });

    it('should return 404 when book does not exist', async () => {
      bookServiceMock.findOneWithProgress.mockRejectedValueOnce(
        new NotFoundException('Book not found'),
      );
      await request(app.getHttpServer())
        .get(`/book/${missingBookId}`)
        .expect(404);

      expect(bookServiceMock.findOneWithProgress).toHaveBeenCalledWith(
        missingBookId,
        userId,
      );
      expect(bookServiceMock.findOneWithProgress).toHaveBeenCalledOnce();
    });

    it('should return 400 for an invalid CUID', async () => {
      await request(app.getHttpServer()).get('/book/1').expect(400);

      expect(bookServiceMock.findOneWithProgress).not.toHaveBeenCalled();
    });
  });

  describe('POST /book', () => {
    it('should create a book', async () => {
      const dto = {
        title: 'The Pragmatic Programmer',
        author: 'Andrew Hunt',
        type: 'PHYSICAL',
        physicalBook: {
          address: 'Main Street 1',
          city: 'Berlin',
          country: 'Germany',
        },
      };

      const res = await request(app.getHttpServer())
        .post('/book')
        .send(dto)
        .expect(201);

      expect(res.body).toEqual({
        id: bookId,
        ...dto,
      });

      expect(bookServiceMock.create).toHaveBeenCalledWith(
        dto,
        userId,
        undefined,
        undefined,
      );
      expect(bookServiceMock.create).toHaveBeenCalledOnce();
    });

    it('should reject an invalid body', async () => {
      await request(app.getHttpServer()).post('/book').send({}).expect(400);

      expect(bookServiceMock.create).not.toHaveBeenCalled();
    });
  });
});
