import {
  HttpException,
  Injectable,
  UnauthorizedException,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WsException,
} from '@nestjs/websockets';
import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { ChatRealtimeService, chatUserRoom } from './chat-realtime.service';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ChatWsFilter } from './chat-ws.filter';
import type {
  ChatFailure,
  ChatNamespace,
  ChatSocket,
} from './chat-socket.types';
import {
  ChatTypingDto,
  ConversationSocketDto,
  SendSocketMessageDto,
} from './dto/chat.dto';
import { ChatPresenceService } from './chat-presence.service';

@Injectable()
@WebSocketGateway({ namespace: '/chat' })
@UseFilters(new ChatWsFilter())
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: () => new WsException('Invalid chat payload'),
  }),
)
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly connections = new Map<string, number>();

  constructor(
    private readonly chat: ChatService,
    private readonly realtime: ChatRealtimeService,
    private readonly limits: ChatRateLimitService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly presence: ChatPresenceService,
  ) {}

  afterInit(namespace: ChatNamespace) {
    this.realtime.attach(namespace);
    namespace.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('Chat authentication failed')),
      );
    });
  }

  private async authenticate(socket: ChatSocket) {
    const token: unknown = socket.handshake.auth?.accessToken;
    if (typeof token !== 'string' || token.length > 4096)
      throw new UnauthorizedException();
    const payload = await this.jwt.verifyAsync<{
      sub?: unknown;
      exp?: unknown;
    }>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sub !== 'string' ||
      !/^c[a-z0-9]{24}$/i.test(payload.sub) ||
      typeof payload.exp !== 'number' ||
      payload.exp * 1000 <= Date.now()
    )
      throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });
    if (!user || socket.conn.readyState !== 'open')
      throw new UnauthorizedException();
    const count = this.connections.get(user.id) ?? 0;
    if (count >= 5) throw new UnauthorizedException();
    socket.data = { userId: user.id, expiresAt: payload.exp * 1000 };
    this.connections.set(user.id, count + 1);
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.min(socket.data.expiresAt - Date.now(), 2147483647),
    );
    timer.unref();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      const remaining = (this.connections.get(user.id) ?? 1) - 1;
      if (remaining > 0) this.connections.set(user.id, remaining);
      else this.connections.delete(user.id);
    };
    socket.once('disconnect', release);
    socket.conn.once('close', release);
    let pending = 0;
    socket.use((packet, next) => {
      const deny = (status: number, message: string) => {
        const response: ChatFailure = { ok: false, error: { status, message } };
        const ack: unknown = packet[packet.length - 1];
        if (typeof ack === 'function')
          (ack as (value: unknown) => void)(response);
        else socket.emit('chat.error', response);
      };
      if (socket.data.expiresAt <= Date.now()) {
        deny(401, 'Chat authentication expired');
        socket.disconnect(true);
        return;
      }
      if (pending >= 8) {
        deny(429, 'Too many pending chat events');
        return;
      }
      pending++;
      const event: unknown = packet[0];
      const scope =
        event === 'chat.typing'
          ? 'typing'
          : event === 'chat.presence.get'
            ? 'presence'
            : 'send';
      void this.limits
        .consume(
          scope,
          user.id,
          scope === 'typing' ? 10 : 60,
          scope === 'typing' ? 1000 : 60000,
        )
        .then(
          () => {
            if (
              !['chat.send', 'chat.presence.get', 'chat.typing'].includes(
                String(event),
              )
            )
              deny(400, 'Unsupported chat event');
            else next();
          },
          (error: unknown) => {
            deny(
              error instanceof HttpException ? error.getStatus() : 503,
              'Chat event limit exceeded or unavailable',
            );
          },
        )
        .finally(() => {
          pending--;
        });
    });
  }

  async handleConnection(socket: ChatSocket) {
    if (!socket.data.userId) {
      socket.disconnect(true);
      return;
    }
    await socket.join(chatUserRoom(socket.data.userId));
    if (!socket.connected) return;
    await this.presence.connect(
      socket.data.userId,
      socket.id,
      socket.data.expiresAt,
    );
    socket.emit('chat.ready', {
      userId: socket.data.userId,
      expiresAt: socket.data.expiresAt,
    });
  }

  async handleDisconnect(socket: ChatSocket) {
    await this.presence.disconnect(socket.id);
  }

  @SubscribeMessage('chat.presence.get')
  async getPresence(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() dto: ConversationSocketDto,
  ) {
    return {
      ok: true,
      presence: await this.presence.peer(
        socket.data.userId,
        dto.conversationId,
      ),
    };
  }

  @SubscribeMessage('chat.typing')
  async typing(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() dto: ChatTypingDto,
  ) {
    return {
      ok: true,
      typing: await this.presence.typing(
        socket.data.userId,
        dto.conversationId,
        dto.typing,
      ),
    };
  }

  @SubscribeMessage('chat.send')
  async send(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() dto: SendSocketMessageDto,
  ) {
    if (!socket.data.userId || socket.data.expiresAt <= Date.now()) {
      socket.disconnect(true);
      throw new UnauthorizedException('Chat authentication expired');
    }
    const result = await this.chat.send(
      socket.data.userId,
      dto.conversationId,
      dto,
    );
    return { ok: true, ...result };
  }
}
