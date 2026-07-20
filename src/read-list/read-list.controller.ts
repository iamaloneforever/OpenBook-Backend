import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ReadListService } from './read-list.service';

import { JwtAuthGuard } from 'src/common/guards/auth/jwt-auth.guard';
import { OwnerGuard } from 'src/common/guards/auth/owner.guard';

import { CurrentUser } from 'src/common/decorators/Current-user.decorator';

import type { User } from 'src/generated/prisma/client';

import { CreateReadListDto } from 'src/common/dtos/read-list/create-read-list.dto';
import { UpdateReadListDto } from 'src/common/dtos/read-list/update-read-list.dto';
import { AddBookToReadListDto } from 'src/common/dtos/read-list/add-book-to-read-list.dto';
import { PaginationDto } from 'src/common/dtos/shared/pagination.dto';
import { Owner } from 'src/common/decorators/owner.decorator';

@Controller('read-list')
@UseGuards(JwtAuthGuard)
export class ReadListController {
  constructor(private readonly readListService: ReadListService) {}

  @Get()
  getLists(@CurrentUser() user: User, @Query() query: PaginationDto) {
    return this.readListService.getLists(
      user.id,
      query.page || 1,
      query.limit || 10,
    );
  }

  @Get(':id')
  @UseGuards(OwnerGuard)
  @Owner('readList')
  getList(@Param('id') id: string) {
    return this.readListService.getList(id);
  }

  @Post()
  createList(@Body() dto: CreateReadListDto, @CurrentUser() user: User) {
    return this.readListService.createList(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(OwnerGuard)
  @Owner('readList')
  updateList(@Param('id') id: string, @Body() dto: UpdateReadListDto) {
    return this.readListService.updateList(id, dto);
  }

  @Delete(':id')
  @UseGuards(OwnerGuard)
  @Owner('readList')
  deleteList(@Param('id') id: string) {
    return this.readListService.deleteList(id);
  }

  @Post(':id/books')
  @UseGuards(OwnerGuard)
  @Owner('readList')
  addBook(@Param('id') id: string, @Body() dto: AddBookToReadListDto) {
    return this.readListService.addBook(id, dto.bookId);
  }

  @Delete(':id/books/:bookId')
  @UseGuards(OwnerGuard)
  @Owner('readList')
  removeBook(@Param('id') id: string, @Param('bookId') bookId: string) {
    return this.readListService.removeBook(id, bookId);
  }
}
