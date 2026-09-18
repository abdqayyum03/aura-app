# Changelog

All notable changes to the AURA project. This project does not (yet) follow strict
SemVer releases — entries are grouped by development phase.

**A note on how this file was built:** the repository currently has a single squashed
git commit ("Initial commit: AURA backend + frontend"), so there is no real commit-level
history to draw from. The entries below are reconstructed from in-code markers — the
backend/frontend READMEs' "Prompt N" build-plan references, and comments explicitly
dated "Aug 2026" describing a client-feedback revision pass. Treat this as directionally
accurate, not as an authoritative record the way real commit history would be. Going
forward, prefer small real commits over one large squash so this file can be generated
honestly.

## [Unreleased]

### Docs — SRS/SAD updated to v1.1 content (2026-09-19)

`docs/AURA_SRS_v1.0.docx` and `docs/AURA_SAD_v1.0.docx` (filenames kept stable per the
established pattern; internal title-page version bumped to v1.1) rewritten to reflect
everything built since v1.0 (2026-09-18): device pairing/signup screens, the
biomass→CO2/O2 impact derivation pipeline, per-device alert threshold editing,
turbidity-aware harvest readiness, real push notifications (with the cooldown fixes
below), and actuator control (lighting/bubbling) via a new MQTT command channel. Both
regenerated files pass the docx skill's XSD validator. Remaining open items (a true
harvest-aware lifetime-cumulative CO2/O2 total, and the B2B/multi-user gap) are called
out explicitly in each document's own "next steps" / "open questions" section rather
than left implied.

### Fixed — push notification spam on a flickering reading (2026-09-18)

Reported from real use: a real device's reading sitting right at a threshold boundary
(e.g. pH bouncing between amber and red every few seconds) produced a non-stop stream
of push notifications for the same metric. Root cause: the existing "only notify on a
severity transition" rule correctly stops steady-state spam, but each flicker really is
a distinct transition (amber→red→amber→red...), so it doesn't help here.

- `AlertsService`: added a 30-minute per-(device, metric) notification cooldown, stored
  in Redis (`device:{id}:notified:{metricType}`), gating `notifyOwner` only - the
  `alert_events` row for every genuine transition is still written unconditionally, so
  in-app alert history stays fully accurate even when a push was suppressed.
- `RedisService`: added a `del` wrapper (the 5th basic op alongside `get`/`set`/`hset`/
  `hgetall`).
- Verified on the real device: a genuine RED `light_intensity` alert correctly produced
  a push, and the very next flicker was correctly skipped
  (`DEBUG [AlertsService] Skipping push for device ... light_intensity - still within
  the 1800s cooldown`), with the Redis key confirmed present with the correct remaining
  TTL directly in `aura-redis`.
- **Second round, same day**: the first version cleared the cooldown key the moment a
  metric returned to green (so a genuine recovery-then-later-recurrence wouldn't be
  wrongly suppressed) - real use caught this as a bug, not a feature: pm25 and co both
  sit near their GREEN boundary (not just amber/red like light_intensity), so oscillating
  through green wiped the cooldown on every touch, letting the very next amber reading
  notify again immediately - spam continued. Fixed by removing the clear-on-green
  behavior entirely; the cooldown now just runs its full 30 minutes once set, regardless
  of intermediate green blips. Re-verified with a `co` reading deliberately oscillated
  green↔amber 8 times: `alert_events` recorded all 4 genuine amber episodes accurately,
  while the cooldown key survived every green touch (TTL still 1786/1800 at the end) -
  only the first episode would have produced a push.
- Also flagged, not a code bug: while investigating, confirmed `wsl.exe -e redis-cli`
  (no explicit port) talks to a leftover WSL-native Redis on 127.0.0.1:6379, **not**
  `aura-redis` (which moved to host port 6380 during the earlier Docker project-name
  fix) - a diagnostic-tooling footgun for future debugging in this environment, not an
  application bug. Always verify via `docker exec aura-redis redis-cli ...` (or
  `redis-cli -p 6380`) when checking what the app itself actually sees.

### Added — Phase 4: actuator control, lighting + bubbling (2026-09-18)

Closes what SRS §9.4/§8 flagged as new architecture, not a wire-up - MQTT ingestion was
strictly device → backend until now. See `backend/src/mqtt/ACTUATOR_CONTROL.md` for the
full picture, including why there's no acknowledgement from the device (this is
optimistic desired state) and the open questions for whoever owns the firmware.

- Backend: `PATCH /devices/:id/actuators` (`DevicesController`/`DevicesService`,
  ownership-guarded like every other device-scoped endpoint), new actuator columns on
  `devices` (migration 009: `lightOn`, `lightColorMode`, `lightColorHex`,
  `lightIntensityPercent`, `bubblingSpeed`).
- New `MqttCommandPublisherService`/`Module` - a **separate** MQTT connection from
  `MqttIngestionService`'s, publish-only, deliberately avoiding a circular module
  dependency (`MqttModule`, the ingestion side, already depends on `DevicesModule`; if
  command-publishing lived there too, `DevicesModule` would need to import it back).
  Publishes the complete resulting actuator state (not just the changed fields) to
  `aura/{deviceCode}/command` on every update - deliberate, since there's no
  acknowledgement mechanism, so a device that missed a previous command still ends up
  correct on the next one.
- `simulate-esp32.ts` now also subscribes to its device's command topic and logs
  whatever it receives - the same "stand-in for firmware that doesn't exist yet" role it
  already plays for telemetry.
- Frontend: `DashboardScreen.tsx`'s new "Lighting & Bubbling" card - light on/off,
  White/Mix color mode (5 preset swatches for Mix), 4 intensity presets (25/50/75/100%,
  matching the client spec exactly), 4 bubbling speed presets (off/slow/moderate/
  vigorous - `off` added since the spec's 3 named presets don't cover "stopped
  entirely," an obvious real need).
- Verified end-to-end against the live backend with a real simulator subscribed to the
  command topic: a PATCH correctly merged onto existing state (untouched fields
  preserved in the response), the simulator logged receiving the exact complete desired
  state, invalid values (an intensity not in the 4 presets, a malformed hex color) were
  rejected with 400, and a different account was correctly blocked with 403.

### Added — push notifications (2026-09-18)

Closes the last open item from `ALERT_THRESHOLDS.md`'s "what's not built" list. Uses
Expo's push API directly, not Firebase/FCM - no Firebase project needed. See
`backend/src/notifications/PUSH_NOTIFICATIONS.md` for the full picture, including the
one real platform constraint (Expo Go on Android doesn't support remote push at all -
needs a real EAS build to test there; iOS Expo Go should still work).

- Backend: new `push_tokens` table (migration 008), `POST /push-tokens`
  (`NotificationsModule` - user-scoped, not device-scoped), `AlertsService.notifyOwner`
  sends on every genuine transition into amber/red (never on green, never while already
  sitting in the same severity - same rule as writing an `alert_events` row).
- Frontend: `expo-notifications` + `expo-device` + `expo-constants` installed,
  permission request + token registration (`registerForPushNotifications.ts`), fired
  once per "reached Main" transition (`MainTabNavigator.tsx`).
- **Found via a real device test (iOS, Expo Go), fixed same-day**: token retrieval needs
  an EAS `projectId`, which this app was never linked to - failed with a clear
  `No "projectId" found" error, permission request/grant itself worked correctly.
  `registerPushNotifications.ts` now reads the projectId via `expo-constants` and passes
  it explicitly to `getExpoPushTokenAsync`. Fixed by running `npx eas-cli login` +
  `npx eas-cli init` from `frontend/` - the project is now linked (`app.json`'s
  `extra.eas.projectId`/`owner`), this isn't an outstanding setup step anymore.
- **Confirmed working end-to-end on a real device**: after the EAS link, a real Expo
  push token registered against the real account, a forced RED-severity temperature
  reading published to the real paired device over MQTT, and a real push notification
  arrived on the physical iOS phone with the exact expected message. The alert
  auto-resolved ~4 seconds later once the device's simulator published its next normal
  reading - no manual cleanup needed, exactly as the transition-only design intends.
- Verified end-to-end against the live backend: registered a token, confirmed
  re-registering the same token doesn't duplicate, forced a real RED-severity alert via
  MQTT and confirmed the send path runs and fails gracefully with a fake token (Expo
  rejects it, logged, alert pipeline keeps running unaffected) - real delivery to a
  genuine device token wasn't tested (no physical device/EAS build in this session).
- Not built: notification-tap deep-linking, per-user notification preferences, stale-
  token cleanup - see the doc's "What's not built" section.

### Added — Phase 2: biomass/CO2/O2 impact pipeline (2026-09-18)

Closes the client's "strongest structural differentiator" gap (SRS §9.2). Decision:
computed server-side from RGB, not on the ESP32 - RGB (TCS34725) is the confirmed
sensor already flowing into the system; biomass/CO2/O2 are pure math on top of it, so
no firmware changes or team coordination were needed to build this now.

- `backend/src/mqtt/biomass-calculation.ts` (new): RGB → HSV → OD680 → biomass (g/L) →
  biomass (g) → CO2 absorbed / O2 released, using the client's own formulas. Documents
  two real inconsistencies found in the source document (two different OD formulas,
  two different CO2/O2 ratio sets) and which side was picked and why.
- `MqttIngestionService.withImpactMetrics`: computes and inserts `biomass`,
  `co2_absorbed`, `o2_released` as regular sensor_readings whenever a full RGB triple
  arrives - rides the existing generic history/current-value/realtime pipeline with
  zero additional plumbing (validates the "narrow schema, generic pipeline" bet from
  SAD §5.1). A device-sent `biomass` value is dropped in favor of the RGB-derived one
  when both are present in the same payload.
- New `Device.tankVolumeLiters` (migration 006, default 10L) - needed to convert the
  formula's biomass *concentration* (g/L) into total *mass* (g), which is the unit
  the existing UI already assumed. Not yet user-editable (same scope boundary as
  lightStartHour/lightDurationHours).
- New `co2_absorbed`/`o2_released` metric types (migration 007).
- **Real bug found and fixed along the way**: the OD-from-hue formula has a hard
  ceiling (~2.95 OD680 for any RGB input), capping biomass at ~10.25g for a 10L tank -
  drastically lower than the existing biomass gauge/threshold/insight-text constants
  (0-900g range, 700g "near harvest" trigger), which had been calibrated to the ESP32
  simulator's arbitrary walker bounds, not the real formula. Recalibrated
  `constants/thresholds.ts`'s biomass band/domain and `DashboardScreen.tsx`'s insight
  threshold to the formula's real ~0-10g range; without this the biomass ring gauge
  would have rendered as permanently near-empty.
- `DashboardScreen.tsx`: new "Environmental Impact" widget (CO2 Removed / O2 Released /
  Biomass Generated), matching the client spec's Dashboard hero section - reads from
  the same `/current` call the rest of the screen already made, no new API call.
- Verified end-to-end against the live backend: published real MQTT payloads with a
  known RGB value, confirmed computed biomass/CO2/O2 match hand-calculated expected
  values exactly, and confirmed a device-sent `biomass` value is correctly dropped
  when RGB is also present in the same payload.
- **Scope boundary, not solved here**: this is CO2/O2 associated with the *current*
  biomass level, not a harvest-aware lifetime cumulative total (a harvest discards
  ~80% of the culture; the CO2 already absorbed into that discarded biomass doesn't
  un-absorb itself). A true lifetime figure needs to integrate biomass production over
  time across harvests - flagged, not attempted, in `biomass-calculation.ts`.

### Added — Phase 3: per-device alert threshold editing (2026-09-18)

Closes the gap `ALERT_THRESHOLDS.md` flagged: the `alert_thresholds` table existed and
was read on every evaluation, but nothing wrote to it.

- Backend: `GET/POST devices/:id/alerts/thresholds`, `DELETE .../thresholds/:metricType`
  (`AlertsController`/`AlertsService`), server-side band validation
  (`amberMin <= greenMin <= greenMax <= amberMax`), full CRUD flow verified end-to-end
  against the running backend.
- Frontend: `AlertThresholdsScreen.tsx` (new), reachable from Profile → Alerts. Per-metric
  editable green/amber bounds with a "Reset to Default" action once overridden.
- Note: the endpoint's metric list is backend `DEFAULT_THRESHOLDS`' 11 metrics, which does
  **not** include `biomass` — the frontend's `constants/thresholds.ts` has a biomass band
  used only to color the Dashboard/Internal ring gauges, disconnected from the real alert
  engine (`AlertsService.evaluateOne` skips any metric with no default band). Pre-existing
  gap, not touched here - flagged for whoever resolves the biomass/impact pipeline (SRS §9.2).

### Added — Phase 1: close the onboarding gap (2026-09-18)

Closes SRS §9.1. Both backend endpoints already worked; this was pure frontend work.

- `frontend/src/screens/SignupScreen.tsx` (new): email/password/optional-name signup,
  reuses `authApi.signup` (already returns tokens directly, no separate login step).
- `frontend/src/screens/DevicePairingScreen.tsx` (new): pair a device by code, with a
  logout escape hatch for a user who doesn't have a code yet.
- `frontend/src/navigation/RootNavigator.tsx`: 2-way branch (`Login` vs `Main`) became a
  3-way branch (`Login`/`Signup` stack → `DevicePairing` → `Main`), gated on a device
  check that's deliberately keyed off `Boolean(accessToken)` rather than the token string
  itself, so `api/client.ts`'s silent 401-refresh doesn't re-trigger it mid-session.
- `frontend/src/screens/LoginScreen.tsx`: added a link to Signup.
- Removed `frontend/src/screens/PlaceholderScreens.tsx` (confirmed dead code, unused,
  superseded by the real screens since well before this phase).

### Changed — Expo SDK 54 → 57 (2026-09-18)

Forced by an Expo Go version mismatch on a physical test device (Expo Go only supports
the latest SDK). Ran `expo install expo@^57.0.0` then `expo install --fix` to align every
Expo-managed dependency (`react` 19.2.3, `react-native` 0.86.3, `react-native-svg`,
`@expo/vector-icons`, etc.). Fixed three TypeScript breaks that came with the paired
TS 5.9→6.0 bump:
- `baseUrl` deprecation (silenced per TS's own suggested `ignoreDeprecations` flag)
- `process.env` no longer resolving (`@types/node` added, explicitly declared in `types`)
- `useColorScheme()`'s return type gained `'unspecified'` (Android) — `ThemeContext.tsx`
  now treats anything that isn't explicitly `'dark'` as `'light'`, same fallback intent
  as the old `?? 'light'`.

### Still open

Tracked in `docs/AURA_SRS_v1.0.docx` §9 — the biomass/CO2/O2 calculation pipeline,
confirming the MQTT payload contract/alert thresholds/maintenance intervals with the
client, and a decision on actuator control scope.

## [0.1.0] — Initial build (backend Prompts 1–7, frontend Prompts 8–13)

### Backend

- **Scaffold** (Prompt 1): NestJS + TypeScript project structure, `docker-compose.yml`
  for local TimescaleDB/Redis/EMQX, zod-based env validation that refuses to boot on
  missing/invalid config, `GET /health`, ESLint + Prettier.
- **Database schema** (Prompt 2): TypeORM migrations for `users`, `devices`,
  `maintenance_logs`, `alert_events` (001); `sensor_readings` as a TimescaleDB hypertable
  with `sensor_readings_1h/1d/1w` continuous aggregates backing the granularity toggle
  (002).
- **Auth** (Prompt 3): signup/login/refresh via JWT access+refresh tokens, bcrypt
  password hashing, `tokenVersion`-based logout-all (003 adds the column).
- **Device pairing**: pair/unpair/list endpoints, auto-create-on-first-MQTT-sighting for
  unclaimed devices, centralized ownership check reused by every other module.
- **MQTT ingestion** (Prompt 4): subscribes `aura/+/telemetry`, zod schema validation,
  per-metric physical-range validation (drop and log out-of-range readings), Redis
  current-value cache + heartbeat TTL, `simulate-esp32.ts` for hardware-free testing.
  Payload contract explicitly documented as assumed, pending firmware confirmation.
- **REST + realtime API** (Prompt 5): bucketed history endpoint over the continuous
  aggregates, current-readings endpoint, Socket.io `/realtime` namespace with JWT-authed
  per-device rooms.
- **Alerts engine** (Prompt 6): green/amber/red threshold evaluation on every ingested
  reading, transition-only alert writes (no spam), per-device threshold override table
  (004; unused by any UI yet). Documented as placeholder threshold values pending
  client/specialist review.
- **Maintenance** (Prompt 7): CRUD logs (water change, filter replacement, harvest,
  nutrient refill, calibration, other), fixed-interval due-date countdowns. Documented as
  placeholder interval values.

### Frontend

- **Scaffold & theming** (Prompt 8): Expo + TypeScript project, React Navigation
  (auth stack + bottom tabs), first-pass "Bio-Green/Cyber-Blue" design tokens, typed API
  client with automatic single-flight token refresh on 401, Zustand auth/device stores.
- **Auth + pairing flow** (Prompt 9): functional login screen (email/password).
  *(Note: no signup or device-pairing screen was ultimately built in this pass — the
  corresponding API calls exist but are unused. See CHANGELOG "Not carried out" below.)*
- **Dashboard screen** (Prompt 10): system status card with a real CO2 sparkline and
  short-term trend, active-alerts readout, rule-based "AURA Insight" text, photoperiod
  ring computed from device light-schedule config.
- **Environment screen** (Prompt 11): 1h/1d/1w granularity toggle, multi-series overview
  chart (CO2/temperature/PM2.5), scrubbable single-metric chart, metric grid.
- **Internal screen** (Prompt 12): radial safe-zone gauges (pH, turbidity, water level),
  RGB color-sensor diagnostic panel with a rule-based (not ML) contamination heuristic.
- **Maintenance & Profile screens** (Prompt 13): countdown cards with an overdue banner,
  log timeline, log-action modal; Profile screen with account stats and settings rows
  (several explicitly marked "not built yet" rather than silently doing nothing).
  *(Note: push notifications, named in this prompt's original scope, were not built —
  alert transitions still only produce a server log line.)*

## [0.1.1] — Client feedback revision pass ("Aug 2026", exact date not recorded)

A second round of changes attributed in-code to direct client feedback:

- **Design system replaced.** The original "Bio-Green/Cyber-Blue" token pass was
  discarded in favor of a "Deep Sea Biotech" (cyan/violet/magenta) palette taken from a
  newer AI-generated ("Stitch") design export. Dark mode only — light mode was left as an
  unvalidated placeholder both before and after this pass.
- **Temperature split from a combined "Climate" card** into its own metric card on the
  Environment screen, with Humidity becoming its own separate card rather than a nested
  footer line.
- **Light Intensity moved** from the Internal (bioreactor) screen to the Environment
  (air quality) screen's metric grid.
- **`biomass` added as a new metric** end-to-end: `MetricType` enum value (migration
  005), MQTT payload field + physical-range validation, alert threshold band, a dedicated
  ring gauge on the Dashboard, and a ring gauge on the Internal screen. Added ahead of any
  confirmed physical sensor or derivation formula — see `AURA_SRS_v1.0.docx` §6.1 for the
  gap between this and the client's actual RGB→biomass→CO2/O2 calculation chain.
- **`simulate-esp32.ts` updated** to walk a `biomass` value alongside every other
  simulated metric, so the new gauges have realistic-looking demo data.

## Not carried out from the original build plan

Documented here so intent isn't lost — these were named in the backend/frontend READMEs'
"what's next" sections at some point but are not present in the current codebase:

- A UI or endpoint for editing per-device maintenance intervals (thresholds got one —
  see "Phase 3" above — intervals didn't).
- `.github/workflows/ci.yml` — `backend/README.md` currently references this file; it
  does not exist in the repository.
