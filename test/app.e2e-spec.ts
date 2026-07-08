import { Test } from "@nestjs/testing";
import {
	INestApplication,
	ValidationPipe,
	NotFoundException,
} from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { BookService } from "../src/book/book.service";

describe("BookController (e2e)", () => {
	let app: INestApplication;

	const bookId = "c123456789012345678901234";
	const missingBookId = "c999999999999999999999999";

	const bookServiceMock = {
		findAll: vi.fn(),
		findOne: vi.fn(),
		create: vi.fn(),
	};

	beforeEach(async () => {
		vi.resetAllMocks();

		bookServiceMock.findAll.mockResolvedValue([
			{
				id: bookId,
				title: "Clean Code",
				author: "Robert C. Martin",
			},
		]);

		bookServiceMock.findOne.mockResolvedValue({
			id: bookId,
			title: "Clean Code",
			author: "Robert C. Martin",
		});

		bookServiceMock.create.mockImplementation(async (dto) => ({
			id: bookId,
			...dto,
		}));

		const module = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(BookService)
			.useValue(bookServiceMock)
			.compile();

		app = module.createNestApplication();

		app.useGlobalPipes(
			new ValidationPipe({
				whitelist: true,
				transform: true,
			}),
		);

		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	describe("GET /book", () => {
		it("should return all books", async () => {
			const res = await request(app.getHttpServer()).get("/book").expect(200);

			expect(res.body).toEqual([
				{
					id: bookId,
					title: "Clean Code",
					author: "Robert C. Martin",
				},
			]);

			expect(bookServiceMock.findAll).toHaveBeenCalledOnce();
		});
	});

	describe("GET /book/:id", () => {
		it("should return a book", async () => {
			const res = await request(app.getHttpServer())
				.get(`/book/${bookId}`)
				.expect(200);

			expect(res.body).toEqual({
				id: bookId,
				title: "Clean Code",
				author: "Robert C. Martin",
			});

			expect(bookServiceMock.findOne).toHaveBeenCalledWith(bookId);
			expect(bookServiceMock.findOne).toHaveBeenCalledOnce();
		});

		it("should return 404 when book does not exist", async () => {
			bookServiceMock.findOne.mockRejectedValueOnce(
				new NotFoundException("Book not found"),
			);
			await request(app.getHttpServer())
				.get(`/book/${missingBookId}`)
				.expect(404);

			expect(bookServiceMock.findOne).toHaveBeenCalledWith(missingBookId);
			expect(bookServiceMock.findOne).toHaveBeenCalledOnce();
		});

		it("should return 400 for an invalid CUID", async () => {
			await request(app.getHttpServer()).get("/book/1").expect(400);

			expect(bookServiceMock.findOne).not.toHaveBeenCalled();
		});
	});

	describe("POST /book", () => {
		it("should create a book", async () => {
			const dto = {
				title: "The Pragmatic Programmer",
				author: "Andrew Hunt",
			};

			const res = await request(app.getHttpServer())
				.post("/book")
				.send(dto)
				.expect(201);

			expect(res.body).toEqual({
				id: bookId,
				...dto,
			});

			expect(bookServiceMock.create).toHaveBeenCalledWith(dto);
			expect(bookServiceMock.create).toHaveBeenCalledOnce();
		});

		it("should reject an invalid body", async () => {
			await request(app.getHttpServer()).post("/book").send({}).expect(400);

			expect(bookServiceMock.create).not.toHaveBeenCalled();
		});
	});
});
