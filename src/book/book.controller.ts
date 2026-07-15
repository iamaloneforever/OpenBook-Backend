import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

import { BookService } from './book.service';
import { CreateBookDto } from '../common/dtos/book/create-book-dto';
import { BookIDParamDto } from '../common/dtos/shared/is-cuid.dto';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/Current-user.decorator';
import type { User } from '../generated/prisma/client';
import { RateBookDto } from '../common/dtos/book/rate-book.dto';
import { SearchBookDto } from '../common/dtos/book/search-book.dto';
import { UpdateBookDto } from '../common/dtos/book/update-book.dto';
import { CoverUploadInterceptor } from '../common/config/multer.config';
import { OwnerGuard } from '../common/guards/auth/owner.guard';
import { Owner } from '../common/decorators/owner.decorator';

@Controller('book')
export class BookController {
  private readonly logger = new Logger(BookController.name);

  constructor(private readonly bookService: BookService) { }

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @Get()
  findAll(@CurrentUser() user: User, @Query() query: SearchBookDto) {
    this.logger.log('GET /book');

    return this.bookService.findAll(user.id, query);
  }
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60) // 60 ثانیه
  @Get(':id')
  @Owner('book')
  findOne(@Param() params: BookIDParamDto) {
    return this.bookService.findOne(params.id);
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(CoverUploadInterceptor)
  create(
    @Body() dto: CreateBookDto,
    @CurrentUser() user: User,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.bookService.create(dto, user.id, file?.path);
  }

  @Post(':id/rate')
  @UseGuards(JwtAuthGuard)
  rateBook(
    @Param('id') id: string,
    @Body() dto: RateBookDto,
    @CurrentUser() user: User,
  ) {
    return this.bookService.rateBook(id, user.id, dto.value);
  }
  @Delete(':id')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Owner('book')
  deleteBook(@Param('id') id: string) {
    return this.bookService.deleteBook(id);
  }
  @Put(':id')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Owner('book')
  updateBook(@Param('id') id: string, @Body() dto: UpdateBookDto) {
    return this.bookService.updateBook(id, dto);
  }
}
