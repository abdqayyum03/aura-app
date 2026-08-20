import { IsOptional, IsString, MinLength } from 'class-validator';

export class PairDeviceDto {
  @IsString()
  @MinLength(4)
  deviceCode: string;

  @IsOptional()
  @IsString()
  label?: string;
}
