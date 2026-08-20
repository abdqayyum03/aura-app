import { MetricType } from '../../database/entities/sensor-reading.entity';

export const READING_CREATED_EVENT = 'reading.created';

export interface ReadingCreatedEvent {
  deviceId: string;
  deviceCode: string;
  recordedAt: string; // ISO string
  readings: { metricType: MetricType; value: number; unit: string }[];
}
