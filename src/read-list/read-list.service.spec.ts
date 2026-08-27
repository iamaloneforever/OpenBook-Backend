import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

import { ReadListService } from './read-list.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReadListService', () => {
  let service: ReadListService;

  const prisma = {
    readList: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    readListBook: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    book: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadListService,
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

    service = module.get(ReadListService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLists', () => {
    it('should return paginated read lists', async () => {
      const lists = [
        {
          id: 'list-1',
          title: 'Favorites',
          description: 'My top picks',
          userId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { items: 3 },
        },
      ];

      prisma.$transaction.mockResolvedValue([lists, 1]);

      const result = await service.getLists('user-1');

      expect(result).toEqual({
        data: lists,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should apply pagination correctly', async () => {
      prisma.$transaction.mockResolvedValue([[], 25]);

      const result = await service.getLists('user-1', 3, 10);

      expect(result.meta).toEqual({
        total: 25,
        page: 3,
        limit: 10,
        totalPages: 3,
      });
    });

    it('should return empty data when user has no lists', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.getLists('user-1');

      expect(result).toEqual({
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      });
    });
  });

  describe('getList', () => {
    it('should return a read list with statistics', async () => {
      const list = {
        id: 'list-1',
        title: 'Favorites',
        description: 'My top picks',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            book: {
              id: 'book-1',
              title: 'Clean Code',
              totalPages: 300,
              averageRating: 4.5,
              ratingsCount: 10,
              _count: { ratings: 10, progress: 1 },
            },
          },
          {
            book: {
              id: 'book-2',
              title: 'Pragmatic Programmer',
              totalPages: 400,
              averageRating: 4.0,
              ratingsCount: 5,
              _count: { ratings: 5, progress: 1 },
            },
          },
        ],
      };

      prisma.readList.findUnique.mockResolvedValue(list);

      const result = await service.getList('list-1');

      expect(result).toEqual({
        ...list,
        stats: {
          totalBooks: 2,
          totalPages: 700,
          averageRating: 4.3,
          totalRatings: 15,
        },
      });
    });

    it('should throw NotFoundException when list does not exist', async () => {
      prisma.readList.findUnique.mockResolvedValue(null);

      await expect(service.getList('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle empty items list', async () => {
      const list = {
        id: 'list-1',
        title: 'Empty List',
        items: [],
      };

      prisma.readList.findUnique.mockResolvedValue(list);

      const result = await service.getList('list-1');

      expect(result.stats).toEqual({
        totalBooks: 0,
        totalPages: 0,
        averageRating: 0,
        totalRatings: 0,
      });
    });
  });

  describe('createList', () => {
    it('should create a new read list', async () => {
      const dto = { title: 'Favorites', description: 'My top picks' };
      const createdList = {
        id: 'list-1',
        ...dto,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.readList.create.mockResolvedValue(createdList);

      const result = await service.createList('user-1', dto);

      expect(result).toEqual(createdList);
      expect(prisma.readList.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          owner: {
            connect: {
              id: 'user-1',
            },
          },
        },
      });
    });

    it('should throw ConflictException for duplicate list', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplicate key', {
        code: 'P2002',
        clientVersion: 'test',
      });

      prisma.readList.create.mockRejectedValue(error);

      await expect(
        service.createList('user-1', { title: 'Favorites' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for unknown errors', async () => {
      prisma.readList.create.mockRejectedValue(new Error('Database crashed'));

      await expect(
        service.createList('user-1', { title: 'Favorites' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateList', () => {
    it('should update a read list', async () => {
      const dto = { title: 'Updated Title' };
      const existingList = {
        id: 'list-1',
        title: 'Old Title',
        userId: 'user-1',
      };
      const updatedList = {
        id: 'list-1',
        ...dto,
        userId: 'user-1',
      };

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.readList.update.mockResolvedValue(updatedList);

      const result = await service.updateList('list-1', dto);

      expect(result).toEqual(updatedList);
      expect(prisma.readList.update).toHaveBeenCalledWith({
        where: { id: 'list-1' },
        data: dto,
      });
    });

    it('should throw NotFoundException when list does not exist', async () => {
      prisma.readList.findUnique.mockResolvedValue(null);

      await expect(
        service.updateList('nonexistent', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteList', () => {
    it('should delete a read list', async () => {
      const existingList = {
        id: 'list-1',
        title: 'Favorites',
        userId: 'user-1',
      };

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.readList.delete.mockResolvedValue({});

      const result = await service.deleteList('list-1');

      expect(result).toEqual({
        message: 'Read list deleted successfully',
      });
      expect(prisma.readList.delete).toHaveBeenCalledWith({
        where: { id: 'list-1' },
      });
    });

    it('should throw NotFoundException when list does not exist', async () => {
      prisma.readList.findUnique.mockResolvedValue(null);

      await expect(service.deleteList('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addBook', () => {
    it('should add a book to a read list', async () => {
      const existingList = {
        id: 'list-1',
        title: 'Favorites',
        userId: 'user-1',
      };
      const book = {
        id: 'book-1',
        title: 'Clean Code',
      };
      const addedItem = {
        readListId: 'list-1',
        bookId: 'book-1',
      };

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.book.findUnique.mockResolvedValue(book);
      prisma.readListBook.create.mockResolvedValue(addedItem);

      const result = await service.addBook('list-1', 'book-1');

      expect(result).toEqual(addedItem);
      expect(prisma.readListBook.create).toHaveBeenCalledWith({
        data: {
          readListId: 'list-1',
          bookId: 'book-1',
        },
      });
    });

    it('should throw NotFoundException when list does not exist', async () => {
      prisma.readList.findUnique.mockResolvedValue(null);

      await expect(service.addBook('nonexistent', 'book-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when book does not exist', async () => {
      const existingList = {
        id: 'list-1',
        title: 'Favorites',
        userId: 'user-1',
      };

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.book.findUnique.mockResolvedValue(null);

      await expect(service.addBook('list-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when book already exists in list', async () => {
      const existingList = {
        id: 'list-1',
        title: 'Favorites',
        userId: 'user-1',
      };
      const book = {
        id: 'book-1',
        title: 'Clean Code',
      };

      const error = new Prisma.PrismaClientKnownRequestError('Duplicate key', {
        code: 'P2002',
        clientVersion: 'test',
      });

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.book.findUnique.mockResolvedValue(book);
      prisma.readListBook.create.mockRejectedValue(error);

      await expect(service.addBook('list-1', 'book-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for unknown errors', async () => {
      const existingList = {
        id: 'list-1',
        title: 'Favorites',
        userId: 'user-1',
      };
      const book = {
        id: 'book-1',
        title: 'Clean Code',
      };

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.book.findUnique.mockResolvedValue(book);
      prisma.readListBook.create.mockRejectedValue(
        new Error('Database crashed'),
      );

      await expect(service.addBook('list-1', 'book-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('removeBook', () => {
    it('should remove a book from a read list', async () => {
      const existingList = {
        id: 'list-1',
        title: 'Favorites',
        userId: 'user-1',
      };
      const item = {
        readListId: 'list-1',
        bookId: 'book-1',
      };

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.readListBook.findUnique.mockResolvedValue(item);
      prisma.readListBook.delete.mockResolvedValue({});

      const result = await service.removeBook('list-1', 'book-1');

      expect(result).toEqual({
        message: 'Book removed from read list',
      });
      expect(prisma.readListBook.delete).toHaveBeenCalledWith({
        where: {
          readListId_bookId: {
            readListId: 'list-1',
            bookId: 'book-1',
          },
        },
      });
    });

    it('should throw NotFoundException when list does not exist', async () => {
      prisma.readList.findUnique.mockResolvedValue(null);

      await expect(service.removeBook('nonexistent', 'book-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when book is not in list', async () => {
      const existingList = {
        id: 'list-1',
        title: 'Favorites',
        userId: 'user-1',
      };

      prisma.readList.findUnique.mockResolvedValue(existingList);
      prisma.readListBook.findUnique.mockResolvedValue(null);

      await expect(service.removeBook('list-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
