import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookReadingStatus } from '../generated/prisma/client';

describe('UserService', () => {
  let service: UserService;

  const mockPrismaService = {
    readingStats: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    bookProgress: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    book: {
      count: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const userId = 'user-1';

  const buildProgress = (overrides: Record<string, unknown> = {}) => ({
    id: 'progress-1',
    userId,
    bookId: 'book-1',
    currentPage: 300,
    totalPages: 300,
    status: BookReadingStatus.COMPLETED,
    progressPercentage: 100,
    startedAt: new Date('2026-01-01'),
    completedAt: new Date('2026-01-10'),
    updatedAt: new Date('2026-01-10'),
    book: {
      id: 'book-1',
      title: 'Clean Code',
      author: 'Robert C. Martin',
      coverUrl: null,
      type: 'PHYSICAL',
      ratings: [{ value: 5 }],
    },
    ...overrides,
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

  describe('getDashboard', () => {
    it('should compose stats, summary, monthly stats and book stats', async () => {
      const mockStats = {
        id: 'stats-1',
        userId,
        totalBooksCompleted: 1,
        totalPagesRead: 300,
        totalReadingTime: 0,
        averageRating: 5,
        currentStreak: 1,
        longestStreak: 1,
        lastReadDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const now = new Date();
      const completedAt = new Date(now.getFullYear(), 0, 10);

      mockPrismaService.readingStats.findUnique.mockResolvedValue(mockStats);
      mockPrismaService.book.count.mockResolvedValue(1);
      mockPrismaService.bookProgress.findMany.mockResolvedValue([
        buildProgress({ completedAt, updatedAt: completedAt }),
        buildProgress({
          id: 'progress-2',
          bookId: 'book-2',
          title: 'Pragmatic Programmer',
          author: 'Andrew Hunt',
          status: BookReadingStatus.READING,
          currentPage: 100,
          totalPages: 200,
          progressPercentage: 50,
          completedAt: null,
          book: {
            id: 'book-2',
            title: 'Pragmatic Programmer',
            author: 'Andrew Hunt',
            coverUrl: null,
            type: 'DIGITAL',
            ratings: [],
          },
        }),
      ]);

      const result = await service.getDashboard(userId);

      expect(result.stats).toEqual(mockStats);
      expect(result.summary).toEqual({
        completedBooks: 1,
        currentlyReading: 1,
        totalPages: 300,
      });
      expect(result.bookStats.totalBooks).toBe(1);
      expect(result.bookStats.tracked).toBe(2);

      const monthKey = `${completedAt.getFullYear()}-${String(
        completedAt.getMonth() + 1,
      ).padStart(2, '0')}`;
      expect(result.monthlyStats[monthKey]).toEqual({
        books: 1,
        pages: 300,
      });
    });
  });

  describe('getSummary', () => {
    it('should return completed/reading counts and total completed pages', async () => {
      mockPrismaService.bookProgress.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);
      mockPrismaService.bookProgress.aggregate.mockResolvedValue({
        _sum: { totalPages: 300 },
      });

      const result = await service.getSummary(userId);

      expect(result).toEqual({
        completedBooks: 1,
        currentlyReading: 2,
        totalPages: 300,
      });

      expect(mockPrismaService.bookProgress.count).toHaveBeenNthCalledWith(1, {
        where: { userId, status: BookReadingStatus.COMPLETED },
      });
      expect(mockPrismaService.bookProgress.count).toHaveBeenNthCalledWith(2, {
        where: { userId, status: BookReadingStatus.READING },
      });
      expect(mockPrismaService.bookProgress.aggregate).toHaveBeenCalledWith({
        where: { userId, status: BookReadingStatus.COMPLETED },
        _sum: { totalPages: true },
      });
    });
  });

  describe('getMonthlyStats', () => {
    it('should return a full-year breakdown with the completed month filled', async () => {
      const now = new Date();
      const completedAt = new Date(now.getFullYear(), 0, 10);

      mockPrismaService.bookProgress.findMany.mockResolvedValue([
        {
          status: BookReadingStatus.COMPLETED,
          completedAt,
          totalPages: 300,
        },
      ]);

      const result = await service.getMonthlyStats(userId);

      const monthKey = `${completedAt.getFullYear()}-${String(
        completedAt.getMonth() + 1,
      ).padStart(2, '0')}`;

      expect(Object.keys(result)).toHaveLength(12);
      expect(result[monthKey]).toEqual({ books: 1, pages: 300 });
    });
  });

  describe('getStreak', () => {
    it('should return streak fields from the stats row', async () => {
      const lastReadDate = new Date();
      mockPrismaService.readingStats.findUnique.mockResolvedValue({
        id: 'stats-1',
        userId,
        totalBooksCompleted: 5,
        totalPagesRead: 1500,
        totalReadingTime: 0,
        averageRating: 4.2,
        currentStreak: 3,
        longestStreak: 10,
        lastReadDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getStreak(userId);

      expect(result).toEqual({
        currentStreak: 3,
        longestStreak: 10,
        lastReadDate,
      });
    });
  });

  describe('getBookStats', () => {
    it('should return library, status breakdown and detailed book list', async () => {
      mockPrismaService.book.count.mockResolvedValue(3);
      mockPrismaService.bookProgress.findMany.mockResolvedValue([
        buildProgress({}),
        buildProgress({
          id: 'progress-2',
          bookId: 'book-2',
          title: 'Pragmatic Programmer',
          status: BookReadingStatus.READING,
          currentPage: 100,
          totalPages: 200,
          progressPercentage: 50,
          completedAt: null,
          book: {
            id: 'book-2',
            title: 'Pragmatic Programmer',
            author: 'Andrew Hunt',
            coverUrl: 'http://cover',
            type: 'DIGITAL',
            ratings: [],
          },
        }),
      ]);

      const result = await service.getBookStats(userId);

      expect(mockPrismaService.book.count).toHaveBeenCalledWith({
        where: { ownerId: userId },
      });
      expect(mockPrismaService.bookProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
        }),
      );

      expect(result).toEqual({
        totalBooks: 3,
        tracked: 2,
        completionRate: 50,
        byStatus: {
          [BookReadingStatus.READING]: 1,
          [BookReadingStatus.COMPLETED]: 1,
          [BookReadingStatus.PAUSED]: 0,
          [BookReadingStatus.DROPPED]: 0,
        },
        books: [
          expect.objectContaining({
            bookId: 'book-1',
            title: 'Clean Code',
            status: BookReadingStatus.COMPLETED,
            rating: 5,
            startedAt: new Date('2026-01-01'),
            completedAt: new Date('2026-01-10'),
          }),
          expect.objectContaining({
            bookId: 'book-2',
            title: 'Pragmatic Programmer',
            status: BookReadingStatus.READING,
            currentPage: 100,
            totalPages: 200,
            progressPercentage: 50,
            rating: null,
          }),
        ],
      });
    });

    it('should return zeroed stats when the user has no progress', async () => {
      mockPrismaService.book.count.mockResolvedValue(0);
      mockPrismaService.bookProgress.findMany.mockResolvedValue([]);

      const result = await service.getBookStats(userId);

      expect(result).toEqual({
        totalBooks: 0,
        tracked: 0,
        completionRate: 0,
        byStatus: {
          [BookReadingStatus.READING]: 0,
          [BookReadingStatus.COMPLETED]: 0,
          [BookReadingStatus.PAUSED]: 0,
          [BookReadingStatus.DROPPED]: 0,
        },
        books: [],
      });
    });
  });

  describe('updateStatsOnCompletion', () => {
    it('should recompute stats from all completed progress', async () => {
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

      mockPrismaService.bookProgress.findMany.mockResolvedValue([mockProgress]);

      await service.updateStatsOnCompletion(userId);

      expect(mockPrismaService.bookProgress.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          status: BookReadingStatus.COMPLETED,
        },
        include: {
          book: {
            include: {
              ratings: {
                where: { userId },
              },
            },
          },
        },
      });

      const expectedStats = {
        totalBooksCompleted: 1,
        totalPagesRead: 300,
        averageRating: 5,
      };

      expect(mockPrismaService.readingStats.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: expectedStats,
        create: {
          userId,
          ...expectedStats,
        },
      });
    });
  });

  describe('updateStreak', () => {
    const userId = 'user-1';

    type MockStats = {
      id: string;
      userId: string;
      totalBooksCompleted: number;
      totalPagesRead: number;
      totalReadingTime: number;
      averageRating: number;
      currentStreak: number;
      longestStreak: number;
      lastReadDate: Date | null;
      createdAt: Date;
      updatedAt: Date;
    };

    const buildStats = (overrides: Partial<MockStats> = {}): MockStats => {
      const mockStats: MockStats = {
        id: 'stats-1',
        userId,
        totalBooksCompleted: 5,
        totalPagesRead: 1500,
        totalReadingTime: 0,
        averageRating: 4.2,
        currentStreak: 3,
        longestStreak: 10,
        lastReadDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return { ...mockStats, ...overrides };
    };

    it('should start the streak at 1 on the first read', async () => {
      mockPrismaService.readingStats.findUnique.mockResolvedValue(
        buildStats({ lastReadDate: null }),
      );

      await service.updateStreak(userId);

      expect(mockPrismaService.readingStats.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: {
          currentStreak: 1,
          longestStreak: 10,
          lastReadDate: expect.any(Date) as unknown,
        },
        create: {
          userId,
          currentStreak: 1,
          longestStreak: 10,
          lastReadDate: expect.any(Date) as unknown,
        },
      });
    });

    it('should increment streak if read yesterday', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPrismaService.readingStats.findUnique.mockResolvedValue(
        buildStats({ lastReadDate: yesterday }),
      );

      await service.updateStreak(userId);

      expect(mockPrismaService.readingStats.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: {
          currentStreak: 4,
          longestStreak: 10,
          lastReadDate: expect.any(Date) as unknown,
        },
        create: {
          userId,
          currentStreak: 4,
          longestStreak: 10,
          lastReadDate: expect.any(Date) as unknown,
        },
      });
    });

    it('should not change the streak when already read today', async () => {
      const today = new Date();
      const mockStats = buildStats({ currentStreak: 3, lastReadDate: today });

      mockPrismaService.readingStats.findUnique.mockResolvedValue(mockStats);

      const result = await service.updateStreak(userId);

      expect(mockPrismaService.readingStats.upsert).not.toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });

    it('should reset the streak to 1 after a break of more than one day', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      mockPrismaService.readingStats.findUnique.mockResolvedValue(
        buildStats({ lastReadDate: threeDaysAgo }),
      );

      await service.updateStreak(userId);

      expect(mockPrismaService.readingStats.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: {
          currentStreak: 1,
          longestStreak: 10,
          lastReadDate: expect.any(Date) as unknown,
        },
        create: {
          userId,
          currentStreak: 1,
          longestStreak: 10,
          lastReadDate: expect.any(Date) as unknown,
        },
      });
    });
  });
});
