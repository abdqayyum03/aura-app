/**
 * Design tokens for AURA.
 *
 * SECOND design pass (Aug 2026): replaces the earlier "Bio-Green" palette
 * with the "Deep Sea Biotech" system from the newest Stitch export
 * (dashboard.html / internal.html / maintenance.html / profile.html +
 * DESIGN.md). Values below are taken directly from the shared Tailwind
 * config embedded in those HTML files (all four files carry byte-identical
 * config), not eyeballed from the screenshot or DESIGN.md's prose - the
 * prose ("Electric Cyan", "Vivid Magenta") is consistent with the config
 * this time, but the config is still treated as the source of truth.
 *
 * Role mapping notes (Tailwind name -> app role):
 * - primary: "primary" (#c3f5ff, pale cyan text/icon tone)
 * - primaryGlow: "primary-container" (#00e5ff, saturated cyan for glows/fills)
 * - primaryOnFill: "on-primary" (#00363d, text placed on a solid cyan fill)
 * - secondary/secondaryGlow: mapped to the "tertiary" (deep violet) pair,
 *   not Tailwind's "secondary" - DESIGN.md explicitly reserves violet for
 *   "secondary data streams", which is what colors.secondary is used for
 *   in EnvironmentScreen/DashboardScreen (chart accent lines, badges).
 *   Tailwind's own "secondary" (#ffb3b5, pale pink) has no home in this
 *   interface and isn't used - it's a near-duplicate of "error" in this
 *   palette and the screens don't need a third pink/red tone.
 * - red: "error" (#ffb4ab) - matches profile.html's "Terminate Session"
 *   danger button, used for icon/text-only danger states.
 * - redContainer/onRedContainer: "secondary-container" / "on-secondary-container"
 *   (#de0541 / #fff1f1) - this is deliberately NOT "error-container". The
 *   maintenance.html critical-alert banner ("Yield Extraction... CRITICAL")
 *   uses secondary-container for its solid fill, so that's what a red
 *   *banner background* should use to match the approved design; "error"
 *   itself is reserved for the calmer danger-button use case above.
 * - green: "surface-tint" (#00daf3) - a saturated cyan distinct from the
 *   paler "primary" text tone, used where the old palette wanted a more
 *   emphatic "nominal/positive" accent (e.g. StatCard values, success fills).
 * - amber: NOT part of Stitch's output - same situation as the first pass.
 *   This palette has no amber/gold at all (cyan / magenta / violet only),
 *   but the backend's alert engine genuinely has 3 severities. Chose a
 *   muted warm gold that reads clearly against the near-black background
 *   without fighting the cyan-vs-magenta contrast the rest of the design
 *   relies on.
 *
 * Light mode: still not covered by the Stitch export (dark-only design),
 * left as a reasonable placeholder unrelated to either Stitch pass.
 */

export const palette = {
  // Cyan - primary (exact values from Stitch's Tailwind config)
  cyanPale: '#c3f5ff', // "primary" - text/icon tone
  cyanBright: '#00e5ff', // "primary-container" - saturated, for glows/fills
  cyanTint: '#00daf3', // "surface-tint" - used as the app's "green/nominal" accent
  cyanFixed: '#9cf0ff', // "primary-fixed"
  cyanFixedDim: '#00daf3', // "primary-fixed-dim"
  onCyan: '#00363d', // "on-primary" - text/icon placed ON a solid cyan fill
  onCyanContainer: '#00626e', // "on-primary-container"

  // Violet - tertiary, used for secondary data streams (per DESIGN.md)
  violetPale: '#f2e9ff', // "tertiary"
  violetContainer: '#d9c8ff', // "tertiary-container"
  onVioletContainer: '#6c00f7', // "on-tertiary-container"

  // Magenta - reserved strictly for critical alerts (per DESIGN.md)
  magenta: '#de0541', // "secondary-container" - solid critical banner fill
  onMagenta: '#fff1f1', // "on-secondary-container"

  // Error (softer coral-red) - danger buttons/text, distinct from magenta
  error: '#ffb4ab', // "error"
  onError: '#690005', // "on-error"

  // Amber - NOT part of Stitch's output (see note above). Added to support
  // the backend's real amber alert severity.
  amber: '#e0b45c',

  // Neutrals - light mode (unchanged placeholder, not covered by either
  // Stitch export)
  lightBg: '#F7FAF8',
  lightSurface: '#FFFFFF',
  lightBorder: '#DCE8E1',
  lightTextPrimary: '#10231A',
  lightTextSecondary: '#4B6358',

  // Neutrals - dark mode (exact Stitch values)
  darkBg: '#10131a', // "background" / "surface"
  darkSurfaceLow: '#191c22', // "surface-container-low"
  darkSurface: '#1d2026', // "surface-container" - standard card background
  darkSurfaceElevated: '#272a31', // "surface-container-high"
  darkSurfaceHighest: '#32353c', // "surface-container-highest"
  darkBorder: '#3b494c', // "outline-variant" - dividers/card borders
  darkTextPrimary: '#e1e2eb', // "on-surface"
  darkTextSecondary: '#bac9cc', // "on-surface-variant" - secondary body text
  darkTextMuted: '#849396', // "outline" - all-caps section/category labels
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceLow: string; // new: "surface-container-low", slightly darker than surface
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryGlow: string;
  primaryOnFill: string; // text/icon color when placed on a solid primary background
  secondary: string;
  secondaryGlow: string;
  amber: string;
  red: string;
  redContainer: string;
  onRedContainer: string;
  green: string;
}

export const lightColors: ThemeColors = {
  background: palette.lightBg,
  surface: palette.lightSurface,
  surfaceElevated: palette.lightSurface,
  surfaceLow: palette.lightSurface,
  border: palette.lightBorder,
  textPrimary: palette.lightTextPrimary,
  textSecondary: palette.lightTextSecondary,
  textMuted: palette.lightTextSecondary,
  primary: palette.onCyanContainer,
  primaryGlow: palette.onCyanContainer,
  primaryOnFill: '#FFFFFF',
  secondary: palette.onVioletContainer,
  secondaryGlow: palette.onVioletContainer,
  amber: palette.amber,
  red: palette.magenta,
  redContainer: palette.magenta,
  onRedContainer: '#FFFFFF',
  green: palette.onCyanContainer,
};

export const darkColors: ThemeColors = {
  background: palette.darkBg,
  surface: palette.darkSurface,
  surfaceElevated: palette.darkSurfaceElevated,
  surfaceLow: palette.darkSurfaceLow,
  border: palette.darkBorder,
  textPrimary: palette.darkTextPrimary,
  textSecondary: palette.darkTextSecondary,
  textMuted: palette.darkTextMuted,
  primary: palette.cyanPale,
  primaryGlow: palette.cyanBright,
  primaryOnFill: palette.onCyan,
  secondary: palette.violetContainer,
  secondaryGlow: palette.violetPale,
  amber: palette.amber,
  red: palette.error,
  redContainer: palette.magenta,
  onRedContainer: palette.onMagenta,
  green: palette.cyanTint,
};

export const typography = {
  fontFamily: {
    display: 'Inter_700Bold',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold', // new: headline-lg-mobile (600) in the new type scale
    mono: 'JetBrainsMono_500Medium',
    monoSemiBold: 'JetBrainsMono_600SemiBold', // new: label-caps (600) - uppercase section labels/badges
  },
  size: {
    xs: 12, // data-label / label-caps
    sm: 14, // body-sm / data-mono
    md: 16, // body-md
    lg: 24, // headline-md
    xl: 28, // headline-lg-mobile
    xxl: 36, // data-display-lg
  },
} as const;

export const spacing = {
  xs: 4, // base-unit
  sm: 8,
  md: 16, // gutter / card padding ("p-md" in the Stitch export)
  lg: 24,
  xl: 32,
  xxl: 48,
  gutter: 12, // new: grid/list item gaps ("gap-gutter")
  containerMargin: 20, // new: screen-edge horizontal padding ("px-container-margin")
} as const;

export const radius = {
  sm: 4, // small chips/buttons ("rounded-lg" in the Stitch export, oddly named)
  md: 8, // standard card radius ("rounded-xl" - used almost everywhere)
  lg: 12, // larger hero cards
  pill: 999, // true circles/pills - overrides Stitch's buggy borderRadius.full (12px)
} as const;