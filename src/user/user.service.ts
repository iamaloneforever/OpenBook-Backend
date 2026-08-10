import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookReadingStatus } from '../generated/prisma/client';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

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

    const [stats, bookStats] = await Promise.all([
      this.getStats(userId),
      this.getBookStats(userId),
    ]);

    return {
      stats,
      summary: this.computeSummary(bookStats),
      monthlyStats: this.buildMonthlyStats(bookStats.books),
      bookStats,
    };
  }

  async getSummary(userId: string) {
    this.logger.debug(`Getting summary for user ${userId}`);

    const [completedBooks, currentlyReading, totalPages] = await Promise.all([
      this.prisma.bookProgress.count({
        where: {
          userId,
          status: BookReadingStatus.COMPLETED,
        },
      }),
      this.prisma.bookProgress.count({
        where: {
          userId,
          status: BookReadingStatus.READING,
        },
      }),
      this.prisma.bookProgress.aggregate({
        where: {
          userId,
          status: BookReadingStatus.COMPLETED,
        },
        _sum: {
          totalPages: true,
        },
      }),
    ]);

    return {
      completedBooks,
      currentlyReading,
      totalPages: totalPages._sum.totalPages || 0,
    };
  }

  async getMonthlyStats(userId: string) {
    this.logger.debug(`Getting monthly stats for user ${userId}`);

    const now = new Date();
    const currentYear = now.getFullYear();

    const completedBooks = await this.prisma.bookProgress.findMany({
      where: {
        userId,
        status: BookReadingStatus.COMPLETED,
        completedAt: {
          gte: new Date(currentYear, 0, 1),
          lt: new Date(currentYear + 1, 0, 1),
        },
      },
      select: {
        status: true,
        completedAt: true,
        totalPages: true,
      },
    });

    return this.buildMonthlyStats(completedBooks);
  }

  async getStreak(userId: string) {
    this.logger.debug(`Getting streak for user ${userId}`);
    const stats = await this.getStats(userId);
    return {
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      lastReadDate: stats.lastReadDate,
    };
  }

  /**
   * Full detailed stats about the user's books: total library size, a
   * breakdown by reading status and a per-book detail list (progress,
   * dates and the rating the user gave each book).
   */
  async getBookStats(userId: string) {
    this.logger.debug(`Getting book stats for user ${userId}`);

    // `totalBooks` counts the user's owned library (Book.ownerId), while
    // `tracked`/`byStatus`/`books` reflect reading progress (BookProgress).
    const [totalBooks, progressList] = await Promise.all([
      this.prisma.book.count({
        where: { ownerId: userId },
      }),
      this.prisma.bookProgress.findMany({
        where: { userId },
        include: {
          book: {
            include: {
              ratings: {
                where: { userId },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const byStatus: Record<BookReadingStatus, number> = {
      [BookReadingStatus.READING]: 0,
      [BookReadingStatus.COMPLETED]: 0,
      [BookReadingStatus.PAUSED]: 0,
      [BookReadingStatus.DROPPED]: 0,
    };

    const books = progressList.map((p) => {
      byStatus[p.status] += 1;

      return {
        bookId: p.bookId,
        title: p.book.title,
        author: p.book.author,
        coverUrl: p.book.coverUrl,
        type: p.book.type,
        status: p.status,
        currentPage: p.currentPage,
        totalPages: p.totalPages,
        progressPercentage: p.progressPercentage,
        startedAt: p.startedAt,
        completedAt: p.completedAt,
        updatedAt: p.updatedAt,
        rating: p.book.ratings[0]?.value ?? null,
      };
    });

    const tracked = books.length;
    const completed = byStatus[BookReadingStatus.COMPLETED];
    const completionRate =
      tracked > 0 ? Math.round((completed / tracked) * 1000) / 10 : 0;

    return {
      totalBooks,
      tracked,
      completionRate,
      byStatus,
      books,
    };
  }

  async updateStatsOnCompletion(userId: string) {
    this.logger.debug(`Updating stats for user ${userId}`);

    const progresses = await this.prisma.bookProgress.findMany({
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

    const totalBooksCompleted = progresses.length;

    const totalPagesRead = progresses.reduce(
      (sum, p) => sum + (p.totalPages ?? 0),
      0,
    );

    const ratings = progresses
      .map((p) => p.book.ratings[0]?.value)
      .filter((rating): rating is number => rating !== undefined);

    const averageRating =
      ratings.length === 0
        ? 0
        : ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;

    const data = {
      totalBooksCompleted,
      totalPagesRead,
      averageRating,
    };

    // upsert ensures a ReadingStats row exists even for first-time users
    await this.prisma.readingStats.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }
  async updateStreak(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await this.getStats(userId);

    // First read ever → start the streak
    if (!stats.lastReadDate) {
      return this.prisma.readingStats.upsert({
        where: { userId },
        update: {
          currentStreak: 1,
          longestStreak: Math.max(1, stats.longestStreak),
          lastReadDate: new Date(),
        },
        create: {
          userId,
          currentStreak: 1,
          longestStreak: Math.max(1, stats.longestStreak),
          lastReadDate: new Date(),
        },
      });
    }

    const lastRead = new Date(stats.lastReadDate);
    lastRead.setHours(0, 0, 0, 0);

    // Already recorded a read today → keep the streak unchanged (idempotent)
    if (today.getTime() === lastRead.getTime()) {
      return stats;
    }

    // Round (not ceil) so a single skipped day is exactly 1 and DST shifts
    // don't falsely count as two days.
    const diffDays = Math.round(
      (today.getTime() - lastRead.getTime()) / (1000 * 60 * 60 * 24),
    );

    // diffDays === 1 → consecutive day, increment. Otherwise the streak broke.
    const newStreak = diffDays === 1 ? stats.currentStreak + 1 : 1;
    const longestStreak = Math.max(newStreak, stats.longestStreak);

    return this.prisma.readingStats.upsert({
      where: { userId },
      update: {
        currentStreak: newStreak,
        longestStreak,
        lastReadDate: new Date(),
      },
      create: {
        userId,
        currentStreak: newStreak,
        longestStreak,
        lastReadDate: new Date(),
      },
    });
  }

  private computeSummary(bookStats: {
    byStatus: Record<BookReadingStatus, number>;
    books: Array<{ status: BookReadingStatus; totalPages: number }>;
  }) {
    return {
      completedBooks: bookStats.byStatus[BookReadingStatus.COMPLETED],
      currentlyReading: bookStats.byStatus[BookReadingStatus.READING],
      totalPages: bookStats.books
        .filter((b) => b.status === BookReadingStatus.COMPLETED)
        .reduce((sum, b) => sum + (b.totalPages ?? 0), 0),
    };
  }

  private buildMonthlyStats(
    books: Array<{
      status: BookReadingStatus;
      completedAt: Date | null;
      totalPages: number;
    }>,
  ) {
    const now = new Date();
    const currentYear = now.getFullYear();

    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear + 1, 0, 1);

    const monthlyData: Record<string, { books: number; pages: number }> = {};

    // ایجاد تمام ماه‌های سال
    for (let month = 0; month < 12; month++) {
      const key = `${currentYear}-${String(month + 1).padStart(2, '0')}`;

      monthlyData[key] = {
        books: 0,
        pages: 0,
      };
    }

    // پر کردن آمار
    for (const book of books) {
      if (book.status !== BookReadingStatus.COMPLETED) continue;
      if (!book.completedAt) continue;
      if (book.completedAt < startOfYear || book.completedAt >= endOfYear) {
        continue;
      }

      const key = `${book.completedAt.getFullYear()}-${String(
        book.completedAt.getMonth() + 1,
      ).padStart(2, '0')}`;

      monthlyData[key].books++;
      monthlyData[key].pages += book.totalPages ?? 0;
    }

    return monthlyData;
  }
}
