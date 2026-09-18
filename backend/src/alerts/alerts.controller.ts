import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicesService } from '../devices/devices.service';
import { AlertsService } from './alerts.service';
import { UpsertAlertThresholdDto } from './dto/upsert-alert-threshold.dto';
import { MetricType } from '../database/entities/sensor-reading.entity';

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

  @Get('thresholds')
  async listThresholds(@CurrentUser() user: { id: string }, @Param('id') deviceId: string) {
    await this.devicesService.getOwned(user.id, deviceId);
    return this.alertsService.listThresholdsForDevice(deviceId);
  }

  @Post('thresholds')
  async upsertThreshold(
    @CurrentUser() user: { id: string },
    @Param('id') deviceId: string,
    @Body() dto: UpsertAlertThresholdDto,
  ) {
    await this.devicesService.getOwned(user.id, deviceId);
    return this.alertsService.upsertThreshold(deviceId, dto);
  }

  @Delete('thresholds/:metricType')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteThreshold(
    @CurrentUser() user: { id: string },
    @Param('id') deviceId: string,
    @Param('metricType') metricType: string,
  ) {
    if (!Object.values(MetricType).includes(metricType as MetricType)) {
      throw new BadRequestException(`Unknown metric type: ${metricType}`);
    }
    await this.devicesService.getOwned(user.id, deviceId);
    await this.alertsService.deleteThreshold(deviceId, metricType as MetricType);
  }
}
