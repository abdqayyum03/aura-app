import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicesService } from '../devices/devices.service';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceLogDto } from './dto/create-maintenance-log.dto';

@UseGuards(JwtAuthGuard)
@Controller('devices/:id/maintenance')
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly devicesService: DevicesService,
  ) {}

  // Combined response matches the app's Maintenance & Records screen: the
  // "Upcoming Maintenance" countdown cards and the Log Book timeline both
  // come from one call, so the screen only needs one round-trip on load.
  @Get()
  async getSummary(@CurrentUser() user: { id: string }, @Param('id') deviceId: string) {
    await this.devicesService.getOwned(user.id, deviceId);
    const [countdowns, timeline] = await Promise.all([
      this.maintenanceService.getCountdowns(deviceId),
      this.maintenanceService.listForDevice(deviceId),
    ]);
    return { countdowns, timeline };
  }

  // Matches the app's floating "Log Action" button.
  @Post()
  async logAction(
    @CurrentUser() user: { id: string },
    @Param('id') deviceId: string,
    @Body() dto: CreateMaintenanceLogDto,
  ) {
    await this.devicesService.getOwned(user.id, deviceId);
    return this.maintenanceService.create(deviceId, user.id, dto);
  }

  @Delete(':logId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: { id: string },
    @Param('id') deviceId: string,
    @Param('logId') logId: string,
  ) {
    await this.devicesService.getOwned(user.id, deviceId);
    await this.maintenanceService.delete(deviceId, logId);
  }
}
