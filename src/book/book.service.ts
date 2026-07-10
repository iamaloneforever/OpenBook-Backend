import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBookDto } from "src/dtos/book/create-book-dto";

@Injectable()
export class BookService {
	private readonly logger = new Logger(BookService.name);

	constructor(private readonly prisma: PrismaService) {}

	async findAll() {
		this.logger.log("Finding all books");

		return this.prisma.book.findMany({
			orderBy: {
				createdAt: "desc",
			},
		});
	}

	async findOne(id: string) {
		const book = await this.prisma.book.findUnique({
			where: {
				id,
			},
		});

		if (!book) {
			throw new NotFoundException("Book not found");
		}

		return book;
	}

	async create(dto: CreateBookDto) {
		this.logger.log("Creating a new book");

		try {
			return await this.prisma.book.create({
				data: dto,
			});
		} catch (error) {
			this.logger.error("Failed to create book", error);

			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new ConflictException("A book with this ISBN already exists.");
			}

			throw new BadRequestException("Failed to create book.");
		}
	}
}
