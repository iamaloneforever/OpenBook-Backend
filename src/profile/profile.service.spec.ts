import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { ProfileService } from './profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ProfileService', () => {
  let service: ProfileService;

  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    book: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    readList: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProfileService, { provide: PrismaService, useValue: prisma }],
    })
      .setLogger({
        log: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
        verbose: () => {},
      })
      .compile();
    service = module.get<ProfileService>(ProfileService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const userId = 'user-1';

  describe('getPublicProfile', () => {
    it('should return public profile data', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        username: 'alice',
        createdAt: new Date('2026-01-01'),
        showBooks: true,
        showReadlists: false,
        _count: { books: 5, readLists: 2 },
      });

      const result = await service.getPublicProfile(userId);

      expect(result).toEqual({
        id: userId,
        username: 'alice',
        createdAt: new Date('2026-01-01'),
        booksVisible: true,
        readListsVisible: false,
        bookCount: 5,
        readListCount: 2,
      });
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getPublicProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProfileBooks', () => {
    it('should return books when visible', async () => {
      const mockBooks = [
        { id: 'book-1', title: 'Test', author: 'Author', ownerId: userId },
      ];

      prisma.user.findUnique.mockResolvedValue({ showBooks: true });
      prisma.$transaction.mockResolvedValue([mockBooks, 1]);

      const result = await service.getProfileBooks(userId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual(mockBooks);
      expect(result.meta.total).toBe(1);
    });

    it('should throw ForbiddenException when books are hidden', async () => {
      prisma.user.findUnique.mockResolvedValue({ showBooks: false });

      await expect(
        service.getProfileBooks(userId, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfileBooks('nonexistent', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProfileReadLists', () => {
    it('should return read lists when visible', async () => {
      const mockLists = [
        {
          id: 'list-1',
          title: 'Favorites',
          description: 'Top picks',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { items: 3 },
        },
      ];

      prisma.user.findUnique.mockResolvedValue({ showReadlists: true });
      prisma.$transaction.mockResolvedValue([mockLists, 1]);

      const result = await service.getProfileReadLists(userId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Favorites');
      expect(result.data[0].bookCount).toBe(3);
    });

    it('should throw ForbiddenException when read lists are hidden', async () => {
      prisma.user.findUnique.mockResolvedValue({ showReadlists: false });

      await expect(
        service.getProfileReadLists(userId, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfileReadLists('nonexistent', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
