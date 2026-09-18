# Push Notifications

**STATUS: implemented AND confirmed working end-to-end on a real device (2026-09-18)**,
unlike the other docs in this pattern (`PAYLOAD_CONTRACT.md`, `ALERT_THRESHOLDS.md`,
`MAINTENANCE_INTERVALS.md`) which are all still placeholder/assumed. A forced RED-severity
temperature reading published to a real paired device produced a real push notification
on a real iOS phone, with the exact expected message
(`"<device>: temperature reading of 50 is red"`). The one real platform constraint below
isn't a "not built yet" - it's unavoidable given the tools in use, documented so it isn't
mistaken for a bug later.

## Required one-time setup: link an EAS project (already done for this project)

`Notifications.getExpoPushTokenAsync()` needs an EAS `projectId` - without one it fails
with `No "projectId" found`, discovered by actually testing this on a real iOS device
via Expo Go (2026-09-18). Fixed the same day by linking this app to a real EAS project
(`app.json`'s `extra.eas.projectId` and `owner` fields). If you ever need to redo this
(a fresh clone, a different Expo account) - from `frontend/`:

```bash
npx eas-cli login   # your own Expo account - create one free at expo.dev if needed
npx eas-cli init    # links this app to a project, writes extra.eas.projectId into app.json
```

Then restart the dev server (`npm run start`) so the new `app.json` config is picked up.
`registerPushNotifications.ts` reads the projectId via `expo-constants`
(`Constants.expoConfig?.extra?.eas?.projectId`) and passes it explicitly to
`getExpoPushTokenAsync` rather than relying on manifest inference, which is unreliable
in Expo Go - so once `eas init` has run, this should just work without further code
changes.

## How it works

- Frontend: `frontend/src/notifications/registerPushNotifications.ts` requests
  notification permission and registers an Expo push token with the backend once per
  "reached Main" transition (`MainTabNavigator.tsx`'s mount effect) - i.e. once a session
  has an authenticated user with at least one paired device.
- Backend: `POST /push-tokens` (`NotificationsController`) stores the token against the
  authenticated user - user-scoped, not device-scoped, since a token belongs to an app
  installation, not to any particular AURA hardware unit.
- `AlertsService.notifyOwner` calls `NotificationsService.sendToUser` on every genuine
  transition INTO amber or red (never on green, never while already sitting in the same
  severity - same transition-only rule as writing an `alert_events` row) - **and** only
  if the same device+metric hasn't already sent a push within the last
  `NOTIFICATION_COOLDOWN_SECONDS` (30 minutes, a placeholder like every other threshold/
  interval in this codebase). Added 2026-09-18 after a real device produced non-stop
  notifications for a reading oscillating right at a threshold boundary - each flip is a
  genuine severity transition, so the transition-only rule alone doesn't stop it.
  The cooldown key (`device:{id}:notified:{metricType}`, in Redis) simply runs its full
  duration once set - it is **not** cleared when the metric returns to green. An earlier
  version of this code did clear it on green, specifically so a genuine recovery-then-
  later-recurrence wouldn't be wrongly suppressed - that turned out to be a real bug in
  practice: a reading oscillating THROUGH green (not just between amber/red, confirmed
  with real pm25/co readings sitting near their green boundary) would wipe the cooldown
  on every green touch, letting the very next amber reading notify again immediately,
  defeating the cooldown entirely. The current behavior's tradeoff - a genuine new
  problem within the same 30-minute window as a resolved one stays quiet a little
  longer - is a small, deliberate cost next to "notified every few seconds." The
  `alert_events` row for every transition is still written unconditionally regardless of
  the cooldown, so in-app alert history stays fully accurate even when a push was
  suppressed.
- `NotificationsService.sendToUser` calls Expo's push API directly
  (`https://exp.host/--/api/v2/push/send`) - **this does NOT require a Firebase project
  or FCM credentials of your own**. Expo's relay handles FCM/APNs delivery internally;
  the backend only ever needs a valid Expo push token.

## The one real constraint: Expo Go on Android

As of recent Expo SDKs, **Expo Go on Android no longer supports remote (push)
notifications at all** - a Google Play policy change forced this, not something Expo or
this codebase can route around. `registerForPushNotificationsAsync()` will silently
no-op there (same code path as a denied permission or a simulator - see its own
comments), so testing on Android needs a real development or production build via EAS,
not Expo Go. **iOS via Expo Go should still work** for push notifications.

This has nothing to do with Firebase/FCM credentials - it's specifically an Expo Go
(the pre-built testing app) limitation on Android. A production app built via EAS Build
does need Android push credentials configured (Expo can generate/manage FCM credentials
for you through `eas credentials`, or you can supply your own Firebase project) - but
that's a step for shipping a real build, not for the code in this repo, which works
correctly regardless of how those credentials eventually get provisioned.

## Verified (2026-09-18)

- Push token registration + upsert (re-registering the same token under the same user
  doesn't duplicate) - confirmed against the live backend.
- A genuine alert transition (temperature forced to a RED-severity value via a real MQTT
  publish) correctly triggers `notifyOwner` → `sendToUser` → an Expo API call. Tested
  with an intentionally fake token to confirm the failure path: Expo's API rejects it,
  the error is logged, and - critically - the alert evaluation pipeline keeps running
  normally, unaffected.
- Real-device test (iOS, Expo Go) surfaced the missing-EAS-project gap above - permission
  request and grant worked correctly, token retrieval failed with a clear, now-handled
  error until the project was linked.
- **End-to-end real delivery confirmed**, after the EAS project link: a real Expo push
  token was registered against a real user account, a forced RED-severity temperature
  reading was published to a real paired device over MQTT, and a real push notification
  arrived on the physical iOS phone with the exact expected message
  (`"AURA-ESP32-001: temperature reading of 50 is red"`). The alert auto-resolved back
  to green ~4 seconds later once the device's simulator published its next normal
  reading, exactly as the transition-only alert design intends - no manual cleanup
  needed.
- **Cooldown confirmed working on the real device** (2026-09-18): a real light_intensity
  reading naturally oscillating near a threshold boundary produced a genuine RED alert,
  and the very next flicker was correctly suppressed - `DEBUG [AlertsService] Skipping
  push for device ... light_intensity - still within the 1800s cooldown` - with the
  Redis cooldown key confirmed present (correct remaining TTL) directly in `aura-redis`.
- **The clear-on-green bug (see above) was also caught on real devices** - pm25 and co
  both produced repeat notifications shortly after the light_intensity fix landed,
  because both oscillate near their green boundary rather than the amber/red one. Fixed
  the same day (clear-on-green behavior removed) and re-verified with a payload
  deliberately oscillating a `co` reading between green (0.5) and amber (1.5) 8 times in
  a row: `alert_events` correctly recorded all 4 genuine amber episodes, while the
  cooldown key was set once and survived every green touch (confirmed via TTL still at
  1786/1800 after the full sequence) - meaning only the first of the 4 episodes would
  have produced a push.

## What's not built

- Deep-linking a tapped notification to the relevant device/alert screen -
  `registerForPushNotifications.ts` sets up the permission/token flow only, not a
  notification-response listener.
- Per-user notification preferences (e.g. "amber only," "red only," quiet hours) - every
  registered token currently gets every amber/red transition for every device they own.
- Stale-token cleanup - `NotificationsService.sendToUser` logs a per-token
  `DeviceNotRegistered`-style error from Expo's response but doesn't yet delete the
  offending row, so a token that goes stale (app uninstalled, permissions revoked
  outside the app) will keep being attempted (and keep failing harmlessly) indefinitely.
