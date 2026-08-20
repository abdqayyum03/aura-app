import { apiFetch } from './client';
import { CurrentReadings, Granularity, MetricType, ReadingBucket } from './types';

export const readingsApi = {
  current: (deviceId: string) => apiFetch<CurrentReadings>(`/devices/${deviceId}/current`),

  // NOTE: backend query param is "metric", not "metricType" - fixed from the
  // Prompt 9 version, which would have silently returned all metrics instead
  // of filtering (ReadingsQueryDto.metric is optional, so the bad param name
  // was ignored rather than erroring).
  history: (deviceId: string, metric: MetricType, granularity: Granularity, limit = 200) =>
    apiFetch<ReadingBucket[]>(
      `/devices/${deviceId}/readings?metric=${metric}&granularity=${granularity}&limit=${limit}`,
    ),
};