import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

import { FileInterceptor } from '@nestjs/platform-express';

import { BookService } from './book.service';
import { CreateBookDto } from '../dtos/book/create-book-dto';
import { BookIDParamDto } from '../dtos/shared/is-cuid.dto';
import { JwtAuthGuard } from '../guards/auth/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/Current-user.decorator';
import type { User } from 'src/generated/prisma/client';
import { RateBookDto } from 'src/dtos/book/rate-book.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { SearchBookDto } from 'src/dtos/book/search-book.dto';

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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60) // 60 ثانیه
  @Get(':id')
  findOne(@Param() params: BookIDParamDto) {
    return this.bookService.findOne(params.id);
  }
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: diskStorage({
        destination: './uploads/books/covers',

        filename: (_, file, callback) => {
          const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

          callback(null, uniqueName + extname(file.originalname));
        },
      }),

      fileFilter: (_, file, callback) => {
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

        const ext = extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
          return callback(
            new BadRequestException(
              'Only jpg, jpeg, png and webp images are allowed',
            ),
            false,
          );
        }

        callback(null, true);
      },

      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  create(
    @Body() dto: CreateBookDto,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
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
}
