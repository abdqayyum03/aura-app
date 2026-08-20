/**
 * Publishes fake ESP32 telemetry to the local MQTT broker so the ingestion
 * pipeline can be tested end-to-end without the physical hardware.
 *
 * Usage:
 *   npm run simulate:esp32
 *   npm run simulate:esp32 -- --device=AURA-ESP32-002 --interval=5000
 *
 * This is also the intended source for demo-mode fallback data if the real
 * hardware has issues on presentation day - point it at a device code the
 * app is already displaying and let it run in the background.
 */
import mqtt from 'mqtt';

interface Args {
  device: string;
  interval: number;
  brokerUrl: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) =>
    args.find((a) => a.startsWith(`--${flag}=`))?.split('=')[1] ?? fallback;

  return {
    device: get('device', 'AURA-ESP32-001'),
    interval: Number(get('interval', '5000')),
    brokerUrl: get('broker', process.env.MQTT_URL ?? 'mqtt://localhost:1883'),
  };
}

// Random walk within realistic bounds so values drift smoothly instead of
// jumping randomly every publish, closer to how a real sensor behaves.
function makeWalker(start: number, min: number, max: number, step: number) {
  let value = start;
  return () => {
    value += (Math.random() - 0.5) * step;
    value = Math.max(min, Math.min(max, value));
    return Math.round(value * 100) / 100;
  };
}

const walkers = {
  co2: makeWalker(650, 400, 1500, 40),
  temperature: makeWalker(24, 18, 32, 0.5),
  humidity: makeWalker(55, 30, 80, 2),
  pm25: makeWalker(12, 0, 60, 3),
  pm10: makeWalker(18, 0, 80, 3),
  voc: makeWalker(0.3, 0, 3, 0.1),
  co: makeWalker(0.5, 0, 5, 0.2),
  ph: makeWalker(7.0, 5.5, 8.5, 0.1),
  turbidity: makeWalker(15, 0, 100, 2),
  lightIntensity: makeWalker(320, 0, 2000, 30),
  waterLevel: makeWalker(82, 40, 100, 1),
  // New (Aug 2026). Real biomass only trends upward between harvests, not a
  // symmetric random walk - this is a simplification for test/demo data,
  // not a model of actual algae growth.
  biomass: makeWalker(240, 0, 900, 15),
  colorR: makeWalker(34, 0, 255, 5),
  colorG: makeWalker(139, 0, 255, 5),
  colorB: makeWalker(34, 0, 255, 5),
};

function buildPayload(deviceCode: string) {
  return {
    deviceCode,
    timestamp: new Date().toISOString(),
    readings: {
      co2: walkers.co2(),
      temperature: walkers.temperature(),
      humidity: walkers.humidity(),
      pm25: walkers.pm25(),
      pm10: walkers.pm10(),
      voc: walkers.voc(),
      co: walkers.co(),
      ph: walkers.ph(),
      turbidity: walkers.turbidity(),
      lightIntensity: walkers.lightIntensity(),
      waterLevel: walkers.waterLevel(),
      biomass: walkers.biomass(),
      color: {
        r: Math.round(walkers.colorR()),
        g: Math.round(walkers.colorG()),
        b: Math.round(walkers.colorB()),
      },
    },
  };
}

function main() {
  const { device, interval, brokerUrl } = parseArgs();
  const topic = `aura/${device}/telemetry`;

  console.log(`[simulator] connecting to ${brokerUrl}`);
  const client = mqtt.connect(brokerUrl);

  client.on('connect', () => {
    console.log(`[simulator] connected. publishing to ${topic} every ${interval}ms`);
    console.log('[simulator] press Ctrl+C to stop');

    const publish = () => {
      const payload = buildPayload(device);
      client.publish(topic, JSON.stringify(payload), (err) => {
        if (err) {
          console.error('[simulator] publish failed:', err.message);
        } else {
          console.log(`[simulator] published: co2=${payload.readings.co2} temp=${payload.readings.temperature} ph=${payload.readings.ph}`);
        }
      });
    };

    publish();
    setInterval(publish, interval);
  });

  client.on('error', (err) => {
    console.error('[simulator] MQTT error:', err.message);
  });
}

main();
