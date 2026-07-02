import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { BookService } from './book.service';
import { Book } from 'src/generated/prisma/client';
import { CuidValitationPipe } from 'src/common/pipes/cuid-validation.pipe';

@Controller('book')
export class BookController {
  private readonly logger = new Logger(BookController.name);

  constructor(private readonly bookService: BookService) {}
  @Get('get-books')
  async FindAll(): Promise<Book[]> {
    this.logger.log('Fetching All Books');
    this.logger.log('Books Fetched');
    return this.bookService.FindAll();
  }
  @Get(':id')
  async FindOne(@Param('id', CuidValitationPipe) id: string): Promise<Book> {
    this.logger.log(`Fetching One Book With ID : ${id}`);
    const book = await this.bookService.FindOne(id);
    if (!book) {
      this.logger.error(`Book with ID ${id} not found`);
      throw new NotFoundException(`Book with ID ${id} not found`);
    }
    this.logger.log(`Book With ID ${id} Found`);
    return book;
  }
}
