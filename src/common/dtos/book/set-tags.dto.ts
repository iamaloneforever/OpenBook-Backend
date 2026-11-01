import {
  IsArray,
  IsString,
  MinLength,
  MaxLength,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';

export class SetTagsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique((tag: unknown) =>
    typeof tag === 'string' ? tag.trim().toLowerCase() : tag,
  )
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(50, { each: true })
  tags!: string[];
}
