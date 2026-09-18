import { apiFetch } from './client';

export const notificationsApi = {
  registerPushToken: (expoPushToken: string) =>
    apiFetch<void>('/push-tokens', { method: 'POST', body: { expoPushToken } }),
};
