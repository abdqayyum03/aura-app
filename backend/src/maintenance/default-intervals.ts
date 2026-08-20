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
