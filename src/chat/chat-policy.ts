import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export const chatMemberWhere = (
  userId: string,
): Prisma.ChatConversationWhereInput => ({
  OR: [{ firstUserId: userId }, { secondUserId: userId }],
});

export async function chatBlocked(
  db: Prisma.TransactionClient,
  first: string,
  second: string,
) {
  return (
    (await db.socialBlock.count({
      where: {
        OR: [
          { blockerId: first, blockedId: second },
          { blockerId: second, blockedId: first },
        ],
      },
    })) > 0
  );
}

export async function chatPeer(
  db: Prisma.TransactionClient,
  userId: string,
  conversationId: string,
) {
  const conversation = await db.chatConversation.findFirst({
    where: { id: conversationId, ...chatMemberWhere(userId) },
    select: { firstUserId: true, secondUserId: true },
  });
  if (!conversation) throw new NotFoundException('Conversation not found');
  return conversation.firstUserId === userId
    ? conversation.secondUserId
    : conversation.firstUserId;
}
