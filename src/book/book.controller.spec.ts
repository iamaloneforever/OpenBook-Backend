import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import { BookController } from './book.controller';
import { BookService } from './book.service';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { OwnerGuard } from '../common/guards/auth/owner.guard';
import { CacheInterceptor } from '@nestjs/cache-manager';

describe('BookController', () => {
  let controller: BookController;

  const service = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    rateBook: vi.fn(),
    deleteBook: vi.fn(),
    updateBook: vi.fn(),
  };

  const user = {
    id: 'user-1',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookController],
      providers: [
        {
          provide: BookService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: vi.fn().mockReturnValue(true),
      })
      .overrideGuard(OwnerGuard)
      .useValue({
        canActivate: vi.fn().mockReturnValue(true),
      })
      .overrideInterceptor(CacheInterceptor)
      .useValue({
        intercept: vi.fn((_, next) => next.handle()),
      })
      .compile();

    controller = module.get(BookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with user id and query', async () => {
      const query = {
        page: 1,
        limit: 10,
      };

      const result = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      };

      service.findAll.mockResolvedValue(result);

      const response = await controller.findAll(user as any, query as any);

      expect(service.findAll).toHaveBeenCalledWith(user.id, query);
      expect(response).toEqual(result);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with book id', async () => {
      const book = {
        id: 'book-1',
        title: 'Clean Code',
      };

      service.findOne.mockResolvedValue(book);

      const response = await controller.findOne({
        id: 'book-1',
      });

      expect(service.findOne).toHaveBeenCalledWith('book-1');
      expect(response).toEqual(book);
    });
  });

  describe('create', () => {
    const dto = {
      title: 'Clean Code',
      author: 'Robert C. Martin',
    };

    it('should create a book with cover', async () => {
      const file = {
        path: 'uploads/books/covers/cover.jpg',
      } as Express.Multer.File;

      const book = {
        id: 'book-1',
        ...dto,
        coverUrl: file.path,
      };

      service.create.mockResolvedValue(book);

      const response = await controller.create(dto as any, user as any, file);

      expect(service.create).toHaveBeenCalledWith(dto, user.id, file.path);

      expect(response).toEqual(book);
    });

    it('should create a book without cover', async () => {
      service.create.mockResolvedValue(dto);

      const response = await controller.create(
        dto as any,
        user as any,
        undefined,
      );

      expect(service.create).toHaveBeenCalledWith(dto, user.id, undefined);

      expect(response).toEqual(dto);
    });
  });

  describe('rateBook', () => {
    it('should call service.rateBook with book id, user id and rating value', async () => {
      const result = {
        id: 'book-1',
        averageRating: 5,
        ratingsCount: 1,
      };

      service.rateBook.mockResolvedValue(result);

      const response = await controller.rateBook(
        'book-1',
        { value: 5 },
        user as any,
      );

      expect(service.rateBook).toHaveBeenCalledWith('book-1', user.id, 5);

      expect(response).toEqual(result);
    });
  });

  describe('deleteBook', () => {
    it('should call service.deleteBook with book id', async () => {
      const result = {
        message: 'Book deleted successfully',
      };

      service.deleteBook.mockResolvedValue(result);

      const response = await controller.deleteBook('book-1');

      expect(service.deleteBook).toHaveBeenCalledWith('book-1');
      expect(response).toEqual(result);
    });
  });

  describe('updateBook', () => {
    it('should call service.updateBook with book id and dto', async () => {
      const dto = {
        title: 'Updated Clean Code',
      };

      const result = {
        id: 'book-1',
        ...dto,
      };

      service.updateBook.mockResolvedValue(result);

      const response = await controller.updateBook('book-1', dto);

      expect(service.updateBook).toHaveBeenCalledWith('book-1', dto);

      expect(response).toEqual(result);
    });
  });
});
