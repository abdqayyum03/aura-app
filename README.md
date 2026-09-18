# AURA

AURA (Algae Urban Air Regenerative system) is a microalgae-powered air-regeneration
bioreactor built by **Algae Decarbon**. This repository is the **software half** of the
product: a NestJS backend that ingests live sensor telemetry from an ESP32-based unit
over MQTT, and an Expo/React Native mobile app that turns that telemetry into a live
dashboard, alerting, and maintenance-tracking tool.

The hardware side is a separate, already-running workstream (see
`docs/Executive Summary 3.0.docx`); this repo covers everything downstream of the
sensors.

## Documentation

| Document | What it covers |
|---|---|
| [docs/AURA_SRS_v1.0.docx](docs/AURA_SRS_v1.0.docx) | Software Requirements Specification — what the system does, feature-by-feature implementation status, and the gap against the client's product vision |
| [docs/AURA_SAD_v1.0.docx](docs/AURA_SAD_v1.0.docx) | System Architecture Document — how it's built, why, and open architectural questions |
| [docs/Executive Summary 3.0.docx](docs/Executive%20Summary%203.0.docx) | Client-authored source spec (business, hardware, app, brand strategy) |
| [treeview.md](treeview.md) | Annotated file tree |
| [CHANGELOG.md](CHANGELOG.md) | Development history, reconstructed from in-code build markers (single squashed git commit — see the changelog's note) |
| [CLAUDE.md](CLAUDE.md) | Guidance for AI coding agents working in this repo |

**Start with the SRS** if you want to know what's built vs. still open. **Start with the
SAD** if you want to know how the pieces fit together and why.

## Repository layout

```
AURA/
├── docs/       # SRS, SAD, and the client's source spec
├── backend/    # NestJS API + MQTT ingestion + realtime (see backend/README.md)
└── frontend/   # Expo/React Native mobile app (see frontend/README.md)
```

`backend/` and `frontend/` are independent npm projects — there are no root-level
scripts. See each directory's own README for setup details; the summary below is enough
to get both running locally.

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d      # TimescaleDB, Redis, EMQX
npm run migration:run
npm run start:dev
```

Verify: `curl http://localhost:3000/health`

Optional — exercise the full ingestion pipeline without real hardware:
```bash
npm run simulate:esp32
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# edit .env: set EXPO_PUBLIC_API_BASE_URL to your computer's LAN IP,
# not localhost — see frontend/README.md for why
npm install
npm run start
```

Scan the printed QR code with the Expo Go app on your phone.

### 3. Sign up and pair a device

Open the app — it starts on the Login screen. Tap "Sign up" to create an account (this
logs you in directly, no separate login step needed), which lands you on the Device
Pairing screen. Enter the simulator's device code (`AURA-ESP32-001` by default, or
whatever you passed to `--device=` if you ran `npm run simulate:esp32` with a custom
one) and submit — you'll land on the Dashboard with live data flowing.

## Current status (short version)

Backend and frontend both implement the full loop end to end: MQTT ingestion → Postgres/
TimescaleDB → REST + Socket.io → a 5-tab mobile dashboard (Dashboard, Environment,
Internal, Maintenance, Profile), with threshold-based alerting (per-device overrides,
plus real push notifications, cooldown-limited) and maintenance-due tracking (harvest
now turbidity-aware, not just fixed-interval), plus signup and device-pairing screens so
a fresh install reaches a usable app on its own. A biomass→CO2/O2 derivation pipeline
(RGB → optical density → biomass → CO2 absorbed/O2 released) runs server-side and feeds
a Dashboard "Environmental Impact" widget, and a new MQTT command channel lets the app
control the device's lighting and bubbling. What's **not** yet built: a true
harvest-aware *lifetime cumulative* CO2/O2 total (today's figure is tied to the current
biomass level only) and any B2B/multi-user account model. Full detail and rationale in
the SRS and SAD linked above — don't take this paragraph as the last word.

## Stack

- **Backend**: NestJS, TypeScript, TypeORM, PostgreSQL + TimescaleDB, Redis, MQTT (EMQX,
  bidirectional: telemetry ingestion + a separate actuator-command publisher), Expo's
  push notification service
- **Frontend**: Expo (React Native + TypeScript), React Navigation, Zustand, Socket.io client
