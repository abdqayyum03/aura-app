import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Switch, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { useTheme } from '../theme/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import { authApi } from '../api/auth';
import { alertsApi } from '../api/alerts';
import { AlertEventDto } from '../api/types';

// Decodes the JWT payload WITHOUT verifying the signature - fine for reading
// a display name client-side (the backend never trusts this), not fine for
// any security decision. No new dependency: manual base64url decode since
// atob() isn't reliably available across RN environments.
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (const char of padded) {
      if (char === '=') break;
      buffer = (buffer << 6) | chars.indexOf(char);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function comingSoon(feature: string) {
  Alert.alert(feature, 'This is not built yet - coming in a future update.');
}

function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function relativeLastSeen(isoDate: string | null): string {
  if (!isoDate) return 'Never';
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// --- Glow header card (avatar, name, status badges) ------------------------
function ProfileHeaderCard({
  displayName,
  online,
  deviceCount,
}: {
  displayName: string;
  online: boolean;
  deviceCount: number;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: `${colors.surface}CC`,
        borderRadius: radius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}1A`,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: `${colors.primary}4D`,
            }}
          >
            <Ionicons name="person" size={30} color={colors.primary} />
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              backgroundColor: colors.surface,
              borderRadius: 10,
              padding: 2,
            }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: online ? colors.primary : colors.textMuted,
                borderWidth: 2,
                borderColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="checkmark" size={9} color={colors.primaryOnFill} />
            </View>
          </View>
        </View>

        <View style={{ flex: 1, paddingTop: 2 }}>
          <ThemedText variant="semiBold" style={{ color: colors.textPrimary, fontSize: 20 }}>
            {displayName}
          </ThemedText>
          <ThemedText variant="label" color="primary" style={{ marginTop: 4 }}>
            AURA Operator
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <Badge label={`${deviceCount} Device${deviceCount === 1 ? '' : 's'} Paired`} tone="primary" />
            <Badge label={online ? 'System Nominal' : 'System Offline'} tone={online ? 'primary' : 'muted'} />
          </View>
        </View>
      </View>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'primary' | 'muted' }) {
  const { colors, spacing, radius } = useTheme();
  const color = tone === 'primary' ? colors.primary : colors.textMuted;
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: `${color}1A`,
        borderWidth: 1,
        borderColor: `${color}33`,
      }}
    >
      <ThemedText variant="label" style={{ color, letterSpacing: 1 }}>
        {label}
      </ThemedText>
    </View>
  );
}

// --- Bento stat cell ------------------------------------------------------
function BentoStat({ icon, value, unit, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; unit?: string; label: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
      }}
    >
      <Ionicons name={icon} size={18} color={colors.textSecondary} style={{ marginBottom: spacing.sm }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <ThemedText variant="display" style={{ fontSize: 30, color: colors.textPrimary }}>
          {value}
        </ThemedText>
        {unit ? (
          <ThemedText variant="mono" style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
            {unit}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText variant="label" color="primary" style={{ marginTop: 4, opacity: 0.8 }}>
        {label}
      </ThemedText>
    </View>
  );
}

// --- Section wrapper (mono-caps title + card) -----------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <ThemedText variant="label" style={{ color: colors.textSecondary, marginBottom: spacing.sm, marginLeft: spacing.xs }}>
        {title}
      </ThemedText>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: `${colors.primary}1A`,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

// --- Tap row ----------------------------------------------------------
function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  first?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm + 4,
        paddingHorizontal: spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: `${colors.border}80`,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: spacing.sm + 4,
        }}
      >
        <Ionicons name={icon} size={16} color={danger ? colors.red : colors.textSecondary} />
      </View>
      <ThemedText variant="body" style={{ flex: 1, color: danger ? colors.red : colors.textPrimary }}>
        {label}
      </ThemedText>
      {value && (
        <ThemedText variant="caption" style={{ color: colors.textSecondary, marginRight: spacing.xs }}>
          {value}
        </ThemedText>
      )}
      {onPress && !danger && <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
    </TouchableOpacity>
  );
}

// --- Row with a real Switch ------------------------------------------------
function SwitchRow({
  icon,
  label,
  sublabel,
  value,
  onValueChange,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  first?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm + 4,
        paddingHorizontal: spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: `${colors.border}80`,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: spacing.sm + 4,
        }}
      >
        <Ionicons name={icon} size={16} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText variant="body" style={{ color: colors.textPrimary }}>
          {label}
        </ThemedText>
        {sublabel ? (
          <ThemedText variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
            {sublabel}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.surfaceElevated }}
        thumbColor={colors.background}
      />
    </View>
  );
}

export function ProfileScreen() {
  const { colors, spacing, radius } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const { accessToken, clearTokens } = useAuthStore();
  const { devices } = useDeviceStore();
  const [activeAlerts, setActiveAlerts] = useState<AlertEventDto[] | null>(null);
  const [manualLightCycle, setManualLightCycle] = useState(false);
  const [metricUnits, setMetricUnits] = useState(true);

  const payload = accessToken ? decodeJwtPayload(accessToken) : null;
  const displayName = payload?.email ?? payload?.name ?? 'Signed in user';
  const device = devices[0];

  useEffect(() => {
    if (!device) return;
    alertsApi
      .list(device.id, 'active')
      .then(setActiveAlerts)
      .catch(() => setActiveAlerts(null));
  }, [device]);

  const handleLogout = () => {
    Alert.alert('Terminate Session', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await authApi.logoutAll();
          } catch {
            // Even if the server call fails (e.g. offline), still clear local
            // tokens so the user isn't stuck unable to log out.
          } finally {
            await clearTokens();
          }
        },
      },
    ]);
  };

  const handleManualToggle = (value: boolean) => {
    if (value) {
      Alert.alert(
        'Manual Light Cycle',
        "Manual override isn't supported by the current hardware/backend yet - the device will keep running its automatic schedule.",
      );
    }
    setManualLightCycle(value);
  };

  const online = device?.status === 'active';
  const hasCritical = (activeAlerts ?? []).some((a) => a.severity === 'red');
  const hasAmber = (activeAlerts ?? []).some((a) => a.severity === 'amber');
  const alertTone = hasCritical ? colors.red : hasAmber ? colors.amber : colors.green;

  return (
    <ThemedScreen screenLabel="Profile">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl, gap: spacing.lg }}
      >
        <ProfileHeaderCard displayName={displayName} online={online} deviceCount={devices.length} />

        <View style={{ flexDirection: 'row', gap: spacing.gutter }}>
          <BentoStat
            icon="calendar-outline"
            value={device ? String(daysSince(device.createdAt)) : '—'}
            unit={device ? 'days' : undefined}
            label="Paired Since"
          />
          <BentoStat
            icon="warning-outline"
            value={activeAlerts !== null ? String(activeAlerts.length) : '—'}
            label="Active Alerts"
          />
        </View>

        <Section title="System Access">
          <Row first icon="lock-closed-outline" label="Security" onPress={() => comingSoon('Security')} />
          <Row icon="eye-off-outline" label="Privacy" onPress={() => comingSoon('Privacy')} />
          <Row icon="notifications-outline" label="Notifications" onPress={() => comingSoon('Notifications')} />
        </Section>

        <Section title="Laboratory Preferences">
          <SwitchRow
            first
            icon="speedometer-outline"
            label="Measurement Units"
            sublabel="Metric (°C, ppm, kg)"
            value={metricUnits}
            onValueChange={setMetricUnits}
          />
          <View
            style={{
              paddingVertical: spacing.sm + 4,
              paddingHorizontal: spacing.md,
              borderTopWidth: 1,
              borderTopColor: `${colors.border}80`,
            }}
          >
            <ThemedText variant="body" style={{ color: colors.textPrimary, marginBottom: spacing.sm }}>
              Light Cycle Mode
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <TouchableOpacity
                onPress={() => handleManualToggle(false)}
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  alignItems: 'center',
                  borderRadius: radius.sm,
                  backgroundColor: !manualLightCycle ? colors.primary : 'transparent',
                  borderWidth: 1,
                  borderColor: !manualLightCycle ? colors.primary : colors.border,
                }}
              >
                <ThemedText variant="label" style={{ color: !manualLightCycle ? colors.primaryOnFill : colors.textSecondary }}>
                  Auto
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleManualToggle(true)}
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  alignItems: 'center',
                  borderRadius: radius.sm,
                  backgroundColor: manualLightCycle ? colors.primary : 'transparent',
                  borderWidth: 1,
                  borderColor: manualLightCycle ? colors.primary : colors.border,
                }}
              >
                <ThemedText variant="label" style={{ color: manualLightCycle ? colors.primaryOnFill : colors.textSecondary }}>
                  Manual
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

        <Section title="Terminal Diagnostics">
          <Row
            first
            icon="hardware-chip-outline"
            label={device ? device.label ?? device.deviceCode : 'No device paired'}
            value={device ? `SN: ${device.deviceCode}` : undefined}
          />
          <Row
            icon="radio-outline"
            label="Connection"
            value={device ? (online ? 'Synced' : device.status === 'maintenance' ? 'Maintenance' : 'Offline') : '—'}
          />
          <Row icon="time-outline" label="Last Seen" value={device ? relativeLastSeen(device.lastSeenAt) : '—'} />
          <Row icon="cloud-download-outline" label="Firmware Updates" value="Not available" />
        </Section>

        <Section title="Support">
          <Row first icon="book-outline" label="User Guide" onPress={() => comingSoon('User Guide')} />
          <Row
            icon="bug-outline"
            label="Report an Issue"
            onPress={() => Linking.openURL('mailto:support@algaedecarbon.com?subject=AURA App Issue')}
          />
        </Section>

        <TouchableOpacity
          onPress={handleLogout}
          style={{
            borderRadius: radius.md,
            backgroundColor: `${colors.red}0D`,
            borderWidth: 1,
            borderColor: `${colors.red}33`,
            paddingVertical: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.xs,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
          <ThemedText variant="semiBold" style={{ color: colors.red, fontSize: 15 }}>
            Terminate Session
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedScreen>
  );
}