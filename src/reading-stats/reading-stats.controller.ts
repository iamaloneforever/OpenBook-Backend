import {
  Controller,
  Get,
  Logger,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ReadingStatsService } from './reading-stats.service';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/Current-user.decorator';
import type { User } from '../generated/prisma/client';

@Controller('reading-stats')
export class ReadingStatsController {
  private readonly logger = new Logger(ReadingStatsController.name);

  constructor(private readonly readingStatsService: ReadingStatsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300000)
  async getStats(@CurrentUser() user: User) {
    this.logger.debug(`Getting stats for user ${user.id}`);
    return this.readingStatsService.getStats(user.id);
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300000)
  async getDashboard(@CurrentUser() user: User) {
    this.logger.debug(`Getting dashboard for user ${user.id}`);
    return this.readingStatsService.getDashboard(user.id);
  }
}
