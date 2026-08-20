import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthTokens } from '../api/types';

const ACCESS_TOKEN_KEY = 'aura_access_token';
const REFRESH_TOKEN_KEY = 'aura_refresh_token';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean; // true once we've checked SecureStore on app launch
  setTokens: (tokens: AuthTokens) => Promise<void>;
  clearTokens: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  isHydrated: false,

  setTokens: async (tokens) => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    ]);
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },

  clearTokens: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken: null, refreshToken: null });
  },

  // Called once on app launch (see App.tsx) - restores a session from a
  // previous install without asking the user to log in again every time.
  hydrate: async () => {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    set({ accessToken, refreshToken, isHydrated: true });
  },
}));
