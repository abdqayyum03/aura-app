# AURA Backend

Backend for the Algae Decarbon AURA IoT air regenerator dashboard.

**Status:** all of Prompts 1-7 of the original build plan are implemented (scaffold,
database schema, auth, MQTT ingestion, REST + realtime API, alerts, maintenance). See
[`../docs/AURA_SRS_v1.0.docx`](../docs/AURA_SRS_v1.0.docx) and
[`../docs/AURA_SAD_v1.0.docx`](../docs/AURA_SAD_v1.0.docx) for the full, current picture —
this README covers setup only; treat those two documents as the source of truth for
scope and architecture, not the "What's included" list below.

## Stack
NestJS + TypeScript, TypeORM, PostgreSQL/TimescaleDB, Redis, MQTT (EMQX).

## What's included
- Auth: signup/login/refresh via JWT access+refresh tokens, bcrypt, logout-all via
  token versioning
- Device pairing: pair/unpair/list, auto-create on first MQTT sighting, ownership
  enforced on every device-scoped endpoint
- MQTT ingestion (`aura/{deviceCode}/telemetry`): zod-validated payload, per-metric
  physical-range validation, RGB→biomass→CO2/O2 derivation on ingest (see
  `src/mqtt/biomass-calculation.ts`), Redis current-value cache, event-driven fan-out to
  alerts + realtime — see `src/mqtt/PAYLOAD_CONTRACT.md` (status: **assumed, not
  confirmed** with the firmware team)
- MQTT actuator command channel (`aura/{deviceCode}/command`, backend → device): a
  separate publisher connection (`MqttCommandPublisherService`) lets the app control
  lighting (on/off, color, intensity) and bubbling speed — see
  `src/mqtt/ACTUATOR_CONTROL.md` (status: **assumed payload shape**, verified only
  against the simulator, not real firmware)
- REST history/current-readings endpoints backed by TimescaleDB continuous aggregates
  (1h/1d/1w), plus a Socket.io `/realtime` namespace for live updates
- Alerts engine: green/amber/red threshold evaluation, transition-only alert writes,
  per-device threshold overrides (now with a real read/write API, not just a table), and
  real push notifications (via Expo's push service, cooldown-limited to avoid spam from
  a reading oscillating near a threshold) — see `src/alerts/ALERT_THRESHOLDS.md`
  (status: **placeholder band values**) and `src/notifications/PUSH_NOTIFICATIONS.md`
  (status: **implemented and confirmed working end-to-end on a real device**)
- Maintenance: CRUD logs + due-date countdowns, harvest readiness additionally driven by
  live turbidity (not just a fixed interval) — see
  `src/maintenance/MAINTENANCE_INTERVALS.md` (status: **placeholder values**)
- Env validation via `zod` (`src/config/env.validation.ts`) - app refuses to boot with
  missing/invalid env vars instead of failing confusingly later
- `GET /health` endpoint
- Full DB schema as TypeORM migrations (`src/database/migrations/001`-`009`)
- ESLint + Prettier

**Not included:** a true harvest-aware *lifetime cumulative* CO2/O2 total (today's Impact
figures are tied to the current biomass level only), push-notification-tap deep-linking,
per-user notification preferences, stale push-token cleanup, and CI — no
`.github/workflows/ci.yml` currently exists in this repository despite the previous
version of this README claiming one did. See the SRS's traceability table (§8) for the
full gap list.

## Prerequisites
- Node.js 20+
- Docker + Docker Compose (for Postgres/Timescale, Redis, EMQX locally)

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run migration:run
npm run start:dev
```

Verify it's up:
```bash
curl http://localhost:3000/health
```

## Useful commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run with hot reload |
| `npm run migration:run` | Apply pending migrations |
| `npm run migration:revert` | Roll back the last migration |
| `npm run migration:generate -- src/database/migrations/NameHere` | Generate a migration from entity changes |
| `npm run lint` | Lint + autofix |
| `npm run build` | Production build to `dist/` |

## Notes on the hypertable migration
`002_sensor_readings_hypertable.ts` calls TimescaleDB functions (`create_hypertable`,
`add_continuous_aggregate_policy`) that historically need to run outside a transaction
on some Postgres/Timescale versions. If it fails partway:
1. Check which statement failed in the error output
2. Run the remaining SQL manually via `psql` against the `aura` database
3. Mark the migration as applied: `INSERT INTO migrations (timestamp, name) VALUES (...)`
   (TypeORM's migrations table)

## What's next

See [`../docs/AURA_SRS_v1.0.docx`](../docs/AURA_SRS_v1.0.docx) §9 for the full, current
recommended-next-steps list (confirming the MQTT/threshold/interval placeholders with the
client, deciding whether the Impact Widget should become a true harvest-aware lifetime
cumulative total, and the B2B/multi-user gap).
