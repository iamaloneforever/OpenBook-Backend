import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ReadListVisibility } from '../../../generated/prisma/enums';

export class CreateReadListDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^\p{Cc}\p{Cs}]+$/u)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^\p{Cc}\p{Cs}]*$/u)
  description?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(2048)
  coverUrl?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(ReadListVisibility)
  visibility?: ReadListVisibility;
}
