import { IsArray, IsString, MinLength, MaxLength } from 'class-validator';

export class SetTagsDto {
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(50, { each: true })
  tags: string[];
}
