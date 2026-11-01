import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCuid } from '../../common/validators/is-cuid.decorator';

// XML 1.0 cannot represent these controls. Keep social text portable to RSS.
const PORTABLE_TEXT =
  // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these control characters.
  /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]*$/u;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class HandleParamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @Matches(/^[a-z0-9_]{3,30}$/)
  handle!: string;
}

export class SocialIdParamDto {
  @IsCuid()
  id!: string;
}

export class SaveProfileDto extends HandleParamDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  @Matches(PORTABLE_TEXT)
  displayName!: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  @Matches(PORTABLE_TEXT)
  bio?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  avatarUrl?: string | null;

  @IsOptional()
  @IsUrl({
    protocols: ['https', 'http'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(2048)
  websiteUrl?: string | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isPublic?: boolean;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  personalizeFeed?: boolean;
}

export class CreatePostDto {
  @Transform(trim)
  @IsString()
  @Length(1, 280)
  @Matches(PORTABLE_TEXT)
  content!: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsCuid()
  parentId?: string;
}

export class EditPostDto {
  @Transform(trim)
  @IsString()
  @Length(1, 280)
  @Matches(PORTABLE_TEXT)
  content!: string;
}

export enum FeedMode {
  RECENT = 'recent',
  FOLLOWING = 'following',
  FOR_YOU = 'for-you',
}

export class SocialPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  cursor?: string;
}

export class FeedQueryDto extends SocialPageDto {
  @IsOptional()
  @IsEnum(FeedMode)
  mode: FeedMode = FeedMode.FOR_YOU;
}

export class ProfileSearchDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
