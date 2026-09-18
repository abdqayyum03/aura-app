# Alert Threshold Assumptions

**STATUS: PLACEHOLDER VALUES.** The green/amber/red bands in
`src/alerts/default-thresholds.ts` are reasonable generic estimates, not
values confirmed by an algae/aquaculture specialist or the client. Please
review before the client demo, especially `ph` and `turbidity` - the
"safe zone" for the specific algae strain used in the bioreactor matters a
lot more than a generic guess.

## How it works

- Every metric has a `[greenMin, greenMax]` nominal range and a wider
  `[amberMin, amberMax]` warning range. Outside the amber range is red.
- Defaults live in code and apply to every device automatically.
- A device can get its own override via the `alert_thresholds` table (one row
  per device+metric) - useful once real hardware reveals a device needs
  different bounds than another (e.g. two bioreactors running different
  algae strains).
- Color channels (`color_r/g/b`) intentionally have no thresholds - the spec
  treats them as a diagnostic swatch for the user to look at, not a
  pass/fail safety metric.

## Current defaults (placeholder)

| Metric | Green (nominal) | Amber (warning) | Red (critical) |
|---|---|---|---|
| co2 | 0 - 1000 ppm | up to 1500 ppm | beyond |
| temperature | 18 - 30 C | 15 - 33 C | beyond |
| humidity | 30 - 70% | 20 - 80% | beyond |
| pm25 | 0 - 35 ug/m3 | up to 55 | beyond |
| pm10 | 0 - 50 ug/m3 | up to 100 | beyond |
| voc | 0 - 0.5 ppm | up to 1.5 | beyond |
| co | 0 - 1 ppm | up to 2 | beyond |
| ph | 6.5 - 8.0 | 6.0 - 8.5 | beyond |
| turbidity | 0 - 50 NTU | up to 100 | beyond |
| lightIntensity | 100 - 1000 lux | 50 - 1500 | beyond |
| waterLevel | 50 - 100% | 30 - 100% | below 30% |

## Alert lifecycle (how spam is avoided)

An alert row is only written on a **severity transition** - green to amber,
amber to red, red back to green, etc. A sensor sitting steadily in the red
for an hour produces exactly one open `alert_events` row, not one every 5
seconds. When the value returns to green, that row gets `resolved_at` set
rather than being deleted, so alert history stays queryable.

## Editing per-device thresholds (added 2026-09-18)

`AlertsController` has three endpoints, all under `devices/:id/alerts/thresholds`,
all ownership-checked the same way as every other device-scoped route:

- `GET` - the full band for every metric with a default, showing the
  device's override if it has one (`isOverridden: true`) or the shared
  default otherwise.
- `POST` - upsert an override for one metric. Server-side validates the same
  invariant documented above (`amberMin <= greenMin <= greenMax <= amberMax`)
  before saving, since a bad band saved once would misclassify every future
  reading for that metric - 400s on a violation.
- `DELETE /thresholds/:metricType` - remove the override, reverting to the
  shared default. 404s if the device was already on the default (nothing to
  delete) - `AlertsService.deleteThreshold` and `.upsertThreshold`.

Frontend: `AlertThresholdsScreen.tsx`, reachable from Profile → Alerts →
"Alert Thresholds".

## What's not built yet

- Push notifications (FCM) - `alerts.service.ts` logs a warning server-side on
  transitions into amber/red; actual push delivery needs push token
  registration, which doesn't exist in the frontend yet.
