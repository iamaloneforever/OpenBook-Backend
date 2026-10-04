import {
  Controller,
  Get,
  Logger,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { UserCacheInterceptor } from '../common/interceptors/user-cache.interceptor';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/Current-user.decorator';
import type { User } from '../generated/prisma/client';

@Controller('user')
export class UserController {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly userService: UserService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(6000)
  async getStats(@CurrentUser() user: User) {
    this.logger.debug(`Getting stats for user ${user.id}`);
    return this.userService.getStats(user.id);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(3000)
  async getDashboard(@CurrentUser() user: User) {
    this.logger.debug(`Getting dashboard for user ${user.id}`);
    return this.userService.getDashboard(user.id);
  }

  // --------------------------------------------------------------------------
  // INDIVIDUAL STAT ENDPOINTS
  // --------------------------------------------------------------------------

  @Get('book-stats')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(3000)
  async getBookStats(@CurrentUser() user: User) {
    this.logger.debug(`Getting book stats for user ${user.id}`);
    return this.userService.getBookStats(user.id);
  }

  @Get('read-list-stats')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(3000)
  async getReadListStats(@CurrentUser() user: User) {
    this.logger.debug(`Getting read list stats for user ${user.id}`);
    return this.userService.getReadListStats(user.id);
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(3000)
  async getSummary(@CurrentUser() user: User) {
    this.logger.debug(`Getting summary for user ${user.id}`);
    return this.userService.getSummary(user.id);
  }

  @Get('monthly-stats')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(3000)
  async getMonthlyStats(@CurrentUser() user: User) {
    this.logger.debug(`Getting monthly stats for user ${user.id}`);
    return this.userService.getMonthlyStats(user.id);
  }

  @Get('streak')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(3000)
  async getStreak(@CurrentUser() user: User) {
    this.logger.debug(`Getting streak for user ${user.id}`);
    return this.userService.getStreak(user.id);
  }
}
