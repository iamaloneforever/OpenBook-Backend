import { Module } from '@nestjs/common';
import { ReadingStatsController } from './reading-stats.controller';
import { ReadingStatsService } from './reading-stats.service';

@Module({
  controllers: [ReadingStatsController],
  providers: [ReadingStatsService],
  exports: [ReadingStatsService],
})
export class ReadingStatsModule {}
