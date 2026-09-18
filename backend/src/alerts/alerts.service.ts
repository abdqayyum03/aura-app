import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertEvent, AlertSeverity } from '../database/entities/alert-event.entity';
import { AlertThreshold } from '../database/entities/alert-threshold.entity';
import { MetricType } from '../database/entities/sensor-reading.entity';
import { DEFAULT_THRESHOLDS, ThresholdBand } from './default-thresholds';
import { UpsertAlertThresholdDto } from './dto/upsert-alert-threshold.dto';
import { READING_CREATED_EVENT, ReadingCreatedEvent } from '../common/events/reading-created.event';
import { DevicesService } from '../devices/devices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../common/redis/redis.service';

function severityFor(value: number, band: ThresholdBand): AlertSeverity {
  if (value >= band.greenMin && value <= band.greenMax) return AlertSeverity.GREEN;
  if (value >= band.amberMin && value <= band.amberMax) return AlertSeverity.AMBER;
  return AlertSeverity.RED;
}

// ASSUMED, not client-confirmed - same "placeholder, tighten later" caution
// as everything in default-thresholds.ts/default-intervals.ts. Exists
// because a reading that oscillates right at a threshold boundary (e.g. pH
// bouncing between amber and red every few seconds) produces a genuine
// severity TRANSITION on every flip - the transition-only rule in
// evaluateOne stops steady-state spam but does nothing for this case, since
// each flip really is a different severity than the one before it. This
// cooldown is a second, independent throttle specifically on notification
// DELIVERY (not on writing alert_events rows, which stay fully accurate for
// history/the in-app Alerts list regardless).
const NOTIFICATION_COOLDOWN_SECONDS = 30 * 60;

export interface AlertThresholdView extends ThresholdBand {
  metricType: MetricType;
  // true when this device has its own override row; false means it's
  // currently running on DEFAULT_THRESHOLDS and the band shown is the default.
  isOverridden: boolean;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(AlertEvent) private readonly alertEvents: Repository<AlertEvent>,
    @InjectRepository(AlertThreshold) private readonly thresholds: Repository<AlertThreshold>,
    private readonly devicesService: DevicesService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  async listForDevice(deviceId: string, activeOnly: boolean): Promise<AlertEvent[]> {
    return this.alertEvents.find({
      where: activeOnly ? { deviceId, resolvedAt: IsNull() } : { deviceId },
      order: { createdAt: 'DESC' },
    });
  }

  // One row per metric that has a DEFAULT_THRESHOLDS entry (color channels are
  // intentionally excluded there - see default-thresholds.ts - so they never
  // appear here either, same "diagnostic swatch, not pass/fail" reasoning).
  // Shows the override if this device has one, otherwise the default, with
  // isOverridden telling the caller which.
  async listThresholdsForDevice(deviceId: string): Promise<AlertThresholdView[]> {
    const overrides = await this.thresholds.find({ where: { deviceId } });
    const overrideByMetric = new Map(overrides.map((o) => [o.metricType, o]));

    return (Object.keys(DEFAULT_THRESHOLDS) as MetricType[]).map((metricType) => {
      const override = overrideByMetric.get(metricType);
      const band = override ?? DEFAULT_THRESHOLDS[metricType]!;
      return { metricType, ...band, isOverridden: !!override };
    });
  }

  async upsertThreshold(deviceId: string, dto: UpsertAlertThresholdDto): Promise<AlertThreshold> {
    this.validateBand(dto);

    let threshold = await this.thresholds.findOne({
      where: { deviceId, metricType: dto.metricType },
    });
    if (!threshold) {
      threshold = this.thresholds.create({ deviceId, metricType: dto.metricType });
    }
    threshold.greenMin = dto.greenMin;
    threshold.greenMax = dto.greenMax;
    threshold.amberMin = dto.amberMin;
    threshold.amberMax = dto.amberMax;

    return this.thresholds.save(threshold);
  }

  async deleteThreshold(deviceId: string, metricType: MetricType): Promise<void> {
    const threshold = await this.thresholds.findOne({ where: { deviceId, metricType } });
    if (!threshold) {
      throw new NotFoundException(
        'No threshold override exists for this device/metric - it is already on the default band',
      );
    }
    await this.thresholds.remove(threshold);
  }

  // Mirrors the ThresholdBand doc comment's invariant: amber is always the
  // wider band surrounding green. Enforced here (not just in the frontend
  // form) since this table is read on every single alert evaluation - a bad
  // band saved once would misclassify every future reading for that metric.
  private validateBand(dto: UpsertAlertThresholdDto): void {
    if (dto.greenMin > dto.greenMax) {
      throw new BadRequestException('greenMin must be <= greenMax');
    }
    if (dto.amberMin > dto.greenMin) {
      throw new BadRequestException('amberMin must be <= greenMin');
    }
    if (dto.amberMax < dto.greenMax) {
      throw new BadRequestException('amberMax must be >= greenMax');
    }
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

  private async evaluateOne(
    deviceId: string,
    metricType: MetricType,
    value: number,
  ): Promise<void> {
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
        this.logger.log(
          `Device ${deviceId} ${metricType} back to green - resolved alert ${activeAlert.id}`,
        );
      }
      // Deliberately does NOT clear the notification cooldown here (an
      // earlier version of this code did, and that was a real bug: a
      // reading that oscillates THROUGH green - not just between amber/red -
      // would wipe the cooldown on every green touch, letting the very next
      // amber reading notify again immediately. Confirmed in practice with
      // pm25/co, both of which sit near their green boundary). The cooldown
      // now just runs its full duration regardless of intermediate green
      // blips - the tradeoff (a genuine recovery-then-new-problem within the
      // same cooldown window stays quiet a while longer) is a small cost
      // next to "notified every few seconds," and the window is short (30
      // min) precisely so that cost stays small.
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

    this.logger.warn(
      `Device ${deviceId} ${metricType}=${value} -> ${severity} (alert ${newAlert.id})`,
    );

    await this.notifyOwner(deviceId, metricType, value, severity);
  }

  // Only reached on a genuine transition INTO amber/red (see evaluateOne) -
  // never fires again while a device sits steadily in the same severity, and
  // never fires on a transition back to green (that's a relief, not
  // something worth interrupting someone over). On TOP of that, gated by a
  // per-(device, metric) cooldown (NOTIFICATION_COOLDOWN_SECONDS) so a
  // reading oscillating right at a threshold boundary can't re-notify on
  // every flip - see that constant's comment. The cooldown only throttles
  // this notification send; the alert_events row for every genuine
  // transition is still written unconditionally in evaluateOne, so in-app
  // alert history stays fully accurate even when a push was suppressed.
  // Never throws - a device with no owner (unclaimed) or no registered push
  // tokens is a normal, silent no-op, not an error; NotificationsService.
  // sendToUser itself never throws either, for the same "don't break the
  // alert pipeline" reason - this method's own try/catch is a second layer
  // of the same guarantee, not redundant paranoia, since a future change to
  // either method shouldn't be able to reintroduce a crash here by accident.
  private async notifyOwner(
    deviceId: string,
    metricType: MetricType,
    value: number,
    severity: AlertSeverity,
  ): Promise<void> {
    try {
      const cooldownKey = this.notificationCooldownKey(deviceId, metricType);
      if (await this.redis.get(cooldownKey)) {
        this.logger.debug(
          `Skipping push for device ${deviceId} ${metricType} - still within the ${NOTIFICATION_COOLDOWN_SECONDS}s cooldown`,
        );
        return;
      }

      const device = await this.devicesService.getById(deviceId);
      if (!device?.ownerId) return; // unclaimed device - nobody to notify

      const label = metricType.replace(/_/g, ' ');
      await this.notifications.sendToUser(device.ownerId, {
        title: severity === AlertSeverity.RED ? 'Critical alert' : 'Attention needed',
        body: `${device.label ?? device.deviceCode}: ${label} reading of ${value} is ${severity}.`,
        data: { deviceId, metricType, severity },
      });

      await this.redis.set(cooldownKey, '1', NOTIFICATION_COOLDOWN_SECONDS);
    } catch (err) {
      this.logger.error(`Push notification dispatch failed for device ${deviceId}: ${err.message}`);
    }
  }

  private notificationCooldownKey(deviceId: string, metricType: MetricType): string {
    return `device:${deviceId}:notified:${metricType}`;
  }
}
