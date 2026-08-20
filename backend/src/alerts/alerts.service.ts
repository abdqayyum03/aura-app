import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertEvent, AlertSeverity } from '../database/entities/alert-event.entity';
import { AlertThreshold } from '../database/entities/alert-threshold.entity';
import { MetricType } from '../database/entities/sensor-reading.entity';
import { DEFAULT_THRESHOLDS, ThresholdBand } from './default-thresholds';
import { READING_CREATED_EVENT, ReadingCreatedEvent } from '../common/events/reading-created.event';

function severityFor(value: number, band: ThresholdBand): AlertSeverity {
  if (value >= band.greenMin && value <= band.greenMax) return AlertSeverity.GREEN;
  if (value >= band.amberMin && value <= band.amberMax) return AlertSeverity.AMBER;
  return AlertSeverity.RED;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(AlertEvent) private readonly alertEvents: Repository<AlertEvent>,
    @InjectRepository(AlertThreshold) private readonly thresholds: Repository<AlertThreshold>,
  ) {}

  async listForDevice(deviceId: string, activeOnly: boolean): Promise<AlertEvent[]> {
    return this.alertEvents.find({
      where: activeOnly ? { deviceId, resolvedAt: IsNull() } : { deviceId },
      order: { createdAt: 'DESC' },
    });
  }

  private async getBand(deviceId: string, metricType: MetricType): Promise<ThresholdBand | null> {
    const override = await this.thresholds.findOne({ where: { deviceId, metricType } });
    if (override) {
      return {
        greenMin: override.greenMin,
        greenMax: override.greenMax,
        amberMin: override.amberMin,
        amberMax: override.amberMax,
      };
    }
    return DEFAULT_THRESHOLDS[metricType] ?? null;
  }

  // Reuses the same event Prompt 5's Socket.io gateway listens to - no new
  // MQTT wiring needed. Runs once per incoming batch of readings, evaluates
  // each metric independently, and only touches the database on a severity
  // *transition* (green->amber, amber->red, red->green, etc). A sensor
  // sitting steadily in the red doesn't create a new row every 5 seconds -
  // it just keeps one open alert_events row until it clears.
  @OnEvent(READING_CREATED_EVENT)
  async handleReadingCreated(event: ReadingCreatedEvent): Promise<void> {
    for (const reading of event.readings) {
      try {
        await this.evaluateOne(event.deviceId, reading.metricType, reading.value);
      } catch (err) {
        // One metric's evaluation failing must never block the others in the
        // same batch, or a bad threshold row could silently blind the whole device.
        this.logger.error(
          `Alert evaluation failed for device ${event.deviceId} metric ${reading.metricType}: ${err.message}`,
        );
      }
    }
  }

  private async evaluateOne(deviceId: string, metricType: MetricType, value: number): Promise<void> {
    const band = await this.getBand(deviceId, metricType);
    if (!band) return; // no threshold defined for this metric (e.g. color channels) - skip

    const severity = severityFor(value, band);

    const activeAlert = await this.alertEvents.findOne({
      where: { deviceId, metricType, resolvedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (severity === AlertSeverity.GREEN) {
      if (activeAlert) {
        activeAlert.resolvedAt = new Date();
        await this.alertEvents.save(activeAlert);
        this.logger.log(`Device ${deviceId} ${metricType} back to green - resolved alert ${activeAlert.id}`);
      }
      return; // green + no active alert = nothing to do
    }

    if (activeAlert && activeAlert.severity === severity) {
      return; // same severity as the currently open alert - no spam, no new row
    }

    if (activeAlert) {
      activeAlert.resolvedAt = new Date(); // severity changed (e.g. amber -> red) - close the old one
      await this.alertEvents.save(activeAlert);
    }

    const newAlert = await this.alertEvents.save(
      this.alertEvents.create({
        deviceId,
        metricType,
        severity,
        triggeringValue: value,
        message: `${metricType} reading of ${value} is ${severity}`,
      }),
    );

    this.logger.warn(`Device ${deviceId} ${metricType}=${value} -> ${severity} (alert ${newAlert.id})`);

    // TODO (Prompt 13, frontend): trigger an FCM push notification here on
    // amber->red transitions specifically. Push token registration doesn't
    // exist yet, so this is a log line for now, not a no-op placeholder to
    // forget about later.
  }
}
