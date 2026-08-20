import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicesService } from '../devices/devices.service';
import { SensorsService } from './sensors.service';
import { ReadingsQueryDto } from './dto/readings-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('devices/:id')
export class SensorsController {
  constructor(
    private readonly sensorsService: SensorsService,
    private readonly devicesService: DevicesService,
  ) {}

  @Get('readings')
  async getReadings(
    @CurrentUser() user: { id: string },
    @Param('id') deviceId: string,
    @Query() query: ReadingsQueryDto,
  ) {
    await this.devicesService.getOwned(user.id, deviceId); // enforces ownership, throws 403/404
    return this.sensorsService.getReadings(deviceId, query);
  }

  @Get('current')
  async getCurrent(@CurrentUser() user: { id: string }, @Param('id') deviceId: string) {
    await this.devicesService.getOwned(user.id, deviceId);
    return this.sensorsService.getCurrent(deviceId);
  }
}
