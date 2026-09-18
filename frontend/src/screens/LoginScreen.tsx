import React, { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { useTheme } from '../theme/ThemeContext';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { ApiError } from '../api/client';

export function LoginScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const navigation = useNavigation<any>();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const tokens = await authApi.login(email.trim(), password);
      await setTokens(tokens); // RootNavigator reacts to this and switches to the main app
    } catch (err) {
      setError(err instanceof ApiError ? (err.body as any)?.message ?? 'Login failed' : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedScreen showHeader={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ThemedText variant="display">AURA</ThemedText>
        <ThemedText variant="body" style={{ color: colors.textSecondary, marginBottom: spacing.xl }}>
          Sign in to your dashboard
        </ThemedText>

        <TextInput
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{
            fontFamily: typography.fontFamily.body,
            fontSize: typography.size.md,
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.sm,
          }}
        />

        <TextInput
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{
            fontFamily: typography.fontFamily.body,
            fontSize: typography.size.md,
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.md,
          }}
        />

        {error && (
          <ThemedText variant="caption" style={{ color: colors.red, marginBottom: spacing.md }}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={handleLogin}
          disabled={isSubmitting || !email || !password}
          style={{
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            padding: spacing.md,
            alignItems: 'center',
            opacity: isSubmitting || !email || !password ? 0.6 : 1,
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <ThemedText variant="bodyMedium" style={{ color: colors.background }}>
              Log in
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Signup')}
          style={{ marginTop: spacing.lg, alignItems: 'center' }}
        >
          <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
            Don't have an account? <ThemedText variant="caption" color="primary">Sign up</ThemedText>
          </ThemedText>
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
