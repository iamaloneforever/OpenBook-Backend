import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { CreateReadListDto } from '../common/dtos/read-list/create-read-list.dto';
import { UpdateReadListDto } from '../common/dtos/read-list/update-read-list.dto';

@Injectable()
export class ReadListService {
  private readonly logger = new Logger(ReadListService.name);

  constructor(private readonly prisma: PrismaService) { }

  async getLists(userId: string) {
    this.logger.log(`Getting read lists for user ${userId}`);

    return this.prisma.readList.findMany({
      where: {
        userId,
      },

      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getList(id: string) {
    const list = await this.prisma.readList.findUnique({
      where: {
        id,
      },

      include: {
        items: {
          include: {
            book: true,
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Read list not found');
    }

    return list;
  }

  async createList(userId: string, dto: CreateReadListDto) {
    this.logger.log(`Creating read list ${dto.title}`);

    try {
      return await this.prisma.readList.create({
        data: {
          ...dto,

          owner: {
            connect: {
              id: userId,
            },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'Failed to create read list');
    }
  }

  async updateList(id: string, dto: UpdateReadListDto) {
    await this.exists(id);

    return this.prisma.readList.update({
      where: {
        id,
      },

      data: dto,
    });
  }

  async deleteList(id: string) {
    await this.exists(id);

    await this.prisma.readList.delete({
      where: {
        id,
      },
    });

    return {
      message: 'Read list deleted successfully',
    };
  }

  async addBook(listId: string, bookId: string) {
    await this.exists(listId);

    const book = await this.prisma.book.findUnique({
      where: {
        id: bookId,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    try {
      return await this.prisma.readListBook.create({
        data: {
          readListId: listId,

          bookId,
        },
      });
    } catch (error) {
      this.handleError(error, 'Book already exists in this list');
    }
  }

  async removeBook(listId: string, bookId: string) {
    await this.exists(listId);

    const item = await this.prisma.readListBook.findUnique({
      where: {
        readListId_bookId: {
          readListId: listId,

          bookId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Book not found in read list');
    }

    await this.prisma.readListBook.delete({
      where: {
        readListId_bookId: {
          readListId: listId,

          bookId,
        },
      },
    });

    return {
      message: 'Book removed from read list',
    };
  }

  private async exists(id: string) {
    const list = await this.prisma.readList.findUnique({
      where: {
        id,
      },
    });

    if (!list) {
      throw new NotFoundException('Read list not found');
    }

    return list;
  }

  private handleError(error: unknown, message: string): never {
    this.logger.error(
      message,

      error instanceof Error ? error.stack : String(error),
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('This item already exists');
    }

    throw new BadRequestException(message);
  }
}
