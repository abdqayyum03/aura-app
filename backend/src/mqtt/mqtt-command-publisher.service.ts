import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';

/**
 * Publishes backend -> device commands (aura/{deviceCode}/command). This is
 * the first and only thing in this codebase that sends anything TO a
 * device - everything else (MqttIngestionService) is strictly device ->
 * backend. See ACTUATOR_CONTROL.md for the full picture.
 *
 * Deliberately a SEPARATE MQTT connection from MqttIngestionService's,
 * rather than sharing that one, for one concrete reason: MqttModule (the
 * ingestion side) already imports DevicesModule (to resolve/create devices
 * by code). DevicesService needs to publish commands (when actuator state
 * changes via its REST endpoint), so if command-publishing lived on
 * MqttIngestionService, DevicesModule would need to import MqttModule back -
 * a circular module dependency. This service lives in its own module with
 * NO dependency on DevicesModule, so DevicesModule can import it with no
 * cycle. A second lightweight MQTT connection for a low-frequency publish
 * path is a normal, unremarkable pattern - not a workaround to be uneasy about.
 */
@Injectable()
export class MqttCommandPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttCommandPublisherService.name);
  private client: MqttClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('MQTT_URL')!;
    const username = this.config.get<string>('MQTT_USERNAME') || undefined;
    const password = this.config.get<string>('MQTT_PASSWORD') || undefined;

    this.client = mqtt.connect(url, { username, password, reconnectPeriod: 2000 });

    this.client.on('connect', () => this.logger.log(`Command publisher connected to ${url}`));
    this.client.on('reconnect', () => this.logger.warn('Command publisher reconnecting...'));
    this.client.on('error', (err) =>
      this.logger.error(`Command publisher client error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    this.client?.end();
  }

  // Fire-and-forget from the caller's perspective, same as
  // NotificationsService.sendToUser - a publish failure (broker down,
  // network blip) must never break the REST request that triggered it.
  // There is NO acknowledgement mechanism from the device (see
  // ACTUATOR_CONTROL.md's "no ack" note) - this is optimistic control, not
  // confirmed-applied state.
  publishCommand(deviceCode: string, command: Record<string, unknown>): void {
    const topic = `aura/${deviceCode}/command`;
    const payload = JSON.stringify({ ...command, issuedAt: new Date().toISOString() });

    this.client.publish(topic, payload, (err) => {
      if (err) {
        this.logger.error(`Failed to publish command to ${topic}: ${err.message}`);
      } else {
        this.logger.log(`Published command to ${topic}: ${payload}`);
      }
    });
  }
}
