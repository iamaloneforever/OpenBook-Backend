import {
  INestApplication,
  ValidationPipe,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from 'vitest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// The app reads these directly from the environment. Provide test-only values
// so the module boots even when no .env file is present. DATABASE_URL is the
// only real requirement; without it the suite is skipped below.
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret';

const hasDatabase = !!process.env.DATABASE_URL;

describe.skipIf(!hasDatabase)('Reading streak (e2e, real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: any;
  let dbUnreachable = false;

  const createdUsernames: string[] = [];
  const password = 'password123';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      // The /user endpoint is guarded by the CacheInterceptor (6s TTL); a
      // no-op pass-through keeps every stats read fresh and deterministic.
      .overrideInterceptor(CacheInterceptor)
      .useValue({
        intercept: (_: ExecutionContext, next: CallHandler) => next.handle(),
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Sweep leftovers from previously killed runs (older than 10 minutes, so
    // a concurrently running suite is never affected).
    await prisma.user
      .deleteMany({
        where: {
          username: { startsWith: 'e2e_streak_' },
          createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
      })
      .catch(() => {});

    // Probe with a real query (not $connect, which may not force a
    // connection with the pg adapter) so an unreachable DB skips cleanly
    // instead of failing mid-test with a confusing connection error.
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbUnreachable = true;
    }
  });

  afterAll(async () => {
    if (prisma) {
      // Cascade deletes the user's books, progress and reading stats.
      await prisma.user
        .deleteMany({
          where: { username: { in: createdUsernames } },
        })
        .catch(() => {});
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  /** Marks the current test as skipped and returns true when the DB is down. */
  const skipIfDbDown = (ctx: TestContext): boolean => {
    if (dbUnreachable) {
      ctx.skip();
      return true;
    }
    return false;
  };

  /** Creates a unique user via the real auth endpoint and returns auth details. */
  const signup = async () => {
    const username = `e2e_streak_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    createdUsernames.push(username);

    const res = await request(server)
      .post('/auth/signup')
      .send({ username, password })
      .expect(201);

    return {
      userId: res.body.user.id as string,
      token: res.body.accessToken as string,
    };
  };

  /** Creates a real physical book owned by the user. */
  const createBook = (token: string) =>
    request(server)
      .post('/book')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `E2E Streak Book ${Date.now()}`,
        author: 'E2E Tester',
        type: 'PHYSICAL',
        physicalBook: {
          address: 'Test Street 1',
          city: 'Berlin',
          country: 'Germany',
        },
      })
      .expect(201);

  const setProgress = (bookId: string, token: string, body: object) =>
    request(server)
      .post(`/book/${bookId}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

  /** Reads the user's stats through the real HTTP endpoint (uncached). */
  const readStats = async (token: string) => {
    const res = await request(server)
      .get('/user')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body;
  };

  /**
   * Simulates "the user last read N days ago". updateStreak compares the
   * stored lastReadDate against today at midnight, so any clock time on the
   * target day is equivalent — a fixed 12:00 avoids the tiny window where
   * `Date.now() - N*24h` could drift across a midnight boundary and make a
   * consecutive day look like a two-day gap.
   */
  const backdateLastRead = (userId: string, daysAgo: number) => {
    const lastRead = new Date();
    lastRead.setDate(lastRead.getDate() - daysAgo);
    lastRead.setHours(12, 0, 0, 0);
    return prisma.readingStats.update({
      where: { userId },
      data: { lastReadDate: lastRead },
    });
  };

  it('grows the streak on consecutive days and resets it after a break', async (ctx) => {
    if (skipIfDbDown(ctx)) return;

    const { userId, token } = await signup();
    const created = await createBook(token);
    const bookId = created.body.id;

    // Day 1 — first read ever → streak starts at 1
    await setProgress(bookId, token, { currentPage: 50, totalPages: 300 });
    let stats = await readStats(token);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);

    // Day 2 — last read was "yesterday" → streak increments to 2
    await backdateLastRead(userId, 1);
    await setProgress(bookId, token, { currentPage: 150, totalPages: 300 });
    stats = await readStats(token);
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(2);

    // Day 3 — finishes the book → streak 3 and completion totals computed
    await backdateLastRead(userId, 1);
    await setProgress(bookId, token, { currentPage: 300, totalPages: 300 });
    stats = await readStats(token);
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
    expect(stats.totalBooksCompleted).toBe(1);
    expect(stats.totalPagesRead).toBe(300);

    // Skipped two days → streak breaks back to 1, longest streak is kept
    await backdateLastRead(userId, 3);
    await setProgress(bookId, token, { currentPage: 300, totalPages: 300 });
    stats = await readStats(token);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(3);
  });

  it('does not inflate the streak with multiple reads on the same day', async (ctx) => {
    if (skipIfDbDown(ctx)) return;

    const { token } = await signup();
    const created = await createBook(token);
    const bookId = created.body.id;

    await setProgress(bookId, token, { currentPage: 50, totalPages: 300 });
    await setProgress(bookId, token, { currentPage: 100, totalPages: 300 });
    await setProgress(bookId, token, { currentPage: 150, totalPages: 300 });

    const stats = await readStats(token);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
  });

  it('counts a book completed on the very first read', async (ctx) => {
    if (skipIfDbDown(ctx)) return;

    const { token } = await signup();
    const created = await createBook(token);
    const bookId = created.body.id;

    await setProgress(bookId, token, { currentPage: 300, totalPages: 300 });

    const stats = await readStats(token);
    expect(stats.currentStreak).toBe(1);
    expect(stats.totalBooksCompleted).toBe(1);
    expect(stats.totalPagesRead).toBe(300);
  });
});
