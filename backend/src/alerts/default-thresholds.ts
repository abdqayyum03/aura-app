import { MetricType } from '../database/entities/sensor-reading.entity';

/**
 * ASSUMED SAFE ZONES - not yet confirmed against real algae biology or the
 * client's target environment. See ALERT_THRESHOLDS.md for the full write-up.
 *
 * A value inside [greenMin, greenMax] is nominal. Outside that but inside
 * [amberMin, amberMax] is a warning. Outside [amberMin, amberMax] entirely
 * is critical. amberMin/Max must be <= greenMin / >= greenMax respectively -
 * amber is always the wider band surrounding green.
 *
 * Color channels (color_r/g/b) are intentionally excluded - the spec treats
 * them as a diagnostic swatch for the user to eyeball, not a pass/fail metric.
 */
export interface ThresholdBand {
  greenMin: number;
  greenMax: number;
  amberMin: number;
  amberMax: number;
}

export const DEFAULT_THRESHOLDS: Partial<Record<MetricType, ThresholdBand>> = {
  [MetricType.CO2]: { greenMin: 0, greenMax: 1000, amberMin: 0, amberMax: 1500 },
  [MetricType.TEMPERATURE]: { greenMin: 18, greenMax: 30, amberMin: 15, amberMax: 33 },
  [MetricType.HUMIDITY]: { greenMin: 30, greenMax: 70, amberMin: 20, amberMax: 80 },
  [MetricType.PM25]: { greenMin: 0, greenMax: 35, amberMin: 0, amberMax: 55 },
  [MetricType.PM10]: { greenMin: 0, greenMax: 50, amberMin: 0, amberMax: 100 },
  [MetricType.VOC]: { greenMin: 0, greenMax: 0.5, amberMin: 0, amberMax: 1.5 },
  [MetricType.CO]: { greenMin: 0, greenMax: 1, amberMin: 0, amberMax: 2 },
  [MetricType.PH]: { greenMin: 6.5, greenMax: 8.0, amberMin: 6.0, amberMax: 8.5 },
  [MetricType.TURBIDITY]: { greenMin: 0, greenMax: 50, amberMin: 0, amberMax: 100 },
  [MetricType.LIGHT_INTENSITY]: { greenMin: 100, greenMax: 1000, amberMin: 50, amberMax: 1500 },
  [MetricType.WATER_LEVEL]: { greenMin: 50, greenMax: 100, amberMin: 30, amberMax: 100 },
};
