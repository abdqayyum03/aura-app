import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { ErrorState } from '../components/ErrorState';
import { useTheme } from '../theme/ThemeContext';
import { useDeviceStore } from '../store/deviceStore';
import { alertsApi } from '../api/alerts';
import { ApiError } from '../api/client';
import { AlertThresholdDto, MetricType } from '../api/types';

// Every metric with a real default band on the backend (backend/src/alerts/
// default-thresholds.ts) - NOT the same set as constants/thresholds.ts,
// which is a frontend-only display list and (as of this screen) includes
// `biomass`, a metric the backend alert engine does NOT currently evaluate
// (no DEFAULT_THRESHOLDS entry for it - see AlertsService.evaluateOne's
// `if (!band) return` guard). That's a pre-existing gap, not something this
// screen tries to paper over: biomass simply has no row here because there
// is no real alert band to edit yet.
const METRIC_META: Record<MetricType, { label: string; unit: string }> = {
  co2: { label: 'CO2', unit: 'ppm' },
  temperature: { label: 'Temperature', unit: '°C' },
  humidity: { label: 'Humidity', unit: '%' },
  pm25: { label: 'PM2.5', unit: 'µg/m³' },
  pm10: { label: 'PM10', unit: 'µg/m³' },
  voc: { label: 'VOC', unit: 'ppb' },
  co: { label: 'CO', unit: 'ppm' },
  ph: { label: 'pH Level', unit: '' },
  turbidity: { label: 'Turbidity', unit: 'NTU' },
  light_intensity: { label: 'Light Intensity', unit: 'lux' },
  water_level: { label: 'H2O Level', unit: '%' },
  color_r: { label: 'Color R', unit: '' },
  color_g: { label: 'Color G', unit: '' },
  color_b: { label: 'Color B', unit: '' },
  biomass: { label: 'Biomass', unit: 'g' },
  co2_absorbed: { label: 'CO2 Absorbed', unit: 'g' },
  o2_released: { label: 'O2 Released', unit: 'g' },
};

// Draft form values are strings (so a field can hold "" or "12." mid-type
// without fighting a numeric state), keyed by metricType.
interface Draft {
  greenMin: string;
  greenMax: string;
  amberMin: string;
  amberMax: string;
}

function draftFrom(t: AlertThresholdDto): Draft {
  return {
    greenMin: String(t.greenMin),
    greenMax: String(t.greenMax),
    amberMin: String(t.amberMin),
    amberMax: String(t.amberMax),
  };
}

// Same invariant the backend enforces (AlertsService.validateBand) - checked
// client-side first so a bad value fails fast without a round trip, but the
// backend re-validates regardless since it's the one thing every future
// alert evaluation for this device/metric depends on.
function validateDraft(d: Draft): string | null {
  const [greenMin, greenMax, amberMin, amberMax] = [d.greenMin, d.greenMax, d.amberMin, d.amberMax].map(Number);
  if ([greenMin, greenMax, amberMin, amberMax].some((n) => Number.isNaN(n))) {
    return 'All four values must be numbers';
  }
  if (greenMin > greenMax) return 'Green min must be ≤ green max';
  if (amberMin > greenMin) return 'Amber min must be ≤ green min';
  if (amberMax < greenMax) return 'Amber max must be ≥ green max';
  return null;
}

function NumberField({
  value,
  onChangeText,
  label,
}: {
  value: string;
  onChangeText: (v: string) => void;
  label: string;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <ThemedText variant="caption" style={{ color: colors.textMuted, marginBottom: 2 }}>
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        style={{
          fontFamily: typography.fontFamily.mono,
          fontSize: typography.size.sm,
          color: colors.textPrimary,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
        }}
      />
    </View>
  );
}

function ThresholdRow({
  threshold,
  onSave,
  onReset,
}: {
  threshold: AlertThresholdDto;
  onSave: (metricType: MetricType, band: Omit<AlertThresholdDto, 'isOverridden' | 'metricType'>) => Promise<void>;
  onReset: (metricType: MetricType) => Promise<void>;
}) {
  const { colors, spacing, radius } = useTheme();
  const meta = METRIC_META[threshold.metricType];
  const [draft, setDraft] = useState<Draft>(() => draftFrom(threshold));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the server value changes underneath us (e.g. a reset elsewhere), and
  // this row has no unsaved edits of its own, keep the fields in sync.
  useEffect(() => {
    setDraft(draftFrom(threshold));
  }, [threshold.greenMin, threshold.greenMax, threshold.amberMin, threshold.amberMax]);

  const dirty =
    draft.greenMin !== String(threshold.greenMin) ||
    draft.greenMax !== String(threshold.greenMax) ||
    draft.amberMin !== String(threshold.amberMin) ||
    draft.amberMax !== String(threshold.amberMax);

  const handleSave = async () => {
    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(threshold.metricType, {
        greenMin: Number(draft.greenMin),
        greenMax: Number(draft.greenMax),
        amberMin: Number(draft.amberMin),
        amberMax: Number(draft.amberMax),
      });
    } catch (err) {
      setError(err instanceof ApiError ? (err.body as any)?.message ?? 'Save failed' : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setResetting(true);
    try {
      await onReset(threshold.metricType);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body as any)?.message ?? 'Reset failed' : 'Network error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
        marginBottom: spacing.gutter,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <ThemedText variant="bodyMedium" style={{ color: colors.textPrimary }}>
            {meta.label}
          </ThemedText>
          {meta.unit ? (
            <ThemedText variant="caption" style={{ color: colors.textMuted }}>
              ({meta.unit})
            </ThemedText>
          ) : null}
        </View>
        <View
          style={{
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
            borderRadius: radius.pill,
            backgroundColor: threshold.isOverridden ? `${colors.primary}1A` : `${colors.textMuted}1A`,
            borderWidth: 1,
            borderColor: threshold.isOverridden ? `${colors.primary}33` : `${colors.textMuted}33`,
          }}
        >
          <ThemedText
            variant="label"
            style={{ color: threshold.isOverridden ? colors.primary : colors.textMuted, fontSize: 9 }}
          >
            {threshold.isOverridden ? 'CUSTOM' : 'DEFAULT'}
          </ThemedText>
        </View>
      </View>

      <ThemedText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.xs }}>
        Green (nominal)
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <NumberField label="Min" value={draft.greenMin} onChangeText={(v) => setDraft((d) => ({ ...d, greenMin: v }))} />
        <NumberField label="Max" value={draft.greenMax} onChangeText={(v) => setDraft((d) => ({ ...d, greenMax: v }))} />
      </View>

      <ThemedText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.xs }}>
        Amber (warning) - beyond this is red
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <NumberField label="Min" value={draft.amberMin} onChangeText={(v) => setDraft((d) => ({ ...d, amberMin: v }))} />
        <NumberField label="Max" value={draft.amberMax} onChangeText={(v) => setDraft((d) => ({ ...d, amberMax: v }))} />
      </View>

      {error && (
        <ThemedText variant="caption" style={{ color: colors.red, marginBottom: spacing.sm }}>
          {error}
        </ThemedText>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!dirty || saving}
          style={{
            flex: 1,
            paddingVertical: spacing.sm,
            borderRadius: radius.sm,
            backgroundColor: colors.primary,
            alignItems: 'center',
            opacity: !dirty || saving ? 0.5 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryOnFill} />
          ) : (
            <ThemedText variant="label" style={{ color: colors.primaryOnFill }}>
              Save
            </ThemedText>
          )}
        </TouchableOpacity>
        {threshold.isOverridden && (
          <TouchableOpacity
            onPress={handleReset}
            disabled={resetting}
            style={{
              flex: 1,
              paddingVertical: spacing.sm,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              opacity: resetting ? 0.5 : 1,
            }}
          >
            {resetting ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <ThemedText variant="label" style={{ color: colors.textSecondary }}>
                Reset to Default
              </ThemedText>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function AlertThresholdsScreen() {
  const { colors, spacing } = useTheme();
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId);

  const [thresholds, setThresholds] = useState<AlertThresholdDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    try {
      const data = await alertsApi.listThresholds(selectedDeviceId);
      setThresholds(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body as any)?.message ?? 'Failed to load thresholds' : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSave = async (metricType: MetricType, band: Omit<AlertThresholdDto, 'isOverridden' | 'metricType'>) => {
    if (!selectedDeviceId) return;
    const saved = await alertsApi.upsertThreshold(selectedDeviceId, { metricType, ...band });
    setThresholds((prev) => prev.map((t) => (t.metricType === metricType ? saved : t)));
  };

  const handleReset = async (metricType: MetricType) => {
    if (!selectedDeviceId) return;
    await alertsApi.resetThreshold(selectedDeviceId, metricType);
    await load(); // simplest correct way to get the reverted default band back
  };

  if (!selectedDeviceId) {
    return (
      <ThemedScreen screenLabel="Alert Thresholds">
        <ThemedText variant="body">No device paired yet.</ThemedText>
      </ThemedScreen>
    );
  }

  return (
    <ThemedScreen screenLabel="Alert Thresholds">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.sm }}
      >
        <ThemedText variant="body" style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
          Green is nominal, amber is a warning, anything outside amber is critical. Amber
          must fully contain green on both sides. Changes only affect this device.
        </ThemedText>

        {error && <ErrorState message={error} onRetry={load} />}

        {loading && !refreshing ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : (
          thresholds.map((t) => (
            <ThresholdRow key={t.metricType} threshold={t} onSave={handleSave} onReset={handleReset} />
          ))
        )}
      </ScrollView>
    </ThemedScreen>
  );
}
