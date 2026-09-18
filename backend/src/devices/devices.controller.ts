import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
import { PairDeviceDto } from './dto/pair-device.dto';
import { UpdateActuatorStateDto } from './dto/update-actuator-state.dto';

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.devicesService.listForUser(user.id);
  }

  @Post('pair')
  pair(@CurrentUser() user: { id: string }, @Body() dto: PairDeviceDto) {
    return this.devicesService.pair(user.id, dto);
  }

  @Delete(':id/pair')
  @HttpCode(HttpStatus.NO_CONTENT)
  unpair(@CurrentUser() user: { id: string }, @Param('id') deviceId: string) {
    return this.devicesService.unpair(user.id, deviceId);
  }

  @Patch(':id/actuators')
  updateActuatorState(
    @CurrentUser() user: { id: string },
    @Param('id') deviceId: string,
    @Body() dto: UpdateActuatorStateDto,
  ) {
    return this.devicesService.updateActuatorState(user.id, deviceId, dto);
  }
}
