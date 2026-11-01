import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Matches,
  Min,
  IsBoolean,
  IsArray,
  ArrayMaxSize,
  MaxLength,
  ValidateIf,
  ValidateNested,
  IsUrl,
} from 'class-validator';
import { IsCuid } from '../../common/validators/is-cuid.decorator';
import { BookReferenceDto } from '../books/catalog.dto';

export class ChatQuoteDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 1000)
  // eslint-disable-next-line no-control-regex -- quoted text uses the same printable-text policy as messages.
  @Matches(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]*$/u)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  // eslint-disable-next-line no-control-regex -- reject control bytes and unpaired surrogates in JSON quotations.
  @Matches(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]*$/u)
  attribution?: string;
}

export class ChatIdDto {
  @IsCuid()
  id!: string;
}

export class CreateConversationDto {
  @IsCuid()
  recipientId!: string;
}

export class SendMessageDto {
  @IsUUID('4')
  clientMessageId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 4000)
  // eslint-disable-next-line no-control-regex -- reject control bytes that cannot be stored or safely displayed.
  @Matches(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]*$/u)
  content!: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  spoiler?: boolean;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsCuid()
  replyToId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatQuoteDto)
  quote?: ChatQuoteDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => BookReferenceDto)
  books?: BookReferenceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @MaxLength(2048, { each: true })
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      disallow_auth: true,
    },
    { each: true },
  )
  bookUrls?: string[];
}

export class ConversationSocketDto {
  @IsCuid()
  conversationId!: string;
}

export class ChatTypingDto extends ConversationSocketDto {
  @IsBoolean()
  typing!: boolean;
}

export class SendSocketMessageDto extends SendMessageDto {
  @IsCuid()
  conversationId!: string;
}

export class MessageHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  before?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  after?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
