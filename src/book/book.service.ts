import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  BookType,
  DigitalBookSource,
  Prisma,
  BookProgress,
  BookReadingStatus,
} from '../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ReadStatus } from 'src/common/enums/read-status.enum';

import { CreateBookDto } from '../common/dtos/book/create-book-dto';
import { SearchBookDto } from '../common/dtos/book/search-book.dto';
import { UpdateBookDto } from '../common/dtos/book/update-book.dto';
import { SetTagsDto } from '../common/dtos/book/set-tags.dto';
import { FindByTagsDto } from '../common/dtos/book/find-by-tags.dto';

@Injectable()
export class BookService {
  private readonly logger = new Logger(BookService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --------------------------------------------------------------------------
  // FIND ALL
  // --------------------------------------------------------------------------

  async findAll(userId: string, query: SearchBookDto) {
    this.logger.debug(`Finding books for user ${userId}`);

    const {
      q,
      author,
      minRating,
      maxRating,
      sort = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 10,
    } = query;

    const where: Prisma.BookWhereInput = {
      ownerId: userId,

      ...(q && {
        OR: [
          {
            title: {
              contains: q,
              mode: Prisma.QueryMode.insensitive,
            },
          },

          {
            description: {
              contains: q,
              mode: Prisma.QueryMode.insensitive,
            },
          },

          {
            author: {
              contains: q,
              mode: Prisma.QueryMode.insensitive,
            },
          },

          {
            isbn: {
              contains: q,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      }),

      ...(author && {
        author: {
          contains: author,
          mode: Prisma.QueryMode.insensitive,
        },
      }),

      ...(minRating !== undefined || maxRating !== undefined
        ? {
            averageRating: {
              ...(minRating !== undefined && {
                gte: minRating,
              }),

              ...(maxRating !== undefined && {
                lte: maxRating,
              }),
            },
          }
        : {}),
    };

    const [books, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        where,

        include: {
          digitalBook: true,
          physicalBook: true,
        },

        orderBy: {
          [sort]: order,
        },

        skip: (page - 1) * limit,

        take: limit,
      }),

      this.prisma.book.count({
        where,
      }),
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

  // --------------------------------------------------------------------------
  // FIND ONE
  // --------------------------------------------------------------------------

  async findOne(id: string) {
    const book = await this.prisma.book.findUnique({
      where: {
        id,
      },

      include: {
        digitalBook: true,
        physicalBook: true,
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    return book;
  }

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------

  async create(
    dto: CreateBookDto,

    ownerId: string,

    coverUrl?: string,

    file?: Express.Multer.File,
  ) {
    this.logger.log(`Creating book ${dto.title}`);

    this.validateBookType(dto, file);

    const { digitalBook, physicalBook, publishedAt, ...bookData } = dto;

    try {
      const digitalBookData = this.buildDigitalBookData(digitalBook, file);

      return await this.prisma.book.create({
        data: {
          ...bookData,

          coverUrl,

          publishedAt: publishedAt ? new Date(publishedAt) : undefined,

          owner: {
            connect: {
              id: ownerId,
            },
          },

          ...(dto.type === BookType.DIGITAL
            ? {
                digitalBook: {
                  create: digitalBookData!,
                },
              }
            : {
                physicalBook: {
                  create: physicalBook!,
                },
              }),
        },

        include: {
          digitalBook: true,

          physicalBook: true,
        },
      });
    } catch (error) {
      this.handleError(error, 'Failed to create book');
    }
  }

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------

  async updateBook(
    bookId: string,

    dto: UpdateBookDto,

    coverUrl?: string,

    file?: Express.Multer.File,
  ) {
    try {
      const { digitalBook, physicalBook, publishedAt, ...bookData } = dto;

      return await this.prisma.$transaction(async (tx) => {
        const existingBook = await tx.book.findUnique({
          where: {
            id: bookId,
          },

          include: {
            digitalBook: true,

            physicalBook: true,
          },
        });

        if (!existingBook) {
          throw new NotFoundException('Book not found');
        }

        // جلوگیری از تغییر نوع کتاب
        if (dto.type && dto.type !== existingBook.type) {
          throw new BadRequestException('Changing book type is not allowed');
        }

        const currentType = existingBook.type;

        // DIGITAL
        if (currentType === BookType.DIGITAL) {
          if (physicalBook) {
            throw new BadRequestException(
              'Digital books cannot have physical book data',
            );
          }

          if (digitalBook?.url && file) {
            throw new BadRequestException(
              'Provide either a URL or an EPUB file, not both',
            );
          }

          if (file) {
            await tx.digitalBook.update({
              where: {
                bookId,
              },

              data: {
                source: DigitalBookSource.FILE,

                url: null,

                filePath: `/uploads/books/${file.filename}`,

                fileType: 'EPUB',

                fileSize: file.size,
              },
            });
          } else if (digitalBook?.url) {
            await tx.digitalBook.update({
              where: {
                bookId,
              },

              data: {
                source: DigitalBookSource.URL,

                url: digitalBook.url,

                filePath: null,

                fileType: null,

                fileSize: null,
              },
            });
          }
        }

        // PHYSICAL
        if (currentType === BookType.PHYSICAL) {
          if (digitalBook) {
            throw new BadRequestException(
              'Physical books cannot have digital book data',
            );
          }

          if (file) {
            throw new BadRequestException(
              'Physical books cannot have an EPUB file',
            );
          }

          if (physicalBook) {
            await tx.physicalBook.update({
              where: {
                bookId,
              },

              data: physicalBook,
            });
          }
        }

        return tx.book.update({
          where: {
            id: bookId,
          },

          data: {
            ...bookData,

            publishedAt:
              publishedAt !== undefined ? new Date(publishedAt) : undefined,

            ...(coverUrl && {
              coverUrl,
            }),
          },

          include: {
            digitalBook: true,

            physicalBook: true,
          },
        });
      });
    } catch (error) {
      this.handleError(error, 'Failed to update book');
    }
  }

  // --------------------------------------------------------------------------
  // DELETE
  // --------------------------------------------------------------------------

  async deleteBook(bookId: string) {
    try {
      await this.prisma.book.delete({
        where: {
          id: bookId,
        },
      });

      return {
        message: 'Book deleted successfully',
      };
    } catch (error) {
      this.handleError(error, 'Failed to delete book');
    }
  }

  // --------------------------------------------------------------------------
  // RATE
  // --------------------------------------------------------------------------

  async rateBook(
    bookId: string,

    userId: string,

    value: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const book = await tx.book.findUnique({
        where: {
          id: bookId,
        },
      });

      if (!book) {
        throw new NotFoundException('Book not found');
      }

      const rating = await tx.rating.findUnique({
        where: {
          userId_bookId: {
            userId,

            bookId,
          },
        },
      });

      if (rating) {
        await tx.rating.update({
          where: {
            id: rating.id,
          },

          data: {
            value,
          },
        });
      } else {
        await tx.rating.create({
          data: {
            value,

            userId,

            bookId,
          },
        });
      }

      const stats = await tx.rating.aggregate({
        where: {
          bookId,
        },

        _avg: {
          value: true,
        },

        _count: {
          value: true,
        },
      });

      return tx.book.update({
        where: {
          id: bookId,
        },

        data: {
          averageRating: stats._avg.value ?? 0,

          ratingsCount: stats._count.value,
        },

        include: {
          digitalBook: true,

          physicalBook: true,
        },
      });
    });
  }

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  private validateBookType(
    dto: CreateBookDto,

    file?: Express.Multer.File,
  ) {
    // DIGITAL
    if (dto.type === BookType.DIGITAL) {
      if (dto.physicalBook) {
        throw new BadRequestException(
          'Digital books cannot have physical book data',
        );
      }

      if (!dto.digitalBook?.url && !file) {
        throw new BadRequestException(
          'Digital books must have either a URL or an EPUB file',
        );
      }

      if (dto.digitalBook?.url && file) {
        throw new BadRequestException(
          'Provide either a URL or an EPUB file, not both',
        );
      }

      return;
    }

    // PHYSICAL
    if (dto.type === BookType.PHYSICAL) {
      if (dto.digitalBook) {
        throw new BadRequestException(
          'Physical books cannot have digital book data',
        );
      }

      if (!dto.physicalBook) {
        throw new BadRequestException('Physical book data is required');
      }

      if (file) {
        throw new BadRequestException(
          'Physical books cannot have an EPUB file',
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // DIGITAL BOOK DATA
  // --------------------------------------------------------------------------

  private buildDigitalBookData(
    digitalBook: CreateBookDto['digitalBook'],

    file?: Express.Multer.File,
  ) {
    if (digitalBook?.url) {
      return {
        source: DigitalBookSource.URL,

        url: digitalBook.url,

        filePath: null,

        fileType: null,

        fileSize: null,
      };
    }

    if (file) {
      return {
        source: DigitalBookSource.FILE,

        url: null,

        filePath: `/uploads/books/${file.filename}`,

        fileType: 'EPUB',

        fileSize: file.size,
      };
    }

    return undefined;
  }

  // --------------------------------------------------------------------------
  // ERROR HANDLING
  // --------------------------------------------------------------------------

  private handleError(
    error: unknown,

    message: string,
  ): never {
    this.logger.error(
      message,

      error instanceof Error ? error.stack : String(error),
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('ISBN already exists');
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Book not found');
    }

    throw new BadRequestException(message);
  }

  // --------------------------------------------------------------------------
  // PROGRESS TRACKING
  // --------------------------------------------------------------------------

  async getProgress(
    bookId: string,
    userId: string,
  ): Promise<
    | BookProgress
    | {
        currentPage: number;
        totalPages: number;
        progressPercentage: number;
        status: ReadStatus | string;
      }
  > {
    const progress = await this.prisma.bookProgress.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    return (
      progress || {
        currentPage: 0,
        totalPages: 0,
        progressPercentage: 0,
        status: 'reading',
      }
    );
  }

  async setProgress(
    bookId: string,
    userId: string,
    data: { currentPage: number; totalPages?: number; status?: ReadStatus },
  ) {
    // validate status explicitly (extra guard in addition to DTO validation)
    if (data.status && !Object.values(ReadStatus).includes(data.status)) {
      throw new BadRequestException('Invalid status value');
    }

    return this.prisma.$transaction(async (tx) => {
      const book = await tx.book.findUnique({
        where: { id: bookId },
      });

      if (!book) {
        throw new NotFoundException('Book not found');
      }

      const totalPages = data.totalPages || book.totalPages || 0;
      const progressPercentage =
        totalPages > 0 ? Math.round((data.currentPage / totalPages) * 100) : 0;

      const existingProgress = await tx.bookProgress.findUnique({
        where: {
          userId_bookId: {
            userId,
            bookId,
          },
        },
      });

      if (existingProgress) {
        return tx.bookProgress.update({
          where: {
            id: existingProgress.id,
          },
          data: {
            currentPage: data.currentPage,
            totalPages: data.totalPages || existingProgress.totalPages,
            progressPercentage,
            status: (data.status as unknown as BookReadingStatus) || existingProgress.status || BookReadingStatus.READING,
            completedAt: (data.status || existingProgress.status) === ReadStatus.COMPLETED ? new Date() : null,
            updatedAt: new Date(),
          },
        });
      } else {
        return tx.bookProgress.create({
          data: {
            userId,
            bookId,
            currentPage: data.currentPage,
            totalPages,
            progressPercentage,
            status: (data.status as unknown as BookReadingStatus) || BookReadingStatus.READING,
          },
        });
      }
    });
  }

  // --------------------------------------------------------------------------
  // TOP BOOKS
  // --------------------------------------------------------------------------

  async getTopBooks(
    page: number = 1,
    limit: number = 10,
    sort: 'rating' | 'reads' | 'trending' = 'rating',
  ) {
    const orderBy: Prisma.BookOrderByWithRelationInput =
      sort === 'rating'
        ? { averageRating: 'desc' }
        : sort === 'reads'
          ? { ratingsCount: 'desc' }
          : { updatedAt: 'desc' };

    const [books, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          owner: {
            select: {
              id: true,
              username: true,
            },
          },
          digitalBook: true,
          physicalBook: true,
          _count: {
            select: {
              ratings: true,
            },
          },
        },
      }),
      this.prisma.book.count(),
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

  // --------------------------------------------------------------------------
  // BOOK WITH PROGRESS
  // --------------------------------------------------------------------------

  async findOneWithProgress(id: string, userId?: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        digitalBook: true,
        physicalBook: true,
        tags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: {
            ratings: true,
            progress: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    let progress:
      | BookProgress
      | {
          currentPage: number;
          totalPages: number;
          progressPercentage: number;
          status: string;
        }
      | null = null;
    if (userId) {
      progress = await this.getProgress(id, userId);
    }

    return {
      ...book,
      tags: book.tags.map((bt) => bt.tag.name),
      progress,
      stats: {
        totalReaders: book._count.progress,
        totalRatings: book._count.ratings,
        averageRating: book.averageRating,
      },
    };
  }

  // --------------------------------------------------------------------------
  // SET TAGS
  // --------------------------------------------------------------------------

  async setTags(bookId: string, dto: SetTagsDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const book = await tx.book.findUnique({
          where: { id: bookId },
        });

        if (!book) {
          throw new NotFoundException('Book not found');
        }

        // Get or create tags
        const tags = await Promise.all(
          dto.tags.map((tagName) =>
            tx.tag.upsert({
              where: { name: tagName.toLowerCase().trim() },
              update: {},
              create: { name: tagName.toLowerCase().trim() },
            }),
          ),
        );

        // Remove all existing tags for this book
        await tx.bookTag.deleteMany({
          where: { bookId },
        });

        // Add new tags
        await tx.bookTag.createMany({
          data: tags.map((tag) => ({
            bookId,
            tagId: tag.id,
          })),
        });

        return tx.book.findUnique({
          where: { id: bookId },
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        });
      });
    } catch (error) {
      this.handleError(error, 'Failed to set tags');
    }
  }

  // --------------------------------------------------------------------------
  // ADD TAGS
  // --------------------------------------------------------------------------

  async addTags(bookId: string, dto: SetTagsDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const book = await tx.book.findUnique({
          where: { id: bookId },
        });

        if (!book) {
          throw new NotFoundException('Book not found');
        }

        // Get existing tags
        const existingTags = await tx.bookTag.findMany({
          where: { bookId },
          include: { tag: true },
        });

        const existingTagNames = new Set(
          existingTags.map((bt) => bt.tag.name.toLowerCase()),
        );

        // Get or create new tags and filter out duplicates
        const tagsToAdd = await Promise.all(
          dto.tags
            .map((tagName) => tagName.toLowerCase().trim())
            .filter((tagName) => !existingTagNames.has(tagName))
            .map((tagName) =>
              tx.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName },
              }),
            ),
        );

        // Add new tags
        if (tagsToAdd.length > 0) {
          await tx.bookTag.createMany({
            data: tagsToAdd.map((tag) => ({
              bookId,
              tagId: tag.id,
            })),
          });
        }

        return tx.book.findUnique({
          where: { id: bookId },
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
          },
        });
      });
    } catch (error) {
      this.handleError(error, 'Failed to add tags');
    }
  }

  // --------------------------------------------------------------------------
  // REMOVE TAGS
  // --------------------------------------------------------------------------

  async removeTags(bookId: string, dto: SetTagsDto) {
    try {
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
      });

      if (!book) {
        throw new NotFoundException('Book not found');
      }

      const tagsToRemove = dto.tags.map((t) => t.toLowerCase().trim());

      await this.prisma.bookTag.deleteMany({
        where: {
          bookId,
          tag: {
            name: {
              in: tagsToRemove,
            },
          },
        },
      });

      return this.prisma.book.findUnique({
        where: { id: bookId },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'Failed to remove tags');
    }
  }

  // --------------------------------------------------------------------------
  // FIND BY TAGS
  // --------------------------------------------------------------------------

  async findByTags(userId: string, dto: FindByTagsDto) {
    try {
      const {
        tags,
        page = 1,
        limit = 10,
      } = dto;

      const tagsLower = tags.map((t) => t.toLowerCase().trim());

      const [books, total] = await this.prisma.$transaction([
        this.prisma.book.findMany({
          where: {
            ownerId: userId,
            tags: {
              some: {
                tag: {
                  name: {
                    in: tagsLower,
                  },
                },
              },
            },
          },
          include: {
            digitalBook: true,
            physicalBook: true,
            tags: {
              include: {
                tag: true,
              },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.book.count({
          where: {
            ownerId: userId,
            tags: {
              some: {
                tag: {
                  name: {
                    in: tagsLower,
                  },
                },
              },
            },
          },
        }),
      ]);

      return {
        data: books.map((book) => ({
          ...book,
          tags: book.tags.map((bt) => bt.tag.name),
        })),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.handleError(error, 'Failed to find books by tags');
    }
  }

  // --------------------------------------------------------------------------
  // GET ALL TAGS
  // --------------------------------------------------------------------------

  async getAllTags() {
    return this.prisma.tag.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            books: true,
          },
        },
      },
    });
  }
}
