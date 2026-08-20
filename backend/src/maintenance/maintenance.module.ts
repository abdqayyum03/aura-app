import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceLog } from '../database/entities/maintenance-log.entity';
import { DevicesModule } from '../devices/devices.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [TypeOrmModule.forFeature([MaintenanceLog]), DevicesModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
