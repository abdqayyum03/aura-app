import React from 'react';
import { View, ViewProps, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { ThemedText } from './ThemedText';

interface ThemedScreenProps extends ViewProps {
  /**
   * Label shown as the second line under the "AURA" wordmark in the
   * persistent header (e.g. "Home", "Env Data", "Profile"). Optional so
   * screens that haven't been through the redesign pass yet still compile.
   */
  screenLabel?: string;
  /**
   * Set false to skip the app header entirely - for screens that live
   * outside the main Tab Navigator (e.g. LoginScreen, which is a sibling
   * of "Main" in RootNavigator's root Stack, not nested inside it). The
   * header's avatar button assumes a "Profile" tab route is reachable,
   * which isn't true pre-auth - showing a profile shortcut before login
   * doesn't make sense anyway.
   */
  showHeader?: boolean;
}

function AppHeader({ screenLabel }: { screenLabel?: string }) {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation<any>();

  const handleAvatarPress = () => {
    // Defensive guard: only navigate if "Profile" is actually a route in
    // the current navigator's state. Without this, any screen rendered
    // outside the Tab Navigator (present or future) throws "The action
    // NAVIGATE... was not handled by any navigator" on tap instead of
    // failing silently.
    const routeNames = navigation.getState?.()?.routeNames ?? [];
    if (routeNames.includes('Profile')) {
      navigation.navigate('Profile');
    }
  };

  return (
    <BlurView
      intensity={40}
      tint="dark"
      style={{
        width: '100%',
        borderBottomWidth: 1,
        borderBottomColor: `${colors.border}80`,
        backgroundColor: `${colors.background}CC`,
      }}
    >
      <View
        style={{
          height: 64,
          paddingHorizontal: spacing.containerMargin,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: colors.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: `${colors.primary}40`,
            }}
          >
            <Ionicons name="triangle" size={14} color={colors.primary} />
          </View>
          <View>
            <ThemedText variant="label" color="primary">
              AURA
            </ThemedText>
            {screenLabel ? (
              <ThemedText variant="bodyMedium" style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 16 }}>
                {screenLabel}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="pulse-outline" size={20} color={colors.textSecondary} />
          <TouchableOpacity onPress={handleAvatarPress} accessibilityLabel="Open profile">
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: `${colors.primary}33`,
                backgroundColor: colors.surfaceElevated,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <Ionicons name="person" size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </BlurView>
  );
}

export function ThemedScreen({ children, style, screenLabel, showHeader = true, ...rest }: ThemedScreenProps) {
  const { colors, spacing } = useTheme();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {showHeader && <AppHeader screenLabel={screenLabel} />}
      <View style={[{ flex: 1, paddingHorizontal: spacing.containerMargin, paddingTop: spacing.md }, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}