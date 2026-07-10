import {
  IsOptional,
  IsString,
  IsISBN,
  IsUrl,
  IsDateString,
  MaxLength,
} from "class-validator";

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
}
