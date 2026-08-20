import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MetricType } from './sensor-reading.entity';

// Absence of a row here means "use DEFAULT_THRESHOLDS" - most devices never
// need one; this exists purely for the client to tune per-unit safe zones
// later (e.g. one bioreactor running a more acid-tolerant algae strain).
@Entity('alert_thresholds')
@Index(['deviceId', 'metricType'], { unique: true })
export class AlertThreshold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'metric_type', type: 'enum', enum: MetricType })
  metricType: MetricType;

  @Column({ name: 'green_min', type: 'double precision' })
  greenMin: number;

  @Column({ name: 'green_max', type: 'double precision' })
  greenMax: number;

  @Column({ name: 'amber_min', type: 'double precision' })
  amberMin: number;

  @Column({ name: 'amber_max', type: 'double precision' })
  amberMax: number;
}
