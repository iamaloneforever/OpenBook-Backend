import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { serializableTransaction } from '../common/database/serializable-transaction';
import type { PaginationDto } from '../common/dtos/shared/pagination.dto';
import { ChatRealtimeService } from './chat-realtime.service';
import {
  chatConversationSelect,
  chatMessageSelect,
  conversationForUser,
  serializeMessage,
  type StoredChatMessage,
} from './chat.select';
import type { MessageHistoryDto, SendMessageDto } from './dto/chat.dto';
import { PublicBooksService } from './books/public-books.service';
import { asRecord, type PublicBookPreview } from './books/catalog.types';
import { messageReferences } from './chat-format';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: ChatRealtimeService,
    private readonly books: PublicBooksService,
  ) {}

  private memberWhere(userId: string): Prisma.ChatConversationWhereInput {
    return { OR: [{ firstUserId: userId }, { secondUserId: userId }] };
  }

  private async isBlocked(
    tx: Prisma.TransactionClient,
    first: string,
    second: string,
  ) {
    return (
      (await tx.socialBlock.count({
        where: {
          OR: [
            { blockerId: first, blockedId: second },
            { blockerId: second, blockedId: first },
          ],
        },
      })) > 0
    );
  }

  async create(userId: string, recipientId: string) {
    if (userId === recipientId)
      throw new BadRequestException('Choose another recipient');
    const [firstUserId, secondUserId] = [userId, recipientId].sort();
    const conversation = await serializableTransaction(
      this.prisma,
      async (tx) => {
        const users = await tx.user.count({
          where: { id: { in: [userId, recipientId] } },
        });
        if (users !== 2 || (await this.isBlocked(tx, userId, recipientId)))
          throw new NotFoundException('Recipient is unavailable');
        await tx.chatConversation.createMany({
          data: [{ firstUserId, secondUserId }],
          skipDuplicates: true,
        });
        return tx.chatConversation.findUniqueOrThrow({
          where: { firstUserId_secondUserId: { firstUserId, secondUserId } },
          select: chatConversationSelect,
        });
      },
    );
    return conversationForUser(conversation, userId);
  }

  async list(userId: string, query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.memberWhere(userId);
    const [conversations, total] = await this.prisma.$transaction([
      this.prisma.chatConversation.findMany({
        where,
        select: chatConversationSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatConversation.count({ where }),
    ]);
    return {
      data: conversations.map((item) => conversationForUser(item, userId)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async get(userId: string, id: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id, ...this.memberWhere(userId) },
      select: chatConversationSelect,
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversationForUser(conversation, userId);
  }

  async history(
    userId: string,
    conversationId: string,
    query: MessageHistoryDto,
  ) {
    if (query.before !== undefined && query.after !== undefined)
      throw new BadRequestException('Use either before or after, not both');
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, ...this.memberWhere(userId) },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const limit = query.limit ?? 50;
    const forward = query.after !== undefined;
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...(forward
          ? { sequence: { gt: query.after } }
          : query.before !== undefined
            ? { sequence: { lt: query.before } }
            : {}),
      },
      orderBy: { sequence: forward ? 'asc' : 'desc' },
      take: limit + 1,
      select: chatMessageSelect,
    });
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const data = forward ? selected : selected.reverse();
    return {
      data: data.map((message) => serializeMessage(message)),
      nextBefore: !forward && hasMore ? data[0].sequence : null,
      nextAfter: forward && hasMore ? data[data.length - 1].sequence : null,
    };
  }

  async send(userId: string, conversationId: string, dto: SendMessageDto) {
    const intent = messageReferences(dto);
    const checkRetry = (existing: StoredChatMessage) => {
      const storedRefs = Array.isArray(existing.bookReferences)
        ? existing.bookReferences
            .map(asRecord)
            .map((ref) => [ref.provider, ref.id])
        : [];
      const requestedRefs =
        storedRefs.length === 0 && intent.explicit.size === 0
          ? []
          : intent.refs.map((ref) => [ref.provider, ref.id]);
      const quote = asRecord(existing.quote);
      if (
        existing.content !== dto.content ||
        existing.spoiler !== (dto.spoiler ?? false) ||
        existing.replyToId !== (dto.replyToId ?? null) ||
        JSON.stringify(storedRefs) !== JSON.stringify(requestedRefs) ||
        JSON.stringify(
          typeof quote.text === 'string'
            ? [quote.text, quote.attribution ?? null]
            : null,
        ) !==
          JSON.stringify(
            dto.quote ? [dto.quote.text, dto.quote.attribution ?? null] : null,
          )
      )
        throw new ConflictException(
          'clientMessageId was already used for a different message',
        );
    };
    const where = {
      conversationId_senderId_clientMessageId: {
        conversationId,
        senderId: userId,
        clientMessageId: dto.clientMessageId,
      },
    };
    const preflight = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, ...this.memberWhere(userId) },
      select: { firstUserId: true, secondUserId: true },
    });
    if (!preflight) throw new NotFoundException('Conversation not found');
    const prior = await this.prisma.chatMessage.findUnique({
      where,
      select: chatMessageSelect,
    });
    if (prior) {
      checkRetry(prior);
      return { message: serializeMessage(prior), created: false };
    }
    if (
      await this.isBlocked(
        this.prisma,
        preflight.firstUserId,
        preflight.secondUserId,
      )
    )
      throw new ForbiddenException('Messaging is unavailable');
    const requireReply = async (db: Prisma.TransactionClient) => {
      if (
        dto.replyToId &&
        !(await db.chatMessage.findFirst({
          where: { id: dto.replyToId, conversationId },
          select: { id: true },
        }))
      )
        throw new NotFoundException(
          'Quoted message not found in this conversation',
        );
    };
    await requireReply(this.prisma);
    const previews: PublicBookPreview[] = [];
    for (const ref of intent.refs) {
      try {
        previews.push(await this.books.preview(ref));
      } catch (error) {
        if (intent.explicit.has(`${ref.provider}:${ref.id}`)) throw error;
      }
    }
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const conversation = await tx.chatConversation.findFirst({
        where: { id: conversationId, ...this.memberWhere(userId) },
        select: { id: true, firstUserId: true, secondUserId: true },
      });
      if (!conversation) throw new NotFoundException('Conversation not found');
      const participants = [
        conversation.firstUserId,
        conversation.secondUserId,
      ];
      const existing = await tx.chatMessage.findUnique({
        where,
        select: chatMessageSelect,
      });
      if (existing) {
        checkRetry(existing);
        return { message: existing, created: false, participants };
      }
      if (
        await this.isBlocked(
          tx,
          conversation.firstUserId,
          conversation.secondUserId,
        )
      )
        throw new ForbiddenException('Messaging is unavailable');
      await requireReply(tx);
      const updated = await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastSequence: { increment: 1 } },
        select: { lastSequence: true },
      });
      const message = await tx.chatMessage.create({
        data: {
          conversationId,
          senderId: userId,
          sequence: updated.lastSequence,
          clientMessageId: dto.clientMessageId,
          content: dto.content,
          spoiler: dto.spoiler ?? false,
          replyToId: dto.replyToId,
          quote: dto.quote
            ? {
                text: dto.quote.text,
                attribution: dto.quote.attribution ?? null,
              }
            : Prisma.DbNull,
          bookReferences: intent.refs.map((ref) => ({ ...ref })),
          bookPreviews: previews.map((preview) => ({ ...preview })),
        },
        select: chatMessageSelect,
      });
      return { message, created: true, participants };
    });
    if (result.created)
      this.realtime.publish(
        result.participants,
        serializeMessage(result.message),
      );
    return {
      message: serializeMessage(result.message),
      created: result.created,
    };
  }
}
