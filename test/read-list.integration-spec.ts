import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { BadGatewayException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReadListModule } from '../src/read-list/read-list.module';
import { PublicBooksService } from '../src/chat/books/public-books.service';
import { CatalogProvider } from '../src/chat/books/catalog.dto';
import type {
  BookReference,
  PublicBookPreview,
} from '../src/chat/books/catalog.types';
import { configureHttp } from '../src/common/config/http.config';

interface Actor {
  id: string;
  token: string;
  bookId: string;
}
interface Item {
  id: string;
  position: number;
  bookId: string | null;
  note: string | null;
  catalogPreview: PublicBookPreview | null;
  revision: number;
}
interface List {
  id: string;
  title: string;
  revision: number;
  visibility: string;
  items: Item[];
  stats: { totalBooks: number };
  savedByMe: boolean;
  _count: { items: number; saves: number; collaborators: number };
  role: string;
}
interface Page<T> {
  data: T[];
  meta: { total: number };
  revision: number;
}
const secret = 'read-list-integration-access-secret-at-least-32-characters';
const jwt = new JwtService({ secret });
const catalog = {
  preview: vi.fn<(reference: BookReference) => Promise<PublicBookPreview>>(),
};

describe('playlist-style reading lists with PostgreSQL and authenticated HTTP', () => {
  let app: NestExpressApplication;
  let server: Server;
  let db: PrismaClient;
  let alice: Actor;
  let bob: Actor;
  let carol: Actor;
  let actors: Actor[] = [];

  beforeAll(async () => {
    const url = process.env.READ_LIST_TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/openbook_read_list_test')
      throw new Error(
        'READ_LIST_TEST_DATABASE_URL must point to the dedicated migrated openbook_read_list_test database',
      );
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await db.$connect();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule,
        ReadListModule,
      ],
      providers: [JwtStrategy],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({ JWT_ACCESS_SECRET: secret, CHAT_REDIS_URL: '' }),
      )
      .overrideProvider(PublicBooksService)
      .useValue(catalog)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureHttp(app);
    await app.init();
    server = app.getHttpServer();
  });
  beforeEach(async () => {
    catalog.preview.mockReset().mockImplementation((reference) =>
      Promise.resolve({
        provider: reference.provider,
        id: reference.id,
        title: 'A public catalog book',
        authors: ['Catalog Author'],
        description: 'Public metadata',
        publishedYear: 2000,
        isbn: null,
        url: `https://openlibrary.org/works/${reference.id}`,
        coverUrl: null,
        previewUrl: null,
      }),
    );
    actors = [];
    for (let index = 0; index < 3; index++) {
      const user = await db.user.create({
        data: {
          username: `list-test-${randomUUID()}`,
          password: 'PRIVATE_HASH',
          refreshToken: 'PRIVATE_REFRESH',
        },
      });
      const book = await db.book.create({
        data: {
          ownerId: user.id,
          title: `Book ${index}`,
          author: 'Author',
          totalPages: 300,
          digitalBook: {
            create: {
              url: 'https://private.example/SECRET',
              filePath: 'PRIVATE_STORAGE_PATH',
            },
          },
          physicalBook: {
            create: {
              address: 'PRIVATE_ADDRESS',
              city: 'PRIVATE_CITY',
              country: 'PRIVATE_COUNTRY',
            },
          },
        },
      });
      actors.push({
        id: user.id,
        bookId: book.id,
        token: jwt.sign({ sub: user.id }, { expiresIn: '15m' }),
      });
    }
    [alice, bob, carol] = actors;
  });
  afterEach(async () => {
    await db.user.deleteMany({
      where: { id: { in: actors.map((a) => a.id) } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  const api = (actor = alice) => ({
    get: (path: string) =>
      request(server).get(path).auth(actor.token, { type: 'bearer' }),
    post: (path: string) =>
      request(server).post(path).auth(actor.token, { type: 'bearer' }),
    patch: (path: string) =>
      request(server).patch(path).auth(actor.token, { type: 'bearer' }),
    delete: (path: string) =>
      request(server).delete(path).auth(actor.token, { type: 'bearer' }),
  });
  async function create(
    visibility = 'PRIVATE',
    actor = alice,
    title = 'Reading soundtrack',
  ) {
    const res = await api(actor)
      .post('/read-list')
      .send({
        title,
        description: 'Curated reading',
        visibility,
        coverUrl: 'https://covers.example/list.jpg',
      })
      .expect(201);
    return res.body as List;
  }
  async function item(list: List, actor = alice) {
    const res = await api(actor)
      .post(`/read-list/${list.id}/books`)
      .send({ bookId: actor.bookId })
      .expect(201);
    return res.body as Item;
  }
  async function grant(list: List, actor = bob, role = 'EDITOR') {
    return api()
      .post(`/read-list/${list.id}/collaborators`)
      .send({ userId: actor.id, role })
      .expect(201);
  }
  async function listData(list: List, actor = alice) {
    return (await api(actor).get(`/read-list/${list.id}`).expect(200))
      .body as List;
  }

  it('requires authentication and validates every nested identifier', async () => {
    await request(server).get('/read-list/discover').expect(401);
    await api().get('/read-list/not-a-cuid/items').expect(400);
    const list = await create();
    await api()
      .patch(`/read-list/${list.id}/items/not-a-cuid`)
      .send({ note: 'x' })
      .expect(400);
    await api().get('/read-list?limit=101').expect(400);
  });
  it('preserves private defaults and rejects empty, null, and untrusted fields', async () => {
    const result = await api()
      .post('/read-list')
      .send({ title: '  Trimmed  ' })
      .expect(201);
    expect(result.body as List).toMatchObject({
      title: 'Trimmed',
      visibility: 'PRIVATE',
      revision: 0,
    });
    for (const body of [
      { title: '   ' },
      { title: null },
      { title: 'X', userId: bob.id },
      { title: 'X', visibility: null },
      { title: 'X', coverUrl: 'javascript:alert(1)' },
    ])
      await api().post('/read-list').send(body).expect(400);
    const list = result.body as List;
    for (const body of [
      { title: null },
      { visibility: null },
      { expectedRevision: null },
    ])
      await api().patch(`/read-list/${list.id}`).send(body).expect(400);
  });
  it('protects private lists for reads, writes, saving, and duplication', async () => {
    const list = await create();
    await api(bob).get(`/read-list/${list.id}`).expect(404);
    await api(bob).get(`/read-list/${list.id}/items`).expect(404);
    await api(bob)
      .patch(`/read-list/${list.id}`)
      .send({ title: 'Hijack' })
      .expect(404);
    await api(bob).delete(`/read-list/${list.id}`).expect(404);
    await api(bob).post(`/read-list/${list.id}/save`).expect(404);
    await api(bob)
      .post(`/read-list/${list.id}/duplicate`)
      .send({ title: 'Copy' })
      .expect(404);
  });
  it('returns a conflict on duplicate owned titles for both create and rename', async () => {
    await create();
    await api()
      .post('/read-list')
      .send({ title: 'Reading soundtrack' })
      .expect(409);
    const second = await create('PRIVATE', alice, 'Second');
    await api()
      .patch(`/read-list/${second.id}`)
      .send({ title: 'Reading soundtrack' })
      .expect(409);
    expect((await listData(second)).title).toBe('Second');
  });
  it('shares only safe book and contributor metadata', async () => {
    const list = await create('PUBLIC');
    await item(list);
    const res = await api(bob).get(`/read-list/${list.id}`).expect(200);
    const body = res.body as List;
    expect(body.stats.totalBooks).toBe(1);
    expect(body.role).toBe('READER');
    expect(res.text).not.toMatch(
      /PRIVATE_|password|refreshToken|filePath|digitalBook|physicalBook|ownerId|progress/,
    );
    await api(bob)
      .post(`/book/${alice.bookId}`)
      .send({ title: 'Hijack' })
      .expect(404);
  });
  it('discovers public lists with search and pagination, excluding unlisted/private lists', async () => {
    const published = await create('PUBLIC');
    await create('UNLISTED', alice, 'Hidden reading');
    await create('PRIVATE', alice, 'Secret reading');
    const res = await api(bob)
      .get('/read-list/discover?q=READING&limit=1')
      .expect(200);
    expect((res.body as Page<List>).data.map((l) => l.id)).toEqual([
      published.id,
    ]);
    expect((res.body as Page<List>).meta.total).toBe(1);
  });
  it('lets a signed-in reader open an unlisted link without listing it publicly', async () => {
    const list = await create('UNLISTED');
    await api(bob).get(`/read-list/${list.id}`).expect(200);
    expect(
      ((await api(bob).get('/read-list/discover')).body as Page<List>).data,
    ).toEqual([]);
    await api(bob)
      .patch(`/read-list/${list.id}`)
      .send({ visibility: 'PUBLIC' })
      .expect(403);
  });
  it('saves idempotently and hides saved lists when access is revoked', async () => {
    const list = await create('PUBLIC');
    await api(bob).post(`/read-list/${list.id}/save`).expect(201);
    await api(bob).post(`/read-list/${list.id}/save`).expect(201);
    expect((await listData(list, bob))._count.saves).toBe(1);
    expect(
      ((await api(bob).get('/read-list?scope=saved')).body as Page<List>).data,
    ).toHaveLength(1);
    await api()
      .patch(`/read-list/${list.id}`)
      .send({ visibility: 'PRIVATE' })
      .expect(200);
    expect(
      ((await api(bob).get('/read-list?scope=saved')).body as Page<List>).data,
    ).toEqual([]);
    await api(bob).delete(`/read-list/${list.id}/save`).expect(200);
    await api(bob).delete(`/read-list/${list.id}/save`).expect(200);
  });
  it('lets viewers read private lists while keeping edits and roster management owner-controlled', async () => {
    const list = await create();
    await grant(list, bob, 'VIEWER');
    expect((await listData(list, bob)).role).toBe('VIEWER');
    await api(bob)
      .post(`/read-list/${list.id}/books`)
      .send({ bookId: bob.bookId })
      .expect(403);
    await api(bob).get(`/read-list/${list.id}/collaborators`).expect(403);
    await api(bob)
      .post(`/read-list/${list.id}/collaborators`)
      .send({ userId: carol.id, role: 'EDITOR' })
      .expect(403);
  });
  it('lets editors curate and reorder while protecting ownership and metadata', async () => {
    const list = await create();
    const first = await item(list);
    await grant(list);
    const second = await item(list, bob);
    await api(bob)
      .patch(`/read-list/${list.id}/items/${second.id}`)
      .send({ note: 'Read together' })
      .expect(200);
    const current = await listData(list, bob);
    await api(bob)
      .patch(`/read-list/${list.id}/items/order`)
      .send({
        itemIds: [second.id, first.id],
        expectedRevision: current.revision,
      })
      .expect(200);
    expect((await listData(list)).items.map((i) => i.id)).toEqual([
      second.id,
      first.id,
    ]);
    await api(bob)
      .patch(`/read-list/${list.id}`)
      .send({ title: 'Hijack' })
      .expect(403);
    await api(bob).delete(`/read-list/${list.id}`).expect(403);
  });
  it('includes owned, saved, and collaborative lists once in the combined library', async () => {
    const list = await create();
    await grant(list);
    await api(bob).post(`/read-list/${list.id}/save`).expect(201);
    const owned = await create('PRIVATE', bob);
    const res = (await api(bob).get('/read-list?scope=all')).body as Page<List>;
    expect(new Set(res.data.map((l) => l.id))).toEqual(
      new Set([list.id, owned.id]),
    );
    expect(res.meta.total).toBe(2);
    expect(
      (
        (await api(bob).get('/read-list?scope=collaborating'))
          .body as Page<List>
      ).meta.total,
    ).toBe(1);
  });
  it('rejects arbitrary private-library IDs even for editors', async () => {
    const list = await create();
    await grant(list);
    await api(bob)
      .post(`/read-list/${list.id}/items`)
      .send({ bookId: alice.bookId })
      .expect(404);
    await api()
      .post(`/read-list/${list.id}/books`)
      .send({ bookId: carol.bookId })
      .expect(404);
  });
  it('persists trusted public catalog snapshots and reuses them in history', async () => {
    const list = await create('PUBLIC');
    const res = await api()
      .post(`/read-list/${list.id}/items`)
      .send({
        catalogBook: { provider: 'openlibrary', id: 'OL1W' },
        note: 'Start here',
      })
      .expect(201);
    const entry = res.body as Item;
    expect(entry.catalogPreview?.title).toBe('A public catalog book');
    expect(entry.bookId).toBeNull();
    catalog.preview.mockRejectedValue(new Error('provider offline'));
    expect((await listData(list, bob)).items[0].catalogPreview?.id).toBe(
      'OL1W',
    );
    expect(catalog.preview).toHaveBeenCalledTimes(1);
    await api()
      .post(`/read-list/${list.id}/items`)
      .send({
        catalogBook: { provider: 'openlibrary', id: 'OL2W', title: 'Forged' },
      })
      .expect(400);
  });
  it('rejects conflicting or missing sources without catalog IO', async () => {
    const list = await create();
    for (const body of [
      {},
      {
        bookId: alice.bookId,
        catalogBook: { provider: 'openlibrary', id: 'OL1W' },
      },
      { catalogBook: { provider: 'openlibrary', id: '../../private' } },
    ])
      await api().post(`/read-list/${list.id}/items`).send(body).expect(400);
    expect(catalog.preview).not.toHaveBeenCalled();
    await api(bob)
      .post(`/read-list/${list.id}/items`)
      .send({ catalogBook: { provider: 'openlibrary', id: 'OL1W' } })
      .expect(404);
    expect(catalog.preview).not.toHaveBeenCalled();
  });
  it('rejects duplicate books and does not increment revision on failed mutations', async () => {
    const list = await create();
    const entry = await item(list);
    await api()
      .post(`/read-list/${list.id}/books`)
      .send({ bookId: alice.bookId })
      .expect(409);
    expect((await listData(list)).revision).toBe(entry.revision);
    await api()
      .post(`/read-list/${list.id}/items`)
      .send({ catalogBook: { provider: 'openlibrary', id: 'OL1W' } })
      .expect(201);
    await api()
      .post(`/read-list/${list.id}/items`)
      .send({ catalogBook: { provider: 'openlibrary', id: 'OL1W' } })
      .expect(409);
  });
  it('rejects stale revisions and preserves all entries on invalid reorder', async () => {
    const list = await create();
    const first = await item(list);
    await api()
      .patch(`/read-list/${list.id}/items/${first.id}`)
      .send({ note: 'Stale', expectedRevision: 0 })
      .expect(409);
    await api()
      .patch(`/read-list/${list.id}/items/order`)
      .send({ itemIds: [], expectedRevision: first.revision })
      .expect(400);
    await api()
      .patch(`/read-list/${list.id}/items/order`)
      .send({ itemIds: [first.id, first.id], expectedRevision: first.revision })
      .expect(400);
    await api()
      .patch(`/read-list/${list.id}/items/order`)
      .send({ itemIds: [first.id] })
      .expect(400);
    expect((await listData(list)).items.map((i) => i.id)).toEqual([first.id]);
  });
  it('serializes concurrent appends with unique ordering positions', async () => {
    const list = await create();
    await grant(list);
    const responses = await Promise.all([
      api().post(`/read-list/${list.id}/books`).send({ bookId: alice.bookId }),
      api(bob).post(`/read-list/${list.id}/books`).send({ bookId: bob.bookId }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect((await listData(list)).items.map((i) => i.position)).toEqual([0, 1]);
  });
  it('allows one concurrent edit at a supplied revision and returns conflict for the other', async () => {
    const list = await create();
    const entry = await item(list);
    const edits = await Promise.all(
      ['One', 'Two'].map((note) =>
        api()
          .patch(`/read-list/${list.id}/items/${entry.id}`)
          .send({ note, expectedRevision: entry.revision }),
      ),
    );
    expect(edits.map((e) => e.status).sort()).toEqual([200, 409]);
  });
  it('paginates and sorts a mixture of library entries and public books', async () => {
    const list = await create();
    const first = await item(list);
    await api()
      .post(`/read-list/${list.id}/items`)
      .send({ catalogBook: { provider: 'openlibrary', id: 'OL1W' } })
      .expect(201);
    const result = (
      await api().get(`/read-list/${list.id}/items?sort=title&limit=1`)
    ).body as Page<Item>;
    expect(result.meta.total).toBe(2);
    expect(result.data[0].catalogPreview?.title).toBe('A public catalog book');
    const page2 = (
      await api().get(`/read-list/${list.id}/items?sort=title&limit=1&page=2`)
    ).body as Page<Item>;
    expect(page2.data[0].id).toBe(first.id);
  });
  it('keeps item changes scoped to the target list', async () => {
    const first = await create();
    const second = await create('PRIVATE', alice, 'Other');
    const entry = await item(first);
    await api()
      .patch(`/read-list/${second.id}/items/${entry.id}`)
      .send({ note: 'Wrong list' })
      .expect(404);
    await api().delete(`/read-list/${second.id}/items/${entry.id}`).expect(404);
    await api()
      .delete(`/read-list/${first.id}/books/${alice.bookId}`)
      .expect(200);
    expect((await listData(first)).items).toEqual([]);
  });
  it('duplicates visible lists privately without copying collaborators or saves', async () => {
    const list = await create('PUBLIC');
    await item(list);
    await grant(list);
    await api(bob).post(`/read-list/${list.id}/save`).expect(201);
    await api()
      .post(`/read-list/${list.id}/items`)
      .send({
        catalogBook: { provider: 'openlibrary', id: 'OL1W' },
        note: 'Copied note',
      })
      .expect(201);
    const copy = (
      await api(bob)
        .post(`/read-list/${list.id}/duplicate`)
        .send({ title: 'My copy' })
        .expect(201)
    ).body as List;
    expect(copy).toMatchObject({
      visibility: 'PRIVATE',
      revision: 0,
      _count: { items: 2, saves: 0, collaborators: 0 },
    });
    const data = await listData(copy, bob);
    expect(data.items[1].note).toBe('Copied note');
    expect(data.items[0].id).not.toBe((await listData(list)).items[0].id);
    await api().get(`/read-list/${copy.id}`).expect(404);
  });
  it('lets an owner revoke collaborators and a collaborator leave', async () => {
    const list = await create();
    await grant(list);
    await api()
      .delete(`/read-list/${list.id}/collaborators/${bob.id}`)
      .expect(200);
    await api(bob).get(`/read-list/${list.id}`).expect(404);
    await grant(list);
    await api(bob)
      .delete(`/read-list/${list.id}/collaborators/${bob.id}`)
      .expect(200);
    await api(bob).get(`/read-list/${list.id}`).expect(404);
    await api()
      .post(`/read-list/${list.id}/collaborators`)
      .send({ userId: alice.id, role: 'EDITOR' })
      .expect(400);
  });
  it.each([true, false])(
    'honors blocks in either direction, including saved and collaborative lists: %s',
    async (forward) => {
      const list = await create('PUBLIC');
      await grant(list);
      await api(bob).post(`/read-list/${list.id}/save`).expect(201);
      for (const actor of [alice, bob])
        await db.socialProfile.create({
          data: {
            userId: actor.id,
            handle: `list${actor.id}`,
            displayName: 'Reader',
          },
        });
      await db.socialBlock.create({
        data: {
          blockerId: forward ? alice.id : bob.id,
          blockedId: forward ? bob.id : alice.id,
        },
      });
      await api(bob).get(`/read-list/${list.id}`).expect(404);
      await api(bob)
        .post(`/read-list/${list.id}/books`)
        .send({ bookId: bob.bookId })
        .expect(404);
      expect(
        ((await api(bob).get('/read-list/discover')).body as Page<List>).data,
      ).toEqual([]);
      expect(
        ((await api(bob).get('/read-list?scope=all')).body as Page<List>).data,
      ).toEqual([]);
      await api(bob)
        .delete(`/read-list/${list.id}/collaborators/${bob.id}`)
        .expect(200);
      await api(bob).delete(`/read-list/${list.id}/save`).expect(200);
    },
  );
  it('enforces the entry limit and returns bounded embedded item pages', async () => {
    const list = await create();
    await db.readListBook.createMany({
      data: Array.from({ length: 500 }, (_, position) => ({
        readListId: list.id,
        catalogProvider: CatalogProvider.OPEN_LIBRARY,
        catalogId: `OL${position + 1}W`,
        catalogPreview: { title: 'Bulk public fixture' },
        position,
      })),
    });
    await api()
      .post(`/read-list/${list.id}/books`)
      .send({ bookId: alice.bookId })
      .expect(409);
    const data = await listData(list);
    expect(data.items).toHaveLength(100);
    expect(data.stats.totalBooks).toBe(500);
    const page = (
      await api().get(`/read-list/${list.id}/items?page=5&limit=100`)
    ).body as Page<Item>;
    expect(page.data).toHaveLength(100);
  });
  it('cascades playlist membership and saves when deleting a list', async () => {
    const list = await create('PUBLIC');
    await grant(list);
    await item(list);
    await api(bob).post(`/read-list/${list.id}/save`).expect(201);
    await api().delete(`/read-list/${list.id}`).expect(200);
    expect(
      await db.readListBook.count({ where: { readListId: list.id } }),
    ).toBe(0);
    expect(
      await db.readListSave.count({ where: { readListId: list.id } }),
    ).toBe(0);
    expect(
      await db.readListCollaborator.count({ where: { readListId: list.id } }),
    ).toBe(0);
  });

  it('supports a full 500-entry reorder without transient unique-position collisions', async () => {
    const list = await create();
    await db.readListBook.createMany({
      data: Array.from({ length: 500 }, (_, position) => ({
        readListId: list.id,
        catalogProvider: 'openlibrary',
        catalogId: `OL${position + 1}W`,
        catalogPreview: { title: 'Bulk' },
        position,
      })),
    });
    const entries = await db.readListBook.findMany({
      where: { readListId: list.id },
      orderBy: { position: 'desc' },
      select: { id: true },
    });
    await api()
      .patch(`/read-list/${list.id}/items/order`)
      .send({ itemIds: entries.map((e) => e.id), expectedRevision: 0 })
      .expect(200);
    const ordered = await db.readListBook.findMany({
      where: { readListId: list.id },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    expect(ordered.map((e) => e.id)).toEqual(entries.map((e) => e.id));
    expect(ordered.map((e) => e.position)).toEqual(
      Array.from({ length: 500 }, (_, i) => i),
    );
  });

  it('downgrades editors immediately and keeps collaborator account fields private', async () => {
    const list = await create();
    await grant(list);
    await grant(list, bob, 'VIEWER');
    await api(bob)
      .post(`/read-list/${list.id}/books`)
      .send({ bookId: bob.bookId })
      .expect(403);
    const roster = await api()
      .get(`/read-list/${list.id}/collaborators`)
      .expect(200);
    expect(roster.text).not.toMatch(/password|refreshToken|PRIVATE_/);
  });

  it('rolls back provider failures without altering the list revision', async () => {
    const list = await create();
    catalog.preview.mockRejectedValue(
      new BadGatewayException('Catalog unavailable'),
    );
    await api()
      .post(`/read-list/${list.id}/items`)
      .send({ catalogBook: { provider: 'openlibrary', id: 'OL1W' } })
      .expect(502);
    expect((await listData(list)).revision).toBe(0);
    expect((await listData(list)).items).toEqual([]);
  });

  it('enforces database source constraints for malformed entries', async () => {
    const list = await create();
    await expect(
      db.readListBook.create({ data: { readListId: list.id, position: 0 } }),
    ).rejects.toThrow();
    await expect(
      db.readListBook.create({
        data: {
          readListId: list.id,
          bookId: alice.bookId,
          catalogProvider: 'google',
          catalogId: 'public',
          catalogPreview: {},
          position: 0,
        },
      }),
    ).rejects.toThrow();
    expect((await listData(list)).items).toEqual([]);
  });
});
