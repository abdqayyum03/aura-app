import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Every sensor type from the spec lives in one narrow table (metric_type + value)
// rather than one wide table with a column per sensor. This keeps the hypertable
// simple to query at any granularity and makes adding a new sensor a data change,
// not a schema migration.
export enum MetricType {
  CO2 = 'co2',
  TEMPERATURE = 'temperature',
  HUMIDITY = 'humidity',
  PM25 = 'pm25',
  PM10 = 'pm10',
  VOC = 'voc',
  CO = 'co',
  PH = 'ph',
  TURBIDITY = 'turbidity',
  LIGHT_INTENSITY = 'light_intensity',
  WATER_LEVEL = 'water_level',
  COLOR_R = 'color_r',
  COLOR_G = 'color_g',
  COLOR_B = 'color_b',
  BIOMASS = 'biomass', // new (Aug 2026) - see migrations/005_add_biomass_metric.ts
}

@Entity('sensor_readings')
@Index(['deviceId', 'metricType', 'recordedAt'])
export class SensorReading {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'device_id' })
  @Index()
  deviceId: string;

  @Column({ name: 'metric_type', type: 'enum', enum: MetricType })
  metricType: MetricType;

  @Column({ type: 'double precision' })
  value: number;

  @Column({ nullable: true })
  unit: string;

  // Partitioning column for the Timescale hypertable - see migration 002.
  @Column({ name: 'recorded_at', type: 'timestamptz' })
  @Index()
  recordedAt: Date;
}
