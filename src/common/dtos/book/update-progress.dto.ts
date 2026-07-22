import { IsInt, IsOptional, Min, IsEnum } from 'class-validator';
import { ReadStatus } from 'src/common/enums/read-status.enum';

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  currentPage: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalPages?: number;

  @IsOptional()
  @IsEnum(ReadStatus, {
    message: 'status must be one of reading|completed|paused|dropped',
  })
  status?: ReadStatus;
}
