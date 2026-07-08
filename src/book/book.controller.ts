import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { BookService } from './book.service';
import { CreateBookDto } from '../dtos/create-book-dto';
import { BookIDParamDto } from '../dtos/is-cuid.dto';

@Controller('book')
export class BookController {
  private readonly logger = new Logger(BookController.name);
  constructor(private readonly bookService: BookService) { }

  @Get()
  async findAll() {
    this.logger.log('GET /book');
    return this.bookService.findAll();
  }

  @Get(':id')
  findOne(@Param() params: BookIDParamDto) {
    return this.bookService.findOne(params.id);
  }
  @Post()
  create(@Body() dto: CreateBookDto) {
    this.logger.log('POST /book');

    return this.bookService.create(dto);
  }
}
