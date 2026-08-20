# AURA Backend

Backend for the Algae Decarbon AURA IoT air regenerator dashboard.
Covers **Prompt 1 (scaffold)** and **Prompt 2 (database schema)** of the build plan.

## Stack
NestJS + TypeScript, TypeORM, PostgreSQL/TimescaleDB, Redis, MQTT (EMQX).

## What's included so far
- Project scaffold with modular structure (`auth`, `devices`, `sensors`, `maintenance`,
  `alerts`, `mqtt` folders are stubbed and will be filled in by Prompts 3-7)
- `docker-compose.yml` for local infra: TimescaleDB, Redis, EMQX
- Env validation via `zod` (`src/config/env.validation.ts`) - app refuses to boot with
  missing/invalid env vars instead of failing confusingly later
- `GET /health` endpoint
- Full DB schema as TypeORM migrations:
  - `001_core_schema.ts` - users, devices, maintenance_logs, alert_events
  - `002_sensor_readings_hypertable.ts` - sensor_readings as a Timescale hypertable,
    plus continuous aggregates (`sensor_readings_1h/1d/1w`) backing the app's
    granularity toggle
- ESLint + Prettier
- GitHub Actions CI (`.github/workflows/ci.yml`) running lint + build on push/PR

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
- **Prompt 3:** Auth (JWT + refresh) and device pairing
- **Prompt 4:** MQTT ingestion service reading ESP32 payloads into `sensor_readings`
- **Prompt 5:** REST + Socket.io realtime API for the dashboard
- **Prompt 6:** Alerts engine (threshold evaluation, green/amber/red)
- **Prompt 7:** Maintenance endpoints (CRUD, next-due countdown)
