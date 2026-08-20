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
import { DevicesService } from './devices.service';
import { PairDeviceDto } from './dto/pair-device.dto';

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
}
