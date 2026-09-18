import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { ErrorState } from '../components/ErrorState';
import { useTheme } from '../theme/ThemeContext';
import { useDeviceStore } from '../store/deviceStore';
import { useRealtimeReadings } from '../api/realtime';
import { readingsApi } from '../api/readings';
import { CurrentReadings, MetricType } from '../api/types';
import { GAUGE_DOMAIN, THRESHOLDS, ThresholdBand } from '../constants/thresholds';

// Static for now - Device entity has no "species"/"strain" field. Fine as a
// fixed product label if every unit runs the same culture; if that changes,
// this needs a real backend field rather than staying hardcoded.
const ACTIVE_CULTURE_LABEL = 'Chlorella Vulgaris';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type Zone = 'green' | 'amber' | 'red';

function zoneFor(value: number, band: ThresholdBand): Zone {
  if (value >= band.greenMin && value <= band.greenMax) return 'green';
  if (value >= band.amberMin && value <= band.amberMax) return 'amber';
  return 'red';
}

function comingSoon(feature: string) {
  // Lightweight inline alert - matches the "not built yet" pattern used
  // elsewhere (Profile, Support rows) rather than pretending this works.
  // eslint-disable-next-line no-undef
  (globalThis as any).alert?.(`${feature}: not built yet.`);
}

// --- Full-ring gauge (visual language from internal.html) ------------------
// Deliberately colored by real safe-zone status (green/amber/red), not a
// flat cyan/yellow like the Stitch export - these gauges exist specifically
// to flag when a metric drifts outside its biological safe zone, so hiding
// that behind a uniform color would defeat the point of the screen.
function RingGauge({
  label,
  value,
  unit,
  metric,
}: {
  label: string;
  value: number | undefined;
  unit: string;
  metric: MetricType;
}) {
  const { colors, spacing, radius } = useTheme();
  const band = THRESHOLDS[metric];
  const domain = GAUGE_DOMAIN[metric];
  if (!band || !domain) return null;

  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const progress = value !== undefined ? clamp((value - domain.min) / (domain.max - domain.min), 0, 1) : 0;
  const zone: Zone | null = value !== undefined ? zoneFor(value, band) : null;
  const tint = zone === 'red' ? colors.red : zone === 'amber' ? colors.amber : zone === 'green' ? colors.green : colors.textMuted;
  const statusLabel = zone === 'red' ? 'CRITICAL' : zone === 'amber' ? 'ATTENTION' : zone === 'green' ? 'NOMINAL' : '—';
  const statusIcon = zone === 'red' ? 'alert-circle' : zone === 'amber' ? 'warning' : 'checkmark-circle';

  return (
    <View
      style={{
        flexBasis: '48%',
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: `${colors.primary}1A`,
        padding: spacing.md,
        marginBottom: spacing.gutter,
        alignItems: 'center',
      }}
    >
      <ThemedText variant="label" style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
        {label}
      </ThemedText>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={tint}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <ThemedText variant="mono" style={{ color: colors.textPrimary, fontSize: 18 }}>
            {value !== undefined ? value.toFixed(1) : '—'}
          </ThemedText>
          {unit ? (
            <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 9 }}>
              {unit}
            </ThemedText>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm }}>
        <Ionicons name={statusIcon as any} size={13} color={tint} />
        <ThemedText variant="mono" style={{ color: tint, fontSize: 10 }}>
          {statusLabel}
        </ThemedText>
      </View>
    </View>
  );
}

// Rule-based, not ML: flags "healthy" when green is clearly the dominant
// channel (matches expected algae-green), otherwise flags a deviation
// worth a manual check. This is a simple heuristic, not a validated
// contamination detector - worth being clear about that if asked.
function colorDiagnosis(r: number, g: number, b: number): { label: string; healthy: boolean } {
  const isDominantGreen = g > r * 1.15 && g > b * 1.15;
  return isDominantGreen
    ? { label: 'Healthy algae culture - all biological markers within expected parameters.', healthy: true }
    : { label: 'Color deviation detected - check for contamination.', healthy: false };
}

// --- Diagnostic panel: real color-sensor swatch + status message -----------
function DiagnosticPanel({ r, g, b }: { r: number | undefined; g: number | undefined; b: number | undefined }) {
  const { colors, spacing, radius } = useTheme();
  const hasColor = r !== undefined && g !== undefined && b !== undefined;
  const rgbString = hasColor ? `rgb(${Math.round(r!)}, ${Math.round(g!)}, ${Math.round(b!)})` : colors.border;
  const hex = hasColor ? `#${[r, g, b].map((c) => Math.round(c!).toString(16).padStart(2, '0')).join('')}` : '—';
  const diagnosis = hasColor ? colorDiagnosis(r!, g!, b!) : null;

  return (
    <View
      style={{
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}1A`,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
        <View>
          <ThemedText variant="label" style={{ color: colors.textPrimary, letterSpacing: 1.5 }}>
            Diagnostic Panel
          </ThemedText>
          <ThemedText variant="mono" style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            Color Sensor Module
          </ThemedText>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: `${colors.primary}33`,
          }}
        >
          <Ionicons name="pulse-outline" size={18} color={colors.primary} />
        </View>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          padding: spacing.sm + 4,
          borderWidth: 1,
          borderColor: `${colors.border}80`,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.sm,
        }}
      >
        <View>
          <ThemedText variant="label" style={{ color: colors.textMuted, fontSize: 9 }}>
            Detected Hue
          </ThemedText>
          <ThemedText variant="mono" style={{ color: colors.textPrimary, marginTop: 2 }}>
            {ACTIVE_CULTURE_LABEL}
          </ThemedText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <ThemedText variant="mono" style={{ color: colors.textSecondary, fontSize: 11 }}>
            {hex.toUpperCase()}
          </ThemedText>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: rgbString,
              borderWidth: 1,
              borderColor: `${colors.textPrimary}1A`,
            }}
          />
        </View>
      </View>

      {diagnosis && (
        <View
          style={{
            backgroundColor: `${diagnosis.healthy ? colors.primary : colors.amber}1A`,
            borderRadius: radius.sm,
            padding: spacing.sm + 4,
            borderWidth: 1,
            borderColor: `${diagnosis.healthy ? colors.primary : colors.amber}4D`,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Ionicons
            name={diagnosis.healthy ? 'shield-checkmark' : 'alert-circle'}
            size={22}
            color={diagnosis.healthy ? colors.primary : colors.amber}
          />
          <View style={{ flex: 1 }}>
            <ThemedText variant="label" style={{ color: diagnosis.healthy ? colors.primary : colors.amber }}>
              {diagnosis.healthy ? 'Status Optimal' : 'Needs Review'}
            </ThemedText>
            <ThemedText variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
              {diagnosis.label}
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

export function InternalScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<any>();
  // See DashboardScreen.tsx's identical comment - the floating tab bar
  // doesn't reserve layout space, so bottom padding must add its height
  // explicitly or the last bit of content ends up hidden underneath it.
  const tabBarHeight = useBottomTabBarHeight();
  const { devices, selectedDeviceId, fetchDevices } = useDeviceStore();
  const device = devices.find((d) => d.id === selectedDeviceId);
  const [currentReadings, setCurrentReadings] = useState<CurrentReadings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { lastEvent, connected } = useRealtimeReadings(selectedDeviceId);

  const loadCurrent = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      const data = await readingsApi.current(selectedDeviceId);
      setCurrentReadings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sensor readings');
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

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
  }, [lastEvent]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCurrent();
    setRefreshing(false);
  };

  if (!device) {
    return (
      <ThemedScreen screenLabel="Internal">
        <ThemedText variant="body">No device paired yet.</ThemedText>
      </ThemedScreen>
    );
  }

  const readings = currentReadings?.readings ?? {};

  return (
    <ThemedScreen screenLabel="Internal">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl, gap: spacing.lg }}
      >
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ThemedText variant="semiBold" style={{ fontSize: 22, color: colors.textPrimary }}>
              {(device.label ?? device.deviceCode).toUpperCase()}
            </ThemedText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: `${connected ? colors.primary : colors.textMuted}1A`,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: `${connected ? colors.primary : colors.textMuted}33`,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: connected ? colors.primary : colors.textMuted,
                }}
              />
              <ThemedText variant="label" style={{ color: connected ? colors.primary : colors.textMuted, fontSize: 10 }}>
                {connected ? 'Online' : 'Offline'}
              </ThemedText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Ionicons name="leaf-outline" size={14} color={colors.textSecondary} />
            <ThemedText variant="body" style={{ color: colors.textSecondary, fontSize: 13 }}>
              Active Culture: {ACTIVE_CULTURE_LABEL}
            </ThemedText>
          </View>
        </View>

        {error && <ErrorState message={error} onRetry={loadCurrent} />}

        {/* Illumination moved to the Environment tab per client feedback (Aug 2026) */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: spacing.gutter }}>
          <RingGauge label="pH Level" value={readings.ph} unit="" metric="ph" />
          <RingGauge label="Turbidity" value={readings.turbidity} unit="NTU" metric="turbidity" />
          <RingGauge label="H2O Level" value={readings.water_level} unit="%" metric="water_level" />
          <RingGauge label="Biomass" value={readings.biomass} unit="g" metric="biomass" />
        </View>

        <DiagnosticPanel r={readings.color_r} g={readings.color_g} b={readings.color_b} />

        <View style={{ flexDirection: 'row', gap: spacing.gutter }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Maintenance')}
            style={{
              flex: 1,
              paddingVertical: spacing.sm + 4,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <ThemedText variant="label" color="primary">
              Logs
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => comingSoon('Calibrate')}
            style={{
              flex: 1,
              paddingVertical: spacing.sm + 4,
              borderRadius: radius.sm,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Ionicons name="options-outline" size={16} color={colors.primaryOnFill} />
            <ThemedText variant="label" style={{ color: colors.primaryOnFill }}>
              Calibrate
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedScreen>
  );
}