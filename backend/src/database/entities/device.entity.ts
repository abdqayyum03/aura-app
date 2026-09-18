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

// 'mix' means lightColorHex is in effect; 'white' ignores lightColorHex
// entirely (matches the client spec's "Color: White / Mix color" toggle).
export enum LightColorMode {
  WHITE = 'white',
  MIX = 'mix',
}

// Matches the client spec's 3 bubbling presets (Slow/Moderate/Vigorous) plus
// an explicit OFF - the spec doesn't name an "off" preset, but the air pump
// being able to stop entirely is an obvious real need, not an invented one.
export enum BubblingSpeed {
  OFF = 'off',
  SLOW = 'slow',
  MODERATE = 'moderate',
  VIGOROUS = 'vigorous',
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

  // Used only to convert the biomass CONCENTRATION the RGB->OD->biomass
  // pipeline produces (g/L) into a total mass in grams (g) - see
  // mqtt/biomass-calculation.ts. Defaulted (10L, the client doc's most
  // commonly referenced size), not yet user-editable - same scope boundary
  // as lightStartHour/lightDurationHours above.
  @Column({ name: 'tank_volume_liters', type: 'double precision', default: 10 })
  tankVolumeLiters: number;

  // Actuator DESIRED state (added 2026-09-18) - this is what the backend has
  // told the device to do, published over MQTT (aura/{deviceCode}/command)
  // whenever it changes via PATCH /devices/:id/actuators. There is NO
  // acknowledgement mechanism from the device - see ACTUATOR_CONTROL.md's
  // "no ack" note - so this column is optimistic desired state, not a
  // confirmed-applied reading of what the hardware is actually doing.
  @Column({ name: 'light_on', default: true })
  lightOn: boolean;

  @Column({
    name: 'light_color_mode',
    type: 'enum',
    enum: LightColorMode,
    default: LightColorMode.WHITE,
  })
  lightColorMode: LightColorMode;

  // Only meaningful when lightColorMode is MIX - ignored (but still stored,
  // so a later switch back to MIX remembers the last color) when WHITE.
  // type: 'varchar' is required here (not left to reflection) - a
  // `string | null` union type reflects as bare "Object" to TypeORM, which
  // it can't map to a Postgres column type on its own.
  @Column({ name: 'light_color_hex', type: 'varchar', nullable: true })
  lightColorHex: string | null;

  // One of 25/50/75/100 - matches the client spec's 4 strength presets
  // exactly (validated in UpdateActuatorStateDto, not as a DB constraint).
  @Column({ name: 'light_intensity_percent', type: 'smallint', default: 100 })
  lightIntensityPercent: number;

  @Column({
    name: 'bubbling_speed',
    type: 'enum',
    enum: BubblingSpeed,
    default: BubblingSpeed.MODERATE,
  })
  bubblingSpeed: BubblingSpeed;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
