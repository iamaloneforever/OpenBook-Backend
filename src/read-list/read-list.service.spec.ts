import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { PublicBooksService } from '../chat/books/public-books.service';
import type { ChatRateLimitService } from '../chat/chat-rate-limit.service';
import { CatalogProvider } from '../chat/books/catalog.dto';
import { ReadListService } from './read-list.service';

describe('reading list security boundaries', () => {
  const prisma = {
    readList: { findUnique: vi.fn(), create: vi.fn() },
    socialBlock: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  const catalog = { preview: vi.fn() };
  const limits = { consume: vi.fn() };
  const service = new ReadListService(
    prisma as unknown as PrismaService,
    catalog as unknown as PublicBooksService,
    limits as unknown as ChatRateLimitService,
  );
  const entry = {
    catalogBook: { provider: CatalogProvider.OPEN_LIBRARY, id: 'OL1W' },
  };
  const owner = {
    id: 'list',
    userId: 'owner',
    visibility: 'PRIVATE',
    revision: 3,
    collaborators: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    prisma.socialBlock.count.mockResolvedValue(0);
    prisma.readList.findUnique.mockResolvedValue(owner);
  });

  it('rejects a private-list outsider before public provider IO', async () => {
    await expect(service.addItem('list', 'outsider', entry)).rejects.toThrow(
      NotFoundException,
    );
    expect(catalog.preview).not.toHaveBeenCalled();
  });
  it('does not let a viewer curate the list', async () => {
    prisma.readList.findUnique.mockResolvedValue({
      ...owner,
      collaborators: [{ role: 'VIEWER' }],
    });
    await expect(service.addItem('list', 'viewer', entry)).rejects.toThrow(
      ForbiddenException,
    );
    expect(catalog.preview).not.toHaveBeenCalled();
  });
  it('blocks a public-list peer before public provider IO', async () => {
    prisma.readList.findUnique.mockResolvedValue({
      ...owner,
      visibility: 'PUBLIC',
    });
    prisma.socialBlock.count.mockResolvedValue(1);
    await expect(service.addItem('list', 'blocked', entry)).rejects.toThrow(
      NotFoundException,
    );
    expect(catalog.preview).not.toHaveBeenCalled();
  });
  it('detects stale edits before contacting a catalog', async () => {
    await expect(
      service.addItem('list', 'owner', { ...entry, expectedRevision: 2 }),
    ).rejects.toThrow(ConflictException);
    expect(catalog.preview).not.toHaveBeenCalled();
  });
  it.each([{}, { bookId: 'book', ...entry }])(
    'rejects missing or ambiguous entry sources: %j',
    async (dto) => {
      await expect(service.addItem('list', 'owner', dto)).rejects.toThrow(
        'Provide exactly one',
      );
      expect(catalog.preview).not.toHaveBeenCalled();
    },
  );
  it('rejects malformed provider identities before external IO', async () => {
    await expect(
      service.addItem('list', 'owner', {
        catalogBook: {
          provider: CatalogProvider.OPEN_LIBRARY,
          id: '../../internal',
        },
      }),
    ).rejects.toThrow('Invalid public book');
    expect(catalog.preview).not.toHaveBeenCalled();
  });
  it('does not persist an entry on provider failure', async () => {
    catalog.preview.mockRejectedValue(new BadGatewayException());
    await expect(service.addItem('list', 'owner', entry)).rejects.toThrow(
      BadGatewayException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rechecks authorization after an external lookup completes', async () => {
    prisma.readList.findUnique
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce(null);
    catalog.preview.mockResolvedValue({
      provider: 'openlibrary',
      id: 'OL1W',
      title: 'Public book',
    });
    await expect(service.addItem('list', 'owner', entry)).rejects.toThrow(
      NotFoundException,
    );
    expect(catalog.preview).toHaveBeenCalledTimes(1);
  });
  it('maps duplicate titles to a safe conflict', async () => {
    prisma.readList.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('PRIVATE SQL DETAIL', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.createList('owner', { title: 'Existing' }),
    ).rejects.toThrow(ConflictException);
  });
  it('preserves unexpected errors for normal server error handling', async () => {
    const failure = new Error('database offline');
    prisma.readList.create.mockRejectedValue(failure);
    await expect(service.createList('owner', { title: 'Test' })).rejects.toBe(
      failure,
    );
  });
});
