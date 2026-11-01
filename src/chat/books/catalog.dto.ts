import { Type, Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

export enum CatalogProvider {
  OPEN_LIBRARY = 'openlibrary',
  GOOGLE = 'google',
}

export class BookReferenceDto {
  @IsEnum(CatalogProvider)
  provider!: CatalogProvider;

  @IsString()
  @Length(1, 64)
  id!: string;
}

export class CatalogSearchDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 200)
  q!: string;

  @IsOptional()
  @IsIn(['all', 'openlibrary', 'google'])
  provider: 'all' | 'openlibrary' | 'google' = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}

export class BookUrlDto {
  @IsUrl({
    protocols: ['https', 'http'],
    require_protocol: true,
    disallow_auth: true,
  })
  @Length(1, 2048)
  url!: string;
}
