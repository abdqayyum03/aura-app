// Mirrors backend/src/database/entities and DTOs. Kept as a hand-written
// mirror rather than a generated client for now - if the backend's shape
// drifts, TypeScript will only catch it at the call site, not automatically,
// so treat this file as needing a manual pass whenever a backend prompt
// changes a response shape.

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Device {
  id: string;
  deviceCode: string;
  label: string | null;
  ownerId: string | null;
  status: 'active' | 'offline' | 'maintenance';
  lightStartHour: number;
  lightDurationHours: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MetricType =
  | 'co2'
  | 'temperature'
  | 'humidity'
  | 'pm25'
  | 'pm10'
  | 'voc'
  | 'co'
  | 'ph'
  | 'turbidity'
  | 'light_intensity'
  | 'water_level'
  | 'color_r'
  | 'color_g'
  | 'color_b'
  | 'biomass'; // new (Aug 2026)

export type Granularity = '1h' | '1d' | '1w';

export interface ReadingBucket {
  bucket: string;
  metricType: MetricType;
  avgValue: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
}

export interface CurrentReadings {
  lastSeenAt: string | null;
  online: boolean;
  readings: Partial<Record<MetricType, number>>;
}

export type AlertSeverity = 'green' | 'amber' | 'red';

export interface AlertEventDto {
  id: string;
  deviceId: string;
  metricType: MetricType;
  severity: AlertSeverity;
  triggeringValue: number;
  message: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type MaintenanceType =
  | 'water_change'
  | 'filter_replacement'
  | 'harvest'
  | 'nutrient_refill'
  | 'calibration'
  | 'other';

export interface MaintenanceLogDto {
  id: string;
  deviceId: string;
  type: MaintenanceType;
  notes: string | null;
  loggedByUserId: string | null;
  performedAt: string;
  createdAt: string;
}

// Matches the ACTUAL LIVE backend response (confirmed via a direct
// PowerShell test against the running server on 2026-08-11), which differs
// from the maintenance.controller.ts / maintenance.service.ts source that
// was in the zipped Prompt 7 export:
//   - the response key is "countdowns", not "upcoming"
//   - "other" IS included (with a null intervalDays), not excluded
//   - every field is nullable until that type has at least one logged
//     entry - there's no createdAt-baseline fallback like the zip implied
// If the live server is ever brought back in sync with clean/committed
// source, this file needs another pass to match whatever that turns out to be.
export interface MaintenanceCountdownDto {
  type: MaintenanceType;
  intervalDays: number | null;
  lastPerformedAt: string | null;
  nextDueAt: string | null;
  daysRemaining: number | null; // negative means overdue
  overdue: boolean;
}

export interface MaintenanceOverviewDto {
  countdowns: MaintenanceCountdownDto[];
  timeline: MaintenanceLogDto[];
}

// Fired over the /realtime Socket.io namespace on every ingested batch.
export interface ReadingCreatedEvent {
  deviceId: string;
  deviceCode: string;
  recordedAt: string;
  readings: { metricType: MetricType; value: number; unit: string }[];
}