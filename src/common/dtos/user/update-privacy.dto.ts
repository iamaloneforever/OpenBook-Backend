import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePrivacyDto {
  @IsOptional()
  @IsBoolean()
  showBooks?: boolean;

  @IsOptional()
  @IsBoolean()
  showReadlists?: boolean;
}
