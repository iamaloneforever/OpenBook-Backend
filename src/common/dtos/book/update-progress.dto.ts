import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  currentPage: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalPages?: number;

  @IsOptional()
  @IsString()
  status?: 'reading' | 'completed' | 'paused' | 'dropped';
}
