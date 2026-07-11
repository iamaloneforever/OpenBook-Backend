import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BookService } from './book.service';
import { CreateBookDto } from '../dtos/book/create-book-dto';
import { BookIDParamDto } from '../dtos/shared/is-cuid.dto';
import { JwtAuthGuard } from '../guards/auth/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/Current-user.decorator';
import type { User } from 'src/generated/prisma/client';

@Controller('book')
export class BookController {
  private readonly logger = new Logger(BookController.name);
  constructor(private readonly bookService: BookService) { }
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentUser() user: User) {
    this.logger.log('GET /book');
    return this.bookService.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param() params: BookIDParamDto) {
    return this.bookService.findOne(params.id);
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateBookDto, @CurrentUser() user: User) {
    return this.bookService.create(dto, user.id);
  }
}
