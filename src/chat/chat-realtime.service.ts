import { Injectable } from '@nestjs/common';
import type { ChatNamespace } from './chat-socket.types';
import type { ChatMessage } from './chat.select';
import type {
  ChatPresenceUpdate,
  ChatTypingUpdate,
} from './chat-presence.types';

export const chatUserRoom = (userId: string) => `chat:user:${userId}`;

@Injectable()
export class ChatRealtimeService {
  private namespace?: ChatNamespace;

  attach(namespace: ChatNamespace) {
    this.namespace = namespace;
  }

  publish(participants: string[], message: ChatMessage) {
    this.namespace
      ?.to(participants.map(chatUserRoom))
      .emit('chat.message', message);
  }

  presence(peers: string[], update: ChatPresenceUpdate) {
    if (peers.length)
      this.namespace?.to(peers.map(chatUserRoom)).emit('chat.presence', update);
  }

  typing(peer: string, update: ChatTypingUpdate) {
    this.namespace?.to(chatUserRoom(peer)).emit('chat.typing', update);
  }
}
