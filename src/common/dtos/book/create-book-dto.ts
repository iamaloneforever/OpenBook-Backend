import {
  IsOptional,
  IsString,
  IsISBN,
  IsUrl,
  IsDateString,
  MaxLength,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { BookType } from 'src/generated/prisma/enums';
import { DigitalBookDto } from './Digital-book.dto';
import { Type } from 'class-transformer';
import { PhysicalBookDto } from './Physical-book.dto';

export class CreateBookDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MaxLength(100)
  author: string;

  @IsOptional()
  @IsISBN()
  isbn?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @IsEnum(BookType)
  type: BookType;

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalBookDto)
  digitalBook?: DigitalBookDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PhysicalBookDto)
  physicalBook?: PhysicalBookDto;
}
