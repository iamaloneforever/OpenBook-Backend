import { IsOptional, IsUrl } from 'class-validator';

export class DigitalBookDto {
  @IsOptional()
  @IsUrl()
  url?: string;
}
