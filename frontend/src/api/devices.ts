import { apiFetch } from './client';
import { Device } from './types';

export const devicesApi = {
  list: () => apiFetch<Device[]>('/devices'),

  pair: (deviceCode: string, label?: string) =>
    apiFetch<Device>('/devices/pair', { method: 'POST', body: { deviceCode, label } }),

  unpair: (deviceId: string) => apiFetch<void>(`/devices/${deviceId}/pair`, { method: 'DELETE' }),
};
