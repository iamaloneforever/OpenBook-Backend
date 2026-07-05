import { Test, TestingModule } from "@nestjs/testing";
import { BookController } from "./book.controller";
import { BookService } from "./book.service";

describe("BookController", () => {
  let controller: BookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookController],
      providers: [
        {
          provide: BookService,
          useValue: {
            findAll: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(BookController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
