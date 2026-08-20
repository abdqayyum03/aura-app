import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicesService } from '../devices/devices.service';
import { AlertsService } from './alerts.service';

@UseGuards(JwtAuthGuard)
@Controller('devices/:id/alerts')
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly devicesService: DevicesService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { id: string },
    @Param('id') deviceId: string,
    @Query('status') status?: 'active' | 'all',
  ) {
    await this.devicesService.getOwned(user.id, deviceId);
    return this.alertsService.listForDevice(deviceId, status !== 'all');
  }
}
