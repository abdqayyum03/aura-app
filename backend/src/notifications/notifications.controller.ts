import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

// User-scoped, not device-scoped - a push token belongs to an app
// installation (one user's phone), not to any particular AURA hardware
// device, so this deliberately doesn't live under devices/:id like
// sensors/alerts/maintenance do.
@UseGuards(JwtAuthGuard)
@Controller('push-tokens')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@CurrentUser() user: { id: string }, @Body() dto: RegisterPushTokenDto) {
    await this.notifications.registerToken(user.id, dto.expoPushToken);
  }
}
