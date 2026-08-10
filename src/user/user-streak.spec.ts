import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BookReadingStatus } from '../generated/prisma/client';
import { BookService } from '../book/book.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from './user.service';

type StatsRow = {
  userId: string;
  totalBooksCompleted: number;
  totalPagesRead: number;
  totalReadingTime: number;
  averageRating: number;
  currentStreak: number;
  longestStreak: number;
  lastReadDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A tiny in-memory Prisma that implements only what `BookService.setProgress`,
 * `UserService.updateStreak` and `UserService.updateStatsOnCompletion` use.
 * Shared state lets a test simulate real reads across days.
 */
function createInMemoryPrisma() {
  const progressStore: Array<Record<string, unknown>> = [];
  let statsStore: StatsRow | null = null;

  const bookStore: Record<string, { id: string; title: string; totalPages: number }> = {
    'book-1': { id: 'book-1', title: 'Clean Code', totalPages: 300 },
    'book-2': { id: 'book-2', title: 'Pragmatic Programmer', totalPages: 200 },
  };

  const findProgressIndex = (userId: string, bookId: string) =>
    progressStore.findIndex((p) => p.userId === userId && p.bookId === bookId);

  const tx = {
    book: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        bookStore[where.id] ? { ...bookStore[where.id] } : null,
      ),
    },
    bookProgress: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { userId_bookId: { userId: string; bookId: string } };
        }) => {
          const row =
            progressStore[
              findProgressIndex(
                where.userId_bookId.userId,
                where.userId_bookId.bookId,
              )
            ];
          return row ? { ...row } : null;
        },
      ),
      upsert: vi.fn(async (args: any) => {
        const { where, update, create } = args;
        const idx = findProgressIndex(
          where.userId_bookId.userId,
          where.userId_bookId.bookId,
        );
        if (idx >= 0) {
          progressStore[idx] = { ...progressStore[idx], ...update };
          return { ...progressStore[idx] };
        }
        progressStore.push({ ...create });
        return { ...create };
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(tx) : arg,
    ),
    book: tx.book,
    bookProgress: {
      ...tx.bookProgress,
      // Only `updateStatsOnCompletion` calls findMany on bookProgress, so the
      // call count below doubles as "how many times completion stats ran".
      findMany: vi.fn(async ({ where }: { where: Record<string, string> }) =>
        progressStore
          .filter((p) => p.userId === where.userId && p.status === where.status)
          .map((p) => ({ ...p, book: { ratings: [] } })),
      ),
    },
    readingStats: {
      findUnique: vi.fn(async () => (statsStore ? { ...statsStore } : null)),
      create: vi.fn(async ({ data }: { data: { userId: string } }) => {
        if (!statsStore) {
          statsStore = {
            userId: data.userId,
            totalBooksCompleted: 0,
            totalPagesRead: 0,
            totalReadingTime: 0,
            averageRating: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastReadDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return { ...statsStore };
      }),
      upsert: vi.fn(async (args: any) => {
        const { update, create } = args;
        if (!statsStore) {
          statsStore = {
            userId: create.userId,
            totalBooksCompleted: 0,
            totalPagesRead: 0,
            totalReadingTime: 0,
            averageRating: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastReadDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
        } else {
          statsStore = { ...statsStore, ...update };
        }
        return { ...statsStore };
      }),
    },
  };

  return {
    prisma,
    stats: (): StatsRow | null => (statsStore ? { ...statsStore } : null),
  };
}

describe('Reading streak', () => {
  let bookService: BookService;
  let fakePrisma: ReturnType<typeof createInMemoryPrisma>;

  beforeEach(async () => {
    vi.useFakeTimers();

    fakePrisma = createInMemoryPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookService,
        { provide: PrismaService, useValue: fakePrisma.prisma },
        UserService,
      ],
    })
      .setLogger({
        log: () => {},
        error: () => {},
        warn: () => {},
        debug: () => {},
        verbose: () => {},
      })
      .compile();

    bookService = module.get<BookService>(BookService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // BookService.setProgress(bookId, userId, data)
  const read = (
    bookId: string,
    currentPage: number,
    totalPages: number,
    status?: BookReadingStatus,
  ) =>
    bookService.setProgress(bookId, 'user-1', {
      currentPage,
      totalPages,
      ...(status ? { status } : {}),
    });

  it('increments the streak on consecutive reading days (1 → 2 → 3)', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    await read('book-1', 50, 300);
    expect(fakePrisma.stats()?.currentStreak).toBe(1);
    expect(fakePrisma.stats()?.lastReadDate).toEqual(
      new Date('2026-08-01T12:00:00'),
    );

    vi.setSystemTime(new Date('2026-08-02T09:00:00'));
    await read('book-1', 150, 300);
    expect(fakePrisma.stats()?.currentStreak).toBe(2);

    vi.setSystemTime(new Date('2026-08-03T18:00:00'));
    await read('book-1', 300, 300); // completes the book
    expect(fakePrisma.stats()?.currentStreak).toBe(3);
    expect(fakePrisma.stats()?.longestStreak).toBe(3);
    expect(fakePrisma.stats()?.lastReadDate).toEqual(
      new Date('2026-08-03T18:00:00'),
    );
  });

  it('does not inflate the streak with multiple reads on the same day', async () => {
    vi.setSystemTime(new Date('2026-08-01T08:00:00'));
    await read('book-1', 50, 300);
    await read('book-1', 100, 300);
    await read('book-1', 150, 300);

    expect(fakePrisma.stats()?.currentStreak).toBe(1);
    expect(fakePrisma.stats()?.longestStreak).toBe(1);
    // Idempotent: the second and third reads must not rewrite lastReadDate.
    expect(fakePrisma.stats()?.lastReadDate).toEqual(
      new Date('2026-08-01T08:00:00'),
    );
  });

  it('recomputes completion stats only when a book is actually completed', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    await read('book-1', 50, 300);
    expect(fakePrisma.stats()?.totalBooksCompleted).toBe(0);
    // No completion yet → updateStatsOnCompletion must not have run.
    expect(fakePrisma.prisma.bookProgress.findMany).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-08-02T12:00:00'));
    await read('book-1', 300, 300);

    expect(fakePrisma.stats()?.totalBooksCompleted).toBe(1);
    expect(fakePrisma.stats()?.totalPagesRead).toBe(300);
    expect(fakePrisma.prisma.bookProgress.findMany).toHaveBeenCalledTimes(1);
  });

  it('completing a book on the very first read still starts the streak at 1', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    await read('book-1', 300, 300); // completed on day 1

    expect(fakePrisma.stats()?.currentStreak).toBe(1);
    expect(fakePrisma.stats()?.totalBooksCompleted).toBe(1);
    expect(fakePrisma.stats()?.totalPagesRead).toBe(300);
  });

  it('counts an explicit COMPLETED status even before the last page', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    await read('book-1', 100, 300, BookReadingStatus.COMPLETED);

    expect(fakePrisma.stats()?.currentStreak).toBe(1);
    expect(fakePrisma.stats()?.totalBooksCompleted).toBe(1);
  });

  it('updating an already-completed book keeps the streak and skips recompute', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    await read('book-1', 300, 300); // complete → stats computed once
    expect(fakePrisma.stats()?.currentStreak).toBe(1);

    // Same day, update the completed book again (e.g. re-sync progress)
    await read('book-1', 300, 300);

    expect(fakePrisma.stats()?.currentStreak).toBe(1);
    expect(fakePrisma.stats()?.totalBooksCompleted).toBe(1);
    // updateStatsOnCompletion must not re-run for an already-completed book.
    expect(fakePrisma.prisma.bookProgress.findMany).toHaveBeenCalledTimes(1);
  });

  it('resets the streak to 1 after a day is skipped, keeping the longest streak', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    await read('book-1', 50, 300); // day 1 → streak 1

    vi.setSystemTime(new Date('2026-08-02T12:00:00'));
    await read('book-1', 150, 300); // day 2 → streak 2

    vi.setSystemTime(new Date('2026-08-03T12:00:00'));
    await read('book-1', 250, 300); // day 3 → streak 3

    // Aug 4 skipped — no reading happened
    vi.setSystemTime(new Date('2026-08-05T12:00:00'));
    await read('book-2', 10, 200); // gap of 2 days → streak breaks

    expect(fakePrisma.stats()?.currentStreak).toBe(1);
    expect(fakePrisma.stats()?.longestStreak).toBe(3);
    expect(fakePrisma.stats()?.lastReadDate).toEqual(
      new Date('2026-08-05T12:00:00'),
    );
  });

  it('starts climbing again after a streak reset', async () => {
    vi.setSystemTime(new Date('2026-08-01T12:00:00'));
    await read('book-1', 50, 300); // day 1 → 1

    vi.setSystemTime(new Date('2026-08-05T12:00:00'));
    await read('book-1', 100, 300); // gap → reset to 1

    vi.setSystemTime(new Date('2026-08-06T12:00:00'));
    await read('book-1', 150, 300); // day 2 → 2

    expect(fakePrisma.stats()?.currentStreak).toBe(2);
    expect(fakePrisma.stats()?.longestStreak).toBe(2);
  });
});
