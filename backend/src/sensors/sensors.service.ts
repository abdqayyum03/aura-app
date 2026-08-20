import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../database/entities/device.entity';
import { MetricType } from '../database/entities/sensor-reading.entity';
import { RedisService } from '../common/redis/redis.service';
import { Granularity, ReadingsQueryDto } from './dto/readings-query.dto';

// Maps the API's granularity param to the actual continuous aggregate view
// created in migration 002. Keeping this mapping in one place means the view
// names can change without touching the controller/DTO layer.
const GRANULARITY_VIEW: Record<Granularity, string> = {
  '1h': 'sensor_readings_1h',
  '1d': 'sensor_readings_1d',
  '1w': 'sensor_readings_1w',
};

export interface ReadingBucket {
  bucket: string;
  metricType: MetricType;
  avgValue: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
}

@Injectable()
export class SensorsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly redis: RedisService,
  ) {}

  async getReadings(deviceId: string, query: ReadingsQueryDto): Promise<ReadingBucket[]> {
    const view = GRANULARITY_VIEW[query.granularity];

    // View name is chosen from a fixed whitelist above, never from user input
    // directly, so this string interpolation can't become SQL injection -
    // every actual value is still passed as a parameter below.
    const conditions: string[] = ['device_id = $1'];
    const params: unknown[] = [deviceId];

    if (query.metric) {
      params.push(query.metric);
      conditions.push(`metric_type = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      conditions.push(`bucket >= $${params.length}`);
    }
    if (query.to) {
      params.push(query.to);
      conditions.push(`bucket <= $${params.length}`);
    }

    params.push(query.limit ?? 200);
    const limitParamIndex = params.length;

    const sql = `
      SELECT bucket, metric_type, avg_value, min_value, max_value, sample_count
      FROM "${view}"
      WHERE ${conditions.join(' AND ')}
      ORDER BY bucket DESC
      LIMIT $${limitParamIndex}
    `;

    const rows: {
      bucket: Date;
      metric_type: MetricType;
      avg_value: string;
      min_value: string;
      max_value: string;
      sample_count: string;
    }[] = await this.dataSource.query(sql, params);

    // Return oldest -> newest, which is what a line chart wants to plot directly.
    return rows
      .map((r) => ({
        bucket: r.bucket.toISOString(),
        metricType: r.metric_type,
        avgValue: Number(r.avg_value),
        minValue: Number(r.min_value),
        maxValue: Number(r.max_value),
        sampleCount: Number(r.sample_count),
      }))
      .reverse();
  }

  async getCurrent(deviceId: string): Promise<{
    lastSeenAt: string | null;
    online: boolean;
    readings: Record<string, number>;
  }> {
    const [device, cached, lastSeenRaw] = await Promise.all([
      this.devices.findOne({ where: { id: deviceId } }),
      this.redis.hgetall(`device:${deviceId}:current`),
      this.redis.get(`device:${deviceId}:last_seen`),
    ]);

    const readings: Record<string, number> = {};
    for (const [metric, value] of Object.entries(cached)) {
      readings[metric] = Number(value);
    }

    // Redis heartbeat key has a TTL (see mqtt-ingestion.service.ts) - if it's
    // expired, fall back to the device's last known lastSeenAt from Postgres
    // so "current" still shows the most recent value, just flagged offline.
    const lastSeenAt = lastSeenRaw ?? device?.lastSeenAt?.toISOString() ?? null;
    const online = lastSeenRaw !== null;

    return { lastSeenAt, online, readings };
  }
}
