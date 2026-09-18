import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { DevicePairingScreen } from '../screens/DevicePairingScreen';
import { AlertThresholdsScreen } from '../screens/AlertThresholdsScreen';
import { MainTabNavigator } from './MainTabNavigator';
import { ThemedScreen } from '../components/ThemedScreen';
import { ErrorState } from '../components/ErrorState';
import { ApiError } from '../api/client';

const Stack = createNativeStackNavigator();

function FullScreenSpinner({ background, tint }: { background: string; tint: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: background }}>
      <ActivityIndicator color={tint} />
    </View>
  );
}

export function RootNavigator() {
  const { colors, resolvedScheme } = useTheme();
  const { accessToken, isHydrated, hydrate } = useAuthStore();
  const devices = useDeviceStore((s) => s.devices);
  const fetchDevices = useDeviceStore((s) => s.fetchDevices);

  // Deliberately NOT keyed on the accessToken string itself - api/client.ts's
  // silent 401-refresh rewrites accessToken mid-session on ordinary token
  // rotation, and that must not re-trigger a device re-check / flash a
  // spinner over Main. Only a genuine login/logout transition should.
  const hasSession = Boolean(accessToken);

  const [devicesChecked, setDevicesChecked] = useState(false);
  const [deviceCheckError, setDeviceCheckError] = useState<string | null>(null);

  useEffect(() => {
    hydrate(); // check SecureStore for a persisted session on launch
  }, [hydrate]);

  const runDeviceCheck = useCallback(() => {
    setDeviceCheckError(null);
    fetchDevices()
      .then(() => setDevicesChecked(true))
      .catch((err) => {
        setDeviceCheckError(
          err instanceof ApiError ? (err.body as any)?.message ?? 'Could not check paired devices' : 'Network error',
        );
      });
  }, [fetchDevices]);

  useEffect(() => {
    if (!hasSession) {
      // Reset so the NEXT login (possibly a different account) forces a
      // fresh check instead of trusting whatever's left in deviceStore.
      setDevicesChecked(false);
      setDeviceCheckError(null);
      return;
    }
    runDeviceCheck();
  }, [hasSession, runDeviceCheck]);

  const navTheme = {
    ...(resolvedScheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(resolvedScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      border: colors.border,
      primary: colors.primary,
      text: colors.textPrimary,
    },
  };

  if (!isHydrated) {
    return <FullScreenSpinner background={colors.background} tint={colors.primary} />;
  }

  if (hasSession && !devicesChecked) {
    if (deviceCheckError) {
      return (
        <ThemedScreen showHeader={false}>
          <ErrorState message={deviceCheckError} onRetry={runDeviceCheck} />
        </ThemedScreen>
      );
    }
    return <FullScreenSpinner background={colors.background} tint={colors.primary} />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!hasSession ? (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </Stack.Group>
        ) : devices.length === 0 ? (
          <Stack.Screen name="DevicePairing" component={DevicePairingScreen} />
        ) : (
          <Stack.Group>
            <Stack.Screen name="Main" component={MainTabNavigator} />
            {/* Reached via navigation.navigate('AlertThresholds') from inside
                a Main tab (e.g. Profile) - React Navigation bubbles a
                navigate() call up to this parent stack when the route name
                isn't found in the nested tab navigator. */}
            <Stack.Screen name="AlertThresholds" component={AlertThresholdsScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
