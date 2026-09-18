import { z } from 'zod';
import { MetricType } from '../../database/entities/sensor-reading.entity';

/**
 * ASSUMED PAYLOAD FORMAT - not yet confirmed against real ESP32 firmware.
 * See src/mqtt/PAYLOAD_CONTRACT.md for the full write-up to hand to the
 * client's hardware/firmware team.
 *
 * MQTT topic: aura/{deviceCode}/telemetry
 * Payload (JSON, UTF-8):
 * {
 *   "deviceCode": "AURA-ESP32-001",      // optional - falls back to topic segment if omitted
 *   "timestamp": "2026-08-07T08:10:00Z", // optional ISO8601 - falls back to server receive time
 *   "readings": {
 *     "co2": 650,             // ppm
 *     "temperature": 24.5,    // Celsius
 *     "humidity": 55.2,       // %
 *     "pm25": 12,             // ug/m3
 *     "pm10": 18,             // ug/m3
 *     "voc": 0.3,             // ppm (index scale TBD with client)
 *     "co": 0.5,              // ppm
 *     "ph": 7.1,               // pH scale
 *     "turbidity": 15.2,      // NTU
 *     "lightIntensity": 320,  // lux
 *     "waterLevel": 82,       // % of tank capacity
 *     "biomass": 240,         // grams - NEW (Aug 2026), no confirmed sensor yet, see PAYLOAD_CONTRACT.md
 *     "color": { "r": 34, "g": 139, "b": 34 } // 0-255 each
 *   }
 * }
 *
 * All fields inside `readings` are optional - the device can send a partial
 * payload (e.g. only bioreactor sensors on one publish, only air sensors on
 * another) and only the included metrics get written.
 */
export const TelemetryPayloadSchema = z.object({
  deviceCode: z.string().min(1).optional(),
  timestamp: z.string().datetime().optional(),
  readings: z
    .object({
      co2: z.number().optional(),
      temperature: z.number().optional(),
      humidity: z.number().optional(),
      pm25: z.number().optional(),
      pm10: z.number().optional(),
      voc: z.number().optional(),
      co: z.number().optional(),
      ph: z.number().optional(),
      turbidity: z.number().optional(),
      lightIntensity: z.number().optional(),
      waterLevel: z.number().optional(),
      biomass: z.number().optional(), // new (Aug 2026)
      color: z
        .object({
          r: z.number(),
          g: z.number(),
          b: z.number(),
        })
        .optional(),
    })
    .refine((r) => Object.keys(r).length > 0, {
      message: 'readings object must contain at least one metric',
    }),
});

export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

// Sane physical bounds per metric. A reading outside this range is almost
// certainly a sensor fault or transmission glitch, not a real value - dropped
// and logged rather than written, so a stuck/broken sensor can't poison
// graphs, alerts, or continuous aggregates.
export const METRIC_RANGES: Record<MetricType, { min: number; max: number; unit: string }> = {
  [MetricType.CO2]: { min: 0, max: 10000, unit: 'ppm' },
  [MetricType.TEMPERATURE]: { min: -10, max: 60, unit: 'C' },
  [MetricType.HUMIDITY]: { min: 0, max: 100, unit: '%' },
  [MetricType.PM25]: { min: 0, max: 1000, unit: 'ug/m3' },
  [MetricType.PM10]: { min: 0, max: 1000, unit: 'ug/m3' },
  [MetricType.VOC]: { min: 0, max: 5000, unit: 'ppm' },
  [MetricType.CO]: { min: 0, max: 1000, unit: 'ppm' },
  [MetricType.PH]: { min: 0, max: 14, unit: 'pH' },
  [MetricType.TURBIDITY]: { min: 0, max: 1000, unit: 'NTU' },
  [MetricType.LIGHT_INTENSITY]: { min: 0, max: 200000, unit: 'lux' },
  [MetricType.WATER_LEVEL]: { min: 0, max: 100, unit: '%' },
  [MetricType.COLOR_R]: { min: 0, max: 255, unit: 'rgb' },
  [MetricType.COLOR_G]: { min: 0, max: 255, unit: 'rgb' },
  [MetricType.COLOR_B]: { min: 0, max: 255, unit: 'rgb' },
  // New (Aug 2026). 10,000g (10kg) is a generous sane-bound guess for a
  // desktop/office-scale tank, NOT a confirmed hardware/tank-capacity limit -
  // tighten once tank volume + expected max culture density are confirmed.
  [MetricType.BIOMASS]: { min: 0, max: 10000, unit: 'g' },
  // CO2_ABSORBED/O2_RELEASED are server-computed (mqtt-ingestion.service.ts's
  // withImpactMetrics, via biomass-calculation.ts) and NEVER go through this
  // device-payload validation path at all - these two entries exist purely
  // so METRIC_RANGES stays a complete Record<MetricType, ...> (forcing any
  // future metric addition to consciously pick a range), not because a
  // device-published value for either is ever actually checked against them.
  [MetricType.CO2_ABSORBED]: { min: 0, max: 20000, unit: 'g' }, // 1.7x BIOMASS's max
  [MetricType.O2_RELEASED]: { min: 0, max: 20000, unit: 'g' }, // 1.35x BIOMASS's max, rounded up
};

export interface ValidatedReading {
  metricType: MetricType;
  value: number;
  unit: string;
}

// Maps the nested `readings` object to flat (metricType, value) pairs and
// drops anything outside physical bounds. Returns both what survived and
// what was dropped, so the caller can log the drops without crashing.
export function extractValidReadings(readings: TelemetryPayload['readings']): {
  valid: ValidatedReading[];
  dropped: { metricType: MetricType; value: number; reason: string }[];
} {
  const valid: ValidatedReading[] = [];
  const dropped: { metricType: MetricType; value: number; reason: string }[] = [];

  const flatEntries: [MetricType, number | undefined][] = [
    [MetricType.CO2, readings.co2],
    [MetricType.TEMPERATURE, readings.temperature],
    [MetricType.HUMIDITY, readings.humidity],
    [MetricType.PM25, readings.pm25],
    [MetricType.PM10, readings.pm10],
    [MetricType.VOC, readings.voc],
    [MetricType.CO, readings.co],
    [MetricType.PH, readings.ph],
    [MetricType.TURBIDITY, readings.turbidity],
    [MetricType.LIGHT_INTENSITY, readings.lightIntensity],
    [MetricType.WATER_LEVEL, readings.waterLevel],
    [MetricType.BIOMASS, readings.biomass], // new (Aug 2026)
    [MetricType.COLOR_R, readings.color?.r],
    [MetricType.COLOR_G, readings.color?.g],
    [MetricType.COLOR_B, readings.color?.b],
  ];

  for (const [metricType, value] of flatEntries) {
    if (value === undefined) continue;

    if (typeof value !== 'number' || Number.isNaN(value)) {
      dropped.push({ metricType, value: NaN, reason: 'not a number' });
      continue;
    }

    const range = METRIC_RANGES[metricType];
    if (value < range.min || value > range.max) {
      dropped.push({ metricType, value, reason: `out of range [${range.min}, ${range.max}]` });
      continue;
    }

    valid.push({ metricType, value, unit: range.unit });
  }

  return { valid, dropped };
}
