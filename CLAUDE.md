# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this
repository.

## Project

AURA is the software half (backend + mobile app) of a microalgae air-regeneration
bioreactor product built by Algae Decarbon. An ESP32-based physical unit publishes
sensor telemetry over MQTT; a NestJS backend ingests, stores, and evaluates it; an Expo/
React Native app turns it into a live dashboard. See `docs/AURA_SRS_v1.0.docx` (what's
built vs. still open) and `docs/AURA_SAD_v1.0.docx` (how it's built and why) before making
non-trivial changes — both were written by inspecting the actual code, not aspirationally.
`docs/Executive Summary 3.0.docx` is the client's own source spec; read it if a change
touches product scope, not just implementation.

## Commands

There is no automated test suite. `backend/` and `frontend/` are independent npm
projects with no root-level scripts.

**Backend** (`cd backend`):
- `npm run start:dev` — NestJS with hot reload
- `npm run migration:run` / `migration:revert` / `migration:generate -- src/database/migrations/NameHere`
- `npm run lint` — ESLint + autofix
- `npm run simulate:esp32` — publishes realistic fake telemetry over MQTT; the way to
  exercise the full ingestion pipeline (and demo the app) without physical hardware

**Frontend** (`cd frontend`):
- `npm run start` — Expo dev server, prints a QR code for Expo Go
- `npm run typecheck` — `tsc --noEmit`

**One-time backend setup**: `docker compose up -d` (TimescaleDB, Redis, EMQX — see
`backend/docker-compose.yml`), then `npm run migration:run`. See "Known operational
sharp edges" below for the Timescale migration caveat.

**No CI is configured.** `backend/README.md` currently claims a GitHub Actions workflow
exists; it doesn't. Don't assume lint/build is checked anywhere but locally.

## Architecture

**Everything downstream of MQTT ingestion is event-driven, not a direct call chain.**
`MqttIngestionService` writes a reading and emits `READING_CREATED_EVENT` via Nest's
`EventEmitter2` (in-process, not a queue). `AlertsService` and `SensorsGateway`
(Socket.io) both react to it independently — ingestion never calls either directly.
Adding a new consumer of "a reading just landed" (e.g. a future push-notification
dispatcher) means adding an `@OnEvent(READING_CREATED_EVENT)` listener somewhere, not
touching `mqtt-ingestion.service.ts`.

**Device ownership is checked in one place, reused everywhere.**
`DevicesService.getOwned(userId, deviceId)` throws 404/403 as appropriate and is called
by every device-scoped controller (sensors, alerts, maintenance) before doing anything.
Any new device-scoped endpoint must call it too — don't re-implement an ownership check
inline.

**`sensor_readings` is narrow (metricType + value), not wide (a column per sensor).**
Adding a new sensor metric is a data change: a new `MetricType` enum value + one
migration (`ALTER TYPE ... ADD VALUE`), not a schema redesign. See migration 005
(`biomass`) as the reference example. Postgres has no `DROP VALUE` for enums — removing
one cleanly needs a full type rebuild, so a migration's `down()` for an enum-add is
correctly a documented no-op, not a bug.

**Granularity (1h/1d/1w) is backed by TimescaleDB continuous aggregates
(`sensor_readings_1h/1d/1w`), not a live GROUP BY.** `SensorsService` selects the view
name from a fixed whitelist (never user input) and queries it directly. If you add a new
granularity option, it needs its own continuous aggregate + refresh policy in a new
migration, following migration `002`'s pattern — don't try to compute a new bucket size
from the raw hypertable at request time, that defeats the point.

**Two validators for two different input surfaces, on purpose.** REST DTOs use
`class-validator` (Nest's idiomatic choice, enforced by a global `ValidationPipe`). MQTT
payloads and environment config use zod instead, because neither goes through Nest's
request pipeline (MQTT messages arrive via the `mqtt` package's own event emitter; env
vars are read once at bootstrap) — zod's plain `safeParse` fits both without forcing a
decorator-on-a-class shape onto non-HTTP input. Don't "consolidate" these to one library;
they're deliberately different for different reasons.

**MQTT now has a second, backend → device direction: actuator commands** (added
2026-09-18, see `backend/src/mqtt/ACTUATOR_CONTROL.md`). `MqttIngestionService`
(device → backend, telemetry) is untouched — commands are published by a **separate**
service, `MqttCommandPublisherService`, with its own MQTT connection, specifically to
avoid a circular module dependency (`MqttModule`, the ingestion side, already depends on
`DevicesModule`; `DevicesService` is what needs to publish commands on
`PATCH /devices/:id/actuators`). `Device` now has actuator DESIRED-state columns
(`lightOn`, `lightColorMode`, `lightColorHex`, `lightIntensityPercent`,
`bubblingSpeed`) — **optimistic, not confirmed-applied**, since there's no
acknowledgement mechanism from the device. Every update publishes the complete
resulting state, not a delta, precisely because a dropped message can't be detected —
don't "optimize" this to a delta-only publish. Verified end-to-end against a real
simulator subscribed to the command topic.

**The `biomass` metric is a raw published value today, not a derived one.** The client's
source spec describes a calculation chain (RGB → HSV → optical density → biomass g/L →
CO2 absorbed / O2 released) that is **not implemented anywhere** in this codebase —
`biomass` is currently just another number the device is assumed to publish directly, no
formula involved. Before extending anything biomass/impact-related, read
`docs/AURA_SRS_v1.0.docx` §6.1 and §9.2 — there's a real open decision about whether this
conversion belongs in firmware or in the backend.

**MQTT payload shape, alert thresholds, and maintenance intervals are all explicitly
unconfirmed placeholders**, documented in `backend/src/mqtt/PAYLOAD_CONTRACT.md`,
`backend/src/alerts/ALERT_THRESHOLDS.md`, and
`backend/src/maintenance/MAINTENANCE_INTERVALS.md` respectively. Don't treat any specific
number in `default-thresholds.ts` or `default-intervals.ts` as validated — they're
reasonable generic guesses, called out in-repo as needing review before a client demo.
If you tighten or change one of these, update the corresponding `.md` file in the same
change so the "STATUS: PLACEHOLDER" banner stays honest.

**Frontend has no backend-shape codegen.** `frontend/src/api/types.ts` (DTOs) and
`frontend/src/constants/thresholds.ts` (alert bands) are hand-written mirrors of backend
entities/constants. If you change a backend response shape or a threshold value, you
must update these frontend files by hand in the same change — nothing else catches the
drift.

**Alerts are written only on a severity transition, not on every reading.**
`AlertsService.evaluateOne` compares against the currently-open alert (if any) for that
device+metric and only writes a new row when severity actually changes; it sets
`resolvedAt` when a metric returns to green. Don't change this to "write a row every
evaluation" — that was a deliberate anti-spam design (a sensor sitting in the red for an
hour should produce one open row, not one per reading).

**Every failure in the ingestion→alert→realtime chain fails closed per-item, never
crashes the pipeline.** A malformed MQTT message, an out-of-range reading, or one
metric's alert evaluation throwing must never stop processing for the rest of that
message or any other device — see the try/catch-and-log patterns in
`mqtt-ingestion.service.ts` and `alerts.service.ts`. Follow the same pattern for any new
per-reading or per-device processing step you add to this chain.

**Charts are hand-rolled SVG (`react-native-svg` + a manual `PanResponder`), not a
charting library.** The scrubber-drag interaction and radial gauge style are bespoke to
this design. If you need a new chart type, look at `EnvironmentScreen.tsx`'s
`MultiSeriesChart`/`ScrubbableLineChart` as the pattern to extend rather than reaching
for a charting dependency — that was a considered choice, not an oversight (see SAD §4.3).

**Design tokens have gone through two AI-generated ("Stitch") design passes, dark mode
only.** `frontend/src/theme/tokens.ts`'s `darkColors` is production-quality and
traceable to a specific Tailwind config export (see the file's header comment for the
full mapping rationale). `lightColors` is explicitly an unvalidated placeholder that has
never been through either design pass — don't assume it's "the same palette but light,"
and flag it if a task requires real light-mode support.

**There is no admin/staff role and no B2B/organization account model.** `User` owns
zero-or-more `Device`s, 1:1. This matches the client's B2C beachhead but not their B2B
target segments (wellness centres, corporate HQ, malls, hotels — see the Executive
Summary). Don't assume multi-user device sharing works; it doesn't exist yet (SRS §7).

## Known operational sharp edges

- **TimescaleDB migration 002** (`create_hypertable`, `add_continuous_aggregate_policy`)
  can fail partway on some Postgres/Timescale/pooler combinations because those functions
  sometimes need to run outside a transaction. If it does: check which statement failed,
  run the rest manually via `psql`, then manually insert a row into TypeORM's migrations
  table to mark it applied. This is a real, previously-hit issue, not a hypothetical.
- **CORS is wide open** (`origin: '*'` on both the REST app and the Socket.io gateway) —
  fine for local Expo Go testing, not reviewed for any real deployment. Don't copy this
  pattern into a new service without thinking about it first.
- **Signup and device pairing have real frontend screens** (`SignupScreen.tsx`,
  `DevicePairingScreen.tsx`, added 2026-09-18 — closes what SRS §9.1 used to flag as the
  onboarding gap). `RootNavigator.tsx` is a 3-way branch: `!hasSession` → Login/Signup
  stack, `hasSession && devices.length === 0` → `DevicePairingScreen` (a hard gate that
  replaces `Main` entirely, not something reachable from within it — there's still no
  unpair UI, so nothing can ever drive a session from >0 devices back to 0, which is what
  makes the hard gate safe), `hasSession && devices.length > 0` → `Main`. The device-check
  effect is keyed off `Boolean(accessToken)`, not the token string — keying it off the
  string would re-fire on every silent 401-refresh (`api/client.ts`) and flash the
  pairing screen or a spinner over `Main` mid-session.
- **Expo SDK is 57** (bumped from 54 on 2026-09-18 to match Expo Go's forced-latest-SDK
  behavior on physical devices). If a future Expo Go update moves past 57, the fix is the
  same: `npx expo install expo@<new>` then `npx expo install --fix`, then re-run
  `npm run typecheck` — the last bump broke on a TS 6.0 `baseUrl` deprecation, a missing
  `@types/node`, and `useColorScheme()` gaining an `'unspecified'` return value; expect
  similar small breaks on the next one too.
- **Push notifications are implemented and confirmed working end-to-end on a real
  device** (added 2026-09-18, see `backend/src/notifications/PUSH_NOTIFICATIONS.md`) —
  `AlertsService.notifyOwner` sends via Expo's push API (not Firebase/FCM directly — no
  Firebase project needed) on every genuine transition into amber/red. The app is linked
  to a real EAS project (`app.json`'s `extra.eas.projectId`/`owner`) — required for
  `getExpoPushTokenAsync` to work at all; without it, it fails with `No "projectId"
  found`, which is exactly what happened before this was set up. **Real constraint, not
  a gap in this codebase: Expo Go on Android no longer supports remote push at all** (a
  Google Play policy change) — `registerForPushNotifications.ts` silently no-ops there;
  only a real EAS dev/production build can test Android push. iOS via Expo Go is
  confirmed working (a forced RED alert produced a real notification on a real iPhone).
  Not built yet: notification-tap deep-linking, per-user notification preferences, and
  stale-token cleanup (a token that goes bad keeps being harmlessly retried, not pruned)
  — see the doc's "What's not built" section.
