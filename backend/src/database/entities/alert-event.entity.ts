import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MetricType } from './sensor-reading.entity';

export enum AlertSeverity {
  GREEN = 'green',
  AMBER = 'amber',
  RED = 'red',
}

@Entity('alert_events')
export class AlertEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'device_id' })
  @Index()
  deviceId: string;

  @Column({ name: 'metric_type', type: 'enum', enum: MetricType })
  metricType: MetricType;

  @Column({ type: 'enum', enum: AlertSeverity })
  severity: AlertSeverity;

  @Column({ name: 'triggering_value', type: 'double precision' })
  triggeringValue: number;

  @Column({ nullable: true })
  message: string;

  // Set when the condition clears, so we can distinguish active vs resolved alerts
  // without a separate table.
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
