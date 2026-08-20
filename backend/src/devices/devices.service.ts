import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../database/entities/device.entity';
import { PairDeviceDto } from './dto/pair-device.dto';

@Injectable()
export class DevicesService {
  constructor(@InjectRepository(Device) private readonly devices: Repository<Device>) {}

  async listForUser(userId: string): Promise<Device[]> {
    return this.devices.find({ where: { ownerId: userId }, order: { createdAt: 'DESC' } });
  }

  async pair(userId: string, dto: PairDeviceDto): Promise<Device> {
    let device = await this.devices.findOne({ where: { deviceCode: dto.deviceCode } });

    // MVP behaviour: if the hardware hasn't been provisioned in the DB yet
    // (e.g. Prompt 4's MQTT ingestion hasn't seen it come online), create the
    // record on first pairing rather than requiring a separate factory-seed step.
    // Once MQTT ingestion is live, most devices will already exist by the time
    // a user pairs them, and this just becomes a lookup.
    if (!device) {
      device = this.devices.create({ deviceCode: dto.deviceCode, label: dto.label });
    } else if (device.ownerId && device.ownerId !== userId) {
      throw new ConflictException('This device is already paired to another account');
    }

    device.ownerId = userId;
    if (dto.label) {
      device.label = dto.label;
    }

    return this.devices.save(device);
  }

  async unpair(userId: string, deviceId: string): Promise<void> {
    const device = await this.getOwned(userId, deviceId);
    device.ownerId = null;
    await this.devices.save(device);
  }

  // Used by MQTT ingestion: a device may publish telemetry before any user has
  // paired it. Creates an unclaimed (ownerId null) record on first sighting so
  // ingestion never blocks on a user action happening first.
  async findOrCreateByCode(deviceCode: string): Promise<Device> {
    let device = await this.devices.findOne({ where: { deviceCode } });
    if (!device) {
      device = await this.devices.save(this.devices.create({ deviceCode }));
    }
    return device;
  }

  // Central ownership check other modules (sensors, alerts, maintenance) can
  // reuse so "you don't own this device" is enforced consistently everywhere.
  async getOwned(userId: string, deviceId: string): Promise<Device> {
    const device = await this.devices.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    if (device.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this device');
    }
    return device;
  }
}
