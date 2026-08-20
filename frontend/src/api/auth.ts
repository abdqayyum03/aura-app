import { apiFetch } from './client';
import { AuthTokens } from './types';

export const authApi = {
  signup: (email: string, password: string, name?: string) =>
    apiFetch<AuthTokens>('/auth/signup', { method: 'POST', body: { email, password, name }, skipAuth: true }),

  login: (email: string, password: string) =>
    apiFetch<AuthTokens>('/auth/login', { method: 'POST', body: { email, password }, skipAuth: true }),

  logoutAll: () => apiFetch<void>('/auth/logout-all', { method: 'POST' }),
};
