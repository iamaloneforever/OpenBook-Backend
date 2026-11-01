import { IsOptional, IsUrl, MaxLength } from 'class-validator';

export class DigitalBookDto {
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(2048)
  url?: string;
}
