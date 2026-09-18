import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { DashboardScreen } from '../screens/DashboardScreen';
import { EnvironmentScreen } from '../screens/EnvironmentScreen';
import { InternalScreen } from '../screens/InternalScreen';
import { MaintenanceScreen } from '../screens/MaintenanceScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { registerForPushNotificationsAsync } from '../notifications/registerPushNotifications';

export type MainTabParamList = {
  Dashboard: undefined;
  Environment: undefined;
  Internal: undefined;
  Maintenance: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'grid',
  Environment: 'flask',
  Internal: 'medkit',
  Maintenance: 'archive',
  Profile: 'person',
};

const LABELS: Record<keyof MainTabParamList, string> = {
  Dashboard: 'Home',
  Environment: 'Env',
  Internal: 'Internal',
  Maintenance: 'Records',
  Profile: 'Profile',
};

export function MainTabNavigator() {
  const { colors } = useTheme();

  // Fires once each time this navigator mounts - which is exactly once per
  // "reached Main" transition (RootNavigator only renders this component
  // once a session has a paired device), matching the natural point where
  // push notifications become meaningful. Best-effort, never throws or
  // blocks rendering - see registerPushNotifications.ts.
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: `${colors.border}80`,
          backgroundColor: `${colors.background}E6`,
        },
        tabBarBackground: () => (
          <BlurView intensity={40} tint="dark" style={{ flex: 1 }} />
        ),
        tabBarLabelStyle: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
        tabBarLabel: LABELS[route.name as keyof MainTabParamList],
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={ICONS[route.name as keyof MainTabParamList]}
            size={size}
            color={color}
            style={focused ? { textShadowColor: colors.primaryGlow, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } } : undefined}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Environment" component={EnvironmentScreen} />
      <Tab.Screen name="Internal" component={InternalScreen} />
      <Tab.Screen name="Maintenance" component={MaintenanceScreen} options={{ title: 'Records' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}