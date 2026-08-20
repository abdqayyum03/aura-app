# Maintenance Interval Assumptions

**STATUS: PLACEHOLDER VALUES.** The intervals in
`src/maintenance/default-intervals.ts` are generic estimates for a small
algae bioreactor, not values confirmed by the client. Please review before
the demo - these drive the "Next Harvest due in N days" countdown card.

## Current defaults (placeholder)

| Maintenance type | Interval | Notes |
|---|---|---|
| water_change | 7 days | |
| filter_replacement | 30 days | |
| harvest | 14 days | Tied to "Turbidity (Algae Density)" reaching harvest-ready in the spec - may need to be dynamic based on turbidity readings rather than a fixed interval once real growth rates are known |
| nutrient_refill | 7 days | Matches the subscription's "monthly nutrient media" business model loosely - worth reconciling with the actual delivery cadence |
| calibration | 30 days | pH sensor recalibration |
| other | none (no countdown) | Catch-all for one-off actions, record-keeping only |

## How the countdown is calculated

`nextDueAt = mostRecentLogOfThatType.performedAt + intervalDays`

If a type has never been logged for a device, its countdown shows
`lastPerformedAt: null` and `nextDueAt: null` rather than assuming "due now" -
the frontend should treat this as "no data yet," not as an overdue warning.

## What's not built yet

- Per-device interval overrides (unlike alert thresholds, which do have a
  device-specific override table). If the client needs different intervals
  per unit, add an `maintenance_intervals` table following the same pattern
  as `alert_thresholds`.
- Turbidity-triggered harvest reminders (spec mentions turbidity indicating
  when algae is "thick enough to harvest" - the current countdown is purely
  time-based, not sensor-driven).
