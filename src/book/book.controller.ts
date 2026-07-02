import { Controller, Get, Logger } from "@nestjs/common";
import { BookService } from "./book.service";

@Controller("book")
export class BookController {
	private readonly logger = new Logger(BookController.name);

	constructor(private readonly bookService: BookService) { }
	@Get()
	async FindAll() {
		this.logger.log("Fetching All Books");
		return this.bookService.FindAll();
	}
}
