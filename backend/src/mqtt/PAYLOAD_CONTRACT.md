# ESP32 -> Backend MQTT Payload Contract

**STATUS: ASSUMED, NOT YET CONFIRMED.** This is a best-guess schema based on the
sensor list in the product spec (Executive Summary 3.0), documented explicitly
so it's fast to diff against whatever the real firmware turns out to send.
Please confirm or correct this with whoever owns the ESP32 firmware ASAP -
this is the single biggest schedule risk on the project.

## Topic

```
aura/{deviceCode}/telemetry
```
e.g. `aura/AURA-ESP32-001/telemetry`

`{deviceCode}` should be a stable identifier printed on/burned into the unit
(not the MAC address, in case hardware gets swapped). If a message arrives for
a `deviceCode` the backend has never seen, it auto-creates an unclaimed device
record - no manual provisioning step needed before first boot.

## Payload (JSON, UTF-8)

```json
{
  "deviceCode": "AURA-ESP32-001",
  "timestamp": "2026-08-07T08:10:00Z",
  "readings": {
    "co2": 650,
    "temperature": 24.5,
    "humidity": 55.2,
    "pm25": 12,
    "pm10": 18,
    "voc": 0.3,
    "co": 0.5,
    "ph": 7.1,
    "turbidity": 15.2,
    "lightIntensity": 320,
    "waterLevel": 82,
    "color": { "r": 34, "g": 139, "b": 34 }
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceCode` | string | No | Falls back to the topic segment if omitted |
| `timestamp` | ISO8601 string | No | Falls back to server receive time if omitted |
| `readings.*` | number | No (each) | Send only what changed since the last publish - partial payloads are fine |
| `readings.color` | `{r,g,b}` | No | Each channel 0-255 |

## Assumed units and valid ranges

| Metric | Unit | Accepted range | Rejected if outside |
|---|---|---|---|
| co2 | ppm | 0 - 10,000 | yes |
| temperature | Celsius | -10 - 60 | yes |
| humidity | % | 0 - 100 | yes |
| pm25 | ug/m3 | 0 - 1,000 | yes |
| pm10 | ug/m3 | 0 - 1,000 | yes |
| voc | ppm | 0 - 5,000 | yes |
| co | ppm | 0 - 1,000 | yes |
| ph | pH scale | 0 - 14 | yes |
| turbidity | NTU | 0 - 1,000 | yes |
| lightIntensity | lux | 0 - 200,000 | yes |
| waterLevel | % of tank capacity | 0 - 100 | yes |
| color.r/g/b | 0-255 | 0 - 255 | yes |

Readings outside these ranges are dropped and logged (not written to the
database), so a stuck or faulty sensor can't poison the graphs or trigger
false alerts. **These ranges are placeholders** - once real sensor datasheets
are available, tighten them in `src/mqtt/dto/telemetry-payload.schema.ts`
(`METRIC_RANGES`).

## Open questions for the firmware team

1. Does the ESP32 publish all sensors in one message, or separate messages
   per sensor/subsystem (e.g. air sensors vs bioreactor sensors)? The schema
   supports partial payloads either way, but it changes how often each
   `readings` key actually appears.
2. What's the actual publish interval (every N seconds)?
3. Is the VOC reading a raw ppm-equivalent value, or an index (e.g. IAQ 0-500)?
   This changes both the unit and the valid range.
4. Does the device authenticate to MQTT (username/password, client cert), or
   connect anonymously? `MQTT_USERNAME`/`MQTT_PASSWORD` env vars are wired up
   and ready either way.
5. Is `waterLevel` a percentage, or a raw distance/depth reading from an
   ultrasonic sensor that needs conversion?

## Testing without real hardware

Run `npm run simulate:esp32` (see `scripts/simulate-esp32.ts`) to publish
fake telemetry for a test device against your local MQTT broker. This
exercises the full ingestion -> database -> (future) API pipeline without
needing the physical unit, and doubles as the demo-mode data source if the
live hardware has issues on presentation day.
