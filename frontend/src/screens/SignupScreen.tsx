import React, { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { useTheme } from '../theme/ThemeContext';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { ApiError } from '../api/client';

export function SignupScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const navigation = useNavigation<any>();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      // Signup already returns AuthTokens - no separate login call needed.
      const tokens = await authApi.signup(email.trim(), password, name.trim() || undefined);
      await setTokens(tokens); // RootNavigator reacts to this and moves to device pairing
    } catch (err) {
      setError(err instanceof ApiError ? (err.body as any)?.message ?? 'Sign up failed' : 'Network error');
    } finally {
      setIsSubmitting(false);
    }
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
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ThemedText variant="display">AURA</ThemedText>
        <ThemedText variant="body" style={{ color: colors.textSecondary, marginBottom: spacing.xl }}>
          Create your account
        </ThemedText>

        <TextInput
          placeholder="Name (optional)"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
          style={inputStyle}
        />

        <TextInput
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={inputStyle}
        />

        <TextInput
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={{ ...inputStyle, marginBottom: spacing.md }}
        />

        {error && (
          <ThemedText variant="caption" style={{ color: colors.red, marginBottom: spacing.md }}>
            {error}
          </ThemedText>
        )}

        <Pressable
          onPress={handleSignup}
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
              Sign up
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Login')}
          style={{ marginTop: spacing.lg, alignItems: 'center' }}
        >
          <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
            Already have an account? <ThemedText variant="caption" color="primary">Log in</ThemedText>
          </ThemedText>
        </Pressable>
      </View>
    </ThemedScreen>
  );
}
