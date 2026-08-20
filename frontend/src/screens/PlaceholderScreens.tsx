import React from 'react';
import { View } from 'react-native';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { useTheme } from '../theme/ThemeContext';

// Shared placeholder body - each screen below just supplies a title. Proves
// the theme tokens (colors, both font families) and safe-area wiring work
// correctly before Prompts 9-13 replace these with real screens.
function PlaceholderBody({ title }: { title: string }) {
  const { colors, spacing } = useTheme();
  return (
    <ThemedScreen>
      <ThemedText variant="display">{title}</ThemedText>
      <View style={{ height: spacing.md }} />
      <ThemedText variant="body" color="onSurface">
        This screen is a placeholder - built out in a later prompt.
      </ThemedText>
      <View style={{ height: spacing.lg }} />
      <ThemedText variant="mono" color="primary">
        co2: 654.21 ppm
      </ThemedText>
      <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
        Mono type is reserved for sensor data, not UI copy.
      </ThemedText>
    </ThemedScreen>
  );
}

export function DashboardScreen() {
  return <PlaceholderBody title="Dashboard" />;
}

export function EnvironmentScreen() {
  return <PlaceholderBody title="Environment" />;
}

export function InternalScreen() {
  return <PlaceholderBody title="AURA Internal" />;
}

export function MaintenanceScreen() {
  return <PlaceholderBody title="Maintenance" />;
}
