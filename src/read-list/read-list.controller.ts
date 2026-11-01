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
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/Current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateReadListDto } from '../common/dtos/read-list/create-read-list.dto';
import { UpdateReadListDto } from '../common/dtos/read-list/update-read-list.dto';
import { AddBookToReadListDto } from '../common/dtos/read-list/add-book-to-read-list.dto';
import { ReadListIdParamDto } from '../common/dtos/read-list/read-list-id-param.dto';
import {
  AddReadListItemDto,
  DuplicateReadListDto,
  ReadListBookParamDto,
  ReadListCollaboratorDto,
  ReadListCollaboratorParamDto,
  ReadListItemParamDto,
  ReadListItemsQueryDto,
  ReadListQueryDto,
  ReorderReadListDto,
  UpdateReadListItemDto,
} from '../common/dtos/read-list/advanced-read-list.dto';

@Controller('read-list')
@UseGuards(JwtAuthGuard)
export class ReadListController {
  constructor(private readonly lists: ReadListService) {}

  @Get()
  getLists(@CurrentUser() user: AuthUser, @Query() query: ReadListQueryDto) {
    return this.lists.getLists(user.id, query);
  }

  @Get('discover')
  discover(@CurrentUser() user: AuthUser, @Query() query: ReadListQueryDto) {
    return this.lists.getLists(user.id, query, true);
  }

  @Get(':id')
  getList(@Param() params: ReadListIdParamDto, @CurrentUser() user: AuthUser) {
    return this.lists.getList(params.id, user.id);
  }

  @Post()
  createList(@Body() dto: CreateReadListDto, @CurrentUser() user: AuthUser) {
    return this.lists.createList(user.id, dto);
  }

  @Patch(':id')
  updateList(
    @Param() params: ReadListIdParamDto,
    @Body() dto: UpdateReadListDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lists.updateList(params.id, dto, user.id);
  }

  @Delete(':id')
  deleteList(
    @Param() params: ReadListIdParamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lists.deleteList(params.id, user.id);
  }

  @Post(':id/books')
  addBook(
    @Param() params: ReadListIdParamDto,
    @Body() dto: AddBookToReadListDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lists.addBook(
      params.id,
      dto.bookId,
      user.id,
      dto.expectedRevision,
    );
  }

  @Delete(':id/books/:bookId')
  removeBook(
    @Param() params: ReadListBookParamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lists.removeBook(params.id, params.bookId, user.id);
  }

  @Get(':id/items')
  items(
    @Param() params: ReadListIdParamDto,
    @CurrentUser() user: AuthUser,
    @Query() query: ReadListItemsQueryDto,
  ) {
    return this.lists.getItems(params.id, user.id, query);
  }

  @Post(':id/items')
  addItem(
    @Param() params: ReadListIdParamDto,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddReadListItemDto,
  ) {
    return this.lists.addItem(params.id, user.id, dto);
  }

  @Patch(':id/items/order')
  reorder(
    @Param() params: ReadListIdParamDto,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderReadListDto,
  ) {
    return this.lists.reorder(params.id, user.id, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param() params: ReadListItemParamDto,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateReadListItemDto,
  ) {
    return this.lists.updateItem(params.id, params.itemId, user.id, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param() params: ReadListItemParamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lists.removeItem(params.id, params.itemId, user.id);
  }

  @Get(':id/collaborators')
  collaborators(
    @Param() params: ReadListIdParamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lists.collaborators(params.id, user.id);
  }

  @Post(':id/collaborators')
  setCollaborator(
    @Param() params: ReadListIdParamDto,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReadListCollaboratorDto,
  ) {
    return this.lists.setCollaborator(params.id, user.id, dto);
  }

  @Delete(':id/collaborators/:userId')
  removeCollaborator(
    @Param() params: ReadListCollaboratorParamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lists.removeCollaborator(params.id, user.id, params.userId);
  }

  @Post(':id/save')
  save(@Param() params: ReadListIdParamDto, @CurrentUser() user: AuthUser) {
    return this.lists.save(params.id, user.id);
  }

  @Delete(':id/save')
  unsave(@Param() params: ReadListIdParamDto, @CurrentUser() user: AuthUser) {
    return this.lists.unsave(params.id, user.id);
  }

  @Post(':id/duplicate')
  duplicate(
    @Param() params: ReadListIdParamDto,
    @CurrentUser() user: AuthUser,
    @Body() dto: DuplicateReadListDto,
  ) {
    return this.lists.duplicate(params.id, user.id, dto.title);
  }
}
