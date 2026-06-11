import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '@config/config.type';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/notifications',
  transports: ['websocket', 'polling'],
})
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationGateway.name);

  // userId → Set<socketId>  (1 user nhiều thiết bị)
  private readonly connectedUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  afterInit() {
    this.logger.log('NotificationGateway initialised ✓');
  }

  async handleConnection(client: Socket) {
    const userId = await this.extractUserId(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }

    // Join room riêng của user
    const room = `user:${userId}`;
    client.join(room);
    client.data.userId = userId;

    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId).add(client.id);

    this.logger.log(`[connect] userId=${userId} socketId=${client.id} (${this.connectedUsers.get(userId).size} connections)`);
  }

  handleDisconnect(client: Socket) {
    const userId: string = client.data.userId;
    if (!userId) return;

    const sockets = this.connectedUsers.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.connectedUsers.delete(userId);
    }
    this.logger.log(`[disconnect] userId=${userId} socketId=${client.id}`);
  }

  // ── Public helpers gọi từ NotificationService ────────────────────────────

  sendToUser(userId: string, notification: any) {
    const room = `user:${userId}`;
    this.server.to(room).emit('notification:new', notification);
  }

  sendUnreadCount(userId: string, count: number) {
    const room = `user:${userId}`;
    this.server.to(room).emit('notification:unread_count', { count });
  }

  // ── Client event: client yêu cầu unread count ────────────────────────────
  @SubscribeMessage('notification:get_unread')
  handleGetUnread(@ConnectedSocket() client: Socket, @MessageBody() _data: any) {
    // NotificationService sẽ handle qua HTTP, gateway chỉ forward
    // (không cần implementation - client dùng REST endpoint)
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async extractUserId(client: Socket): Promise<string | null> {
    // Token có thể ở handshake.auth.token hoặc Authorization header
    const raw =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization ||
      (client.handshake.query?.token as string);

    const token = raw?.startsWith('Bearer ') ? raw.slice(7) : raw;
    if (!token) {
      this.logger.warn(`[connect] No token — disconnecting ${client.id}`);
      return null;
    }

    try {
      const authConfig = this.configService.get('auth', { infer: true });
      const payload = this.jwtService.verify<{ id: string }>(token, {
        secret: authConfig.accessSecret,
      });
      return payload.id ?? null;
    } catch (e) {
      this.logger.warn(`[connect] Invalid token — disconnecting ${client.id}: ${e.message}`);
      return null;
    }
  }
}
