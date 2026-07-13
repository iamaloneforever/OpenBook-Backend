import { Module } from '@nestjs/common';
import { ReadListController } from './read-list.controller';
import { ReadListService } from './read-list.service';

@Module({
  controllers: [ReadListController],
  providers: [ReadListService]
})
export class ReadListModule {}
