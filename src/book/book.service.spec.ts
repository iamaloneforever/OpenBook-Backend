import { Test, TestingModule } from "@nestjs/testing";
import { BookService } from "./book.service";
import { PrismaService } from "../prisma/prisma.service";

describe("BookService", () => {
  let service: BookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookService,
        {
          provide: PrismaService,
          useValue: {
            book: {
              findMany: vi.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get(BookService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
