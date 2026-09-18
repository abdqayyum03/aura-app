import { apiFetch } from './client';
import { AlertEventDto, AlertThresholdDto, MetricType } from './types';

export const alertsApi = {
  list: (deviceId: string, status: 'active' | 'all' = 'active') =>
    apiFetch<AlertEventDto[]>(`/devices/${deviceId}/alerts?status=${status}`),

  listThresholds: (deviceId: string) =>
    apiFetch<AlertThresholdDto[]>(`/devices/${deviceId}/alerts/thresholds`),

  upsertThreshold: (deviceId: string, band: Omit<AlertThresholdDto, 'isOverridden'>) =>
    apiFetch<AlertThresholdDto>(`/devices/${deviceId}/alerts/thresholds`, {
      method: 'POST',
      body: band,
    }),

  // Reverts a metric back to the shared default band.
  resetThreshold: (deviceId: string, metricType: MetricType) =>
    apiFetch<void>(`/devices/${deviceId}/alerts/thresholds/${metricType}`, { method: 'DELETE' }),
};
