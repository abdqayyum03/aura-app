import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DevicesService } from '../devices/devices.service';
import { READING_CREATED_EVENT, ReadingCreatedEvent } from '../common/events/reading-created.event';

interface AuthenticatedSocket extends Socket {
  data: { userId?: string };
}

// Namespaced separately from the default '/' so REST-only clients (or future
// non-dashboard consumers) never accidentally get pulled into the socket
// handshake path.
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/realtime' })
export class SensorsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SensorsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly devicesService: DevicesService,
  ) {}

  // Auth happens once at connection time via a token in the handshake, not
  // per-message - matches the REST guard's JWT, so the same access token
  // works for both.
  async handleConnection(client: AuthenticatedSocket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      client.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      this.logger.warn(`Socket ${client.id} rejected: no token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      client.data.userId = payload.sub;
      this.logger.log(`Socket ${client.id} authenticated as user ${payload.sub}`);
    } catch {
      this.logger.warn(`Socket ${client.id} rejected: invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Socket ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { deviceId: string },
  ) {
    if (!client.data.userId) {
      throw new UnauthorizedException();
    }
    // Same ownership rule as the REST endpoints - a user can only subscribe
    // to live updates for a device they actually own.
    await this.devicesService.getOwned(client.data.userId, body.deviceId);
    client.join(this.roomFor(body.deviceId));
    return { subscribed: body.deviceId };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { deviceId: string },
  ) {
    client.leave(this.roomFor(body.deviceId));
    return { unsubscribed: body.deviceId };
  }

  // Fired by MqttIngestionService after every successful write. Decoupled via
  // EventEmitter2 rather than a direct dependency so the ingestion path never
  // has to know or care whether any dashboard client is currently connected.
  @OnEvent(READING_CREATED_EVENT)
  handleReadingCreated(event: ReadingCreatedEvent) {
    if (!this.server) return; // gateway not fully initialized yet - drop silently, nothing was subscribed anyway
    this.server.to(this.roomFor(event.deviceId)).emit('reading', event);
  }

  private roomFor(deviceId: string): string {
    return `device:${deviceId}`;
  }
}
