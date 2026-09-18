import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { useTheme } from '../theme/ThemeContext';
import { authApi } from '../api/auth';
import { devicesApi } from '../api/devices';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import { ApiError } from '../api/client';

export function DevicePairingScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const clearTokens = useAuthStore((s) => s.clearTokens);
  const fetchDevices = useDeviceStore((s) => s.fetchDevices);

  const [deviceCode, setDeviceCode] = useState('');
  const [label, setLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePair = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await devicesApi.pair(deviceCode.trim(), label.trim() || undefined);
      // No manual navigation - once devices is non-empty, RootNavigator swaps
      // to Main on its own (same store-reactivity pattern login/signup use).
      await fetchDevices();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body as any)?.message ?? 'Could not pair device' : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Same "Terminate Session" pattern as ProfileScreen.handleLogout - tolerates
  // the network call failing so a user without a device code yet is never
  // stuck unable to log out from this screen.
  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await authApi.logoutAll();
          } catch {
            // Even if the server call fails (e.g. offline), still clear
            // local tokens so the user isn't stuck unable to log out.
          } finally {
            await clearTokens();
          }
        },
      },
    ]);
  };

  const inputStyle = {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  };

  return (
    <ThemedScreen showHeader={false}>
      <TouchableOpacity
        onPress={handleLogout}
        accessibilityLabel="Log out"
        style={{
          position: 'absolute',
          top: spacing.md,
          right: spacing.containerMargin,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          padding: spacing.xs,
        }}
      >
        <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
          Log out
        </ThemedText>
        <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ThemedText variant="display">Pair your AURA</ThemedText>
        <ThemedText variant="body" style={{ color: colors.textSecondary, marginBottom: spacing.xl }}>
          Enter the device code printed on your unit to connect it to your account.
        </ThemedText>

        <TextInput
          placeholder="Device code (e.g. AURA-ESP32-001)"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          value={deviceCode}
          onChangeText={setDeviceCode}
          style={inputStyle}
        />

        <TextInput
          placeholder="Label (optional, e.g. Living Room)"
          placeholderTextColor={colors.textSecondary}
          value={label}
          onChangeText={setLabel}
          style={{ ...inputStyle, marginBottom: spacing.md }}
        />

        {error && (
          <ThemedText variant="caption" style={{ color: colors.red, marginBottom: spacing.md }}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={handlePair}
          disabled={isSubmitting || !deviceCode}
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            padding: spacing.md,
            alignItems: 'center',
            opacity: isSubmitting || !deviceCode ? 0.6 : 1,
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <ThemedText variant="bodyMedium" style={{ color: colors.background }}>
              Pair device
            </ThemedText>
          )}
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
