import { MetricType } from '../api/types';

/**
 * Mirrors backend/src/alerts/default-thresholds.ts. ASSUMED SAFE ZONES -
 * not yet confirmed against real algae biology or the client's target
 * environment (see backend ALERT_THRESHOLDS.md). If the backend values
 * change, this file needs a manual update to match - same tradeoff as
 * api/types.ts mirroring backend entities.
 */
export interface ThresholdBand {
  greenMin: number;
  greenMax: number;
  amberMin: number;
  amberMax: number;
}

export const THRESHOLDS: Partial<Record<MetricType, ThresholdBand>> = {
  ph: { greenMin: 6.5, greenMax: 8.0, amberMin: 6.0, amberMax: 8.5 },
  turbidity: { greenMin: 0, greenMax: 50, amberMin: 0, amberMax: 100 },
  light_intensity: { greenMin: 100, greenMax: 1000, amberMin: 50, amberMax: 1500 },
  water_level: { greenMin: 50, greenMax: 100, amberMin: 30, amberMax: 100 },
  biomass: { greenMin: 0, greenMax: 500, amberMin: 0, amberMax: 800 }, // new (Aug 2026)
};

// Gauge display domain - matches the simulator's realistic sensor bounds,
// not just the amber band, so the dial has headroom past "critical" rather
// than clipping right at the edge of the warning zone.
export const GAUGE_DOMAIN: Partial<Record<MetricType, { min: number; max: number }>> = {
  ph: { min: 5.5, max: 8.5 },
  turbidity: { min: 0, max: 100 },
  light_intensity: { min: 0, max: 2000 },
  water_level: { min: 0, max: 100 },
  biomass: { min: 0, max: 900 }, // new (Aug 2026), matches simulator's walker bound
};