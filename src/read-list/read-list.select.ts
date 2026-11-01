import type { Prisma } from '../generated/prisma/client';

// Shared lists expose catalog metadata, never files, locations, or reading activity.
export const listBookSelect = {
  id: true,
  title: true,
  description: true,
  author: true,
  isbn: true,
  type: true,
  publishedAt: true,
  coverUrl: true,
  totalPages: true,
  averageRating: true,
  ratingsCount: true,
} satisfies Prisma.BookSelect;

export const listItemSelect = {
  id: true,
  readListId: true,
  bookId: true,
  position: true,
  note: true,
  addedAt: true,
  addedBy: { select: { id: true, username: true } },
  book: { select: listBookSelect },
  catalogProvider: true,
  catalogId: true,
  catalogPreview: true,
} satisfies Prisma.ReadListBookSelect;

export const listSummarySelect = {
  id: true,
  userId: true,
  title: true,
  description: true,
  coverUrl: true,
  visibility: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, username: true } },
  _count: { select: { items: true, saves: true, collaborators: true } },
} satisfies Prisma.ReadListSelect;
