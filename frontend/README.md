# AURA App (Expo + React Native)

Mobile dashboard for the AURA air regenerator. Covers **Prompt 8 (scaffold &
theming)** of the frontend build plan.

## What's included so far
- Expo + TypeScript project, React Navigation (bottom tabs + auth stack)
- Design token system (`src/theme/tokens.ts`) - Bio-Green/Cyber-Blue palette,
  light/dark mode, Inter + JetBrains Mono typography pairing
- Typed API client (`src/api/client.ts`) with automatic access-token refresh
  on 401 (deduped against concurrent requests)
- Zustand stores for auth (persisted to SecureStore) and devices
- A minimally functional login screen (enough to verify the full loop end to
  end) - Prompt 9 replaces this with the polished auth + pairing flow
- Placeholder screens for the four main tabs (Dashboard, Environment,
  Internal, Maintenance) - built out in Prompts 10-13

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
- **Prompt 9:** Full auth screens + device pairing flow
- **Prompt 10:** Dashboard screen (Impact widget, Photoperiod Ring, live Socket.io updates)
- **Prompt 11:** Environment Data screen (granularity toggle, scrubber chart)
- **Prompt 12:** AURA Internal screen (radial gauges, color swatch)
- **Prompt 13:** Maintenance & alerts screen, push notifications
