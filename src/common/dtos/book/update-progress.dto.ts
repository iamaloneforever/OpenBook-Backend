import { IsInt, IsOptional, Min, Max, IsEnum } from 'class-validator';
import { BookReadingStatus } from '../../../generated/prisma/enums';

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  currentPage!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  totalPages?: number;

  @IsOptional()
  @IsEnum(BookReadingStatus, {
    message: 'status must be one of READING|COMPLETED|PAUSED|DROPPED',
  })
  status?: BookReadingStatus;
}
