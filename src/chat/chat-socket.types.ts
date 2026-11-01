import type { Namespace, Socket } from 'socket.io';
import type { ChatMessage } from './chat.select';
import type {
  ChatTypingDto,
  ConversationSocketDto,
  SendSocketMessageDto,
} from './dto/chat.dto';
import type {
  ChatPresenceUpdate,
  ChatTypingUpdate,
} from './chat-presence.types';

export interface ChatSocketData {
  userId: string;
  expiresAt: number;
}
export interface ChatFailure {
  ok: false;
  error: { status: number; message: string };
}
export interface ChatClientEvents {
  'chat.presence.get': (
    payload: ConversationSocketDto,
    ack: (reply: unknown) => void,
  ) => void;
  'chat.typing': (
    payload: ChatTypingDto,
    ack: (reply: unknown) => void,
  ) => void;
  'chat.send': (
    payload: SendSocketMessageDto,
    ack: (reply: unknown) => void,
  ) => void;
}
export interface ChatServerEvents {
  'chat.presence': (presence: ChatPresenceUpdate) => void;
  'chat.typing': (typing: ChatTypingUpdate) => void;
  'chat.ready': (info: { userId: string; expiresAt: number }) => void;
  'chat.message': (message: ChatMessage) => void;
  'chat.error': (failure: ChatFailure) => void;
}
export type ChatSocket = Socket<
  ChatClientEvents,
  ChatServerEvents,
  Record<string, never>,
  ChatSocketData
>;
export type ChatNamespace = Namespace<
  ChatClientEvents,
  ChatServerEvents,
  Record<string, never>,
  ChatSocketData
>;
