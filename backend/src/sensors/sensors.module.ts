import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Device } from '../database/entities/device.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesModule } from '../devices/devices.module';
import { SensorsController } from './sensors.controller';
import { SensorsService } from './sensors.service';
import { SensorsGateway } from './sensors.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device]),
    DevicesModule,
    JwtModule.register({}), // secret passed per-verify call, same pattern as AuthModule
  ],
  controllers: [SensorsController],
  providers: [SensorsService, SensorsGateway],
})
export class SensorsModule {}
