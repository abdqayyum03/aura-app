import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceLog, MaintenanceType } from '../database/entities/maintenance-log.entity';
import { DEFAULT_INTERVAL_DAYS } from './default-intervals';
import { CreateMaintenanceLogDto } from './dto/create-maintenance-log.dto';

export interface MaintenanceCountdown {
  type: MaintenanceType;
  intervalDays: number | null;
  lastPerformedAt: string | null;
  nextDueAt: string | null;
  daysRemaining: number | null; // negative means overdue
  overdue: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceLog) private readonly logs: Repository<MaintenanceLog>,
  ) {}

  async create(deviceId: string, userId: string, dto: CreateMaintenanceLogDto): Promise<MaintenanceLog> {
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

    const countdowns = await Promise.all(
      types.map(async (type): Promise<MaintenanceCountdown> => {
        const intervalDays = DEFAULT_INTERVAL_DAYS[type];

        const lastLog = await this.logs.findOne({
          where: { deviceId, type },
          order: { performedAt: 'DESC' },
        });

        if (!lastLog || intervalDays === null) {
          return {
            type,
            intervalDays,
            lastPerformedAt: lastLog?.performedAt.toISOString() ?? null,
            nextDueAt: null,
            daysRemaining: null,
            overdue: false,
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
          overdue: daysRemaining < 0,
        };
      }),
    );

    return countdowns;
  }
}
