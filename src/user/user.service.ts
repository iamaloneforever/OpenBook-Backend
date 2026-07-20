import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async GetUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        username: true,
        createdAt: true,
        _count: {
          select: {
            books: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const daysSinceSignup = Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      id: user.id,
      username: user.username,
      joinedAt: user.createdAt,
      daysSinceSignup,
      totalBooks: user._count.books,
    };
  }

  async getUserStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        createdAt: true,
        _count: {
          select: {
            books: true,
            ratings: true,
            readLists: true,
            progress: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get reading statistics
    const progressStats = await this.prisma.bookProgress.groupBy({
      by: ['status'],
      where: { userId },
      _count: {
        id: true,
      },
    });

    const progressChart = progressStats.reduce(
      (acc, stat) => ({
        ...acc,
        [stat.status]: stat._count.id,
      }),
      {},
    );

    // Get average rating given by user
    const avgRating = await this.prisma.rating.aggregate({
      where: { userId },
      _avg: { value: true },
    });

    // Get top rated books by this user
    const topRatedBooks = await this.prisma.rating.findMany({
      where: { userId },
      orderBy: { value: 'desc' },
      take: 5,
      select: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            coverUrl: true,
          },
        },
        value: true,
      },
    });

    // Get reading streak (consecutive days with activity)
    const recentActivity = await this.prisma.bookProgress.findMany({
      where: { userId },
      select: { updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    const daysSinceSignup = Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      profile: {
        id: user.id,
        username: user.username,
        joinedAt: user.createdAt,
        daysSinceSignup,
      },
      statistics: {
        totalBooks: user._count.books,
        totalRatings: user._count.ratings,
        totalReadLists: user._count.readLists,
        booksInProgress: user._count.progress,
        averageRatingGiven: avgRating._avg.value || 0,
      },
      charts: {
        readingStatus: progressChart,
      },
      topRatedBooks: topRatedBooks.map((r) => ({
        ...r.book,
        rating: r.value,
      })),
      recentActivity: recentActivity.slice(0, 10),
    };
  }
}
