import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/Current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { JwtAuthGuard } from '../../common/guards/auth/jwt-auth.guard';
import { ChatRateLimitService } from '../chat-rate-limit.service';
import { PublicBooksService } from './public-books.service';
import { BookReferenceDto, BookUrlDto, CatalogSearchDto } from './catalog.dto';
import { referenceFromUrl } from './catalog.types';

@Controller('chat/books')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(
    private readonly books: PublicBooksService,
    private readonly limits: ChatRateLimitService,
  ) {}

  @Get('search')
  async search(
    @CurrentUser() user: AuthUser,
    @Query() query: CatalogSearchDto,
  ) {
    await this.limits.consume('catalog', user.id, 30);
    return this.books.search(query);
  }

  @Get('preview')
  async previewUrl(@CurrentUser() user: AuthUser, @Query() query: BookUrlDto) {
    await this.limits.consume('catalog', user.id, 30);
    return this.books.preview(referenceFromUrl(query.url));
  }

  @Get(':provider/:id')
  async preview(
    @CurrentUser() user: AuthUser,
    @Param() reference: BookReferenceDto,
  ) {
    await this.limits.consume('catalog', user.id, 30);
    return this.books.preview(reference);
  }
}
