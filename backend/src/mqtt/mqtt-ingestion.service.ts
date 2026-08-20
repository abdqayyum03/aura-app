import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { SensorReading } from '../database/entities/sensor-reading.entity';
import { Device, DeviceStatus } from '../database/entities/device.entity';
import { DevicesService } from '../devices/devices.service';
import { RedisService } from '../common/redis/redis.service';
import { TelemetryPayloadSchema, extractValidReadings } from './dto/telemetry-payload.schema';
import { READING_CREATED_EVENT, ReadingCreatedEvent } from '../common/events/reading-created.event';

const DEVICE_HEARTBEAT_TTL_SECONDS = 120; // if no message for 2 min, treat as offline (used by prompt 5/6)

@Injectable()
export class MqttIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttIngestionService.name);
  private client: MqttClient;

  constructor(
    private readonly config: ConfigService,
    private readonly devicesService: DevicesService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
    @InjectRepository(SensorReading) private readonly readings: Repository<SensorReading>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
  ) {}

  onModuleInit() {
    // Non-null assertions are safe here: env.validation.ts (zod) refuses to
    // boot the app at all if these are missing, so by the time this module
    // initializes they're guaranteed to be set.
    const url = this.config.get<string>('MQTT_URL')!;
    const username = this.config.get<string>('MQTT_USERNAME') || undefined;
    const password = this.config.get<string>('MQTT_PASSWORD') || undefined;
    const topic = this.config.get<string>('MQTT_INGEST_TOPIC')!;

    this.client = mqtt.connect(url, {
      username,
      password,
      reconnectPeriod: 2000, // library auto-reconnects; a dropped broker never crashes the app
    });

    this.client.on('connect', () => {
      this.logger.log(`MQTT connected to ${url}`);
      this.client.subscribe(topic, (err) => {
        if (err) {
          this.logger.error(`Failed to subscribe to ${topic}: ${err.message}`);
        } else {
          this.logger.log(`Subscribed to ${topic}`);
        }
      });
    });

    this.client.on('reconnect', () => this.logger.warn('MQTT reconnecting...'));
    this.client.on('close', () => this.logger.warn('MQTT connection closed'));
    this.client.on('error', (err) => this.logger.error(`MQTT client error: ${err.message}`));

    this.client.on('message', (topic, payload) => {
      // Never let a single bad message take the process down - ingestion must
      // keep running for every other device even if one payload is garbage.
      this.handleMessage(topic, payload).catch((err) =>
        this.logger.error(`Unhandled error processing message on ${topic}: ${err.message}`),
      );
    });
  }

  async onModuleDestroy() {
    this.client?.end();
  }

  private async handleMessage(topic: string, payloadBuffer: Buffer): Promise<void> {
    const topicDeviceCode = topic.split('/')[1];

    let json: unknown;
    try {
      json = JSON.parse(payloadBuffer.toString('utf-8'));
    } catch {
      this.logger.warn(`Discarding message on ${topic}: not valid JSON`);
      return;
    }

    const parsed = TelemetryPayloadSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.warn(
        `Discarding message on ${topic}: schema validation failed - ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
      return;
    }

    const deviceCode = parsed.data.deviceCode ?? topicDeviceCode;
    if (!deviceCode) {
      this.logger.warn(`Discarding message on ${topic}: no device code in payload or topic`);
      return;
    }

    const { valid, dropped } = extractValidReadings(parsed.data.readings);

    if (dropped.length > 0) {
      this.logger.warn(
        `Device ${deviceCode}: dropped ${dropped.length} out-of-range/invalid reading(s): ` +
          dropped.map((d) => `${d.metricType}=${d.value} (${d.reason})`).join(', '),
      );
    }

    if (valid.length === 0) {
      this.logger.warn(`Device ${deviceCode}: no valid readings in payload, nothing written`);
      return;
    }

    const device = await this.devicesService.findOrCreateByCode(deviceCode);
    const recordedAt = parsed.data.timestamp ? new Date(parsed.data.timestamp) : new Date();

    await this.readings.insert(
      valid.map((r) => ({
        deviceId: device.id,
        metricType: r.metricType,
        value: r.value,
        unit: r.unit,
        recordedAt,
      })),
    );

    await this.devices.update(device.id, {
      status: DeviceStatus.ACTIVE,
      lastSeenAt: recordedAt,
    });

    // Cache latest value per metric in Redis so a future "current readings"
    // endpoint (Prompt 5) doesn't have to hit Postgres on every dashboard poll.
    const currentValues: Record<string, string> = {};
    for (const r of valid) {
      currentValues[r.metricType] = String(r.value);
    }
    await this.redis.hset(`device:${device.id}:current`, currentValues);
    await this.redis.set(`device:${device.id}:last_seen`, recordedAt.toISOString(), DEVICE_HEARTBEAT_TTL_SECONDS);

    const event: ReadingCreatedEvent = {
      deviceId: device.id,
      deviceCode: device.deviceCode,
      recordedAt: recordedAt.toISOString(),
      readings: valid,
    };
    this.events.emit(READING_CREATED_EVENT, event);

    this.logger.log(`Device ${deviceCode}: wrote ${valid.length} reading(s)`);
  }
}
