import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceLog, MaintenanceType } from '../database/entities/maintenance-log.entity';
import { DEFAULT_INTERVAL_DAYS, HARVEST_READY_TURBIDITY_NTU } from './default-intervals';
import { CreateMaintenanceLogDto } from './dto/create-maintenance-log.dto';
import { RedisService } from '../common/redis/redis.service';

export interface MaintenanceCountdown {
  type: MaintenanceType;
  intervalDays: number | null;
  lastPerformedAt: string | null;
  nextDueAt: string | null;
  daysRemaining: number | null; // negative means overdue
  overdue: boolean;
  // Only populated for HARVEST - null for every other type. See
  // HARVEST_READY_TURBIDITY_NTU (default-intervals.ts): turbidity crossing
  // this forces `overdue: true` regardless of daysRemaining.
  turbidityNow: number | null;
  turbidityReadyThreshold: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceLog) private readonly logs: Repository<MaintenanceLog>,
    private readonly redis: RedisService,
  ) {}

  async create(
    deviceId: string,
    userId: string,
    dto: CreateMaintenanceLogDto,
  ): Promise<MaintenanceLog> {
    return this.logs.save(
      this.logs.create({
        deviceId,
        type: dto.type,
        notes: dto.notes,
        loggedByUserId: userId,
        performedAt: dto.performedAt ? new Date(dto.performedAt) : new Date(),
      }),
    );
  }

  async listForDevice(deviceId: string, limit = 100): Promise<MaintenanceLog[]> {
    return this.logs.find({
      where: { deviceId },
      order: { performedAt: 'DESC' },
      take: limit,
    });
  }

  // Ownership of the log itself, not just the device - a log can only be
  // deleted through a device the requester owns, checked by the caller
  // before this runs, but we re-verify the log actually belongs to that
  // device so a crafted request can't delete a log under someone else's device.
  async delete(deviceId: string, logId: string): Promise<void> {
    const log = await this.logs.findOne({ where: { id: logId } });
    if (!log) {
      throw new NotFoundException('Maintenance log not found');
    }
    if (log.deviceId !== deviceId) {
      throw new ForbiddenException('This log does not belong to the specified device');
    }
    await this.logs.remove(log);
  }

  async getCountdowns(deviceId: string): Promise<MaintenanceCountdown[]> {
    const types = Object.values(MaintenanceType);
    const now = Date.now();

    // Fetched once per call, not once per type - same current-value cache
    // MqttIngestionService writes and SensorsService.getCurrent reads, so
    // this reflects the device's actual latest turbidity reading with no
    // extra Postgres query.
    const currentValues = await this.redis.hgetall(`device:${deviceId}:current`);
    const turbidityNow =
      currentValues.turbidity !== undefined ? Number(currentValues.turbidity) : null;

    const countdowns = await Promise.all(
      types.map(async (type): Promise<MaintenanceCountdown> => {
        const intervalDays = DEFAULT_INTERVAL_DAYS[type];
        const isHarvest = type === MaintenanceType.HARVEST;

        const lastLog = await this.logs.findOne({
          where: { deviceId, type },
          order: { performedAt: 'DESC' },
        });

        // Turbidity readiness takes priority over the calendar for harvest -
        // matches the client spec's "turbidity indicates when algae is thick
        // enough to harvest," not a fixed cadence. Applies even before a
        // first harvest has ever been logged for this device.
        const turbidityReady =
          isHarvest && turbidityNow !== null && turbidityNow >= HARVEST_READY_TURBIDITY_NTU;

        if (!lastLog || intervalDays === null) {
          return {
            type,
            intervalDays,
            lastPerformedAt: lastLog?.performedAt.toISOString() ?? null,
            nextDueAt: null,
            daysRemaining: null,
            overdue: turbidityReady,
            turbidityNow: isHarvest ? turbidityNow : null,
            turbidityReadyThreshold: isHarvest ? HARVEST_READY_TURBIDITY_NTU : null,
          };
        }

        const nextDueAtMs = lastLog.performedAt.getTime() + intervalDays * MS_PER_DAY;
        const daysRemaining = Math.ceil((nextDueAtMs - now) / MS_PER_DAY);

        return {
          type,
          intervalDays,
          lastPerformedAt: lastLog.performedAt.toISOString(),
          nextDueAt: new Date(nextDueAtMs).toISOString(),
          daysRemaining,
          overdue: turbidityReady || daysRemaining < 0,
          turbidityNow: isHarvest ? turbidityNow : null,
          turbidityReadyThreshold: isHarvest ? HARVEST_READY_TURBIDITY_NTU : null,
        };
      }),
    );

    return countdowns;
  }
}
