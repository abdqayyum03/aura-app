import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { MaintenanceType } from '../../database/entities/maintenance-log.entity';

export class CreateMaintenanceLogDto {
  @IsEnum(MaintenanceType)
  type: MaintenanceType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Optional - lets a user backdate an entry (e.g. logging this morning's
  // water change in the evening). Defaults to now if omitted.
  @IsOptional()
  @IsISO8601()
  performedAt?: string;
}
