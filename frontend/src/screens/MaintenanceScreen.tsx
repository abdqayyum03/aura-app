import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, RefreshControl, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ThemedScreen } from '../components/ThemedScreen';
import { ThemedText } from '../components/ThemedText';
import { ErrorState } from '../components/ErrorState';
import { useTheme } from '../theme/ThemeContext';
import { useDeviceStore } from '../store/deviceStore';
import { maintenanceApi } from '../api/maintenance';
import { MaintenanceCountdownDto, MaintenanceLogDto, MaintenanceOverviewDto, MaintenanceType } from '../api/types';

const TYPE_META: Record<MaintenanceType, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  water_change: { label: 'Water Change', icon: 'water' },
  filter_replacement: { label: 'Filter Replacement', icon: 'filter' },
  harvest: { label: 'Harvest', icon: 'leaf' },
  nutrient_refill: { label: 'Nutrient Refill', icon: 'flask' },
  calibration: { label: 'Calibration', icon: 'options' },
  other: { label: 'Other', icon: 'ellipsis-horizontal' },
};

const LOGGABLE_TYPES: MaintenanceType[] = [
  'water_change',
  'filter_replacement',
  'harvest',
  'nutrient_refill',
  'calibration',
  'other',
];

type StatusKind = 'scheduled' | 'upcoming' | 'action_req' | 'not_logged';

function statusFor(item: MaintenanceCountdownDto): { kind: StatusKind; label: string } {
  // overdue is checked FIRST - a turbidity-triggered harvest (see
  // turbidityNow/turbidityReadyThreshold) can be overdue:true even when
  // daysRemaining is still null (never logged before) or positive (not yet
  // due by the calendar), and that must win over both of those.
  if (item.overdue) return { kind: 'action_req', label: 'ACTION REQ' };
  if (item.daysRemaining === null) return { kind: 'not_logged', label: 'NOT LOGGED' };
  if (item.daysRemaining <= 3) return { kind: 'upcoming', label: 'UPCOMING' };
  return { kind: 'scheduled', label: 'SCHEDULED' };
}

function countdownChip(item: MaintenanceCountdownDto): string {
  // Same ordering reason as statusFor above.
  if (item.overdue && item.turbidityNow !== null) return 'READY';
  if (item.daysRemaining === null) return 'NOT LOGGED';
  if (item.daysRemaining === 0) return 'TODAY';
  return `T-${item.daysRemaining}D`;
}

// --- Pulsing warning glyph (mirrors the banner's animate-pulse) -----------
function PulsingGlow({ color, children }: { color: string; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View>
      <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: `${color}1A`, opacity }} />
      {children}
    </View>
  );
}

// --- Critical action banner: the single most urgent overdue item ----------
function CriticalBanner({ item, onLogNow }: { item: MaintenanceCountdownDto; onLogNow: (type: MaintenanceType) => void }) {
  const { colors, spacing, radius } = useTheme();
  const meta = TYPE_META[item.type];
  const overdueDays = item.daysRemaining !== null ? Math.abs(item.daysRemaining) : null;
  // Turbidity can force overdue:true while daysRemaining is still null/
  // positive (not yet due by the calendar) - Math.abs(daysRemaining) in that
  // case would print a backwards "overdue by 3 days" for something that's
  // actually 3 days BEFORE its calendar due date. Detect that case and use
  // a turbidity-specific message instead.
  const isTurbidityTriggered =
    item.turbidityNow !== null && (item.daysRemaining === null || item.daysRemaining >= 0);

  return (
    <PulsingGlow color={colors.redContainer}>
      <View
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          padding: spacing.md,
          overflow: 'hidden',
          borderLeftWidth: 4,
          borderLeftColor: colors.redContainer,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="warning" size={16} color={colors.redContainer} />
            <ThemedText variant="label" style={{ color: colors.redContainer }}>
              Action Required
            </ThemedText>
          </View>
          <ThemedText variant="label" style={{ color: colors.redContainer }}>
            OVERDUE
          </ThemedText>
        </View>

        <ThemedText variant="semiBold" style={{ color: colors.textPrimary, fontSize: 17, marginTop: spacing.sm }}>
          {meta.label}
        </ThemedText>
        <ThemedText variant="body" style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
          {isTurbidityTriggered
            ? `Turbidity is ${item.turbidityNow} NTU, at or above the ${item.turbidityReadyThreshold} NTU harvest-ready level. Log this action once it's been completed.`
            : overdueDays !== null
              ? `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}. Log this action once it's been completed to reset the countdown.`
              : "This hasn't been logged yet - record it once completed."}
        </ThemedText>

        <TouchableOpacity
          onPress={() => onLogNow(item.type)}
          style={{
            marginTop: spacing.sm + 4,
            backgroundColor: colors.redContainer,
            borderRadius: radius.sm,
            paddingVertical: spacing.sm,
            alignItems: 'center',
          }}
        >
          <ThemedText variant="label" style={{ color: colors.onRedContainer }}>
            Log Action Now
          </ThemedText>
        </TouchableOpacity>
      </View>
    </PulsingGlow>
  );
}

// --- Scheduled Operations pod ----------------------------------------------
function ScheduledOperationsPod({ items }: { items: MaintenanceCountdownDto[] }) {
  const { colors, spacing, radius } = useTheme();
  if (items.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
        <Ionicons name="git-network-outline" size={15} color={colors.primary} />
        <ThemedText variant="label" color="primary">
          Scheduled Operations
        </ThemedText>
      </View>
      {items.map((item, idx) => {
        const meta = TYPE_META[item.type];
        const status = statusFor(item);
        const neutral = status.kind === 'not_logged';
        return (
          <View
            key={item.type}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.surface,
              borderRadius: radius.sm,
              padding: spacing.sm + 2,
              marginTop: idx === 0 ? 0 : spacing.xs,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: `${colors.primary}1A`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={meta.icon} size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText variant="body" style={{ color: colors.textPrimary, fontSize: 14 }}>
                  {meta.label}
                </ThemedText>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontSize: 11 }}>
                  {item.daysRemaining === null
                    ? item.intervalDays !== null
                      ? `Every ${item.intervalDays}d once started`
                      : 'Logged for record-keeping only'
                    : `Due in ${item.daysRemaining}d`}
                  {/* Harvest also tracks turbidity toward the ready threshold -
                      not overdue yet here (this pod only shows non-overdue
                      items), so just progress context. */}
                  {item.turbidityNow !== null ? ` · Turbidity ${item.turbidityNow}/${item.turbidityReadyThreshold} NTU` : ''}
                </ThemedText>
              </View>
            </View>
            <View
              style={{
                backgroundColor: neutral ? `${colors.textMuted}1A` : `${colors.primary}1A`,
                borderWidth: 1,
                borderColor: neutral ? `${colors.textMuted}33` : `${colors.primary}33`,
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
                borderRadius: radius.pill,
              }}
            >
              <ThemedText variant="mono" style={{ color: neutral ? colors.textMuted : colors.primary, fontSize: 10 }}>
                {countdownChip(item)}
              </ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// --- Event Logs pod (real timeline, dot+line style) -------------------------
function EventLogsPod({ timeline }: { timeline: MaintenanceLogDto[] }) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surfaceLow,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.primary}0D`,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="time-outline" size={15} color={colors.primary} />
          <ThemedText variant="label" color="primary">
            System Logs
          </ThemedText>
        </View>
      </View>

      {timeline.length === 0 ? (
        <ThemedText variant="body" style={{ color: colors.textSecondary, fontSize: 13 }}>
          No maintenance logged yet.
        </ThemedText>
      ) : (
        timeline.map((log, idx) => {
          const meta = TYPE_META[log.type];
          const isLast = idx === timeline.length - 1;
          return (
            <View key={log.id} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.primary,
                    marginTop: 4,
                  }}
                />
                {!isLast && <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 4 }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: spacing.sm + 4 }}>
                <ThemedText variant="mono" style={{ color: `${colors.primary}B3`, fontSize: 10, letterSpacing: 1 }}>
                  {new Date(log.performedAt).toLocaleString()}
                </ThemedText>
                <ThemedText variant="body" style={{ color: colors.textPrimary, fontSize: 14, marginTop: 2 }}>
                  {meta.label}
                </ThemedText>
                {log.notes && (
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>
                    {log.notes}
                  </ThemedText>
                )}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

// --- Log action modal -----------------------------------------------
function LogActionModal({
  visible,
  onClose,
  onSubmit,
  initialType,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (type: MaintenanceType, notes: string, backdateDays: number) => Promise<void>;
  initialType: MaintenanceType;
}) {
  const { colors, spacing, radius } = useTheme();
  const [type, setType] = useState<MaintenanceType>(initialType);
  const [notes, setNotes] = useState('');
  const [backdateDays, setBackdateDays] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setType(initialType);
  }, [visible, initialType]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(type, notes, backdateDays);
      setNotes('');
      setBackdateDays(0);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.lg,
            borderTopWidth: 1,
            borderColor: `${colors.primary}1A`,
          }}
        >
          <ThemedText variant="semiBold" style={{ fontSize: 18, color: colors.textPrimary, marginBottom: spacing.md }}>
            Log Maintenance Action
          </ThemedText>

          {submitError && (
            <ThemedText variant="caption" style={{ color: colors.red, marginBottom: spacing.sm }}>
              {submitError}
            </ThemedText>
          )}

          <ThemedText variant="label" style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
            Type
          </ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md, gap: spacing.xs }}>
            {LOGGABLE_TYPES.map((t) => {
              const active = t === type;
              const meta = TYPE_META[t];
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : 'transparent',
                  }}
                >
                  <Ionicons name={meta.icon} size={14} color={active ? colors.primaryOnFill : colors.textSecondary} />
                  <ThemedText
                    variant="caption"
                    style={{ color: active ? colors.primaryOnFill : colors.textSecondary, marginLeft: 4 }}
                  >
                    {meta.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <ThemedText variant="label" style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
            Notes (optional)
          </ThemedText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Cleaned tank walls, replaced filter media"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              padding: spacing.sm,
              color: colors.textPrimary,
              minHeight: 60,
              marginBottom: spacing.md,
              textAlignVertical: 'top',
            }}
          />

          <ThemedText variant="label" style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
            When
          </ThemedText>
          <View style={{ flexDirection: 'row', marginBottom: spacing.lg, gap: spacing.xs }}>
            {[0, 1, 2].map((d) => {
              const active = backdateDays === d;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => setBackdateDays(d)}
                  style={{
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : 'transparent',
                  }}
                >
                  <ThemedText style={{ color: active ? colors.primaryOnFill : colors.textSecondary }}>
                    {d === 0 ? 'Today' : d === 1 ? 'Yesterday' : '2 Days Ago'}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: spacing.sm + 2,
                alignItems: 'center',
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <ThemedText style={{ color: colors.textSecondary }}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={{
                flex: 1,
                paddingVertical: spacing.sm + 2,
                alignItems: 'center',
                borderRadius: radius.sm,
                backgroundColor: colors.primary,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <ThemedText style={{ color: colors.primaryOnFill }}>{submitting ? 'Saving...' : 'Save'}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function MaintenanceScreen() {
  const { colors, spacing } = useTheme();
  // MainTabNavigator's tab bar is position:'absolute' (a floating/blurred
  // bar, not normal layout flow), so it overlays screen content rather than
  // reserving space for it - anything positioned relative to the screen's
  // own bottom edge (this screen's FAB, the ScrollView's bottom padding)
  // needs to explicitly add this on top of its own spacing or it ends up
  // underneath the bar. Same fix ProfileScreen.tsx already uses.
  const tabBarHeight = useBottomTabBarHeight();
  const { devices, selectedDeviceId, fetchDevices } = useDeviceStore();
  const device = devices.find((d) => d.id === selectedDeviceId);

  const [overview, setOverview] = useState<MaintenanceOverviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<MaintenanceType>('water_change');

  const loadOverview = useCallback(async () => {
    if (!selectedDeviceId) return;
    setLoading(true);
    try {
      const data = await maintenanceApi.overview(selectedDeviceId);
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load maintenance data');
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleSubmitLog = async (type: MaintenanceType, notes: string, backdateDays: number) => {
    if (!selectedDeviceId) return;
    const performedAt = new Date();
    performedAt.setDate(performedAt.getDate() - backdateDays);
    await maintenanceApi.logAction(selectedDeviceId, type, notes || undefined, performedAt.toISOString());
    await loadOverview();
  };

  const openModal = (type: MaintenanceType) => {
    setModalType(type);
    setModalVisible(true);
  };

  if (!device) {
    return (
      <ThemedScreen screenLabel="Records">
        <ThemedText variant="body">No device paired yet.</ThemedText>
      </ThemedScreen>
    );
  }

  const countdowns = overview?.countdowns ?? [];
  const timeline = overview?.timeline ?? [];
  const overdueItems = countdowns.filter((c) => c.overdue);
  const scheduledItems = countdowns.filter((c) => !c.overdue);
  // Only the single most urgent item gets the full critical banner treatment -
  // matches the mockup's one-banner layout rather than stacking several.
  const topOverdue = overdueItems[0];

  return (
    <ThemedScreen screenLabel="Records">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOverview} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl, gap: spacing.lg }}
      >
        {error && <ErrorState message={error} onRetry={loadOverview} />}

        {topOverdue && <CriticalBanner item={topOverdue} onLogNow={openModal} />}

        <ScheduledOperationsPod items={scheduledItems} />

        <EventLogsPod timeline={timeline} />
      </ScrollView>

      <TouchableOpacity
        onPress={() => openModal('water_change')}
        style={{
          position: 'absolute',
          bottom: tabBarHeight + spacing.lg,
          right: spacing.lg,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.primaryGlow,
          shadowOpacity: 0.5,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={28} color={colors.primaryOnFill} />
      </TouchableOpacity>

      <LogActionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleSubmitLog}
        initialType={modalType}
      />
    </ThemedScreen>
  );
}