import { apiFetch } from './client';
import { MaintenanceLogDto, MaintenanceOverviewDto, MaintenanceType } from './types';

export const maintenanceApi = {
  overview: (deviceId: string) => apiFetch<MaintenanceOverviewDto>(`/devices/${deviceId}/maintenance`),

  timeline: (deviceId: string, before?: string) =>
    apiFetch<MaintenanceLogDto[]>(
      `/devices/${deviceId}/maintenance/timeline${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),

  logAction: (deviceId: string, type: MaintenanceType, notes?: string, performedAt?: string) =>
    apiFetch<MaintenanceLogDto>(`/devices/${deviceId}/maintenance`, {
      method: 'POST',
      body: { type, notes, performedAt },
    }),
};