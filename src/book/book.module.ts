import { Module } from '@nestjs/common';
import { BookController } from './book.controller';
import { BookService } from './book.service';
import { UserModule } from '../user/user.module';
import { BookFilesService } from './book-files.service';

@Module({
  imports: [UserModule],
  controllers: [BookController],
  providers: [BookService, BookFilesService],
})
export class BookModule {}
