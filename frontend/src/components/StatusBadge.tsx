import React from 'react';
import { View } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../theme/ThemeContext';
import { AlertEventDto, AlertSeverity } from '../api/types';

// Worst-of across all active alerts - red beats amber beats green, matching
// the Exec Summary's color-coded states (System nominal / Attention needed /
// Critical failure).
export function overallSeverity(alerts: AlertEventDto[]): AlertSeverity {
  if (alerts.some((a) => a.severity === 'red')) return 'red';
  if (alerts.some((a) => a.severity === 'amber')) return 'amber';
  return 'green';
}

export function StatusBadge({ alerts, online }: { alerts: AlertEventDto[]; online: boolean }) {
  const { colors, spacing, radius } = useTheme();

  if (!online) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.textSecondary,
            marginRight: spacing.xs,
          }}
        />
        <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
          Offline
        </ThemedText>
      </View>
    );
  }

  const severity = overallSeverity(alerts);
  const color = severity === 'red' ? colors.red : severity === 'amber' ? colors.amber : colors.green;
  const label = severity === 'red' ? 'Critical' : severity === 'amber' ? 'Attention' : 'Nominal';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.pill,
        paddingVertical: 4,
        paddingHorizontal: spacing.sm,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: spacing.xs }} />
      <ThemedText variant="caption" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}