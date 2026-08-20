import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../database/entities/device.entity';
import { SensorReading } from '../database/entities/sensor-reading.entity';
import { DevicesModule } from '../devices/devices.module';
import { MqttIngestionService } from './mqtt-ingestion.service';

@Module({
  imports: [TypeOrmModule.forFeature([Device, SensorReading]), DevicesModule],
  providers: [MqttIngestionService],
})
export class MqttModule {}
