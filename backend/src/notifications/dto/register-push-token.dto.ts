import { IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  // Not validated against Expo's exact "ExponentPushToken[...]" format on
  // purpose - that format is an Expo implementation detail that could change;
  // a genuinely malformed token just fails silently at send time (Expo's push
  // API reports per-token errors, logged and swallowed - see
  // NotificationsService.sendToUser) rather than being rejected at registration.
  @IsString()
  @MinLength(10)
  expoPushToken: string;
}
