/**
 * RGB -> HSV -> Optical Density (OD680) -> Biomass -> CO2/O2 pipeline.
 *
 * Source: docs/Executive Summary 3.0.docx ("Sensor and App" table). Computed
 * server-side from the RGB color sensor (TCS34725 - confirmed working
 * hardware, already flowing into the system as color_r/g/b), NOT on the
 * ESP32 - see docs/AURA_SRS_v1.0.docx §9.2 for why this direction was chosen
 * over on-device computation (no firmware changes needed, works retroactively
 * on already-collected RGB history, keeps firmware simple).
 *
 * STATUS: the underlying regression formulas are the client's own, taken
 * directly from their document, NOT independently re-derived or validated
 * against a real spectrophotometer by this codebase. Treat this whole module
 * with the same "ASSUMED, confirm before relying on it for a real claim"
 * caution as PAYLOAD_CONTRACT.md / ALERT_THRESHOLDS.md / MAINTENANCE_INTERVALS.md.
 *
 * KNOWN INCONSISTENCY IN THE SOURCE DOCUMENT, resolved here by picking one
 * side explicitly rather than silently averaging or guessing:
 * - The "Sensor and App" table gives TWO different formulas for OD680 from
 *   the same RGB reading: one via HSV Hue (used here - see rgbToHue/
 *   computeOpticalDensity680), and a second via direct RGB linear
 *   regression ("OD = -29.9848 + (-0.0306)R + (0.1512)G + (-0.000670)B").
 *   The HSV-based one is used here because it produces physically plausible
 *   (non-negative) OD for a real algae-green color (e.g. the simulator's
 *   default (34,139,34) -> OD680 ~2.95); the direct-RGB regression produces
 *   a NEGATIVE OD for that same color, which is unphysical (absorbance
 *   can't be negative) - almost certainly means that second formula's units/
 *   normalization don't match how this codebase's 0-255 RGB is represented.
 * - The "App" section and the "Sensor list" section give two different
 *   CO2/O2-per-biomass ratios: the App section's simpler 1.7x/1.35x (used
 *   here, since it's explicitly labeled as the app-facing formula) vs. the
 *   Sensor list section's more detailed stoichiometric 1.83x/1.3x (plus a
 *   556 L/kg CO2 and ~764 L/kg O2 volume conversion, consistent with each
 *   gas's molar volume at roughly room temperature - the source document
 *   appears to have a typo labeling both as "CO2"). Worth reconciling with
 *   the client before either number is used in a real marketing claim.
 *
 * SCOPE BOUNDARY: this computes CO2/O2 associated with the CURRENT biomass
 * level only ("if all the algae currently in the tank grew from scratch,
 * this is roughly how much CO2 it took") - NOT a true lifetime-cumulative
 * total across harvests. A harvest discards ~80% of the culture (see the
 * Executive Summary's maintenance process flow), and the CO2 already
 * absorbed into that discarded biomass doesn't un-absorb itself - a real
 * "lifetime to date" figure would need to integrate biomass PRODUCTION over
 * time (harvest-aware), which this module does not attempt. Flagged as a
 * known gap, not silently glossed over - see SRS §9.2.
 */

export interface RgbReading {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface ImpactMetrics {
  opticalDensity680: number;
  biomassConcentrationGPerL: number;
  biomassGrams: number;
  co2AbsorbedGrams: number;
  o2ReleasedGrams: number;
}

// biomass(g) = ratio x biomass(g) - see "KNOWN INCONSISTENCY" note above for
// why these specific values (not the Sensor list section's 1.83/1.3) were chosen.
const CO2_PER_BIOMASS_RATIO = 1.7;
const O2_PER_BIOMASS_RATIO = 1.35;

// Biomass = 0.325 x OD680 + 0.065 (g/L)
const BIOMASS_OD_SLOPE = 0.325;
const BIOMASS_OD_INTERCEPT = 0.065;

// OD = -6.9148 + 57.5223H - 83.8247H², H normalized to [0, 1) (fraction of
// 360°, not degrees - plugging degree-scale H into this quadratic produces
// nonsense magnitudes, confirmed by hand against the doc's own numbers).
const OD_HUE_INTERCEPT = -6.9148;
const OD_HUE_LINEAR = 57.5223;
const OD_HUE_QUADRATIC = -83.8247;

/**
 * Standard RGB -> HSV hue extraction, returning H normalized to [0, 1).
 * Degenerate case (r === g === b, i.e. a grey/uncolored reading - zero
 * saturation) returns hue 0 by the usual HSV convention; the resulting
 * OD/biomass for that case is not physically meaningful (there's no real
 * "hue" for grey) but the function still returns a number rather than
 * throwing, consistent with the rest of the ingestion pipeline's
 * fail-soft-per-reading philosophy - see mqtt-ingestion.service.ts.
 */
export function rgbToHue({ r, g, b }: RgbReading): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  if (delta === 0) return 0;

  let hueDegrees: number;
  if (max === rn) {
    hueDegrees = 60 * (((gn - bn) / delta) % 6);
  } else if (max === gn) {
    hueDegrees = 60 * ((bn - rn) / delta + 2);
  } else {
    hueDegrees = 60 * ((rn - gn) / delta + 4);
  }
  if (hueDegrees < 0) hueDegrees += 360;

  return hueDegrees / 360;
}

// Clamped to >= 0 - the quadratic can dip negative for hues far from green,
// and a negative optical density is unphysical.
export function computeOpticalDensity680(hue: number): number {
  const od = OD_HUE_INTERCEPT + OD_HUE_LINEAR * hue + OD_HUE_QUADRATIC * hue * hue;
  return Math.max(0, od);
}

// Clamped to >= 0 for the same reason - a negative OD (already clamped
// above) would otherwise still be able to produce a small negative biomass
// through the intercept term.
export function computeBiomassConcentrationGPerL(od680: number): number {
  return Math.max(0, BIOMASS_OD_SLOPE * od680 + BIOMASS_OD_INTERCEPT);
}

export function computeBiomassGrams(concentrationGPerL: number, tankVolumeLiters: number): number {
  return concentrationGPerL * tankVolumeLiters;
}

export function computeCo2AbsorbedGrams(biomassGrams: number): number {
  return biomassGrams * CO2_PER_BIOMASS_RATIO;
}

export function computeO2ReleasedGrams(biomassGrams: number): number {
  return biomassGrams * O2_PER_BIOMASS_RATIO;
}

/** Runs the full RGB -> impact-metrics pipeline in one call. */
export function deriveImpactMetrics(color: RgbReading, tankVolumeLiters: number): ImpactMetrics {
  const hue = rgbToHue(color);
  const opticalDensity680 = computeOpticalDensity680(hue);
  const biomassConcentrationGPerL = computeBiomassConcentrationGPerL(opticalDensity680);
  const biomassGrams = computeBiomassGrams(biomassConcentrationGPerL, tankVolumeLiters);

  return {
    opticalDensity680,
    biomassConcentrationGPerL,
    biomassGrams,
    co2AbsorbedGrams: computeCo2AbsorbedGrams(biomassGrams),
    o2ReleasedGrams: computeO2ReleasedGrams(biomassGrams),
  };
}
