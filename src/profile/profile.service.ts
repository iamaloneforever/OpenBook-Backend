import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dtos/shared/pagination.dto';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPublicProfile(userId: string) {
    this.logger.debug(`Getting public profile for user ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        createdAt: true,
        showBooks: true,
        showReadlists: true,
        _count: {
          select: {
            books: true,
            readLists: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      booksVisible: user.showBooks,
      readListsVisible: user.showReadlists,
      bookCount: user._count.books,
      readListCount: user._count.readLists,
    };
  }

  async getProfileBooks(userId: string, query: PaginationDto) {
    this.logger.debug(`Getting profile books for user ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { showBooks: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.showBooks) {
      throw new ForbiddenException('This user has hidden their books');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;

    const [books, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        where: { ownerId: userId },
        include: {
          digitalBook: true,
          physicalBook: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.book.count({ where: { ownerId: userId } }),
    ]);

    return {
      data: books,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProfileReadLists(userId: string, query: PaginationDto) {
    this.logger.debug(`Getting profile read lists for user ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { showReadlists: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.showReadlists) {
      throw new ForbiddenException('This user has hidden their read lists');
    }

    const page = query.page || 1;
    const limit = query.limit || 10;

    const [readLists, total] = await this.prisma.$transaction([
      this.prisma.readList.findMany({
        where: { userId },
        include: {
          _count: {
            select: { items: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.readList.count({ where: { userId } }),
    ]);

    return {
      data: readLists.map((list) => ({
        id: list.id,
        title: list.title,
        description: list.description,
        bookCount: list._count.items,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
