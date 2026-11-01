import type { Prisma } from '../generated/prisma/client';
import { asRecord, previewSnapshot } from './books/catalog.types';
import { messageExcerpt, messageSegments } from './chat-format';

export const chatUserSelect = {
  id: true,
  username: true,
} satisfies Prisma.UserSelect;

export const chatMessageSelect = {
  id: true,
  conversationId: true,
  clientMessageId: true,
  sequence: true,
  content: true,
  spoiler: true,
  quote: true,
  bookPreviews: true,
  bookReferences: true,
  replyToId: true,
  replyTo: {
    select: {
      id: true,
      sequence: true,
      content: true,
      spoiler: true,
      sender: { select: chatUserSelect },
    },
  },
  createdAt: true,
  sender: { select: chatUserSelect },
} satisfies Prisma.ChatMessageSelect;

export const chatConversationSelect = {
  id: true,
  firstUserId: true,
  secondUserId: true,
  firstUser: { select: chatUserSelect },
  secondUser: { select: chatUserSelect },
  lastSequence: true,
  createdAt: true,
  updatedAt: true,
  messages: {
    orderBy: { sequence: 'desc' },
    take: 1,
    select: chatMessageSelect,
  },
} satisfies Prisma.ChatConversationSelect;

export type StoredChatMessage = Prisma.ChatMessageGetPayload<{
  select: typeof chatMessageSelect;
}>;
export type ChatMessage = ReturnType<typeof serializeMessage>;

export function serializeMessage(message: StoredChatMessage, preview = false) {
  const content = preview
    ? messageExcerpt(message.content, message.spoiler)
    : message.content;
  const quote = asRecord(message.quote);
  const quotedText = typeof quote.text === 'string' ? quote.text : null;
  const hideCards = preview && message.spoiler;
  return {
    id: message.id,
    conversationId: message.conversationId,
    clientMessageId: message.clientMessageId,
    sequence: message.sequence,
    content,
    spoiler: message.spoiler,
    createdAt: message.createdAt,
    sender: message.sender,
    segments: messageSegments(content, !preview && message.spoiler),
    quote:
      quotedText !== null && !hideCards
        ? {
            text: preview ? messageExcerpt(quotedText) : quotedText,
            attribution:
              typeof quote.attribution === 'string' ? quote.attribution : null,
            segments: messageSegments(
              preview ? messageExcerpt(quotedText) : quotedText,
              !preview && message.spoiler,
            ),
          }
        : null,
    bookPreviews:
      !hideCards && Array.isArray(message.bookPreviews)
        ? message.bookPreviews
            .map(previewSnapshot)
            .filter((item) => item !== null)
        : [],
    replyTo:
      message.replyTo && !hideCards
        ? {
            id: message.replyTo.id,
            sequence: message.replyTo.sequence,
            sender: message.replyTo.sender,
            excerpt: messageExcerpt(
              message.replyTo.content,
              message.replyTo.spoiler,
            ),
            spoiler:
              message.replyTo.spoiler ||
              messageSegments(message.replyTo.content).some(
                (segment) => segment.type === 'spoiler',
              ),
          }
        : null,
  };
}
export type ChatConversation = Prisma.ChatConversationGetPayload<{
  select: typeof chatConversationSelect;
}>;

export function conversationForUser(
  conversation: ChatConversation,
  userId: string,
) {
  return {
    id: conversation.id,
    peer:
      conversation.firstUserId === userId
        ? conversation.secondUser
        : conversation.firstUser,
    lastSequence: conversation.lastSequence,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessage: conversation.messages[0]
      ? serializeMessage(conversation.messages[0], true)
      : null,
  };
}
