import { MaintenanceType } from '../database/entities/maintenance-log.entity';

/**
 * ASSUMED INTERVALS - not yet confirmed with the client. See
 * MAINTENANCE_INTERVALS.md for the full write-up. These drive the "next
 * harvest due in N days" countdown on the Maintenance & Records screen.
 *
 * A null interval means that type is logged for record-keeping only and
 * never shows a countdown (e.g. "other" is a catch-all, not a recurring task).
 */
export const DEFAULT_INTERVAL_DAYS: Record<MaintenanceType, number | null> = {
  [MaintenanceType.WATER_CHANGE]: 7,
  [MaintenanceType.FILTER_REPLACEMENT]: 30,
  [MaintenanceType.HARVEST]: 14,
  [MaintenanceType.NUTRIENT_REFILL]: 7,
  [MaintenanceType.CALIBRATION]: 30,
  [MaintenanceType.OTHER]: null,
};

/**
 * ASSUMED PLACEHOLDER, not client/biology-confirmed - see the "Turbidity-
 * triggered harvest reminders" note below and MAINTENANCE_INTERVALS.md.
 *
 * When the device's current turbidity reading is at or above this, harvest
 * is considered due regardless of how many days it's been since the last
 * one - this takes priority over DEFAULT_INTERVAL_DAYS[HARVEST] in
 * MaintenanceService.getCountdowns, matching the client spec's "Turbidity
 * (Algae Density): Indicates when the algae is thick enough to harvest."
 * The 14-day interval above still applies as a fallback estimate when no
 * turbidity reading is available yet (e.g. a brand new device).
 *
 * 60 NTU sits just above the alert engine's own "nominal" turbidity ceiling
 * (DEFAULT_THRESHOLDS.turbidity.greenMax = 50 in default-thresholds.ts) -
 * chosen as a reasonable "the culture has visibly thickened past normal"
 * signal, not a measured harvest-yield number. Tighten once real growth
 * data exists.
 */
export const HARVEST_READY_TURBIDITY_NTU = 60;
