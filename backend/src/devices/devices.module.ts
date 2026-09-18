import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../database/entities/device.entity';
import { MqttCommandPublisherModule } from '../mqtt/mqtt-command-publisher.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [TypeOrmModule.forFeature([Device]), MqttCommandPublisherModule],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
