import { Test, TestingModule } from "@nestjs/testing";
import { describe, beforeEach, it, expect, vi } from "vitest";

import { BookService } from "./book.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBookDto } from "src/dtos/create-book-dto";

describe("BookService", () => {
  let service: BookService;
  let prisma: {
    book: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      book: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(BookService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should return all books", async () => {
    const books = [
      {
        id: "1",
        title: "Clean Code",
      },
    ];

    prisma.book.findMany.mockResolvedValue(books);

    const result = await service.findAll();

    expect(result).toEqual(books);
    expect(prisma.book.findMany).toHaveBeenCalledOnce();
  });

  it("should return one book", async () => {
    const book = {
      id: "1",
      title: "Clean Code",
    };

    prisma.book.findUnique.mockResolvedValue(book);

    const result = await service.findOne("1");

    expect(result).toEqual(book);
    expect(prisma.book.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
    });
  });

  it("should create a book", async () => {
    const dto: CreateBookDto = {
      title: "Clean Code",
      author: "Robert C. Martin",
    };

    const createdBook = {
      id: "1",
      ...dto,
    };

    prisma.book.create.mockResolvedValue(createdBook);

    const result = await service.create(dto);

    expect(result).toEqual(createdBook);
    expect(prisma.book.create).toHaveBeenCalledWith({
      data: dto,
    });
  });
});
