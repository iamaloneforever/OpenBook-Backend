import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client';

import { BookService } from './book.service';
import { PrismaService } from '../prisma/prisma.service';

import { CreateBookDto } from '../common/dtos/book/create-book-dto';
import { SearchBookDto } from '../common/dtos/book/search-book.dto';
import { UpdateBookDto } from '../common/dtos/book/update-book.dto';

describe('BookService', () => {
  let service: BookService;

  let prisma: {
    book: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };

    rating: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };

    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      book: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },

      rating: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        aggregate: vi.fn(),
      },

      $transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    })
      .setLogger({
        log: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
        verbose: () => {},
      })
      .compile();

    service = module.get<BookService>(BookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  describe('findAll', () => {
    const query: SearchBookDto = {
      page: 1,
      limit: 10,
    };

    it('should return paginated books', async () => {
      const books = [
        {
          id: 'book-1',
          title: 'Clean Code',
          ownerId: 'user-1',
        },
      ];

      prisma.$transaction.mockResolvedValue([books, 1]);

      const result = await service.findAll('user-1', query);

      expect(result).toEqual({
        data: books,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should search books by query', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('user-1', {
        q: 'clean',
        page: 1,
        limit: 10,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should apply pagination correctly', async () => {
      prisma.$transaction.mockResolvedValue([[], 25]);

      const result = await service.findAll('user-1', {
        page: 3,
        limit: 10,
      });

      expect(result.meta).toEqual({
        total: 25,
        page: 3,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should apply author filter', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('user-1', {
        author: 'Robert C. Martin',
        page: 1,
        limit: 10,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should apply rating filters', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('user-1', {
        minRating: 3,
        maxRating: 5,
        page: 1,
        limit: 10,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------

  describe('findOne', () => {
    it('should return a book', async () => {
      const book = {
        id: 'book-1',
        title: 'Clean Code',
      };

      prisma.book.findUnique.mockResolvedValue(book);

      const result = await service.findOne('book-1');

      expect(result).toEqual(book);

      expect(prisma.book.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'book-1',
        },
      });
    });

    it('should throw NotFoundException if book does not exist', async () => {
      prisma.book.findUnique.mockResolvedValue(null);

      await expect(service.findOne('book-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    const dto: CreateBookDto = {
      title: 'Clean Code',
      author: 'Robert C. Martin',
    };

    it('should create a book', async () => {
      const createdBook = {
        id: 'book-1',
        ...dto,
        ownerId: 'user-1',
      };

      prisma.book.create.mockResolvedValue(createdBook);

      const result = await service.create(dto, 'user-1');

      expect(result).toEqual(createdBook);

      expect(prisma.book.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          coverUrl: undefined,
          owner: {
            connect: {
              id: 'user-1',
            },
          },
        },
      });
    });

    it('should create a book with a cover URL', async () => {
      const createdBook = {
        id: 'book-1',
        ...dto,
        coverUrl: '/uploads/cover.jpg',
      };

      prisma.book.create.mockResolvedValue(createdBook);

      const result = await service.create(dto, 'user-1', '/uploads/cover.jpg');

      expect(result).toEqual(createdBook);

      expect(prisma.book.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          coverUrl: '/uploads/cover.jpg',
          owner: {
            connect: {
              id: 'user-1',
            },
          },
        },
      });
    });

    it('should throw ConflictException for duplicate ISBN', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplicate key', {
        code: 'P2002',
        clientVersion: 'test',
      });

      prisma.book.create.mockRejectedValue(error);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for unknown errors', async () => {
      prisma.book.create.mockRejectedValue(new Error('Database crashed'));

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateBook
  // ---------------------------------------------------------------------------

  describe('updateBook', () => {
    const dto: UpdateBookDto = {
      title: 'Clean Code Updated',
    };

    it('should update a book', async () => {
      const updatedBook = {
        id: 'book-1',
        ...dto,
      };

      prisma.book.update.mockResolvedValue(updatedBook);

      const result = await service.updateBook('book-1', dto);

      expect(result).toEqual(updatedBook);

      expect(prisma.book.update).toHaveBeenCalledWith({
        where: {
          id: 'book-1',
        },
        data: {
          ...dto,
        },
      });
    });

    it('should update the cover URL', async () => {
      prisma.book.update.mockResolvedValue({
        id: 'book-1',
        ...dto,
        coverUrl: '/uploads/new-cover.jpg',
      });

      await service.updateBook('book-1', dto, '/uploads/new-cover.jpg');

      expect(prisma.book.update).toHaveBeenCalledWith({
        where: {
          id: 'book-1',
        },
        data: {
          ...dto,
          coverUrl: '/uploads/new-cover.jpg',
        },
      });
    });

    it('should throw ConflictException for duplicate ISBN', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplicate key', {
        code: 'P2002',
        clientVersion: 'test',
      });

      prisma.book.update.mockRejectedValue(error);

      await expect(service.updateBook('book-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for unknown errors', async () => {
      prisma.book.update.mockRejectedValue(new Error('Database crashed'));

      await expect(service.updateBook('book-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // deleteBook
  // ---------------------------------------------------------------------------

  describe('deleteBook', () => {
    it('should delete a book', async () => {
      prisma.book.delete.mockResolvedValue({
        id: 'book-1',
      });

      const result = await service.deleteBook('book-1');

      expect(result).toEqual({
        message: 'Book deleted successfully',
      });

      expect(prisma.book.delete).toHaveBeenCalledWith({
        where: {
          id: 'book-1',
        },
      });
    });

    it('should throw BadRequestException if deletion fails', async () => {
      prisma.book.delete.mockRejectedValue(new Error('Database crashed'));

      await expect(service.deleteBook('book-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // rateBook
  // ---------------------------------------------------------------------------

  describe('rateBook', () => {
    it('should create a new rating', async () => {
      const updatedBook = {
        id: 'book-1',
        averageRating: 5,
        ratingsCount: 1,
      };

      const tx = {
        book: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'book-1',
          }),

          update: vi.fn().mockResolvedValue(updatedBook),
        },

        rating: {
          findUnique: vi.fn().mockResolvedValue(null),

          create: vi.fn().mockResolvedValue({
            id: 'rating-1',
            value: 5,
          }),

          update: vi.fn(),

          aggregate: vi.fn().mockResolvedValue({
            _avg: {
              value: 5,
            },

            _count: {
              value: 1,
            },
          }),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => callback(tx));

      const result = await service.rateBook('book-1', 'user-1', 5);

      expect(result).toEqual(updatedBook);

      expect(tx.rating.create).toHaveBeenCalledWith({
        data: {
          value: 5,
          userId: 'user-1',
          bookId: 'book-1',
        },
      });
    });

    it('should update an existing rating', async () => {
      const tx = {
        book: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'book-1',
          }),

          update: vi.fn().mockResolvedValue({
            id: 'book-1',
            averageRating: 5,
            ratingsCount: 1,
          }),
        },

        rating: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'rating-1',
            value: 3,
          }),

          update: vi.fn().mockResolvedValue({
            id: 'rating-1',
            value: 5,
          }),

          create: vi.fn(),

          aggregate: vi.fn().mockResolvedValue({
            _avg: {
              value: 5,
            },

            _count: {
              value: 1,
            },
          }),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => callback(tx));

      await service.rateBook('book-1', 'user-1', 5);

      expect(tx.rating.update).toHaveBeenCalledWith({
        where: {
          id: 'rating-1',
        },

        data: {
          value: 5,
        },
      });

      expect(tx.rating.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if book does not exist', async () => {
      const tx = {
        book: {
          findUnique: vi.fn().mockResolvedValue(null),
        },

        rating: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          aggregate: vi.fn(),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => callback(tx));

      await expect(service.rateBook('book-1', 'user-1', 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
