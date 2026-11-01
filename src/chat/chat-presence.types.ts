export interface ChatPresence {
  online: boolean;
  expiresAt: number | null;
  observedAt: number;
}
export interface ChatPresenceUpdate extends ChatPresence {
  userId: string;
}
export interface ChatTypingUpdate {
  conversationId: string;
  userId: string;
  typing: boolean;
  expiresAt: number;
}
