import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, RefreshControl, ScrollView, Switch, TouchableOpacity, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { ErrorState } from '../components/ErrorState';
import { useTheme } from '../theme/ThemeContext';
import { useDeviceStore } from '../store/deviceStore';
import { useRealtimeReadings } from '../api/realtime';
import { readingsApi } from '../api/readings';
import { alertsApi } from '../api/alerts';
import { devicesApi } from '../api/devices';
import { ApiError } from '../api/client';
import { AlertEventDto, BubblingSpeed, CurrentReadings, Device, ReadingBucket, UpdateActuatorStateBody } from '../api/types';
import { GAUGE_DOMAIN, THRESHOLDS, ThresholdBand } from '../constants/thresholds';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type Zone = 'green' | 'amber' | 'red';

function zoneFor(value: number, band: ThresholdBand): Zone {
  if (value >= band.greenMin && value <= band.greenMax) return 'green';
  if (value >= band.amberMin && value <= band.amberMax) return 'amber';
  return 'red';
}

// --- Photoperiod calculation -----------------------------------------
function computePhotoperiod(lightStartHour: number, lightDurationHours: number, now: Date) {
  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  let hoursSinceStart = hourOfDay - lightStartHour;
  if (hoursSinceStart < 0) hoursSinceStart += 24;

  const isLight = hoursSinceStart < lightDurationHours;
  const darkDurationHours = 24 - lightDurationHours;

  const phaseElapsed = isLight ? hoursSinceStart : hoursSinceStart - lightDurationHours;
  const phaseTotal = isLight ? lightDurationHours : darkDurationHours;
  const phaseRemainingHours = Math.max(phaseTotal - phaseElapsed, 0);

  return {
    isLight,
    progress: phaseTotal > 0 ? phaseElapsed / phaseTotal : 0,
    remainingLabel: formatHours(phaseRemainingHours),
  };
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

// --- Pulsing dot (mirrors the HTML's animate-ping status indicator) ---
function PulsingDot({ color, size = 8 }: { color: string; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1000, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.75, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// --- System Status glass card (CO2 headline + real sparkline) --------------
function SystemStatusCard({
  co2ppm,
  hourBuckets,
  trendPerHour,
  online,
  alerts,
}: {
  co2ppm: number | undefined;
  hourBuckets: ReadingBucket[];
  trendPerHour: number | null;
  online: boolean;
  alerts: AlertEventDto[];
}) {
  const { colors, spacing, radius } = useTheme();

  const severity = !online ? null : alerts.some((a) => a.severity === 'red') ? 'red' : alerts.some((a) => a.severity === 'amber') ? 'amber' : 'green';
  const tint = severity === 'red' ? colors.red : severity === 'amber' ? colors.amber : colors.primary;
  const statusLabel = !online ? 'Offline' : severity === 'red' ? 'Critical' : severity === 'amber' ? 'Attention' : 'Stable';

  // Real sparkline from the last hourly CO2 buckets - not decorative fake data.
  const sparkPath = useMemo(() => {
    if (hourBuckets.length < 2) return null;
    const values = hourBuckets.map((b) => b.avgValue);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const w = 200;
    const h = 40;
    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const norm = max > min ? (v - min) / (max - min) : 0.5;
      const y = h - norm * (h - 6) - 3;
      return { x, y };
    });
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, last: points[points.length - 1] };
  }, [hourBuckets]);

  return (
    <View
      style={{
        backgroundColor: `${colors.surface}CC`,
        borderRadius: radius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}1A`,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <ThemedText variant="mono" style={{ color: colors.textSecondary, fontSize: 12, letterSpacing: 1 }}>
          SYSTEM STATUS
        </ThemedText>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: `${tint}1A`,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: `${tint}33`,
          }}
        >
          {online ? <PulsingDot color={tint} size={6} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />}
          <ThemedText variant="label" style={{ color: tint, marginLeft: 6, fontSize: 10 }}>
            {statusLabel}
          </ThemedText>
        </View>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <ThemedText variant="label" color="primary" style={{ opacity: 0.7, fontSize: 10 }}>
          ATMOSPHERIC CO2
        </ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
          <ThemedText variant="display" style={{ fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 40, color: colors.textPrimary }}>
            {co2ppm !== undefined ? co2ppm.toFixed(0) : '—'}
          </ThemedText>
          <ThemedText variant="mono" style={{ color: `${colors.primary}CC`, marginLeft: spacing.xs, fontSize: 16 }}>
            PPM
          </ThemedText>
        </View>
      </View>

      <View style={{ height: 48, marginTop: spacing.sm }}>
        {sparkPath ? (
          <Svg width="100%" height="100%" viewBox="0 0 200 40" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="area" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.18} />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={sparkPath.area} fill="url(#area)" />
            <Path d={sparkPath.line} stroke={colors.primary} strokeWidth={2} fill="none" />
            <Circle cx={sparkPath.last.x} cy={sparkPath.last.y} r={3} fill={colors.primary} />
          </Svg>
        ) : (
          <ThemedText variant="caption" style={{ color: colors.textMuted }}>
            Gathering trend data…
          </ThemedText>
        )}
      </View>

      {trendPerHour !== null && (
        <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 11 }}>
          {trendPerHour > 0 ? '+' : ''}
          {trendPerHour.toFixed(1)} PPM/HR
        </ThemedText>
      )}
    </View>
  );
}

// --- Impact Widget (CO2 removed / O2 released / biomass generated) --------
// Matches the client spec's Dashboard "Impact Widget" hero section. Values
// come through the same /current endpoint as every other metric - no extra
// API call - because they're server-computed regular sensor_readings now
// (mqtt-ingestion.service.ts's withImpactMetrics, via
// backend/src/mqtt/biomass-calculation.ts), not a special aggregation.
// Shows the CO2/O2 associated with the CURRENT biomass level, not a
// harvest-aware lifetime total - see biomass-calculation.ts's "SCOPE
// BOUNDARY" note for why that's a deliberate, documented gap, not an oversight.
function ImpactStat({
  icon,
  label,
  value,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | undefined;
  tint: string;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.sm + 4,
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
        alignItems: 'center',
      }}
    >
      <Ionicons name={icon} size={16} color={tint} style={{ marginBottom: 4 }} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <ThemedText variant="mono" style={{ color: colors.textPrimary, fontSize: 18 }}>
          {value !== undefined ? value.toFixed(1) : '—'}
        </ThemedText>
        <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 10 }}>
          g
        </ThemedText>
      </View>
      <ThemedText variant="label" style={{ color: colors.textSecondary, fontSize: 8, marginTop: 2 }}>
        {label}
      </ThemedText>
    </View>
  );
}

function ImpactWidget({ readings }: { readings: CurrentReadings['readings'] }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: `${colors.surface}CC`,
        borderRadius: radius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}1A`,
      }}
    >
      <ThemedText variant="label" style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
        Environmental Impact
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <ImpactStat icon="cloud-outline" label="CO2 REMOVED" value={readings.co2_absorbed} tint={colors.primary} />
        <ImpactStat icon="leaf-outline" label="O2 RELEASED" value={readings.o2_released} tint={colors.green} />
        <ImpactStat icon="water-outline" label="BIOMASS" value={readings.biomass} tint={colors.secondary} />
      </View>
    </View>
  );
}

// --- Real biomass gauge (grams, real safe zones from constants/thresholds) -
// Replaces the old turbidity-based "Algae Density" ring now that a real
// biomass metric exists (see constants/thresholds.ts, Aug 2026 addition).
function BiomassRing({ biomass }: { biomass: number | undefined }) {
  const { colors, spacing, radius } = useTheme();
  const band = THRESHOLDS.biomass;
  const domain = GAUGE_DOMAIN.biomass;

  const zone: Zone | null = biomass !== undefined && band ? zoneFor(biomass, band) : null;
  const tint = zone === 'red' ? colors.red : zone === 'amber' ? colors.amber : colors.primary;

  const progress =
    biomass !== undefined && domain ? clamp((biomass - domain.min) / (domain.max - domain.min), 0, 1) : 0;

  const size = 88;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
      }}
    >
      <ThemedText variant="label" style={{ color: colors.textSecondary, marginBottom: spacing.sm, alignSelf: 'flex-start' }}>
        Biomass
      </ThemedText>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tint}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <ThemedText variant="mono" style={{ color: colors.textPrimary, fontSize: 16 }}>
            {/* 1 decimal, not 0 - real range is ~0-10g (see
                constants/thresholds.ts), where whole-gram rounding would
                hide almost all of the actual variation. */}
            {biomass !== undefined ? biomass.toFixed(1) : '—'}
          </ThemedText>
          <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 9 }}>
            GRAMS
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

// --- Real active-alerts readout (replaces mockup's fake "Biomass" card) ---
function AlertsReadout({ alerts }: { alerts: AlertEventDto[] }) {
  const { colors, spacing, radius } = useTheme();
  const hasCritical = alerts.some((a) => a.severity === 'red');
  const hasAmber = alerts.some((a) => a.severity === 'amber');
  const tint = hasCritical ? colors.red : hasAmber ? colors.amber : colors.green;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
        justifyContent: 'space-between',
      }}
    >
      <ThemedText variant="label" style={{ color: colors.textSecondary }}>
        Active Alerts
      </ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.sm }}>
        <ThemedText variant="display" style={{ fontSize: 30, color: colors.textPrimary }}>
          {alerts.length}
        </ThemedText>
        <Ionicons
          name={alerts.length === 0 ? 'checkmark-circle-outline' : 'warning-outline'}
          size={20}
          color={tint}
        />
      </View>
      <ThemedText variant="caption" style={{ color: colors.textMuted, marginTop: 4, fontSize: 10 }}>
        {alerts.length === 0 ? 'ALL CLEAR' : hasCritical ? 'CRITICAL PRESENT' : 'NEEDS ATTENTION'}
      </ThemedText>
    </View>
  );
}

// --- AURA Insight -----------------------------------------------
function buildInsight(readings: CurrentReadings['readings'], alerts: AlertEventDto[]): string {
  const redAlert = alerts.find((a) => a.severity === 'red');
  if (redAlert) {
    return `Critical: ${redAlert.metricType.replace('_', ' ')} is outside safe range. ${redAlert.message ?? 'Immediate attention needed.'}`;
  }
  const amberAlert = alerts.find((a) => a.severity === 'amber');
  if (amberAlert) {
    return `${amberAlert.metricType.replace('_', ' ')} is drifting outside its nominal range - worth checking soon.`;
  }
  // Matches THRESHOLDS.biomass.amberMax (constants/thresholds.ts) - real
  // range is ~0-10g for the default 10L tank, not the old 700g threshold
  // (which was calibrated to the simulator's arbitrary pre-formula walker
  // and had become unreachable once the real RGB->OD->biomass ceiling was
  // implemented server-side, ~10.25g max).
  if (readings.biomass !== undefined && readings.biomass >= 9) {
    return 'Biomass is approaching harvest range. Consider scheduling a harvest to optimize CO2 absorption.';
  }
  return 'All systems nominal. Algae culture is operating within safe parameters.';
}

function InsightBox({ readings, alerts }: { readings: CurrentReadings['readings']; alerts: AlertEventDto[] }) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        backgroundColor: `${colors.surfaceLow}99`,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs }}>
        <Ionicons name="sparkles-outline" size={14} color={colors.primary} style={{ marginRight: 6 }} />
        <ThemedText variant="label" color="primary">
          Telemetry Insights
        </ThemedText>
      </View>
      <ThemedText variant="body" style={{ color: colors.textSecondary, lineHeight: 20, fontSize: 13.5 }}>
        {buildInsight(readings, alerts)}
      </ThemedText>
    </View>
  );
}

// --- Photoperiod ring --------------------------------------------------
function PhotoperiodRing({ lightStartHour, lightDurationHours }: { lightStartHour: number; lightDurationHours: number }) {
  const { colors } = useTheme();
  const { isLight, progress, remainingLabel } = useMemo(
    () => computePhotoperiod(lightStartHour, lightDurationHours, new Date()),
    [lightStartHour, lightDurationHours],
  );

  const size = 150;
  const strokeWidth = 6;
  const radiusPx = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  const dashOffset = circumference * (1 - progress);
  const ringColor = isLight ? colors.primary : colors.secondary;

  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radiusPx} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            position: 'absolute',
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: ringColor,
            opacity: Animated.multiply(pulse, 0.15),
          }}
        />
        <Ionicons name={isLight ? 'sunny' : 'moon'} size={34} color={ringColor} />
      </View>
    </View>
  );
}

// --- Actuator controls (lighting, bubbling) --------------------------------
// See backend/src/mqtt/ACTUATOR_CONTROL.md. This reflects DESIRED state (the
// device.* fields, as last sent to the backend) - there is no acknowledgement
// from the device, so there's no separate "applied" state to show here.
const LIGHT_INTENSITY_PRESETS = [25, 50, 75, 100] as const;

const MIX_COLOR_PRESETS = [
  { label: 'Amber', hex: '#FFB347' },
  { label: 'Cyan', hex: '#00E5FF' },
  { label: 'Violet', hex: '#8B5CF6' },
  { label: 'Green', hex: '#22C55E' },
  { label: 'Pink', hex: '#EC4899' },
];

const BUBBLING_PRESETS: { value: BubblingSpeed; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'slow', label: 'Slow' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'vigorous', label: 'Vigorous' },
];

function PresetChip({
  label,
  active,
  onPress,
  pending,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  pending: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={pending}
      style={{
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary : 'transparent',
        opacity: pending ? 0.5 : 1,
      }}
    >
      <ThemedText variant="label" style={{ color: active ? colors.primaryOnFill : colors.textSecondary, fontSize: 10 }}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

function ActuatorControlsCard({
  device,
  onUpdate,
}: {
  device: Device;
  onUpdate: (patch: UpdateActuatorStateBody) => Promise<void>;
}) {
  const { colors, spacing, radius } = useTheme();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (key: string, patch: UpdateActuatorStateBody) => {
    setError(null);
    setPendingKey(key);
    try {
      await onUpdate(patch);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body as any)?.message ?? 'Update failed' : 'Network error');
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <View
      style={{
        backgroundColor: `${colors.surface}CC`,
        borderRadius: radius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}1A`,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <ThemedText variant="label" style={{ color: colors.textSecondary }}>
          Lighting &amp; Bubbling
        </ThemedText>
        {pendingKey && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {error && (
        <ThemedText variant="caption" style={{ color: colors.red, marginBottom: spacing.sm }}>
          {error}
        </ThemedText>
      )}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.md,
        }}
      >
        <ThemedText variant="body" style={{ color: colors.textPrimary }}>
          Light
        </ThemedText>
        <Switch
          value={device.lightOn}
          onValueChange={(v) => handle('lightOn', { lightOn: v })}
          disabled={pendingKey === 'lightOn'}
          trackColor={{ true: colors.primary, false: colors.surfaceElevated }}
          thumbColor={colors.background}
        />
      </View>

      <ThemedText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.xs }}>
        Color
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
        <PresetChip
          label="White"
          active={device.lightColorMode === 'white'}
          pending={pendingKey === 'lightColorMode'}
          onPress={() => handle('lightColorMode', { lightColorMode: 'white' })}
        />
        <PresetChip
          label="Mix"
          active={device.lightColorMode === 'mix'}
          pending={pendingKey === 'lightColorMode'}
          onPress={() => handle('lightColorMode', { lightColorMode: 'mix' })}
        />
      </View>

      {device.lightColorMode === 'mix' && (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          {MIX_COLOR_PRESETS.map((c) => {
            const active = device.lightColorHex?.toLowerCase() === c.hex.toLowerCase();
            return (
              <TouchableOpacity
                key={c.hex}
                onPress={() => handle('lightColorHex', { lightColorHex: c.hex })}
                disabled={pendingKey === 'lightColorHex'}
                accessibilityLabel={c.label}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: c.hex,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.textPrimary : colors.border,
                  opacity: pendingKey === 'lightColorHex' ? 0.5 : 1,
                }}
              />
            );
          })}
        </View>
      )}

      <ThemedText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.xs }}>
        Intensity
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        {LIGHT_INTENSITY_PRESETS.map((pct) => (
          <PresetChip
            key={pct}
            label={`${pct}%`}
            active={device.lightIntensityPercent === pct}
            pending={pendingKey === 'lightIntensityPercent'}
            onPress={() => handle('lightIntensityPercent', { lightIntensityPercent: pct })}
          />
        ))}
      </View>

      <ThemedText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.xs }}>
        Bubbling
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
        {BUBBLING_PRESETS.map((b) => (
          <PresetChip
            key={b.value}
            label={b.label}
            active={device.bubblingSpeed === b.value}
            pending={pendingKey === 'bubblingSpeed'}
            onPress={() => handle('bubblingSpeed', { bubblingSpeed: b.value })}
          />
        ))}
      </View>
    </View>
  );
}

export function DashboardScreen() {
  const { colors, spacing, radius } = useTheme();
  // MainTabNavigator's tab bar is position:'absolute' (floats over content
  // rather than reserving layout space) - ScrollView bottom padding must add
  // this explicitly or the last bit of content ends up hidden underneath it.
  // Same bug/fix as MaintenanceScreen.tsx's FAB and ProfileScreen's own padding.
  const tabBarHeight = useBottomTabBarHeight();
  const { devices, selectedDeviceId, isLoading, fetchDevices, updateDeviceLocally } = useDeviceStore();
  const device = devices.find((d) => d.id === selectedDeviceId);
  const { lastEvent, connected } = useRealtimeReadings(selectedDeviceId);

  const [currentReadings, setCurrentReadings] = useState<CurrentReadings | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<AlertEventDto[]>([]);
  const [hourBuckets, setHourBuckets] = useState<ReadingBucket[]>([]);
  const [error, setError] = useState<string | null>(null);

  const lastTwoReadings = useRef<{ value: number; time: number }[]>([]);
  const [trendPerHour, setTrendPerHour] = useState<number | null>(null);

  const loadExtras = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      const [current, alerts, hourly] = await Promise.all([
        readingsApi.current(selectedDeviceId),
        alertsApi.list(selectedDeviceId, 'active'),
        readingsApi.history(selectedDeviceId, 'co2', '1h'),
      ]);
      setCurrentReadings(current);
      setActiveAlerts(alerts);
      setHourBuckets(hourly);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error loading dashboard data');
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  useEffect(() => {
    if (!lastEvent) return;
    setCurrentReadings((prev) => ({
      lastSeenAt: lastEvent.recordedAt,
      online: true,
      readings: {
        ...(prev?.readings ?? {}),
        ...Object.fromEntries(lastEvent.readings.map((r) => [r.metricType, r.value])),
      },
    }));

    const co2 = lastEvent.readings.find((r) => r.metricType === 'co2')?.value;
    if (co2 !== undefined) {
      const now = Date.now();
      lastTwoReadings.current = [...lastTwoReadings.current.slice(-1), { value: co2, time: now }];
      if (lastTwoReadings.current.length === 2) {
        const [prev, curr] = lastTwoReadings.current;
        const hoursElapsed = (curr.time - prev.time) / (1000 * 60 * 60);
        if (hoursElapsed > 0) {
          setTrendPerHour((curr.value - prev.value) / hoursElapsed);
        }
      }
    }
  }, [lastEvent]);

  const co2Reading = lastEvent?.readings.find((r) => r.metricType === 'co2')?.value ?? currentReadings?.readings.co2;
  const biomassReading = currentReadings?.readings.biomass;

  const handleRefresh = async () => {
    await fetchDevices();
    await loadExtras();
  };

  const handleActuatorUpdate = async (patch: UpdateActuatorStateBody) => {
    if (!selectedDeviceId) return;
    const updated = await devicesApi.updateActuatorState(selectedDeviceId, patch);
    updateDeviceLocally(updated);
  };

  if (!device) {
    return (
      <ThemedScreen screenLabel="Home">
        <ThemedText variant="body">No device paired yet. Pair a device to see live data here.</ThemedText>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen screenLabel="Home">
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl, gap: spacing.gutter }}
      >
        {error && <ErrorState message={error} onRetry={loadExtras} />}

        <SystemStatusCard
          co2ppm={co2Reading}
          hourBuckets={hourBuckets}
          trendPerHour={trendPerHour}
          online={connected}
          alerts={activeAlerts}
        />

        <ImpactWidget readings={currentReadings?.readings ?? {}} />

        <View style={{ flexDirection: 'row', gap: spacing.gutter }}>
          <BiomassRing biomass={biomassReading} />
          <AlertsReadout alerts={activeAlerts} />
        </View>

        <InsightBox readings={currentReadings?.readings ?? {}} alerts={activeAlerts} />

        <View
          style={{
            backgroundColor: `${colors.surfaceLow}99`,
            borderRadius: radius.md,
            padding: spacing.md,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: `${colors.primary}0D`,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: spacing.sm }}>
            <ThemedText variant="label" style={{ color: colors.textSecondary }}>
              Photoperiod
            </ThemedText>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
          </View>
          <PhotoperiodRing lightStartHour={device.lightStartHour} lightDurationHours={device.lightDurationHours} />
          <View
            style={{
              width: '100%',
              backgroundColor: `${colors.primary}14`,
              borderRadius: radius.sm,
              paddingVertical: spacing.sm,
              alignItems: 'center',
              marginTop: spacing.md,
            }}
          >
            <ThemedText variant="label" color="primary">
              {computePhotoperiod(device.lightStartHour, device.lightDurationHours, new Date()).remainingLabel} LEFT
              IN {computePhotoperiod(device.lightStartHour, device.lightDurationHours, new Date()).isLight ? 'LIGHT' : 'DARK'}
            </ThemedText>
          </View>
        </View>

        <ActuatorControlsCard device={device} onUpdate={handleActuatorUpdate} />
      </ScrollView>
    </ThemedScreen>
  );
}