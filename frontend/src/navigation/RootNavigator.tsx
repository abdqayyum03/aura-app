import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabNavigator } from './MainTabNavigator';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { colors, resolvedScheme } = useTheme();
  const { accessToken, isHydrated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate(); // check SecureStore for a persisted session on launch
  }, [hydrate]);

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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {accessToken ? (
          <Stack.Screen name="Main" component={MainTabNavigator} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
