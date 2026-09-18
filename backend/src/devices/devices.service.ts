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
import { UpdateActuatorStateDto } from './dto/update-actuator-state.dto';
import { MqttCommandPublisherService } from '../mqtt/mqtt-command-publisher.service';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly mqttCommandPublisher: MqttCommandPublisherService,
  ) {}

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

  // Internal lookup, no ownership check - for system-initiated code paths
  // (e.g. AlertsService resolving who to push-notify for a device) that
  // already have a trusted deviceId and aren't acting on behalf of a
  // specific requesting user. Don't use this from a controller handling a
  // user request - use getOwned below instead.
  async getById(deviceId: string): Promise<Device | null> {
    return this.devices.findOne({ where: { id: deviceId } });
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

  // Merges whatever's present in dto onto the device's current actuator
  // state, saves it (the DB row is the source of truth for "desired
  // state"), then publishes the FULL resulting state over MQTT - not just
  // the changed fields. Deliberate: there's no acknowledgement from the
  // device (see ACTUATOR_CONTROL.md), so a dropped command could otherwise
  // leave the device out of sync with only a partial update. Publishing the
  // complete desired state every time means a device that missed a
  // previous command still ends up correct on the next one - "last known
  // full state," not a delta stream.
  async updateActuatorState(
    userId: string,
    deviceId: string,
    dto: UpdateActuatorStateDto,
  ): Promise<Device> {
    const device = await this.getOwned(userId, deviceId);

    if (dto.lightOn !== undefined) device.lightOn = dto.lightOn;
    if (dto.lightColorMode !== undefined) device.lightColorMode = dto.lightColorMode;
    if (dto.lightColorHex !== undefined) device.lightColorHex = dto.lightColorHex;
    if (dto.lightIntensityPercent !== undefined)
      device.lightIntensityPercent = dto.lightIntensityPercent;
    if (dto.bubblingSpeed !== undefined) device.bubblingSpeed = dto.bubblingSpeed;

    const saved = await this.devices.save(device);

    this.mqttCommandPublisher.publishCommand(saved.deviceCode, {
      lightOn: saved.lightOn,
      lightColorMode: saved.lightColorMode,
      lightColorHex: saved.lightColorHex,
      lightIntensityPercent: saved.lightIntensityPercent,
      bubblingSpeed: saved.bubblingSpeed,
    });

    return saved;
  }
}
