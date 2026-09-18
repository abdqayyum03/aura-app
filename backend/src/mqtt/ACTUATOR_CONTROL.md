# Actuator Control (lighting, bubbling)

**STATUS: backend + frontend implemented (2026-09-18); real-hardware behavior
unconfirmed** - like `PAYLOAD_CONTRACT.md`, this describes a command shape the firmware
team hasn't confirmed it will actually consume. Unlike that file, this isn't describing
something a real device already sends - it's describing something **nothing on the
device side has ever received**, since no real firmware exists yet. Confirm this shape
with whoever owns the ESP32 firmware before treating it as final.

## Why this is architecturally different from everything else in `mqtt/`

Every other MQTT interaction in this codebase (`mqtt-ingestion.service.ts`) is
device → backend. This is the first and only backend → device path. That direction
change is exactly why it's a separate service (`MqttCommandPublisherService`) with its
own MQTT connection, rather than an addition to `MqttIngestionService` - see that
service's own comment for the specific circular-module-dependency reason (`DevicesModule`
needs to publish; `MqttModule`, the ingestion side, already depends on `DevicesModule`).

## How it works

- `PATCH /devices/:id/actuators` (`DevicesController`/`DevicesService`, JWT + ownership
  guarded like every other device-scoped endpoint) accepts a partial
  `UpdateActuatorStateDto` - any subset of `lightOn`, `lightColorMode`, `lightColorHex`,
  `lightIntensityPercent`, `bubblingSpeed`.
- `DevicesService.updateActuatorState` merges the partial update onto the device's
  current actuator columns (the Postgres row is the source of truth for **desired**
  state), saves it, then publishes the **complete resulting state** - not just the
  changed fields - to `aura/{deviceCode}/command` via `MqttCommandPublisherService`.
- Publishing the full state every time (not a delta) is deliberate: see the next section.

## No acknowledgement from the device

There is no mechanism for a device to confirm it received or applied a command. The
`devices` table's actuator columns are **optimistic desired state** - what the backend
last told the device to do - not a confirmed reading of what the hardware is actually
doing. Two consequences that shaped the design:

1. **Every command publishes the complete actuator state, not a delta.** A dropped MQTT
   message (broker hiccup, device briefly offline) with a delta-only design would leave
   the device silently out of sync with no way to detect it. Publishing the full desired
   state each time means the next command - whenever it eventually gets through - brings
   the device back in sync regardless of what it missed.
2. **The app has no way to show "is this actually applied yet" vs. "is this just what I
   asked for."** The UI reflects the Postgres row (what was requested), not a
   confirmed-applied status. If the client wants a real applied/pending distinction
   later, that needs the device to publish its own actuator-status telemetry back
   (e.g. a new `readings.actuatorStatus` field on the existing telemetry topic, or a
   dedicated status topic) - not built here.

## Payload (JSON, UTF-8)

Topic: `aura/{deviceCode}/command`

```json
{
  "lightOn": true,
  "lightColorMode": "white",
  "lightColorHex": null,
  "lightIntensityPercent": 100,
  "bubblingSpeed": "moderate",
  "issuedAt": "2026-09-18T15:58:00.000Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `lightOn` | boolean | Master light switch |
| `lightColorMode` | `"white"` \| `"mix"` | `mix` means `lightColorHex` is in effect |
| `lightColorHex` | string \| null | 6-digit hex (`#RRGGBB`); ignored when mode is `white`, but still sent so a device could remember the last mix color if it wants to |
| `lightIntensityPercent` | 25 \| 50 \| 75 \| 100 | Matches the client spec's 4 strength presets exactly - not an arbitrary 0-100 range |
| `bubblingSpeed` | `"off"` \| `"slow"` \| `"moderate"` \| `"vigorous"` | The spec names 3 presets; `off` was added since the air pump stopping entirely is an obvious real need, not an invented one |
| `issuedAt` | ISO8601 string | When the backend published this, for the device's own diagnostics - not currently read back anywhere |

## Testing without real hardware

`npm run simulate:esp32` now also subscribes to its device's command topic and logs
whatever it receives (see the script for exactly what "receiving and applying" means
here - logging, not actual light/pump control, since there's no real light/pump to
control). This is the same role the simulator already plays for telemetry: a stand-in
for firmware that doesn't exist yet, not a claim about what real hardware will do.

## Open questions for the firmware team

Same spirit as `PAYLOAD_CONTRACT.md`'s own open-questions list:

1. Can the ESP32 subscribe to a second MQTT topic (command) while also publishing
   telemetry on the first, or does its current architecture assume publish-only?
2. Does the physical light support arbitrary RGB (`lightColorHex` as designed), or only
   a fixed set of preset colors? If the latter, `lightColorHex` needs to become an enum
   of supported presets instead of an arbitrary hex value.
3. Does the bubbling mechanism support 3+ discrete speed steps, or is it more naturally
   continuous (a duty-cycle percentage)? The preset-based design here matches the
   client's own spec language ("Slow/Moderate/Vigorous"), but that may be describing the
   *marketing* framing more than the actual hardware's real control surface.
4. Should the device publish its own actuator state back (for a real applied/pending
   distinction in the app)? Not built here - see "No acknowledgement from the device."
