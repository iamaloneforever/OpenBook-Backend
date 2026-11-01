import type { Prisma } from '../generated/prisma/client';

// Never include the related User, its credentials, or private library data.
export const publicProfileSelect = {
  userId: true,
  handle: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  websiteUrl: true,
  createdAt: true,
} satisfies Prisma.SocialProfileSelect;

export const postSelect = {
  id: true,
  content: true,
  tags: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: publicProfileSelect },
} satisfies Prisma.SocialPostSelect;

export type PublicPost = Prisma.SocialPostGetPayload<{
  select: typeof postSelect;
}>;
export type SocialDb = Prisma.TransactionClient;

export function extractTags(content: string): string[] {
  const tags = [
    ...content
      .normalize('NFKC')
      .toLowerCase()
      .matchAll(/(?:^|\s)#([\p{L}\p{N}_]{1,40})(?![\p{L}\p{N}_])/gu),
  ];
  return [...new Set(tags.map((match) => match[1]))].slice(0, 5);
}
