import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { MetricType } from '../../database/entities/sensor-reading.entity';

export type Granularity = '1h' | '1d' | '1w';

export class ReadingsQueryDto {
  @IsIn(['1h', '1d', '1w'])
  granularity: Granularity;

  @IsOptional()
  @IsIn(Object.values(MetricType))
  metric?: MetricType;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 200;
}
