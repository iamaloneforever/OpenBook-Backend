import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ProfileService } from './profile.service';
import { ProfileParamsDto } from '../common/dtos/user/profile-params.dto';
import { PaginationDto } from '../common/dtos/shared/pagination.dto';

@Controller('profile')
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private readonly profileService: ProfileService) {}

  @Get(':userId')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3000)
  getProfile(@Param() params: ProfileParamsDto) {
    this.logger.debug(`GET /profile/${params.userId}`);
    return this.profileService.getPublicProfile(params.userId);
  }

  @Get(':userId/books')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3000)
  getProfileBooks(
    @Param() params: ProfileParamsDto,
    @Query() query: PaginationDto,
  ) {
    this.logger.debug(`GET /profile/${params.userId}/books`);
    return this.profileService.getProfileBooks(params.userId, query);
  }

  @Get(':userId/read-lists')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3000)
  getProfileReadLists(
    @Param() params: ProfileParamsDto,
    @Query() query: PaginationDto,
  ) {
    this.logger.debug(`GET /profile/${params.userId}/read-lists`);
    return this.profileService.getProfileReadLists(params.userId, query);
  }
}
