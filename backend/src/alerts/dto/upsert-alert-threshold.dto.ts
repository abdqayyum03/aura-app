import { IsEnum, IsNumber } from 'class-validator';
import { MetricType } from '../../database/entities/sensor-reading.entity';

export class UpsertAlertThresholdDto {
  @IsEnum(MetricType)
  metricType: MetricType;

  @IsNumber()
  greenMin: number;

  @IsNumber()
  greenMax: number;

  @IsNumber()
  amberMin: number;

  @IsNumber()
  amberMax: number;
}
