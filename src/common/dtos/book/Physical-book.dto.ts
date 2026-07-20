import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PhysicalBookSource } from 'src/generated/prisma/enums';

export class PhysicalBookDto {
  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  country: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsEnum(PhysicalBookSource)
  source?: PhysicalBookSource;

  @IsOptional()
  @IsString()
  borrowedBy?: string;

  @IsOptional()
  @IsDateString()
  returnDate?: string;
}
