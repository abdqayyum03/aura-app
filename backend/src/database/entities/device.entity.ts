import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum DeviceStatus {
  ACTIVE = 'active',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Human-facing/hardware-facing identifier, e.g. printed on the unit and
  // used as the MQTT client id / topic segment. Distinct from the internal uuid.
  @Column({ name: 'device_code', unique: true })
  @Index()
  deviceCode: string;

  @Column({ nullable: true })
  label: string;

  @ManyToOne(() => User, (user) => user.devices, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.OFFLINE })
  status: DeviceStatus;

  // Photoperiod configuration (light/dark cycle), editable from the Dashboard screen
  @Column({ name: 'light_start_hour', type: 'smallint', default: 6 })
  lightStartHour: number;

  @Column({ name: 'light_duration_hours', type: 'smallint', default: 12 })
  lightDurationHours: number;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
