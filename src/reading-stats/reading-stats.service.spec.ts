import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { ReadingStatsService } from './reading-stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookReadingStatus } from '../generated/prisma/client';

describe('ReadingStatsService', () => {
  let service: ReadingStatsService;

  const mockPrismaService = {
    readingStats: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    bookProgress: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadingStatsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ReadingStatsService>(ReadingStatsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should return existing stats', async () => {
      const userId = 'user-1';
      const mockStats = {
        id: 'stats-1',
        userId,
        totalBooksCompleted: 5,
        totalPagesRead: 1500,
        totalReadingTime: 0,
        averageRating: 4.2,
        currentStreak: 3,
        longestStreak: 10,
        lastReadDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.readingStats.findUnique.mockResolvedValue(mockStats);

      const result = await service.getStats(userId);

      expect(result).toEqual(mockStats);
    });

    it('should create new stats if not exist', async () => {
      const userId = 'user-1';
      const mockStats = {
        id: 'stats-1',
        userId,
        totalBooksCompleted: 0,
        totalPagesRead: 0,
        totalReadingTime: 0,
        averageRating: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastReadDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.readingStats.findUnique.mockResolvedValue(null);
      mockPrismaService.readingStats.create.mockResolvedValue(mockStats);

      const result = await service.getStats(userId);

      expect(result).toEqual(mockStats);
      expect(mockPrismaService.readingStats.create).toHaveBeenCalledWith({
        data: { userId },
      });
    });
  });

  describe('updateStatsOnCompletion', () => {
    it('should update stats when book is completed', async () => {
      const userId = 'user-1';
      const bookId = 'book-1';

      const mockProgress = {
        id: 'progress-1',
        userId,
        bookId,
        currentPage: 300,
        totalPages: 300,
        status: BookReadingStatus.COMPLETED,
        progressPercentage: 100,
        startedAt: new Date(),
        completedAt: new Date(),
        updatedAt: new Date(),
        book: {
          id: bookId,
          title: 'Test Book',
          author: 'Test Author',
          description: null,
          isbn: null,
          type: 'PHYSICAL',
          publishedAt: null,
          coverUrl: null,
          totalPages: 300,
          averageRating: 0,
          ratingsCount: 0,
          ownerId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          ratings: [
            { userId, bookId, value: 5, id: 'rating-1', createdAt: new Date() },
          ],
        },
      };

      const mockStats = {
        id: 'stats-1',
        userId,
        totalBooksCompleted: 2,
        totalPagesRead: 600,
        totalReadingTime: 0,
        averageRating: 4.5,
        currentStreak: 2,
        longestStreak: 10,
        lastReadDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.bookProgress.findUnique.mockResolvedValue(mockProgress);
      mockPrismaService.readingStats.findUnique.mockResolvedValue({
        ...mockStats,
        totalBooksCompleted: 1,
        totalPagesRead: 300,
      });

      await service.updateStatsOnCompletion(userId, bookId);

      expect(mockPrismaService.readingStats.update).toHaveBeenCalled();
    });
  });

  describe('updateStreak', () => {
    it('should increment streak if read yesterday', async () => {
      const userId = 'user-1';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const mockStats = {
        id: 'stats-1',
        userId,
        totalBooksCompleted: 5,
        totalPagesRead: 1500,
        totalReadingTime: 0,
        averageRating: 4.2,
        currentStreak: 3,
        longestStreak: 10,
        lastReadDate: yesterday,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.readingStats.findUnique.mockResolvedValue(mockStats);

      await service.updateStreak(userId);

      expect(mockPrismaService.readingStats.update).toHaveBeenCalledWith({
        where: { userId },
        data: expect.objectContaining({
          currentStreak: 4,
          longestStreak: 10,
        }),
      });
    });
  });
});
