import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { WsExceptionFilter } from '@nestjs/common';
import type { ChatFailure, ChatSocket } from './chat-socket.types';

@Catch()
export class ChatWsFilter implements WsExceptionFilter {
  private readonly logger = new Logger(ChatWsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    let status = 500;
    let message = 'Chat request failed';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof WsException) {
      status = 400;
      message = 'Invalid chat payload';
    } else {
      this.logger.error('Unexpected chat event failure');
    }
    const response: ChatFailure = { ok: false, error: { status, message } };
    const ack: unknown = host.getArgs()[2];
    if (typeof ack === 'function') (ack as (value: unknown) => void)(response);
    else host.switchToWs().getClient<ChatSocket>().emit('chat.error', response);
  }
}
