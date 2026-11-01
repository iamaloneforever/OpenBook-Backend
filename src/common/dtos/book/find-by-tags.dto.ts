import {
  IsArray,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class FindByTagsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? [value] : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @MaxLength(50, { each: true })
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
