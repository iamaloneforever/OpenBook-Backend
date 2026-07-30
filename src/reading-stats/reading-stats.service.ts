import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookReadingStatus } from '../generated/prisma/client';

@Injectable()
export class ReadingStatsService {
  private readonly logger = new Logger(ReadingStatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string) {
    this.logger.debug(`Getting stats for user ${userId}`);

    let stats = await this.prisma.readingStats.findUnique({
      where: { userId },
    });

    if (!stats) {
      stats = await this.prisma.readingStats.create({
        data: { userId },
      });
    }

    return stats;
  }

  async getDashboard(userId: string) {
    this.logger.debug(`Getting dashboard for user ${userId}`);

    const stats = await this.getStats(userId);

    const [completedBooks, currentlyReading, totalPages, monthlyStats] =
      await Promise.all([
        this.getCompletedBooks(userId),
        this.getCurrentlyReading(userId),
        this.getTotalPages(userId),
        this.getMonthlyStats(userId),
      ]);

    return {
      stats,
      summary: {
        completedBooks,
        currentlyReading,
        totalPages,
      },
      monthlyStats,
    };
  }

  async updateStatsOnCompletion(userId: string, bookId: string) {
    this.logger.debug(
      `Updating stats on completion for user ${userId}, book ${bookId}`,
    );

    const progress = await this.prisma.bookProgress.findUnique({
      where: { userId_bookId: { userId, bookId } },
      include: { book: { include: { ratings: { where: { userId } } } } },
    });

    if (!progress) {
      throw new NotFoundException('Book progress not found');
    }

    const stats = await this.getStats(userId);

    const totalPages = (stats.totalPagesRead || 0) + (progress.totalPages || 0);
    const avgRating = progress.book.ratings[0]?.value || 0;

    await this.prisma.readingStats.update({
      where: { userId },
      data: {
        totalBooksCompleted: stats.totalBooksCompleted + 1,
        totalPagesRead: totalPages,
        averageRating:
          (stats.averageRating * stats.totalBooksCompleted + avgRating) /
          (stats.totalBooksCompleted + 1),
        lastReadDate: new Date(),
      },
    });
  }

  async updateStreak(userId: string) {
    const stats = await this.getStats(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!stats.lastReadDate) {
      return await this.prisma.readingStats.update({
        where: { userId },
        data: {
          currentStreak: 1,
          longestStreak: 1,
          lastReadDate: new Date(),
        },
      });
    }

    const lastRead = new Date(stats.lastReadDate);
    lastRead.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(today.getTime() - lastRead.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let newStreak = stats.currentStreak;
    if (diffDays === 1) {
      newStreak = stats.currentStreak + 1;
    } else if (diffDays > 1) {
      newStreak = 1;
    }

    const longestStreak = Math.max(newStreak, stats.longestStreak);

    return await this.prisma.readingStats.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak,
        lastReadDate: new Date(),
      },
    });
  }

  private async getCompletedBooks(userId: string) {
    return await this.prisma.bookProgress.count({
      where: {
        userId,
        status: BookReadingStatus.COMPLETED,
      },
    });
  }

  private async getCurrentlyReading(userId: string) {
    return await this.prisma.bookProgress.count({
      where: {
        userId,
        status: BookReadingStatus.READING,
      },
    });
  }

  private async getTotalPages(userId: string) {
    const result = await this.prisma.bookProgress.aggregate({
      where: {
        userId,
        status: BookReadingStatus.COMPLETED,
      },
      _sum: {
        totalPages: true,
      },
    });

    return result._sum.totalPages || 0;
  }

  private async getMonthlyStats(userId: string) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const completedBooks = await this.prisma.bookProgress.findMany({
      where: {
        userId,
        status: BookReadingStatus.COMPLETED,
        completedAt: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        completedAt: true,
        totalPages: true,
      },
      orderBy: {
        completedAt: 'asc',
      },
    });

    const monthlyData: Record<string, { books: number; pages: number }> = {};

    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { books: 0, pages: 0 };
    }

    completedBooks.forEach((book) => {
      if (book.completedAt) {
        const key = `${book.completedAt.getFullYear()}-${String(book.completedAt.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key]) {
          monthlyData[key].books += 1;
          monthlyData[key].pages += book.totalPages || 0;
        }
      }
    });

    return monthlyData;
  }
}
