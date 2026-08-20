import { useAuthStore } from '../store/authStore';
import { AuthTokens } from './types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`);
  }
}

// Multiple requests can 401 at roughly the same time (e.g. several screens
// polling right when a token expires) - without this, each would kick off
// its own refresh call and race to overwrite the stored tokens. This makes
// every concurrent 401 share a single in-flight refresh.
let refreshPromise: Promise<AuthTokens> | null = null;

async function refreshTokens(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise;

  const { refreshToken, setTokens, clearTokens } = useAuthStore.getState();
  if (!refreshToken) {
    throw new ApiError(401, { message: 'No refresh token available' });
  }

  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        await clearTokens();
        throw new ApiError(res.status, await res.json().catch(() => null));
      }
      const tokens: AuthTokens = await res.json();
      await setTokens(tokens);
      return tokens;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean; // for /auth/login, /auth/signup themselves
}

// Internal - always goes through a single attempt, retry-after-refresh logic
// lives in apiFetch below.
async function rawFetch<T>(path: string, options: RequestOptions): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.skipAuth || !accessToken ? {} : { Authorization: `Bearer ${accessToken}` }),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawFetch<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !options.skipAuth) {
      // Access token expired mid-session - refresh once and retry the
      // original request exactly once. If the refresh itself fails, the
      // error propagates and the auth store's tokens are already cleared,
      // which the navigator (see RootNavigator) reacts to by showing login.
      await refreshTokens();
      return rawFetch<T>(path, options);
    }
    throw err;
  }
}
