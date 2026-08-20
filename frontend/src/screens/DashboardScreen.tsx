import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, RefreshControl, ScrollView, View } from 'react-native';
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
import { AlertEventDto, CurrentReadings, ReadingBucket } from '../api/types';
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
            {biomass !== undefined ? biomass.toFixed(0) : '—'}
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
  if (readings.biomass !== undefined && readings.biomass >= 700) {
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

export function DashboardScreen() {
  const { colors, spacing, radius } = useTheme();
  const { devices, selectedDeviceId, isLoading, fetchDevices } = useDeviceStore();
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
        contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.gutter }}
      >
        {error && <ErrorState message={error} onRetry={loadExtras} />}

        <SystemStatusCard
          co2ppm={co2Reading}
          hourBuckets={hourBuckets}
          trendPerHour={trendPerHour}
          online={connected}
          alerts={activeAlerts}
        />

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
      </ScrollView>
    </ThemedScreen>
  );
}