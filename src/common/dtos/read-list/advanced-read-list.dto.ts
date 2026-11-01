import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ReadListRole } from '../../../generated/prisma/enums';
import { IsEnum } from 'class-validator';
import { IsCuid } from '../../validators/is-cuid.decorator';
import { PaginationDto } from '../shared/pagination.dto';
import { BookReferenceDto } from '../../../chat/books/catalog.dto';

export class ReadListMutationDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision?: number;
}

export class ReadListQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['owned', 'saved', 'collaborating', 'all'])
  scope?: 'owned' | 'saved' | 'collaborating' | 'all';
}

export class ReadListItemsQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['position', 'title', 'addedAt'])
  sort?: 'position' | 'title' | 'addedAt';
}

export class AddReadListItemDto extends ReadListMutationDto {
  @IsOptional()
  @IsCuid()
  bookId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookReferenceDto)
  catalogBook?: BookReferenceDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^[^\p{Cc}\p{Cs}]*$/u)
  note?: string | null;
}

export class UpdateReadListItemDto extends ReadListMutationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Matches(/^[^\p{Cc}\p{Cs}]*$/u)
  note?: string | null;
}

export class ReorderReadListDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsCuid({ each: true })
  itemIds!: string[];

  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number;
}

export class ReadListCollaboratorDto extends ReadListMutationDto {
  @IsCuid()
  userId!: string;

  @IsEnum(ReadListRole)
  role!: ReadListRole;
}

export class DuplicateReadListDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[^\p{Cc}\p{Cs}]+$/u)
  title!: string;
}

export class ReadListItemParamDto {
  @IsCuid()
  id!: string;

  @IsCuid()
  itemId!: string;
}

export class ReadListBookParamDto {
  @IsCuid()
  id!: string;

  @IsCuid()
  bookId!: string;
}

export class ReadListCollaboratorParamDto {
  @IsCuid()
  id!: string;

  @IsCuid()
  userId!: string;
}
