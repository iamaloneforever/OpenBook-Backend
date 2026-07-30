import { Module } from '@nestjs/common';
import { BookController } from './book.controller';
import { BookService } from './book.service';
import { ReadingStatsModule } from '../reading-stats/reading-stats.module';

@Module({
  imports: [ReadingStatsModule],
  controllers: [BookController],
  providers: [BookService],
})
export class BookModule {}
