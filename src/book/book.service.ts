import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { CreateBookDto } from '../common/dtos/book/create-book-dto';
import { SearchBookDto } from '../common/dtos/book/search-book.dto';
import { UpdateBookDto } from '../common/dtos/book/update-book.dto';

@Injectable()
export class BookService {
	private readonly logger = new Logger(BookService.name);

	constructor(private readonly prisma: PrismaService) { }

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

	async findOne(id: string) {
		const book = await this.prisma.book.findUnique({
			where: {
				id,
			},
		});

		if (!book) {
			throw new NotFoundException('Book not found');
		}

		return book;
	}

	async create(
		dto: CreateBookDto,

		ownerId: string,

		coverUrl?: string,
	) {
		this.logger.log(`Creating book ${dto.title}`);

		try {
			return await this.prisma.book.create({
				data: {
					...dto,

					coverUrl,

					owner: {
						connect: {
							id: ownerId,
						},
					},
				},
			});
		} catch (error) {
			this.handleError(error, 'Failed to create book');
		}
	}

	async updateBook(
		bookId: string,

		dto: UpdateBookDto,

		coverUrl?: string,
	) {
		try {
			return await this.prisma.book.update({
				where: {
					id: bookId,
				},

				data: {
					...dto,

					...(coverUrl && {
						coverUrl,
					}),
				},
			});
		} catch (error) {
			this.handleError(error, 'Failed to update book');
		}
	}

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
			});
		});
	}

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

		throw new BadRequestException(message);
	}
}
