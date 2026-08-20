import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertEvent } from '../database/entities/alert-event.entity';
import { AlertThreshold } from '../database/entities/alert-threshold.entity';
import { DevicesModule } from '../devices/devices.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [TypeOrmModule.forFeature([AlertEvent, AlertThreshold]), DevicesModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
