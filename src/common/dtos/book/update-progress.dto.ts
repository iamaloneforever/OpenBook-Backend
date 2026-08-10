import { IsInt, IsOptional, Min, IsEnum } from 'class-validator';
import { BookReadingStatus } from 'src/generated/prisma/enums';

export class UpdateProgressDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  currentPage: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalPages?: number;

  @IsOptional()
  @IsEnum(BookReadingStatus, {
    message: 'status must be one of READING|COMPLETED|PAUSED|DROPPED',
  })
  status?: BookReadingStatus;
}
