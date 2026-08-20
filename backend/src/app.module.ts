import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './common/health/health.module';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { RedisModule } from './common/redis/redis.module';
import { MqttModule } from './mqtt/mqtt.module';
import { SensorsModule } from './sensors/sensors.module';
import { AlertsModule } from './alerts/alerts.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { User } from './database/entities/user.entity';
import { Device } from './database/entities/device.entity';
import { SensorReading } from './database/entities/sensor-reading.entity';
import { MaintenanceLog } from './database/entities/maintenance-log.entity';
import { AlertEvent } from './database/entities/alert-event.entity';
import { AlertThreshold } from './database/entities/alert-threshold.entity';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        entities: [User, Device, SensorReading, MaintenanceLog, AlertEvent, AlertThreshold],
        synchronize: false, // migrations own the schema - see src/database/migrations
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
    HealthModule,
    AuthModule,
    DevicesModule,
    RedisModule,
    MqttModule,
    SensorsModule,
    AlertsModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
