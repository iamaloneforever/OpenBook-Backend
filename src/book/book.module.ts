import { Module } from '@nestjs/common';
import { BookController } from './book.controller';
import { BookService } from './book.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [BookController],
  providers: [BookService],
})
export class BookModule { }
