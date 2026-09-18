import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeColors, darkColors, lightColors, radius, spacing, typography } from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // useColorScheme() can return 'unspecified' (Android) or null/undefined in
  // addition to 'light'/'dark' - anything that isn't explicitly 'dark' falls
  // back to 'light', same fallback intent as the old `?? 'light'`.
  const rawScheme = useColorScheme();
  const systemScheme: 'light' | 'dark' = rawScheme === 'dark' ? 'dark' : 'light';
  const [mode, setMode] = useState<ThemeMode>('system');

  const resolvedScheme = mode === 'system' ? systemScheme : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedScheme,
      colors: resolvedScheme === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      setMode,
    }),
    [mode, resolvedScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
