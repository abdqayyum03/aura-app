import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushToken } from '../database/entities/push-token.entity';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@InjectRepository(PushToken) private readonly pushTokens: Repository<PushToken>) {}

  // Re-registering the same token under a different account (e.g. a
  // different user logs into the app on the same physical phone) re-points
  // this one row at the new owner rather than creating a duplicate - a
  // push token belongs to an app installation, not permanently to whoever
  // first registered it.
  async registerToken(userId: string, expoPushToken: string): Promise<void> {
    const existing = await this.pushTokens.findOne({ where: { expoPushToken } });
    if (existing) {
      if (existing.userId !== userId) {
        existing.userId = userId;
        await this.pushTokens.save(existing);
      }
      return;
    }
    await this.pushTokens.save(this.pushTokens.create({ userId, expoPushToken }));
  }

  // Fire-and-forget from the caller's perspective: never throws. A push
  // delivery failure (bad token, Expo API down, network blip) must never
  // break the alert evaluation pipeline that triggered it - same fail-closed-
  // per-item philosophy as mqtt-ingestion.service.ts / alerts.service.ts's
  // own per-reading error handling.
  //
  // Uses Expo's push API directly (not Firebase/FCM), which does NOT
  // require the project to have its own Firebase credentials configured -
  // Expo's relay handles FCM/APNs delivery internally. See
  // PUSH_NOTIFICATIONS.md for the real constraint this doesn't remove:
  // Expo Go on Android doesn't support remote push at all as of recent SDKs
  // (a Google policy change, not an Expo/Firebase credentials issue) - only
  // a development or production build does.
  async sendToUser(userId: string, notification: PushNotificationPayload): Promise<void> {
    const tokens = await this.pushTokens.find({ where: { userId } });
    if (tokens.length === 0) {
      this.logger.debug(`No push tokens registered for user ${userId} - nothing to send`);
      return;
    }

    const messages = tokens.map((t) => ({
      to: t.expoPushToken,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default',
    }));

    try {
      const res = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        this.logger.error(`Expo push send failed: HTTP ${res.status} ${await res.text()}`);
        return;
      }

      // Expo's response has one result entry per message, in the same
      // order - a per-token "error" status (e.g. DeviceNotRegistered) means
      // that specific token is stale, not that the whole send failed.
      const body = (await res.json()) as { data?: { status: string; message?: string }[] };
      body.data?.forEach((result, i) => {
        if (result.status === 'error') {
          this.logger.warn(
            `Push to token for user ${userId} (${tokens[i].expoPushToken.slice(0, 20)}...) failed: ${result.message}`,
          );
        }
      });
    } catch (err) {
      this.logger.error(`Expo push send request failed: ${err.message}`);
    }
  }
}
