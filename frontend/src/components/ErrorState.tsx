import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { ThemedText } from './ThemedText';
import { useTheme } from '../theme/ThemeContext';

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.red,
        padding: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <ThemedText variant="bodyMedium" style={{ color: colors.red, marginBottom: spacing.xs }}>
        Couldn't load data
      </ThemedText>
      <ThemedText variant="caption" style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
        {message}
      </ThemedText>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          alignSelf: 'flex-start',
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: colors.primary,
        }}
      >
        <ThemedText style={{ color: colors.background }}>Retry</ThemedText>
      </TouchableOpacity>
    </View>
  );
}