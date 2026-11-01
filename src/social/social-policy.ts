import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { SocialDb } from './social.select';

export function visibleProfileWhere(
  viewerId?: string,
): Prisma.SocialProfileWhereInput {
  return {
    isPublic: true,
    ...(viewerId
      ? {
          AND: [
            { blockedBy: { none: { blockerId: viewerId } } },
            { blocking: { none: { blockedId: viewerId } } },
          ],
        }
      : {}),
  };
}

export function visiblePostWhere(
  viewerId?: string,
): Prisma.SocialPostWhereInput {
  const author = visibleProfileWhere(viewerId);
  return {
    author,
    OR: [{ parentId: null }, { parent: { author } }],
  };
}

export async function requireSocialProfile(db: SocialDb, userId: string) {
  const profile = await db.socialProfile.findUnique({ where: { userId } });
  if (!profile?.isPublic)
    throw new ForbiddenException('Enable your public social profile first');
  return profile;
}

export async function requireVisibleProfile(
  db: SocialDb,
  handle: string,
  viewerId?: string,
) {
  const profile = await db.socialProfile.findFirst({
    where: { handle, ...visibleProfileWhere(viewerId) },
    select: { userId: true, handle: true, displayName: true },
  });
  if (!profile) throw new NotFoundException('Social profile not found');
  return profile;
}

export async function requireVisiblePost(
  db: SocialDb,
  id: string,
  viewerId?: string,
) {
  const post = await db.socialPost.findFirst({
    where: { id, ...visiblePostWhere(viewerId) },
    select: { id: true, parentId: true },
  });
  if (!post) throw new NotFoundException('Post not found');
  return post;
}
