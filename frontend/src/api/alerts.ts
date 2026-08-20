import { apiFetch } from './client';
import { AlertEventDto } from './types';

export const alertsApi = {
  list: (deviceId: string, status: 'active' | 'all' = 'active') =>
    apiFetch<AlertEventDto[]>(`/devices/${deviceId}/alerts?status=${status}`),
};