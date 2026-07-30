import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheModule } from '@nestjs/cache-manager';
import { ReadingStatsController } from './reading-stats.controller';
import { ReadingStatsService } from './reading-stats.service';

describe('ReadingStatsController', () => {
  let controller: ReadingStatsController;
  let service: ReadingStatsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [ReadingStatsController],
      providers: [
        {
          provide: ReadingStatsService,
          useValue: {
            getStats: vi.fn(),
            getDashboard: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ReadingStatsController>(ReadingStatsController);
    service = module.get<ReadingStatsService>(ReadingStatsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStats', () => {
    it('should return stats for user', async () => {
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

      vi.spyOn(service, 'getStats').mockResolvedValue(mockStats);

      const result = await controller.getStats({ id: userId } as any);

      expect(result).toEqual(mockStats);
      expect(service.getStats).toHaveBeenCalledWith(userId);
    });
  });

  describe('getDashboard', () => {
    it('should return dashboard data', async () => {
      const userId = 'user-1';
      const mockDashboard = {
        stats: {
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
        },
        summary: {
          completedBooks: 5,
          currentlyReading: 2,
          totalPages: 1500,
        },
        monthlyStats: {
          '2026-01': { books: 2, pages: 450 },
          '2026-02': { books: 1, pages: 300 },
        },
      };

      vi.spyOn(service, 'getDashboard').mockResolvedValue(mockDashboard);

      const result = await controller.getDashboard({ id: userId } as any);

      expect(result).toEqual(mockDashboard);
      expect(service.getDashboard).toHaveBeenCalledWith(userId);
    });
  });
});
