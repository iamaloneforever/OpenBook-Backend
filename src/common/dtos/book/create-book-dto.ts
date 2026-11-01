import {
  IsOptional,
  IsString,
  IsISBN,
  IsUrl,
  IsDateString,
  MaxLength,
  IsEnum,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { BookType } from '../../../generated/prisma/enums';
import { DigitalBookDto } from './Digital-book.dto';
import { Type } from 'class-transformer';
import { PhysicalBookDto } from './Physical-book.dto';

export class CreateBookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  author!: string;

  @IsOptional()
  @IsISBN()
  isbn?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(2048)
  coverUrl?: string;

  @IsEnum(BookType)
  type!: BookType;

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalBookDto)
  digitalBook?: DigitalBookDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PhysicalBookDto)
  physicalBook?: PhysicalBookDto;
}
