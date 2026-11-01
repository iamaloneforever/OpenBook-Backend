import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { vi } from 'vitest';
import { SafeFeedFetcher } from '../src/social/rss/safe-feed-fetcher';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
} from 'vitest';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SocialModule } from '../src/social/social.module';
import { FeedService } from '../src/social/feed.service';
import { FeedMode } from '../src/social/dto/social.dto';

interface Actor {
  id: string;
  handle: string;
  token: string;
}
interface PostBody {
  id: string;
  content: string;
  author: { userId: string; handle: string };
  likedByMe: boolean;
  likeCount: number;
  replyCount: number;
}
interface FeedBody {
  data: PostBody[];
  nextCursor: string | null;
  mode: string;
}

describe('social API with PostgreSQL and real JWT authentication', () => {
  let app: INestApplication;
  let server: Server;
  let db: PrismaClient;
  let alice: Actor;
  let bob: Actor;
  let carol: Actor;
  let dave: Actor;
  let actors: Actor[] = [];
  const fetcher = { fetch: vi.fn<SafeFeedFetcher['fetch']>() };
  const secret = 'social-integration-access';
  const jwt = new JwtService({ secret });

  beforeAll(async () => {
    const url = process.env.SOCIAL_TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/openbook_social_test') {
      throw new Error(
        'Set SOCIAL_TEST_DATABASE_URL to a migrated, dedicated openbook_social_test PostgreSQL database. Never use a development or production database.',
      );
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await db.$connect();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: secret,
              SOCIAL_PUBLIC_URL: 'https://openbook.example',
            }),
          ],
        }),
        PassportModule,
        SocialModule,
        ThrottlerModule.forRoot([
          { name: 'ip', ttl: 60_000, limit: 1000 },
          { name: 'account', ttl: 60_000, limit: 1000 },
        ]),
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideProvider(SafeFeedFetcher)
      .useValue(fetcher)
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    fetcher.fetch.mockReset();
    actors = [];
    for (const [handle, isPublic] of [
      ['alice', true],
      ['bob', true],
      ['carol', false],
      ['dave', undefined],
    ] as const) {
      const user = await db.user.create({
        data: {
          username: `social-test-${randomUUID()}`,
          password: 'private-password-sentinel',
          refreshToken: 'private-refresh-sentinel',
          ...(isPublic !== undefined
            ? {
                socialProfile: {
                  create: { handle, displayName: handle, isPublic },
                },
              }
            : {}),
        },
      });
      actors.push({
        id: user.id,
        handle,
        token: jwt.sign({ sub: user.id }, { expiresIn: '5m' }),
      });
    }
    [alice, bob, carol, dave] = actors;
  });

  afterEach(async () => {
    if (db && actors.length)
      await db.user.deleteMany({
        where: { id: { in: actors.map((actor) => actor.id) } },
      });
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  const auth = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    actor?: Actor,
  ) =>
    request(server)
      [method](path)
      .set('Authorization', `Bearer ${(actor ?? alice).token}`);
  const seedPost = (
    author: Actor,
    content = 'A public post',
    at = new Date(Date.now() - 1000),
    tags: string[] = [],
  ) =>
    db.socialPost.create({
      data: { authorId: author.id, content, tags, createdAt: at },
    });

  it('rejects missing, invalid, expired, and deleted-user tokens', async () => {
    await request(server).get('/social/feed').expect(401);
    await request(server)
      .get('/social/me')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    await request(server)
      .get('/social/me')
      .set(
        'Authorization',
        `Bearer ${jwt.sign({ sub: alice.id }, { expiresIn: -1 })}`,
      )
      .expect(401);
    await db.user.delete({ where: { id: dave.id } });
    await auth('get', '/social/me', dave).expect(401);
  });

  it('creates a private profile by default and exposes only public fields after opting in', async () => {
    await auth('put', '/social/me', dave)
      .send({ handle: 'DaVe', displayName: ' Dave ' })
      .expect(200);
    await request(server).get('/social/public/profiles/dave').expect(404);
    await auth('post', '/social/posts', dave)
      .send({ content: 'hello' })
      .expect(403);
    const response = await auth('put', '/social/me', dave)
      .send({ handle: 'dave', displayName: 'Dave', isPublic: true })
      .expect(200);
    expect(response.body).toMatchObject({
      handle: 'dave',
      isPublic: true,
      displayName: 'Dave',
    });
    const profile = await request(server)
      .get('/social/public/profiles/dave')
      .expect(200);
    expect(JSON.stringify(profile.body)).not.toMatch(
      /password|refreshToken|private-|personalizeFeed|books/,
    );
    expect(profile.headers['cache-control']).toBe('no-store');
  });

  it('returns null for an account without a social profile and keeps authenticated responses private', async () => {
    const response = await auth('get', '/social/me', dave).expect(200);
    expect(response.body).toEqual({ profile: null });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('normalizes handles and returns a conflict for concurrent claims', async () => {
    const responses = await Promise.all(
      [carol, dave].map((actor) =>
        auth('put', '/social/me', actor).send({
          handle: 'Claimed',
          displayName: 'Claimed',
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(await db.socialProfile.count({ where: { handle: 'claimed' } })).toBe(
      1,
    );
  });

  it('validates inputs and rejects author or credential injection', async () => {
    await auth('post', '/social/posts')
      .send({ content: 'post', authorId: bob.id })
      .expect(400);
    await auth('post', '/social/posts').send({ content: '   ' }).expect(400);
    await auth('post', '/social/posts')
      .send({ content: 'a'.repeat(281) })
      .expect(400);
    await auth('put', '/social/me')
      .send({ handle: 'alice', displayName: 'Alice', password: 'injected' })
      .expect(400);
    await auth('get', '/social/feed?limit=1000').expect(400);
    await auth('get', '/social/feed?mode=unknown').expect(400);
    await auth('get', '/social/posts/not-an-id').expect(400);
  });

  it('publishes short text with normalized hashtags and preserves author ownership', async () => {
    const response = await auth('post', '/social/posts')
      .send({ content: ' Hello #Books #BOOKS #کتاب ' })
      .expect(201);
    const post = response.body as PostBody & { tags: string[] };
    expect(post.content).toBe('Hello #Books #BOOKS #کتاب');
    expect(post.tags).toEqual(['books', 'کتاب']);
    expect(post.author.userId).toBe(alice.id);
    expect(JSON.stringify(post)).not.toMatch(
      /private-password|private-refresh|"user":/,
    );
    await auth('patch', `/social/posts/${post.id}`, bob)
      .send({ content: 'hijacked' })
      .expect(404);
    await auth('delete', `/social/posts/${post.id}`, bob).expect(404);
    await auth('patch', `/social/posts/${post.id}`)
      .send({ content: 'Updated #Code' })
      .expect(200);
    expect(
      await db.socialPost.findUnique({ where: { id: post.id } }),
    ).toMatchObject({ content: 'Updated #Code', tags: ['code'] });
    await auth('delete', `/social/posts/${post.id}`).expect(200);
    await request(server).get(`/social/public/posts/${post.id}`).expect(404);
  });

  it('supports replies and cascades deletion of a thread', async () => {
    const parent = await seedPost(bob);
    const response = await auth('post', '/social/posts')
      .send({ content: 'Reply', parentId: parent.id })
      .expect(201);
    const reply = response.body as PostBody;
    await auth('post', '/social/posts')
      .send({ content: 'Nested', parentId: reply.id })
      .expect(400);
    const replies = await auth(
      'get',
      `/social/posts/${parent.id}/replies`,
    ).expect(200);
    expect((replies.body as FeedBody).data.map((post) => post.id)).toEqual([
      reply.id,
    ]);
    await auth('delete', `/social/posts/${parent.id}`, bob).expect(200);
    expect(
      await db.socialPost.count({
        where: { id: { in: [parent.id, reply.id] } },
      }),
    ).toBe(0);
  });

  it('does not expose replies when the parent author disables their profile', async () => {
    const parent = await seedPost(bob);
    const reply = await db.socialPost.create({
      data: { authorId: alice.id, content: 'Reply', parentId: parent.id },
    });
    await db.socialProfile.update({
      where: { userId: bob.id },
      data: { isPublic: false },
    });
    await auth('get', `/social/posts/${reply.id}`).expect(404);
    await request(server).get(`/social/public/posts/${reply.id}`).expect(404);
    await auth('get', `/social/posts/${parent.id}/replies`).expect(404);
  });

  it('makes follows idempotent under concurrency and counts only visible profiles', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        auth('put', '/social/profiles/bob/follow'),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(
      await db.socialFollow.count({
        where: { followerId: alice.id, followingId: bob.id },
      }),
    ).toBe(1);
    expect((await auth('get', '/social/profiles/bob')).body).toMatchObject({
      counts: { followers: 1 },
      followedByMe: true,
    });
    await db.socialProfile.update({
      where: { userId: alice.id },
      data: { isPublic: false },
    });
    expect(
      (await request(server).get('/social/public/profiles/bob')).body,
    ).toMatchObject({ counts: { followers: 0 } });
    await auth('delete', '/social/profiles/bob/follow').expect(200);
    await auth('delete', '/social/profiles/bob/follow').expect(200);
    await auth('put', '/social/profiles/carol/follow', bob).expect(404);
    await auth('put', '/social/profiles/bob/follow', bob).expect(400);
  });

  it('makes likes idempotent under concurrency without exposing another viewer’s like state', async () => {
    const post = await seedPost(bob);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        auth('put', `/social/posts/${post.id}/like`),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(
      await db.socialLike.count({
        where: { postId: post.id, userId: alice.id },
      }),
    ).toBe(1);
    expect((await auth('get', `/social/posts/${post.id}`)).body).toMatchObject({
      likedByMe: true,
      likeCount: 1,
    });
    expect(
      (await auth('get', `/social/posts/${post.id}`, bob)).body,
    ).toMatchObject({ likedByMe: false });
    expect(
      (await request(server).get(`/social/public/posts/${post.id}`)).body,
    ).toMatchObject({ likedByMe: false });
    await auth('delete', `/social/posts/${post.id}/like`).expect(200);
    await auth('delete', `/social/posts/${post.id}/like`).expect(200);
    expect(await db.socialLike.count({ where: { postId: post.id } })).toBe(0);
  });

  it('applies blocks in both directions to feeds, profiles, posts, replies, and new interactions', async () => {
    const post = await seedPost(bob);
    const parent = await seedPost(alice);
    const reply = await db.socialPost.create({
      data: { authorId: bob.id, content: 'Reply', parentId: parent.id },
    });
    await auth('put', '/social/profiles/bob/follow').expect(200);
    await auth('put', '/social/profiles/alice/follow', bob).expect(200);
    await auth('put', '/social/profiles/bob/block').expect(200);
    expect(await db.socialFollow.count()).toBe(0);
    for (const [actor, target] of [
      [alice, bob],
      [bob, alice],
    ]) {
      await auth('get', `/social/profiles/${target.handle}`, actor).expect(404);
      await auth(
        'put',
        `/social/profiles/${target.handle}/follow`,
        actor,
      ).expect(404);
    }
    await auth('get', `/social/posts/${post.id}`).expect(404);
    await auth('get', `/social/posts/${reply.id}`).expect(404);
    await auth('put', `/social/posts/${post.id}/like`).expect(404);
    await auth('post', `/social/posts/${post.id}/views`).expect(404);
    await auth('post', '/social/posts')
      .send({ content: 'Reply', parentId: post.id })
      .expect(404);
    expect(
      (
        (await auth('get', '/social/feed?mode=recent')).body as FeedBody
      ).data.map((item) => item.id),
    ).toEqual([parent.id]);
    expect(
      (
        (await auth('get', `/social/posts/${parent.id}/replies`))
          .body as FeedBody
      ).data,
    ).toEqual([]);
    const profiles = await auth('get', '/social/profiles?q=bob').expect(200);
    expect(profiles.body).toEqual([]);
    await auth('delete', '/social/profiles/bob/block').expect(200);
    await auth('get', `/social/posts/${post.id}`).expect(200);
    expect(await db.socialFollow.count()).toBe(0);
  });

  it('resolves concurrent blocks and follows without leaving blocked follows', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await db.socialBlock.deleteMany({
        where: { blockerId: alice.id, blockedId: bob.id },
      });
      await db.socialFollow.deleteMany({
        where: { followerId: bob.id, followingId: alice.id },
      });
      const responses = await Promise.all([
        auth('put', '/social/profiles/bob/block'),
        auth('put', '/social/profiles/alice/follow', bob),
      ]);
      expect(responses[0].status).toBe(200);
      expect([200, 404]).toContain(responses[1].status);
      expect(await db.socialFollow.count()).toBe(0);
    }
  });

  it('pages chronological feeds with stable tie breaking and excludes newly inserted posts', async () => {
    const at = new Date(Date.now() - 5000);
    const posts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => seedPost(bob, `post ${i}`, at)),
    );
    const first = (
      await auth('get', '/social/feed?mode=recent&limit=2').expect(200)
    ).body as FeedBody;
    const inserted = await seedPost(bob, 'new', new Date(Date.now() + 1000));
    const second = (
      await auth(
        'get',
        `/social/feed?mode=recent&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
      ).expect(200)
    ).body as FeedBody;
    const third = (
      await auth(
        'get',
        `/social/feed?mode=recent&limit=2&cursor=${encodeURIComponent(second.nextCursor!)}`,
      ).expect(200)
    ).body as FeedBody;
    const ids = [...first.data, ...second.data, ...third.data].map(
      (post) => post.id,
    );
    expect(ids).toEqual(
      posts
        .map((post) => post.id)
        .sort()
        .reverse(),
    );
    expect(ids).not.toContain(inserted.id);
    expect(third.nextCursor).toBeNull();
    await auth(
      'get',
      `/social/feed?mode=recent&cursor=${encodeURIComponent(first.nextCursor!)}`,
      bob,
    ).expect(400);
    await auth(
      'get',
      `/social/feed?mode=following&cursor=${encodeURIComponent(first.nextCursor!)}`,
    ).expect(400);
  });

  it('filters the following feed and isolates profile timelines', async () => {
    const own = await seedPost(alice);
    const followed = await seedPost(bob);
    await seedPost(carol);
    await auth('put', '/social/profiles/bob/follow').expect(200);
    const response = await auth('get', '/social/feed?mode=following').expect(
      200,
    );
    expect(
      new Set((response.body as FeedBody).data.map((post) => post.id)),
    ).toEqual(new Set([own.id, followed.id]));
    const profile = await request(server)
      .get('/social/public/profiles/bob/posts?limit=1')
      .expect(200);
    expect((profile.body as FeedBody).data.map((post) => post.id)).toEqual([
      followed.id,
    ]);
    await request(server)
      .get('/social/public/profiles/carol/posts')
      .expect(404);
  });

  it('uses recent likes to personalize the feed and preserves ranked pagination', async () => {
    const liked = await seedPost(
      bob,
      '#books liked',
      new Date(Date.now() - 20000),
      ['books'],
    );
    const relevant = await seedPost(
      bob,
      '#books relevant',
      new Date(Date.now() - 5000),
      ['books'],
    );
    const neutral = await seedPost(
      alice,
      'neutral',
      new Date(Date.now() - 1000),
    );
    await auth('put', `/social/posts/${liked.id}/like`).expect(200);
    const first = (
      await auth('get', '/social/feed?mode=for-you&limit=1').expect(200)
    ).body as FeedBody;
    expect(first.mode).toBe('for-you');
    expect(first.data[0].id).toBe(relevant.id);
    const next = (
      await auth(
        'get',
        `/social/feed?mode=for-you&limit=50&cursor=${encodeURIComponent(first.nextCursor!)}`,
      ).expect(200)
    ).body as FeedBody;
    expect(
      new Set([...first.data, ...next.data].map((post) => post.id)),
    ).toEqual(new Set([liked.id, relevant.id, neutral.id]));
    expect(next.data.map((post) => post.id)).not.toContain(first.data[0].id);
    expect(next.nextCursor).toBeNull();
  });

  it('uses private reading tags as interests without exposing the private library', async () => {
    const book = await db.book.create({
      data: {
        title: 'PRIVATE_LIBRARY_SENTINEL',
        author: 'PRIVATE_AUTHOR',
        ownerId: alice.id,
        physicalBook: {
          create: {
            address: 'PRIVATE_ADDRESS',
            city: 'PRIVATE_CITY',
            country: 'PRIVATE_COUNTRY',
          },
        },
        tags: {
          create: {
            tag: {
              connectOrCreate: {
                where: { name: 'science' },
                create: { name: 'science' },
              },
            },
          },
        },
        progress: { create: { userId: alice.id, currentPage: 1 } },
      },
    });
    const relevant = await seedPost(
      bob,
      '#science',
      new Date(Date.now() - 5000),
      ['science'],
    );
    await seedPost(alice, 'neutral');
    const response = await auth('get', '/social/feed?mode=for-you').expect(200);
    expect((response.body as FeedBody).data[0].id).toBe(relevant.id);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE_');
    expect(JSON.stringify(response.body)).not.toContain(book.id);
  });

  it('deduplicates views, removes view history on opt-out, and falls back to recent', async () => {
    const post = await seedPost(bob);
    await auth('post', `/social/posts/${post.id}/views`).expect(201);
    await auth('post', `/social/posts/${post.id}/views`).expect(201);
    expect(await db.socialPostView.count({ where: { userId: alice.id } })).toBe(
      1,
    );
    await auth('put', '/social/me')
      .send({ handle: 'alice', displayName: 'Alice', personalizeFeed: false })
      .expect(200);
    expect(await db.socialPostView.count({ where: { userId: alice.id } })).toBe(
      0,
    );
    expect(
      (await auth('post', `/social/posts/${post.id}/views`).expect(201)).body,
    ).toEqual({ recorded: false });
    expect(
      ((await auth('get', '/social/feed?mode=for-you')).body as FeedBody).mode,
    ).toBe('recent');
    expect(
      ((await auth('get', '/social/feed?mode=for-you', dave)).body as FeedBody)
        .mode,
    ).toBe('recent');
  });

  it('rechecks visibility on a ranked cursor after a profile is disabled', async () => {
    await seedPost(alice, 'own');
    await seedPost(bob, 'bob1');
    await seedPost(bob, 'bob2');
    const first = (
      await auth('get', '/social/feed?mode=for-you&limit=1').expect(200)
    ).body as FeedBody;
    expect(first.nextCursor).toBeTruthy();
    await db.socialProfile.update({
      where: { userId: bob.id },
      data: { isPublic: false },
    });
    const next = (
      await auth(
        'get',
        `/social/feed?mode=for-you&cursor=${encodeURIComponent(first.nextCursor!)}`,
      ).expect(200)
    ).body as FeedBody;
    expect(next.data.every((post) => post.author.userId !== bob.id)).toBe(true);
    expect(next.nextCursor).toBeNull();
  });

  it('publishes public RSS with escaped text and trusted canonical URLs', async () => {
    await seedPost(alice, '<script>alert("x")</script> & ]]>');
    await seedPost(carol, 'PRIVATE_RSS_SENTINEL');
    const response = await request(server)
      .get('/social/rss')
      .set('Host', 'attacker.example')
      .expect(200);
    expect(response.headers['content-type']).toContain('application/rss+xml');
    expect(response.text).toContain('<rss version="2.0"');
    expect(response.text).toContain('&amp;lt;script&amp;gt;');
    expect(response.text).not.toContain('<script>');
    expect(response.text).not.toContain('PRIVATE_RSS_SENTINEL');
    expect(response.text).not.toContain('attacker.example');
    expect(response.text).toContain(
      'https://openbook.example/social/public/posts/',
    );
    await request(server).get('/social/rss/profiles/carol').expect(404);
    const profileRss = await request(server)
      .get('/social/rss/profiles/alice')
      .expect(200);
    expect(profileRss.text).toContain('(@alice)');
    await auth('put', '/social/me')
      .send({ handle: 'alice', displayName: 'Alice', isPublic: false })
      .expect(200);
    await request(server).get('/social/rss/profiles/alice').expect(404);
    expect((await request(server).get('/social/rss')).text).not.toContain(
      'alert',
    );
  });

  it('enforces relational invariants and cascades social records on account deletion', async () => {
    await expect(
      db.socialFollow.create({
        data: { followerId: alice.id, followingId: alice.id },
      }),
    ).rejects.toThrow();
    await expect(
      db.socialBlock.create({
        data: { blockerId: alice.id, blockedId: alice.id },
      }),
    ).rejects.toThrow();
    await expect(
      db.socialPost.create({
        data: { authorId: alice.id, content: '', tags: [] },
      }),
    ).rejects.toThrow();
    const post = await seedPost(alice);
    await auth('put', `/social/posts/${post.id}/like`, bob).expect(200);
    await auth('post', `/social/posts/${post.id}/views`, bob).expect(201);
    await auth('put', '/social/profiles/alice/follow', bob).expect(200);
    await db.user.delete({ where: { id: alice.id } });
    expect(await db.socialPost.count({ where: { id: post.id } })).toBe(0);
    expect(await db.socialLike.count({ where: { postId: post.id } })).toBe(0);
    expect(await db.socialPostView.count({ where: { postId: post.id } })).toBe(
      0,
    );
    expect(
      await db.socialFollow.count({ where: { followingId: alice.id } }),
    ).toBe(0);
  });

  it('bounds personalized candidate selection even with a larger timeline', async () => {
    await db.socialPost.createMany({
      data: Array.from({ length: 350 }, (_, i) => ({
        authorId: bob.id,
        content: `bulk ${i}`,
        tags: [],
      })),
    });
    const feed = app.get(FeedService);
    let page = await feed.get(alice.id, { mode: FeedMode.FOR_YOU, limit: 50 });
    const ids = new Set(page.data.map((post) => post.id));
    while (page.nextCursor) {
      page = await feed.get(alice.id, {
        mode: FeedMode.FOR_YOU,
        limit: 50,
        cursor: page.nextCursor,
      });
      page.data.forEach((post) => {
        expect(ids.has(post.id)).toBe(false);
        ids.add(post.id);
      });
    }
    expect(ids.size).toBe(200);
  });
  const externalRss = (items: string, title = 'External news') =>
    `<rss version="2.0"><channel><title>${title}</title>${items}</channel></rss>`;
  const rssItem = (guid: string, title: string) =>
    `<item><guid>${guid}</guid><title>${title}</title><description><![CDATA[<p>Readable text</p><script>steal()</script>]]></description><link>https://news.example/${guid}</link><category>science</category></item>`;
  const subscribe = async (actor = alice) => {
    fetcher.fetch.mockResolvedValue({
      xml: externalRss(rssItem('article-1', 'External article')),
      finalUrl: 'https://news.example/rss',
    });
    const response = await auth('post', '/social/rss/subscriptions', actor)
      .send({ url: 'https://news.example/rss' })
      .expect(201);
    return response.body as { id: string; title: string };
  };

  it('imports private RSS subscriptions into chronological and personalized feeds', async () => {
    const subscription = await subscribe();
    expect(subscription.title).toBe('External news');
    const list = await auth('get', '/social/rss/subscriptions').expect(200);
    expect(list.body).toMatchObject([{ id: subscription.id }]);
    const recent = (await auth('get', '/social/feed?mode=recent').expect(200))
      .body as { data: Array<{ type: string; summary: string; id: string }> };
    expect(recent.data).toHaveLength(1);
    expect(recent.data[0]).toMatchObject({
      type: 'rss',
      summary: 'Readable text',
    });
    const ranked = (await auth('get', '/social/feed?mode=for-you').expect(200))
      .body as { data: Array<{ type: string }> };
    expect(ranked.data[0].type).toBe('rss');
    const other = (
      await auth('get', '/social/feed?mode=recent', bob).expect(200)
    ).body as FeedBody;
    expect(other.data).toEqual([]);
    expect((await auth('get', '/social/rss/subscriptions', bob)).body).toEqual(
      [],
    );
    expect((await request(server).get('/social/rss')).text).not.toContain(
      'External article',
    );
    expect(
      (await request(server).get('/social/public/profiles/alice/posts')).body,
    ).toMatchObject({ data: [] });
    await auth('put', `/social/rss/entries/${recent.data[0].id}/read`).expect(
      200,
    );
    await auth(
      'put',
      `/social/rss/entries/${recent.data[0].id}/read`,
      bob,
    ).expect(404);
  });

  it('allows private RSS use without creating a public profile', async () => {
    await subscribe(dave);
    const feed = (await auth('get', '/social/feed', dave).expect(200)).body as {
      mode: string;
      data: Array<{ type: string }>;
    };
    expect(feed.mode).toBe('recent');
    expect(feed.data[0].type).toBe('rss');
    expect(
      await db.socialProfile.findUnique({ where: { userId: dave.id } }),
    ).toBeNull();
    await request(server).get('/social/rss/subscriptions').expect(401);
  });

  it('refreshes RSS idempotently, preserves read state, and enforces ownership and cooldown', async () => {
    const subscription = await subscribe();
    const entry = await db.rssEntry.findFirstOrThrow({
      where: { subscriptionId: subscription.id },
    });
    await auth('put', `/social/rss/entries/${entry.id}/read`).expect(200);
    await auth(
      'post',
      `/social/rss/subscriptions/${subscription.id}/refresh`,
    ).expect(429);
    await auth(
      'post',
      `/social/rss/subscriptions/${subscription.id}/refresh`,
      bob,
    ).expect(404);
    await db.rssSubscription.update({
      where: { id: subscription.id },
      data: { nextRefreshAt: new Date(0) },
    });
    fetcher.fetch.mockResolvedValue({
      xml: externalRss(
        rssItem('article-1', 'External article') +
          rssItem('article-2', 'New article'),
      ),
      finalUrl: 'https://news.example/rss',
    });
    const responses = await Promise.all([
      auth('post', `/social/rss/subscriptions/${subscription.id}/refresh`),
      auth('post', `/social/rss/subscriptions/${subscription.id}/refresh`),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 429,
    ]);
    expect(
      await db.rssEntry.count({ where: { subscriptionId: subscription.id } }),
    ).toBe(2);
    expect(
      (await db.rssEntry.findUniqueOrThrow({ where: { id: entry.id } })).readAt,
    ).not.toBeNull();
    await auth(
      'delete',
      `/social/rss/subscriptions/${subscription.id}`,
      bob,
    ).expect(200);
    expect(
      await db.rssSubscription.count({ where: { id: subscription.id } }),
    ).toBe(1);
    await auth('delete', `/social/rss/subscriptions/${subscription.id}`).expect(
      200,
    );
    expect(
      await db.rssEntry.count({ where: { subscriptionId: subscription.id } }),
    ).toBe(0);
  });

  it('preserves cached entries after refresh failure without exposing network diagnostics', async () => {
    const subscription = await subscribe();
    await db.rssSubscription.update({
      where: { id: subscription.id },
      data: { nextRefreshAt: new Date(0) },
    });
    fetcher.fetch.mockRejectedValue(new Error('PRIVATE_NETWORK_DIAGNOSTICS'));
    const response = await auth(
      'post',
      `/social/rss/subscriptions/${subscription.id}/refresh`,
    ).expect(502);
    expect(JSON.stringify(response.body)).not.toContain(
      'PRIVATE_NETWORK_DIAGNOSTICS',
    );
    expect(
      await db.rssEntry.count({ where: { subscriptionId: subscription.id } }),
    ).toBe(1);
    expect(
      (
        await db.rssSubscription.findUniqueOrThrow({
          where: { id: subscription.id },
        })
      ).lastError,
    ).toBe('Feed could not be refreshed');
  });

  it('rejects unsafe subscription URLs before fetching and deduplicates subscriptions', async () => {
    await auth('post', '/social/rss/subscriptions')
      .send({ url: 'http://127.0.0.1/rss' })
      .expect(400);
    expect(fetcher.fetch).not.toHaveBeenCalled();
    const first = await subscribe();
    const second = (
      await auth('post', '/social/rss/subscriptions')
        .send({ url: 'https://news.example/rss' })
        .expect(201)
    ).body as { id: string };
    expect(second.id).toBe(first.id);
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
  });

  it('rechecks RSS ownership on ranked cursors after unsubscribing', async () => {
    const subscription = await subscribe();
    await seedPost(alice, 'Social post');
    const first = (
      await auth('get', '/social/feed?mode=for-you&limit=1').expect(200)
    ).body as FeedBody;
    await auth('delete', `/social/rss/subscriptions/${subscription.id}`).expect(
      200,
    );
    const next = (
      await auth(
        'get',
        `/social/feed?mode=for-you&cursor=${encodeURIComponent(first.nextCursor!)}`,
      ).expect(200)
    ).body as { data: Array<{ type: string }> };
    expect(next.data.every((entry) => entry.type === 'post')).toBe(true);
  });

  it('limits RSS storage and subscription counts without performing excess fetches', async () => {
    const subscription = await subscribe();
    await db.rssSubscription.update({
      where: { id: subscription.id },
      data: { nextRefreshAt: new Date(0) },
    });
    fetcher.fetch.mockResolvedValue({
      xml: externalRss(
        Array.from({ length: 210 }, (_, i) =>
          rssItem(`fresh-${i}`, `Article ${i}`),
        ).join(''),
      ),
      finalUrl: 'https://news.example/rss',
    });
    await auth(
      'post',
      `/social/rss/subscriptions/${subscription.id}/refresh`,
    ).expect(201);
    expect(
      await db.rssEntry.count({ where: { subscriptionId: subscription.id } }),
    ).toBe(200);
    await db.rssSubscription.createMany({
      data: Array.from({ length: 49 }, (_, i) => ({
        userId: alice.id,
        url: `https://news.example/${i}`,
        title: 'Feed',
        nextRefreshAt: new Date(),
      })),
    });
    const calls = fetcher.fetch.mock.calls.length;
    await auth('post', '/social/rss/subscriptions')
      .send({ url: 'https://extra.example/rss' })
      .expect(422);
    expect(fetcher.fetch).toHaveBeenCalledTimes(calls);
  });
  it('bounds view history and purges old views when recording new activity', async () => {
    const posts = await db.socialPost.createManyAndReturn({
      data: Array.from({ length: 150 }, (_, i) => ({
        authorId: bob.id,
        content: `post ${i}`,
        tags: [],
      })),
      select: { id: true },
    });
    await db.socialPostView.createMany({
      data: posts.map((post, i) => ({
        userId: alice.id,
        postId: post.id,
        updatedAt: new Date(Date.now() - (i < 5 ? 31 * 86_400_000 : 1000)),
      })),
    });
    await auth('post', `/social/posts/${posts[0].id}/views`).expect(201);
    expect(await db.socialPostView.count({ where: { userId: alice.id } })).toBe(
      100,
    );
    expect(
      await db.socialPostView.findUnique({
        where: { userId_postId: { userId: alice.id, postId: posts[1].id } },
      }),
    ).toBeNull();
    expect(
      await db.socialPostView.findUnique({
        where: { userId_postId: { userId: alice.id, postId: posts[0].id } },
      }),
    ).not.toBeNull();
  });

  it('paginates mixed social/RSS timelines without duplicates or imports arriving after the cutoff', async () => {
    const at = new Date(Date.now() - 5000);
    const subscription = await db.rssSubscription.create({
      data: {
        userId: alice.id,
        url: 'https://mixed.example/rss',
        title: 'Mixed',
        nextRefreshAt: new Date(),
      },
    });
    const social = await Promise.all([
      seedPost(alice, 'one', at),
      seedPost(bob, 'two', at),
    ]);
    const imported = await db.rssEntry.createManyAndReturn({
      data: Array.from({ length: 3 }, (_, i) => ({
        subscriptionId: subscription.id,
        guidHash: String(i),
        title: `article ${i}`,
        summary: 'text',
        publishedAt: at,
      })),
      select: { id: true },
    });
    let page = (
      await auth('get', '/social/feed?mode=recent&limit=2').expect(200)
    ).body as FeedBody;
    const ids = page.data.map((entry) => entry.id);
    const late = await db.rssEntry.create({
      data: {
        subscriptionId: subscription.id,
        guidHash: 'late',
        title: 'late',
        summary: 'late',
        publishedAt: at,
        importedAt: new Date(Date.now() + 1000),
      },
    });
    while (page.nextCursor) {
      page = (
        await auth(
          'get',
          `/social/feed?mode=recent&limit=2&cursor=${encodeURIComponent(page.nextCursor)}`,
        ).expect(200)
      ).body as FeedBody;
      ids.push(...page.data.map((entry) => entry.id));
    }
    expect(ids).toEqual(
      [...social, ...imported]
        .map((entry) => entry.id)
        .sort()
        .reverse(),
    );
    expect(new Set(ids).size).toBe(5);
    expect(ids).not.toContain(late.id);
  });
});
