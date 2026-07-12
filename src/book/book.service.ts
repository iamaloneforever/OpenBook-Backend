import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookDto } from 'src/dtos/book/create-book-dto';
import { SearchBookDto } from 'src/dtos/book/search-book.dto';

@Injectable()
export class BookService {
	private readonly logger = new Logger(BookService.name);

	constructor(private readonly prisma: PrismaService) { }

	async findAll(userId: string, query: SearchBookDto) {
		this.logger.log(`Finding books for user ${userId}`);
		this.logger.debug(`Search query: ${JSON.stringify(query)}`);

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

		const books = await this.prisma.book.findMany({
			where: {
				ownerId: userId,

				...(q && {
					OR: [
						{
							title: {
								contains: q,
								mode: 'insensitive',
							},
						},
						{
							description: {
								contains: q,
								mode: 'insensitive',
							},
						},
						{
							author: {
								contains: q,
								mode: 'insensitive',
							},
						},
						{
							isbn: {
								contains: q,
								mode: 'insensitive',
							},
						},
					],
				}),

				...(author && {
					author: {
						contains: author,
						mode: 'insensitive',
					},
				}),

				...(minRating !== undefined || maxRating !== undefined
					? {
						averageRating: {
							...(minRating !== undefined && { gte: minRating }),
							...(maxRating !== undefined && { lte: maxRating }),
						},
					}
					: {}),
			},

			orderBy: {
				[sort]: order,
			},

			skip: (page - 1) * limit,
			take: limit,
		});

		this.logger.log(`Found ${books.length} books`);

		return books;
	}

	async findOne(id: string) {
		this.logger.log(`Finding book ${id}`);

		const book = await this.prisma.book.findUnique({
			where: { id },
		});

		if (!book) {
			this.logger.warn(`Book ${id} not found`);
			throw new NotFoundException('Book not found');
		}

		this.logger.log(`Book ${id} found`);

		return book;
	}

	async create(dto: CreateBookDto, ownerId: string, coverUrl?: string) {
		this.logger.log(`Creating book "${dto.title}" for user ${ownerId}`);

		try {
			const book = await this.prisma.book.create({
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

			this.logger.log(`Book ${book.id} created successfully`);

			return book;
		} catch (error) {
			this.logger.error(
				`Failed to create book "${dto.title}"`,
				error instanceof Error ? error.stack : String(error),
			);

			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === 'P2002'
			) {
				throw new ConflictException('A book with this ISBN already exists.');
			}

			throw new BadRequestException('Failed to create book.');
		}
	}

	async rateBook(bookId: string, userId: string, value: number) {
		this.logger.log(`User ${userId} rated book ${bookId} with ${value} stars`);

		return this.prisma.$transaction(async (tx) => {
			const book = await tx.book.findUnique({
				where: { id: bookId },
			});

			if (!book) {
				this.logger.warn(`Book ${bookId} not found`);
				throw new NotFoundException('Book not found');
			}

			const existingRating = await tx.rating.findUnique({
				where: {
					userId_bookId: {
						userId,
						bookId,
					},
				},
			});

			if (existingRating) {
				this.logger.log(`Updating rating for book ${bookId}`);

				await tx.rating.update({
					where: { id: existingRating.id },
					data: { value },
				});
			} else {
				this.logger.log(`Creating rating for book ${bookId}`);

				await tx.rating.create({
					data: {
						userId,
						bookId,
						value,
					},
				});
			}

			const stats = await tx.rating.aggregate({
				where: { bookId },
				_avg: {
					value: true,
				},
				_count: {
					value: true,
				},
			});

			this.logger.debug(
				`Average rating: ${stats._avg.value ?? 0}, Count: ${stats._count.value}`,
			);

			const updatedBook = await tx.book.update({
				where: { id: bookId },
				data: {
					averageRating: stats._avg.value ?? 0,
					ratingsCount: stats._count.value,
				},
			});

			this.logger.log(`Book ${bookId} rating updated successfully`);

			return updatedBook;
		});
	}
}
