import { Test, TestingModule } from "@nestjs/testing";
import { BookController } from "./book.controller";
import { BookService } from "./book.service";

describe("BookController", () => {
	let controller: BookController;
	let service: BookService;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [BookController],
			providers: [
				{
					provide: BookService,
					useValue: {
						findAll: vi.fn(),
						findOne: vi.fn(),
						create: vi.fn(),
					},
				},
			],
		}).compile();

		controller = module.get(BookController);
		service = module.get(BookService);
	});

	it("should be defined", () => {
		expect(controller).toBeDefined();
	});
	it("Should call bookService.FindOne with correct id ", async () => {
		const id = "cmra83gn5000072sbax0sqhg1";
		vi.mocked(service.findOne).mockResolvedValue({
			id,
			title: "Clean Code",
		} as never);
		const result = await controller.findOne({ id });
		expect(service.findOne).toHaveBeenCalledTimes(1);
		expect(service.findOne).toHaveBeenCalledWith(id);
		expect(result).toEqual({
			id,
			title: "Clean Code",
		});
	});
});
