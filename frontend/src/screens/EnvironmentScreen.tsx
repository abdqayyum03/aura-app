import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, RefreshControl, ScrollView, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Line as SvgLine, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { ErrorState } from '../components/ErrorState';
import { useTheme } from '../theme/ThemeContext';
import { useDeviceStore } from '../store/deviceStore';
import { useRealtimeReadings } from '../api/realtime';
import { readingsApi } from '../api/readings';
import { CurrentReadings, Granularity, MetricType, ReadingBucket } from '../api/types';
import { GAUGE_DOMAIN, THRESHOLDS, ThresholdBand } from '../constants/thresholds';

// Exact hex from environment.html - "Particulates" line uses primary-fixed
// (#9cf0ff) in the new palette. Kept local since it's a single-use accent.
const PARTICULATES_COLOR = '#9cf0ff';

const METRIC_META: Partial<Record<MetricType, { label: string; unit: string }>> = {
  co2: { label: 'CO2', unit: 'ppm' },
  temperature: { label: 'Temperature', unit: '°C' }, // renamed from "Climate" per client feedback (Aug 2026)
  humidity: { label: 'Humidity', unit: '%' },
  pm25: { label: 'PM2.5', unit: 'µg/m³' },
  pm10: { label: 'PM10', unit: 'µg/m³' },
  voc: { label: 'VOC', unit: 'ppb' },
  co: { label: 'CO', unit: 'ppm' },
  light_intensity: { label: 'Light Intensity', unit: 'lux' }, // moved here from Internal per client feedback (Aug 2026)
};

// Generic indoor-air-quality reference ranges used ONLY to draw the progress
// bar under cards that have NO real safe-zone data (temperature, PM2.5, CO2,
// CO). These are NOT the alert engine's thresholds and NOT confirmed against
// any spec for this product - just widely-cited general reference points, so
// the bar has something honest-ish to show rather than an invented percent.
// light_intensity is deliberately excluded here - it has REAL thresholds in
// constants/thresholds.ts and uses those instead (see LightIntensityCard).
const DISPLAY_DOMAIN: Partial<Record<MetricType, { min: number; max: number }>> = {
  temperature: { min: 10, max: 35 },
  pm25: { min: 0, max: 150 },
  co2: { min: 400, max: 2000 },
  co: { min: 0, max: 50 },
};

function displayFraction(metric: MetricType, value: number | undefined): number {
  const domain = DISPLAY_DOMAIN[metric];
  if (!domain || value === undefined) return 0;
  return Math.max(0, Math.min(1, (value - domain.min) / (domain.max - domain.min)));
}

type Zone = 'green' | 'amber' | 'red';

function zoneFor(value: number, band: ThresholdBand): Zone {
  if (value >= band.greenMin && value <= band.greenMax) return 'green';
  if (value >= band.amberMin && value <= band.amberMax) return 'amber';
  return 'red';
}

const GRANULARITIES: Granularity[] = ['1h', '1d', '1w'];

const OVERVIEW_SERIES: { metric: MetricType; label: string; color: (c: ReturnType<typeof useTheme>['colors']) => string }[] = [
  { metric: 'co2', label: 'CO2', color: (c) => c.primary },
  { metric: 'temperature', label: 'Temperature', color: (c) => c.secondary },
  { metric: 'pm25', label: 'Particulates', color: () => PARTICULATES_COLOR },
];

function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.pill,
        padding: 4,
      }}
    >
      {GRANULARITIES.map((g) => {
        const active = g === value;
        return (
          <TouchableOpacity
            key={g}
            onPress={() => onChange(g)}
            style={{
              flex: 1,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: active ? colors.primary : 'transparent',
              alignItems: 'center',
            }}
          >
            <ThemedText variant="label" style={{ color: active ? colors.primaryOnFill : colors.textSecondary, fontSize: 10 }}>
              {g === '1h' ? '1 HOUR' : g === '1d' ? '1 DAY' : '1 WEEK'}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MultiSeriesChart({ series }: { series: { metric: MetricType; label: string; color: string; data: ReadingBucket[] }[] }) {
  const { colors, spacing } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - spacing.containerMargin * 2 - spacing.md * 2;
  const chartHeight = 180;
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const touchStartX = useRef(0);

  const longest = series.reduce((max, s) => Math.max(max, s.data.length), 0);

  const normalizedSeries = useMemo(() => {
    return series.map((s) => {
      if (s.data.length === 0) return { ...s, points: [] as { x: number; y: number }[] };
      const values = s.data.map((d) => d.avgValue);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const points = s.data.map((d, i) => ({
        x: s.data.length === 1 ? chartWidth / 2 : (i / (s.data.length - 1)) * chartWidth,
        y: chartHeight - ((d.avgValue - min) / range) * chartHeight,
      }));
      return { ...s, points };
    });
  }, [series, chartWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gestureState) => {
        if (longest === 0) return;
        const localX = gestureState.moveX - gestureState.x0 + touchStartX.current;
        const clamped = Math.max(0, Math.min(chartWidth, localX));
        const nearestIndex = Math.round((clamped / chartWidth) * (longest - 1));
        setScrubIndex(Math.max(0, Math.min(longest - 1, nearestIndex)));
      },
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    }),
  ).current;

  if (longest === 0) {
    return (
      <View style={{ height: chartHeight, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText variant="body" style={{ color: colors.textSecondary }}>
          No data yet for this range.
        </ThemedText>
      </View>
    );
  }

  const scrubX = scrubIndex !== null ? (scrubIndex / Math.max(longest - 1, 1)) * chartWidth : null;
  const scrubBucket = scrubIndex !== null ? series[0]?.data[scrubIndex] : null;
  const firstBucket = series[0]?.data[0];
  const midBucket = series[0]?.data[Math.floor((series[0]?.data.length ?? 0) / 2)];
  const lastBucket = series[0]?.data[series[0]?.data.length - 1];

  return (
    <View>
      <View style={{ position: 'relative' }}>
        <Svg width={chartWidth} height={chartHeight} style={{ position: 'absolute' }}>
          {[0.2, 0.4, 0.6, 0.8].map((frac) => (
            <SvgLine
              key={frac}
              x1={0}
              y1={chartHeight * frac}
              x2={chartWidth}
              y2={chartHeight * frac}
              stroke={colors.textSecondary}
              strokeWidth={0.5}
              strokeDasharray="4,4"
              opacity={0.1}
            />
          ))}
        </Svg>

        {scrubBucket && (
          <View
            style={{
              position: 'absolute',
              top: -4,
              left: Math.max(0, (scrubX ?? 0) - 24),
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 4,
              paddingVertical: 2,
              paddingHorizontal: 6,
              zIndex: 10,
            }}
          >
            <ThemedText variant="mono" style={{ color: colors.textMuted, fontSize: 10 }}>
              {new Date(scrubBucket.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </ThemedText>
          </View>
        )}

        <View
          onTouchStart={(e) => {
            touchStartX.current = e.nativeEvent.locationX;
          }}
          {...panResponder.panHandlers}
        >
          <Svg width={chartWidth} height={chartHeight}>
            {normalizedSeries.map((s) => {
              if (s.points.length === 0) return null;
              const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              return <Path key={s.metric} d={d} stroke={s.color} strokeWidth={s.metric === 'co2' ? 2 : 1.5} fill="none" opacity={s.metric === 'co2' ? 0.9 : 0.6} />;
            })}
            {scrubX !== null && <SvgLine x1={scrubX} y1={0} x2={scrubX} y2={chartHeight} stroke={colors.textMuted} strokeWidth={1} opacity={0.5} />}
            {normalizedSeries.map((s) => {
              const idx = scrubIndex !== null ? scrubIndex : s.points.length - 1;
              const p = s.points[idx];
              if (!p) return null;
              return <Circle key={s.metric} cx={p.x} cy={p.y} r={scrubIndex !== null ? 5 : 2.5} fill={s.color} stroke={colors.background} strokeWidth={scrubIndex !== null ? 2 : 0} />;
            })}
          </Svg>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: spacing.sm,
          paddingTop: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: `${colors.textSecondary}1A`,
        }}
      >
        {OVERVIEW_SERIES.map((s) => (
          <View key={s.metric} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: s.color(colors) }} />
            <ThemedText variant="label" style={{ color: s.color(colors), fontSize: 9 }}>
              {s.label}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs }}>
        <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 10 }}>
          {firstBucket ? new Date(firstBucket.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </ThemedText>
        <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 10 }}>
          {midBucket ? new Date(midBucket.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </ThemedText>
        <ThemedText variant="caption" style={{ color: colors.textMuted, fontSize: 10 }}>
          {lastBucket ? new Date(lastBucket.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </ThemedText>
      </View>

      {scrubIndex !== null && (
        <View style={{ marginTop: spacing.sm, gap: 2 }}>
          {series.map((s) => {
            const bucket = s.data[scrubIndex];
            const meta = METRIC_META[s.metric];
            return (
              <ThemedText key={s.metric} variant="mono" style={{ color: s.color, fontSize: 12 }}>
                {s.label}: {bucket ? `${bucket.avgValue.toFixed(1)} ${meta?.unit ?? ''}` : '—'}
              </ThemedText>
            );
          })}
        </View>
      )}
    </View>
  );
}

function ScrubbableLineChart({ data, unit, color }: { data: ReadingBucket[]; unit: string; color: string }) {
  const { colors, spacing } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - spacing.containerMargin * 2 - spacing.md * 2;
  const chartHeight = 180;
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const touchStartX = useRef(0);

  const { path, points, minValue, maxValue } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', points: [] as { x: number; y: number }[], minValue: 0, maxValue: 0 };
    }
    const values = data.map((d) => d.avgValue);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = data.map((d, i) => {
      const x = data.length === 1 ? chartWidth / 2 : (i / (data.length - 1)) * chartWidth;
      const y = chartHeight - ((d.avgValue - min) / range) * chartHeight;
      return { x, y };
    });
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return { path: d, points: pts, minValue: min, maxValue: max };
  }, [data, chartWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gestureState) => {
        if (points.length === 0) return;
        const localX = gestureState.moveX - gestureState.x0 + touchStartX.current;
        const clamped = Math.max(0, Math.min(chartWidth, localX));
        const nearestIndex = Math.round((clamped / chartWidth) * (points.length - 1));
        setScrubIndex(Math.max(0, Math.min(points.length - 1, nearestIndex)));
      },
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    }),
  ).current;

  if (data.length === 0) {
    return (
      <View style={{ height: chartHeight, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText variant="body" style={{ color: colors.textSecondary }}>
          No data yet for this range.
        </ThemedText>
      </View>
    );
  }

  const scrubPoint = scrubIndex !== null ? points[scrubIndex] : null;
  const scrubBucket = scrubIndex !== null ? data[scrubIndex] : null;

  return (
    <View>
      {scrubBucket && (
        <View style={{ marginBottom: spacing.xs }}>
          <ThemedText variant="mono" style={{ color, fontSize: 16 }}>
            {scrubBucket.avgValue.toFixed(1)} {unit}
          </ThemedText>
          <ThemedText variant="caption" style={{ color: colors.textMuted }}>
            {new Date(scrubBucket.bucket).toLocaleString()}
          </ThemedText>
        </View>
      )}
      <View
        onTouchStart={(e) => {
          touchStartX.current = e.nativeEvent.locationX;
        }}
        {...panResponder.panHandlers}
      >
        <Svg width={chartWidth} height={chartHeight}>
          <Path d={path} stroke={color} strokeWidth={2} fill="none" />
          {scrubPoint && (
            <>
              <SvgLine x1={scrubPoint.x} y1={0} x2={scrubPoint.x} y2={chartHeight} stroke={colors.textMuted} strokeWidth={1} opacity={0.5} />
              <Circle cx={scrubPoint.x} cy={scrubPoint.y} r={5} fill={color} stroke={colors.background} strokeWidth={2} />
            </>
          )}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs }}>
        <ThemedText variant="caption" style={{ color: colors.textMuted }}>
          {minValue.toFixed(1)} {unit}
        </ThemedText>
        <ThemedText variant="caption" style={{ color: colors.textMuted }}>
          {maxValue.toFixed(1)} {unit}
        </ThemedText>
      </View>
    </View>
  );
}

function PulsingSafeDot({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity }} />;
}

function MetricCard({
  icon,
  iconColor,
  label,
  labelColor,
  value,
  unit,
  valueColor,
  barFraction,
  barColor,
  footer,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  labelColor: string;
  value: string;
  unit: string;
  valueColor: string;
  barFraction: number;
  barColor: string;
  footer?: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexBasis: '48%',
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: spacing.gutter,
        borderWidth: 1,
        borderColor: active ? colors.primary : `${colors.primary}0D`,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <ThemedText variant="label" style={{ color: labelColor }}>
          {label}
        </ThemedText>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs, gap: 4 }}>
        <ThemedText variant="display" style={{ fontSize: 28, color: valueColor }}>
          {value}
        </ThemedText>
        <ThemedText variant="mono" style={{ color: `${valueColor}B3`, fontSize: 13 }}>
          {unit}
        </ThemedText>
      </View>
      <View style={{ height: 3, backgroundColor: colors.surfaceElevated, borderRadius: 2, overflow: 'hidden', marginTop: spacing.sm }}>
        <View style={{ height: '100%', width: `${barFraction * 100}%`, backgroundColor: barColor }} />
      </View>
      {footer}
    </TouchableOpacity>
  );
}

function MetricGrid({
  current,
  focusedMetric,
  onFocus,
}: {
  current: CurrentReadings | null;
  focusedMetric: MetricType | null;
  onFocus: (m: MetricType) => void;
}) {
  const { colors, spacing } = useTheme();
  const r = current?.readings ?? {};
  const coSafe = r.co !== undefined && r.co < 9;

  // Light intensity has REAL safe-zone thresholds (unlike the other cards
  // here) - reuse them for genuine zone-based coloring instead of the
  // generic DISPLAY_DOMAIN fallback.
  const lightBand = THRESHOLDS.light_intensity;
  const lightDomain = GAUGE_DOMAIN.light_intensity;
  const lightZone: Zone | null = r.light_intensity !== undefined && lightBand ? zoneFor(r.light_intensity, lightBand) : null;
  const lightColor = lightZone === 'red' ? colors.red : lightZone === 'amber' ? colors.amber : colors.primary;
  const lightFraction =
    r.light_intensity !== undefined && lightDomain
      ? Math.max(0, Math.min(1, (r.light_intensity - lightDomain.min) / (lightDomain.max - lightDomain.min)))
      : 0;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      {/* Temperature - split from Humidity per client feedback (Aug 2026), was
          previously a single "Climate" card with humidity as a footer line */}
      <MetricCard
        icon="thermometer"
        iconColor={colors.secondary}
        label="TEMPERATURE"
        labelColor={colors.textSecondary}
        value={r.temperature !== undefined ? r.temperature.toFixed(0) : '—'}
        unit="°C"
        valueColor={colors.primary}
        barFraction={displayFraction('temperature', r.temperature)}
        barColor={colors.secondary}
        active={focusedMetric === 'temperature'}
        onPress={() => onFocus('temperature')}
      />

      {/* Humidity - now its own card, no longer nested inside Temperature */}
      <MetricCard
        icon="water-outline"
        iconColor={colors.secondary}
        label="HUMIDITY"
        labelColor={colors.textSecondary}
        value={r.humidity !== undefined ? r.humidity.toFixed(0) : '—'}
        unit="%"
        valueColor={colors.textPrimary}
        barFraction={r.humidity !== undefined ? Math.max(0, Math.min(1, r.humidity / 100)) : 0}
        barColor={colors.secondary}
        active={focusedMetric === 'humidity'}
        onPress={() => onFocus('humidity')}
      />

      {/* PM2.5 (with VOC as secondary reading) */}
      <MetricCard
        icon="ellipse-outline"
        iconColor={colors.textSecondary}
        label="PM2.5"
        labelColor={colors.textSecondary}
        value={r.pm25 !== undefined ? r.pm25.toFixed(0) : '—'}
        unit="µg"
        valueColor={colors.textPrimary}
        barFraction={displayFraction('pm25', r.pm25)}
        barColor={colors.textSecondary}
        active={focusedMetric === 'pm25'}
        onPress={() => onFocus('pm25')}
        footer={
          r.voc !== undefined ? (
            <ThemedText variant="caption" style={{ color: colors.textMuted, marginTop: spacing.xs, fontSize: 10 }}>
              VOC {r.voc < 50 ? 'LOW' : r.voc < 150 ? 'MODERATE' : 'HIGH'}
            </ThemedText>
          ) : undefined
        }
      />

      {/* CO2 - the "hero" card */}
      <MetricCard
        icon="cloud"
        iconColor={colors.primary}
        label="CO2 LVL"
        labelColor={colors.primary}
        value={r.co2 !== undefined ? r.co2.toFixed(0) : '—'}
        unit="PPM"
        valueColor={colors.primary}
        barFraction={displayFraction('co2', r.co2)}
        barColor={colors.primary}
        active={focusedMetric === 'co2'}
        onPress={() => onFocus('co2')}
      />

      {/* CO Safety */}
      <MetricCard
        icon="shield-checkmark-outline"
        iconColor={colors.textMuted}
        label="CO SFTY"
        labelColor={colors.textSecondary}
        value={r.co !== undefined ? r.co.toFixed(0) : '—'}
        unit="PPM"
        valueColor={colors.textPrimary}
        barFraction={displayFraction('co', r.co)}
        barColor={coSafe ? colors.textMuted : colors.red}
        active={focusedMetric === 'co'}
        onPress={() => onFocus('co')}
        footer={
          r.co !== undefined ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs }}>
              <PulsingSafeDot color={coSafe ? colors.primary : colors.red} />
              <ThemedText variant="caption" style={{ color: coSafe ? colors.primary : colors.red, fontSize: 10 }}>
                {coSafe ? 'SAFE' : 'ELEVATED'}
              </ThemedText>
            </View>
          ) : undefined
        }
      />

      {/* Light Intensity - moved here from Internal per client feedback
          (Aug 2026). Uses real safe-zone thresholds, unlike the cards above. */}
      <MetricCard
        icon="sunny-outline"
        iconColor={lightColor}
        label="LIGHT INTENSITY"
        labelColor={colors.textSecondary}
        value={r.light_intensity !== undefined ? r.light_intensity.toFixed(0) : '—'}
        unit="LUX"
        valueColor={colors.textPrimary}
        barFraction={lightFraction}
        barColor={lightColor}
        active={focusedMetric === 'light_intensity'}
        onPress={() => onFocus('light_intensity')}
        footer={
          lightZone ? (
            <ThemedText variant="caption" style={{ color: lightColor, marginTop: spacing.xs, fontSize: 10 }}>
              {lightZone === 'green' ? 'NOMINAL' : lightZone === 'amber' ? 'ATTENTION' : 'CRITICAL'}
            </ThemedText>
          ) : undefined
        }
      />
    </View>
  );
}

export function EnvironmentScreen() {
  const { spacing, colors, radius } = useTheme();
  // See DashboardScreen.tsx's identical comment - the floating tab bar
  // doesn't reserve layout space, so bottom padding must add its height
  // explicitly or the last bit of content ends up hidden underneath it.
  const tabBarHeight = useBottomTabBarHeight();
  const { devices, selectedDeviceId, fetchDevices } = useDeviceStore();
  const device = devices.find((d) => d.id === selectedDeviceId);

  const [granularity, setGranularity] = useState<Granularity>('1h');
  const [focusedMetric, setFocusedMetric] = useState<MetricType | null>(null);

  const [overviewData, setOverviewData] = useState<Record<string, ReadingBucket[]>>({});
  const [singleData, setSingleData] = useState<ReadingBucket[]>([]);
  const [currentReadings, setCurrentReadings] = useState<CurrentReadings | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { lastEvent, connected } = useRealtimeReadings(selectedDeviceId);

  const loadCurrent = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      const data = await readingsApi.current(selectedDeviceId);
      setCurrentReadings(data);
      setCurrentError(null);
    } catch (err) {
      setCurrentError(err instanceof Error ? err.message : 'Failed to load current readings');
    }
  }, [selectedDeviceId]);

  const loadOverview = useCallback(async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    try {
      const results = await Promise.all(OVERVIEW_SERIES.map((s) => readingsApi.history(selectedDeviceId, s.metric, granularity)));
      const byMetric: Record<string, ReadingBucket[]> = {};
      OVERVIEW_SERIES.forEach((s, i) => {
        byMetric[s.metric] = results[i];
      });
      setOverviewData(byMetric);
      setChartError(null);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, granularity]);

  const loadSingle = useCallback(async () => {
    if (!selectedDeviceId || !focusedMetric) return;
    setLoading(true);
    try {
      const data = await readingsApi.history(selectedDeviceId, focusedMetric, granularity);
      setSingleData(data);
      setChartError(null);
    } catch (err) {
      setSingleData([]);
      setChartError(err instanceof Error ? err.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, focusedMetric, granularity]);

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

  useEffect(() => {
    if (focusedMetric === null) {
      loadOverview();
    } else {
      loadSingle();
    }
  }, [focusedMetric, loadOverview, loadSingle]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadCurrent(), focusedMetric === null ? loadOverview() : loadSingle()]);
    setRefreshing(false);
  };

  if (!device) {
    return (
      <ThemedScreen screenLabel="Env Data">
        <ThemedText variant="body">No device paired yet.</ThemedText>
      </ThemedScreen>
    );
  }

  const focusedMeta = focusedMetric ? METRIC_META[focusedMetric] : null;
  const focusedColor =
    focusedMetric === 'co2'
      ? colors.primary
      : focusedMetric === 'temperature'
        ? colors.secondary
        : focusedMetric === 'light_intensity'
          ? colors.amber
          : colors.textMuted;

  const seriesForChart = OVERVIEW_SERIES.map((s) => ({
    metric: s.metric,
    label: s.label,
    color: s.color(colors),
    data: overviewData[s.metric] ?? [],
  }));

  return (
    <ThemedScreen screenLabel="Env Data">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl, gap: spacing.lg }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <ThemedText variant="semiBold" style={{ fontSize: 22, color: colors.textPrimary }}>
            Trend Analysis
          </ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: connected ? colors.primary : colors.textMuted,
              }}
            />
            <ThemedText variant="label" style={{ color: connected ? colors.textSecondary : colors.textMuted }}>
              {connected ? 'Live Data' : 'Offline'}
            </ThemedText>
          </View>
        </View>

        {currentError && <ErrorState message={currentError} onRetry={loadCurrent} />}

        <View
          style={{
            backgroundColor: `${colors.surface}CC`,
            borderRadius: radius.md,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: `${colors.primary}1A`,
          }}
        >
          {focusedMetric !== null && (
            <ThemedText variant="label" style={{ color: colors.textMuted, marginBottom: spacing.sm }}>
              {focusedMeta?.label.toUpperCase()}
            </ThemedText>
          )}

          {chartError ? (
            <ErrorState message={chartError} onRetry={focusedMetric === null ? loadOverview : loadSingle} />
          ) : loading ? (
            <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
              Loading...
            </ThemedText>
          ) : focusedMetric === null ? (
            <MultiSeriesChart series={seriesForChart} />
          ) : (
            <ScrubbableLineChart data={singleData} unit={focusedMeta?.unit ?? ''} color={focusedColor} />
          )}
        </View>

        <GranularityToggle value={granularity} onChange={setGranularity} />

        <TouchableOpacity
          onPress={() => setFocusedMetric(focusedMetric === null ? 'co2' : null)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: `${colors.primary}33`,
            borderRadius: radius.md,
            paddingVertical: spacing.sm + 4,
          }}
        >
          <Ionicons name="stats-chart" size={16} color={colors.primary} style={{ marginRight: spacing.xs }} />
          <ThemedText variant="label" color="primary">
            {focusedMetric === null ? 'Focus a Metric' : 'Show All Metrics'}
          </ThemedText>
        </TouchableOpacity>

        <MetricGrid current={currentReadings} focusedMetric={focusedMetric} onFocus={setFocusedMetric} />
      </ScrollView>
    </ThemedScreen>
  );
}