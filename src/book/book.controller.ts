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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { UserCacheInterceptor } from '../common/interceptors/user-cache.interceptor';

import { BookService } from './book.service';
import { BookFilesService } from './book-files.service';

import { CreateBookDto } from '../common/dtos/book/create-book-dto';
import { UpdateBookDto } from '../common/dtos/book/update-book.dto';
import { SearchBookDto } from '../common/dtos/book/search-book.dto';
import { RateBookDto } from '../common/dtos/book/rate-book.dto';
import { UpdateProgressDto } from '../common/dtos/book/update-progress.dto';
import { SetTagsDto } from '../common/dtos/book/set-tags.dto';
import { FindByTagsDto } from '../common/dtos/book/find-by-tags.dto';
import { TopBooksQueryDto } from '../common/dtos/shared/pagination.dto';

import { BookIDParamDto } from '../common/dtos/shared/is-cuid.dto';

import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { OwnerGuard } from '../common/guards/auth/owner.guard';

import { CurrentUser } from '../common/decorators/Current-user.decorator';
import { Owner } from '../common/decorators/owner.decorator';

import type { User } from '../generated/prisma/client';

import {
  BookUploadInterceptor,
  BookUploadValidationInterceptor,
} from '../common/config/multer.config';

@Controller('book')
export class BookController {
  private readonly logger = new Logger(BookController.name);

  constructor(
    private readonly bookService: BookService,
    private readonly bookFiles: BookFilesService,
  ) {}

  @Get(':id/file')
  @UseGuards(JwtAuthGuard)
  download(@Param() params: BookIDParamDto, @CurrentUser() user: User) {
    return this.bookFiles.download(params.id, user.id);
  }

  // --------------------------------------------------------------------------
  // GET ALL BOOKS
  // --------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(6000)
  @Get()
  findAll(
    @CurrentUser() user: User,

    @Query() query: SearchBookDto,
  ) {
    this.logger.log('GET /book');

    return this.bookService.findAll(
      user.id,

      query,
    );
  }

  // --------------------------------------------------------------------------
  // GET TOP BOOKS
  // --------------------------------------------------------------------------

  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3000)
  @Get('top/trending')
  getTopBooks(@Query() query: TopBooksQueryDto) {
    this.logger.log('GET /book/top/trending');

    return this.bookService.getTopBooks(
      query.page || 1,
      query.limit || 10,
      query.sort || 'rating',
    );
  }

  // --------------------------------------------------------------------------
  // GET ONE BOOK
  // --------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard, OwnerGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(6000)
  @Get(':id')
  @Owner('book')
  findOne(@Param() params: BookIDParamDto, @CurrentUser() user: User) {
    return this.bookService.findOneWithProgress(params.id, user.id);
  }

  // --------------------------------------------------------------------------
  // GET BOOK PROGRESS
  // --------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Get(':id/progress')
  @Owner('book')
  getProgress(@Param() params: BookIDParamDto, @CurrentUser() user: User) {
    return this.bookService.getProgress(params.id, user.id);
  }

  // --------------------------------------------------------------------------
  // SET BOOK PROGRESS
  // --------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Post(':id/progress')
  @Owner('book')
  setProgress(
    @Param() params: BookIDParamDto,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: User,
  ) {
    return this.bookService.setProgress(params.id, user.id, dto);
  }

  // --------------------------------------------------------------------------
  // CREATE BOOK
  // --------------------------------------------------------------------------

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(BookUploadInterceptor, BookUploadValidationInterceptor)
  create(
    @Body() dto: CreateBookDto,

    @CurrentUser()
    user: User,

    @UploadedFiles()
    files?: {
      cover?: Express.Multer.File[];

      file?: Express.Multer.File[];
    },
  ) {
    const cover = files?.cover?.[0];

    const epub = files?.file?.[0];

    return this.bookService.create(
      dto,

      user.id,

      cover ? `/uploads/books/covers/${cover.filename}` : undefined,

      epub,
    );
  }

  // --------------------------------------------------------------------------
  // RATE BOOK
  // --------------------------------------------------------------------------

  @Post(':id/rate')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Owner('book')
  rateBook(
    @Param('id') id: string,

    @Body() dto: RateBookDto,

    @CurrentUser()
    user: User,
  ) {
    return this.bookService.rateBook(
      id,

      user.id,

      dto.value,
    );
  }

  // --------------------------------------------------------------------------
  // DELETE BOOK
  // --------------------------------------------------------------------------

  @Delete(':id')
  @UseGuards(
    JwtAuthGuard,

    OwnerGuard,
  )
  @Owner('book')
  deleteBook(@Param('id') id: string) {
    return this.bookService.deleteBook(id);
  }

  // --------------------------------------------------------------------------
  // UPDATE BOOK
  // --------------------------------------------------------------------------

  @Put(':id')
  @UseGuards(
    JwtAuthGuard,

    OwnerGuard,
  )
  @Owner('book')
  @UseInterceptors(BookUploadInterceptor, BookUploadValidationInterceptor)
  updateBook(
    @Param('id') id: string,

    @Body() dto: UpdateBookDto,

    @UploadedFiles()
    files?: {
      cover?: Express.Multer.File[];

      file?: Express.Multer.File[];
    },
  ) {
    const cover = files?.cover?.[0];

    const epub = files?.file?.[0];

    return this.bookService.updateBook(
      id,

      dto,

      cover ? `/uploads/books/covers/${cover.filename}` : undefined,

      epub,
    );
  }

  // --------------------------------------------------------------------------
  // SET TAGS
  // --------------------------------------------------------------------------

  @Post(':id/tags')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Owner('book')
  setTags(@Param('id') id: string, @Body() dto: SetTagsDto) {
    this.logger.log(`POST /book/${id}/tags`);
    return this.bookService.setTags(id, dto);
  }

  // --------------------------------------------------------------------------
  // ADD TAGS
  // --------------------------------------------------------------------------

  @Put(':id/tags/add')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Owner('book')
  addTags(@Param('id') id: string, @Body() dto: SetTagsDto) {
    this.logger.log(`PUT /book/${id}/tags/add`);
    return this.bookService.addTags(id, dto);
  }

  // --------------------------------------------------------------------------
  // REMOVE TAGS
  // --------------------------------------------------------------------------

  @Delete(':id/tags')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @Owner('book')
  removeTags(@Param('id') id: string, @Body() dto: SetTagsDto) {
    this.logger.log(`DELETE /book/${id}/tags`);
    return this.bookService.removeTags(id, dto);
  }

  // --------------------------------------------------------------------------
  // FIND BY TAGS
  // --------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(6000)
  @Get('tags/search')
  findByTags(@CurrentUser() user: User, @Query() query: FindByTagsDto) {
    this.logger.log('GET /book/tags/search');
    return this.bookService.findByTags(user.id, query);
  }

  // --------------------------------------------------------------------------
  // GET ALL TAGS
  // --------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(3000)
  @Get('tags/all')
  getAllTags(@CurrentUser() user: User) {
    this.logger.log('GET /book/tags/all');
    return this.bookService.getAllTags(user.id);
  }
}
