# AURA App (Expo + React Native)

Mobile dashboard for the AURA air regenerator.

**Status:** all of Prompts 8-13 of the original build plan are implemented (scaffold,
theming, all 5 tabs). See [`../docs/AURA_SRS_v1.0.docx`](../docs/AURA_SRS_v1.0.docx) and
[`../docs/AURA_SAD_v1.0.docx`](../docs/AURA_SAD_v1.0.docx) for the full, current picture —
this README covers setup only.

## What's included
- Expo + TypeScript project, React Navigation (bottom tabs + auth stack)
- Design token system (`src/theme/tokens.ts`) - a "Deep Sea Biotech" (cyan/violet/
  magenta) dark palette derived from an AI-generated design export; **light mode is an
  unvalidated placeholder, not a finished design** - see the SAD §7
- Typed API client (`src/api/client.ts`) with automatic access-token refresh
  on 401 (deduped against concurrent requests)
- Zustand stores for auth (persisted to SecureStore) and devices
- Login, Signup, and Device Pairing screens - a fresh install can sign up and pair a
  device entirely from the app, no API workarounds needed (closed 2026-09-18, see
  CLAUDE.md)
- Dashboard, Environment, Internal, Maintenance, and Profile screens - all fully built
  out, not placeholders
- Dashboard "Environmental Impact" widget (CO2 absorbed / O2 released, derived
  server-side from biomass) and a "Lighting & Bubbling" actuator card (on/off, color,
  intensity presets, bubbling speed presets)
- Alert Thresholds screen - per-device green/amber band editing, reachable from Profile
- Real push notifications on alert transitions (Expo push service, requires an EAS
  project link - see `PUSH_NOTIFICATIONS.md` in the backend for the one-time setup and
  the Expo-Go-on-Android platform constraint)

**Not included:** a true harvest-aware *lifetime cumulative* CO2/O2 total (today's
Impact widget is tied to the current biomass level only), notification-tap
deep-linking, and per-user notification preferences - see the SRS's traceability table
(§8) for the full gap list.

## Prerequisites
- Node.js 20+
- The **Expo Go** app on your phone (easiest way to test - no simulator/
  Android Studio/Xcode needed), available on the App Store / Play Store
- Your backend running and reachable from your phone (see note below)

## Setup

```bash
cp .env.example .env
npm install
npm run start
```

This prints a QR code in your terminal. Scan it with the Expo Go app (iOS:
use your camera app; Android: use the Expo Go app's built-in scanner).

## IMPORTANT: connecting to your backend from a phone

Your phone is a separate device from your computer, so `localhost` in
`.env` won't reach your backend - `localhost` on your phone means the phone
itself. Replace it with your computer's LAN IP address:

1. Find your computer's local IP (Windows: `ipconfig`, look for IPv4 Address
   under your active network adapter - usually starts with `192.168.` or `10.`)
2. Update `.env`: `EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:3000`
3. Make sure your phone is on the **same Wi-Fi network** as your computer
4. Restart `npm run start` after changing `.env` (Expo only reads env vars at startup)

If you're testing in an emulator instead of a physical phone:
- Android emulator: use `http://10.0.2.2:3000`
- iOS simulator: `http://localhost:3000` works fine (simulator shares the host's network)

## Useful commands

| Command | Purpose |
|---|---|
| `npm run start` | Start the Expo dev server, shows the QR code |
| `npm run android` | Start and open on a connected Android device/emulator |
| `npm run ios` | Start and open in the iOS simulator (Mac only) |
| `npm run web` | Run in a browser (useful for quick UI checks, not final target) |
| `npm run typecheck` | TypeScript check with no build output |

## What's next

See [`../docs/AURA_SRS_v1.0.docx`](../docs/AURA_SRS_v1.0.docx) §9 for the full, current
recommended-next-steps list (confirming placeholder contracts with the client, deciding
whether the Impact widget should become a true harvest-aware lifetime cumulative total,
and the B2B/multi-user gap).
