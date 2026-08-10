import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheModule } from '@nestjs/cache-manager';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import type { User } from '../generated/prisma/client';

describe('User controller tests', () => {
  let controller: UserController;

  const service = {
    getStats: vi.fn(),
    getDashboard: vi.fn(),
    getBookStats: vi.fn(),
    getSummary: vi.fn(),
    getMonthlyStats: vi.fn(),
    getStreak: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
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

      service.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats({
        id: userId,
        username: 'test',
      } as User);

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

      service.getDashboard.mockResolvedValue(mockDashboard);

      const result = await controller.getDashboard({
        id: userId,
        username: 'test',
      } as User);

      expect(result).toEqual(mockDashboard);
      expect(service.getDashboard).toHaveBeenCalledWith(userId);
    });
  });

  describe('getBookStats', () => {
    it('should return book stats for user', async () => {
      const userId = 'user-1';
      const mockBookStats = {
        totalBooks: 3,
        tracked: 2,
        completionRate: 50,
        byStatus: {
          READING: 1,
          COMPLETED: 1,
          PAUSED: 0,
          DROPPED: 0,
        },
        books: [],
      };

      service.getBookStats.mockResolvedValue(mockBookStats);

      const result = await controller.getBookStats({
        id: userId,
        username: 'test',
      } as User);

      expect(result).toEqual(mockBookStats);
      expect(service.getBookStats).toHaveBeenCalledWith(userId);
    });
  });

  describe('getSummary', () => {
    it('should return summary for user', async () => {
      const userId = 'user-1';
      const mockSummary = {
        completedBooks: 5,
        currentlyReading: 2,
        totalPages: 1500,
      };

      service.getSummary.mockResolvedValue(mockSummary);

      const result = await controller.getSummary({
        id: userId,
        username: 'test',
      } as User);

      expect(result).toEqual(mockSummary);
      expect(service.getSummary).toHaveBeenCalledWith(userId);
    });
  });

  describe('getMonthlyStats', () => {
    it('should return monthly stats for user', async () => {
      const userId = 'user-1';
      const mockMonthlyStats = {
        '2026-01': { books: 2, pages: 450 },
        '2026-02': { books: 1, pages: 300 },
      };

      service.getMonthlyStats.mockResolvedValue(mockMonthlyStats);

      const result = await controller.getMonthlyStats({
        id: userId,
        username: 'test',
      } as User);

      expect(result).toEqual(mockMonthlyStats);
      expect(service.getMonthlyStats).toHaveBeenCalledWith(userId);
    });
  });

  describe('getStreak', () => {
    it('should return streak for user', async () => {
      const userId = 'user-1';
      const mockStreak = {
        currentStreak: 3,
        longestStreak: 10,
        lastReadDate: new Date(),
      };

      service.getStreak.mockResolvedValue(mockStreak);

      const result = await controller.getStreak({
        id: userId,
        username: 'test',
      } as User);

      expect(result).toEqual(mockStreak);
      expect(service.getStreak).toHaveBeenCalledWith(userId);
    });
  });
});
