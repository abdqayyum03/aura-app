import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from './entities/user.entity';
import { Device } from './entities/device.entity';
import { SensorReading } from './entities/sensor-reading.entity';
import { MaintenanceLog } from './entities/maintenance-log.entity';
import { AlertEvent } from './entities/alert-event.entity';
import { AlertThreshold } from './entities/alert-threshold.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'aura',
  password: process.env.DB_PASSWORD ?? 'aura_dev_password',
  database: process.env.DB_DATABASE ?? 'aura',
  entities: [User, Device, SensorReading, MaintenanceLog, AlertEvent, AlertThreshold],
  migrations: ['src/database/migrations/*.ts'],
  // Migrations only - never rely on schema auto-sync once the hypertable exists,
  // TypeORM's synchronize doesn't understand Timescale hypertables and will fight them.
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

export const AppDataSource = new DataSource(dataSourceOptions);
