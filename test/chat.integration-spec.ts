import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaPg } from '@prisma/adapter-pg';
import { io, type Socket } from 'socket.io-client';
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
import { HttpThrottlerGuard } from '../src/common/guards/http-throttler.guard';
import { configureHttp } from '../src/common/config/http.config';
import { ChatModule } from '../src/chat/chat.module';
import { configureChatSockets } from '../src/chat/chat-io.adapter';
import { ChatRedisService } from '../src/chat/chat-redis.service';
import { ChatRateLimitService } from '../src/chat/chat-rate-limit.service';
import { CATALOG_FETCH } from '../src/chat/books/catalog-http.service';
import type { PublicBookPreview } from '../src/chat/books/catalog.types';

interface Actor {
  id: string;
  token: string;
}
interface Message {
  spoiler: boolean;
  segments: Array<{ type: string; text: string; href?: string }>;
  bookPreviews: PublicBookPreview[];
  quote: { text: string; attribution: string | null } | null;
  replyTo: { id: string; excerpt: string; spoiler: boolean } | null;
  id: string;
  sequence: number;
  content: string;
  sender: { id: string; username: string };
}
interface SendReply {
  ok: boolean;
  message?: Message;
  created?: boolean;
  error?: { status: number; message: string };
}
interface History {
  data: Message[];
  nextBefore: number | null;
  nextAfter: number | null;
}
interface Conversation {
  id: string;
  peer: { id: string; username: string };
  lastSequence: number;
}
interface RunningApp {
  app: INestApplication;
  server: Server;
  base: string;
}

const secret = 'chat-integration-access-secret-at-least-32-characters';
const jwt = new JwtService({ secret });
const catalogFetch = vi.fn<typeof fetch>();

describe('private chat with PostgreSQL and real WebSockets', () => {
  let db: PrismaClient;
  let primary: RunningApp;
  let alice: Actor;
  let bob: Actor;
  let outsider: Actor;
  let actors: Actor[] = [];
  let apps: RunningApp[] = [];
  let sockets: Socket[] = [];

  beforeAll(async () => {
    const url = process.env.CHAT_TEST_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/openbook_chat_test')
      throw new Error(
        'CHAT_TEST_DATABASE_URL must point to the dedicated migrated openbook_chat_test database',
      );
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await db.$connect();
  });

  async function start(redisUrl = ''): Promise<RunningApp> {
    const config = {
      JWT_ACCESS_SECRET: secret,
      CORS_ORIGINS: 'https://reader.example',
      SOCIAL_PUBLIC_URL: 'https://api.example',
      CHAT_REDIS_URL: redisUrl,
      GOOGLE_BOOKS_API_KEY: 'integration-catalog-key',
    };
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        PassportModule,
        ChatModule,
        ThrottlerModule.forRoot([
          { name: 'ip', ttl: 60000, limit: 1000 },
          { name: 'account', ttl: 60000, limit: 1000 },
        ]),
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: HttpThrottlerGuard },
      ],
    })
      .overrideProvider(CATALOG_FETCH)
      .useValue(catalogFetch)
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(config))
      .compile();
    const app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureHttp(app);
    await configureChatSockets(app);
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer();
    const port = (server.address() as AddressInfo).port;
    const running = { app, server, base: `http://127.0.0.1:${port}` };
    apps.push(running);
    return running;
  }

  beforeEach(async () => {
    vi.stubEnv('CORS_ORIGINS', 'https://reader.example');
    vi.stubEnv('SOCIAL_PUBLIC_URL', 'https://api.example');
    catalogFetch.mockReset();
    catalogFetch.mockImplementation((input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === 'openlibrary.org') {
        if (url.pathname === '/search.json')
          return Promise.resolve(
            Response.json({
              docs: [
                {
                  key: '/works/OL1W',
                  title: 'Public catalog fixture',
                  author_name: ['Catalog Author'],
                  cover_i: 12,
                  first_publish_year: 2000,
                },
              ],
            }),
          );
        return Promise.resolve(
          Response.json({
            title: 'Public catalog fixture',
            description: 'Public summary',
            covers: [12],
          }),
        );
      }
      const book = {
        id: 'Google1',
        volumeInfo: {
          title: 'Google public fixture',
          authors: ['Public Author'],
          previewLink: 'https://books.google.com/books?id=Google1',
        },
      };
      return Promise.resolve(
        Response.json(
          url.pathname.endsWith('/volumes') ? { items: [book] } : book,
        ),
      );
    });
    apps = [];
    sockets = [];
    actors = [];
    for (let index = 0; index < 3; index++) {
      const user = await db.user.create({
        data: {
          username: `chat-test-${randomUUID()}`,
          password: 'PRIVATE_PASSWORD_HASH',
          refreshToken: 'PRIVATE_REFRESH_HASH',
        },
      });
      actors.push({
        id: user.id,
        token: jwt.sign({ sub: user.id }, { expiresIn: '15m' }),
      });
    }
    [alice, bob, outsider] = actors;
    primary = await start();
  });

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    for (const running of apps) await running.app.close();
    await db.user.deleteMany({
      where: { id: { in: actors.map((actor) => actor.id) } },
    });
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  const auth = (actor = alice, running = primary) =>
    request(running.server)
      .get('/chat/conversations')
      .auth(actor.token, { type: 'bearer' });
  async function conversation() {
    const response = await request(primary.server)
      .post('/chat/conversations')
      .auth(alice.token, { type: 'bearer' })
      .send({ recipientId: bob.id })
      .expect(201);
    return response.body as Conversation;
  }
  async function history(
    id: string,
    query = '',
    actor = alice,
    running = primary,
  ) {
    const response = await request(running.server)
      .get(`/chat/conversations/${id}/messages${query}`)
      .auth(actor.token, { type: 'bearer' })
      .expect(200);
    return response.body as History;
  }
  async function sendRest(
    id: string,
    content: string,
    actor = alice,
    clientMessageId = randomUUID(),
    running = primary,
  ) {
    const response = await request(running.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(actor.token, { type: 'bearer' })
      .send({ content, clientMessageId })
      .expect(201);
    return response.body as { message: Message; created: boolean };
  }
  function pendingEvent<T>(
    socket: Socket,
    event: string,
    timeout = 3000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, listener);
        reject(new Error(`Missing ${event}`));
      }, timeout);
      const listener = (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      };
      socket.once(event, listener);
    });
  }
  async function connect(
    actor = alice,
    running = primary,
    options: { token?: string; origin?: string } = {},
  ) {
    const socket = io(`${running.base}/chat`, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      auth: { accessToken: options.token ?? actor.token },
      ...(options.origin ? { extraHeaders: { Origin: options.origin } } : {}),
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Chat connection timed out')),
        3000,
      );
      socket.once('chat.ready', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.connect();
    });
    return socket;
  }
  async function sendSocket(
    socket: Socket,
    id: string,
    content: string,
    clientMessageId = randomUUID(),
    extra = {},
  ): Promise<SendReply> {
    const reply: unknown = await socket.timeout(3000).emitWithAck('chat.send', {
      conversationId: id,
      content,
      clientMessageId,
      ...extra,
    });
    return reply as SendReply;
  }

  it('requires authentication and creates one canonical conversation for both participants', async () => {
    await request(primary.server).get('/chat/conversations').expect(401);
    const [first, second] = await Promise.all([
      request(primary.server)
        .post('/chat/conversations')
        .auth(alice.token, { type: 'bearer' })
        .send({ recipientId: bob.id })
        .expect(201),
      request(primary.server)
        .post('/chat/conversations')
        .auth(bob.token, { type: 'bearer' })
        .send({ recipientId: alice.id })
        .expect(201),
    ]);
    expect((first.body as Conversation).id).toBe(
      (second.body as Conversation).id,
    );
    expect((first.body as Conversation).peer.id).toBe(bob.id);
    expect((second.body as Conversation).peer.id).toBe(alice.id);
    const list = await auth().expect(200);
    expect((list.body as { data: Conversation[] }).data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('PRIVATE_');
    expect(list.headers['cache-control']).toBe('no-store');
    expect((await auth(outsider).expect(200)).body).toMatchObject({ data: [] });
  });

  it('denies self-chat, missing recipients, mass assignment and outsider history or sends', async () => {
    await request(primary.server)
      .post('/chat/conversations')
      .auth(alice.token, { type: 'bearer' })
      .send({ recipientId: alice.id })
      .expect(400);
    await request(primary.server)
      .post('/chat/conversations')
      .auth(alice.token, { type: 'bearer' })
      .send({ recipientId: 'c123456789012345678901234' })
      .expect(404);
    const { id } = await conversation();
    await request(primary.server)
      .get(`/chat/conversations/${id}`)
      .auth(outsider.token, { type: 'bearer' })
      .expect(404);
    await request(primary.server)
      .get(`/chat/conversations/${id}/messages?after=0`)
      .auth(outsider.token, { type: 'bearer' })
      .expect(404);
    await request(primary.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(outsider.token, { type: 'bearer' })
      .send({ clientMessageId: randomUUID(), content: 'Attack' })
      .expect(404);
    await request(primary.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({
        clientMessageId: randomUUID(),
        content: 'Attack',
        senderId: outsider.id,
      })
      .expect(400);
  });

  it('paginates history in stable sequence order and recovers missed messages after reconnect', async () => {
    const { id } = await conversation();
    for (let n = 1; n <= 4; n++)
      await sendRest(id, `message ${n}`, n % 2 ? alice : bob);
    const latest = await history(id, '?limit=2');
    expect(latest.data.map((message) => message.sequence)).toEqual([3, 4]);
    expect(latest.nextBefore).toBe(3);
    const older = await history(id, '?limit=2&before=3');
    expect(older.data.map((message) => message.sequence)).toEqual([1, 2]);
    expect(older.nextBefore).toBeNull();
    const missed = await history(id, '?after=0&limit=2');
    expect(missed.data.map((message) => message.sequence)).toEqual([1, 2]);
    expect(missed.nextAfter).toBe(2);
    const remainder = await history(id, '?after=2&limit=2');
    expect(remainder.data.map((message) => message.sequence)).toEqual([3, 4]);
    expect(remainder.nextAfter).toBeNull();
    const peer = await connect(bob);
    const received = pendingEvent<Message>(peer, 'chat.message');
    await sendRest(id, 'live after recovery');
    expect((await received).sequence).toBe(5);
    const restarted = await start();
    expect(
      (await history(id, '?after=4', alice, restarted)).data.map(
        (message) => message.sequence,
      ),
    ).toEqual([5]);
    await request(primary.server)
      .get(`/chat/conversations/${id}/messages?before=2&after=0`)
      .auth(alice.token, { type: 'bearer' })
      .expect(400);
    await request(primary.server)
      .get(`/chat/conversations/${id}/messages?limit=101`)
      .auth(alice.token, { type: 'bearer' })
      .expect(400);
  });

  it('deduplicates concurrent retries without consuming extra sequence values', async () => {
    const { id } = await conversation();
    const clientMessageId = randomUUID();
    const replies = await Promise.all([
      sendRest(id, 'retry-safe', alice, clientMessageId),
      sendRest(id, 'retry-safe', alice, clientMessageId),
    ]);
    expect(replies.filter((reply) => reply.created)).toHaveLength(1);
    expect(new Set(replies.map((reply) => reply.message.id)).size).toBe(1);
    expect((await history(id)).data).toHaveLength(1);
    await request(primary.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({ clientMessageId, content: 'different content' })
      .expect(409);
    const next = await sendRest(id, 'second message', bob);
    expect(next.message.sequence).toBe(2);
  });

  it('broadcasts only to participant sockets and supports retries across WebSocket and REST', async () => {
    const { id } = await conversation();
    const sender = await connect(alice, primary, {
      origin: 'https://reader.example',
    });
    const receiver = await connect(bob);
    const stranger = await connect(outsider);
    const leaked: unknown[] = [];
    stranger.on('chat.message', (message: unknown) => leaked.push(message));
    const delivery = pendingEvent<Message>(receiver, 'chat.message');
    const key = randomUUID();
    const reply = await sendSocket(sender, id, 'PRIVATE_CHAT_SENTINEL', key);
    expect(reply.ok).toBe(true);
    expect((await delivery).id).toBe(reply.message?.id);
    expect(
      (await sendRest(id, 'PRIVATE_CHAT_SENTINEL', alice, key)).created,
    ).toBe(false);
    const denied = await sendSocket(stranger, id, 'Attack');
    expect(denied).toMatchObject({ ok: false, error: { status: 404 } });
    const unsupported: unknown = await stranger
      .timeout(3000)
      .emitWithAck('chat.join', { conversationId: id });
    expect(unsupported).toMatchObject({ ok: false, error: { status: 400 } });
    expect(leaked).toEqual([]);
    expect((await history(id, '', bob)).data[0].content).toBe(
      'PRIVATE_CHAT_SENTINEL',
    );
  });

  it('returns safe ACK errors for malformed events and preserves the connection', async () => {
    const { id } = await conversation();
    const sender = await connect();
    expect(await sendSocket(sender, id, ' ', randomUUID())).toMatchObject({
      ok: false,
      error: { status: 400 },
    });
    expect(
      await sendSocket(sender, id, 'hello', randomUUID(), {
        senderId: outsider.id,
      }),
    ).toMatchObject({ ok: false, error: { status: 400 } });
    expect((await sendSocket(sender, id, 'valid after errors')).ok).toBe(true);
    expect(sender.connected).toBe(true);
  });

  it('rejects invalid, expired, wrong-algorithm and deleted-account tokens', async () => {
    for (const token of [
      'invalid',
      jwt.sign({ sub: alice.id }, { expiresIn: -1 }),
      jwt.sign({ sub: alice.id }, { algorithm: 'HS384', expiresIn: '1m' }),
      jwt.sign({ sub: alice.id }),
    ])
      await expect(connect(alice, primary, { token })).rejects.toThrow(
        'Chat authentication failed',
      );
    await db.user.delete({ where: { id: outsider.id } });
    await expect(connect(outsider)).rejects.toThrow(
      'Chat authentication failed',
    );
  });

  it('rejects untrusted browser origins and caps simultaneous sockets per account', async () => {
    await expect(
      connect(alice, primary, { origin: 'https://attacker.example' }),
    ).rejects.toThrow();
    await expect(connect(alice, primary, { origin: 'null' })).rejects.toThrow();
    for (let n = 0; n < 5; n++) await connect(alice);
    await expect(connect(alice)).rejects.toThrow('Chat authentication failed');
  });

  it('disconnects a socket when its access token expires', async () => {
    const socket = await connect(alice, primary, {
      token: jwt.sign({ sub: alice.id }, { expiresIn: '2s' }),
    });
    await pendingEvent(socket, 'disconnect', 3500);
    expect(socket.connected).toBe(false);
  });

  it('rejects oversized frames without persisting their content', async () => {
    const { id } = await conversation();
    const socket = await connect();
    const closed = pendingEvent(socket, 'disconnect');
    socket.emit('chat.send', {
      conversationId: id,
      clientMessageId: randomUUID(),
      content: 'x'.repeat(20000),
    });
    await closed;
    expect((await history(id)).data).toEqual([]);
  });

  it('enforces existing block rules for new sends while preserving participant history', async () => {
    const { id } = await conversation();
    const socket = await connect();
    await sendRest(id, 'before block');
    for (const actor of [alice, bob])
      await db.socialProfile.create({
        data: {
          userId: actor.id,
          handle: `ct_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
          displayName: 'Chat fixture',
        },
      });
    await db.socialBlock.create({
      data: { blockerId: bob.id, blockedId: alice.id },
    });
    expect(await sendSocket(socket, id, 'after block')).toMatchObject({
      ok: false,
      error: { status: 403 },
    });
    await request(primary.server)
      .post('/chat/conversations')
      .auth(alice.token, { type: 'bearer' })
      .send({ recipientId: bob.id })
      .expect(404);
    expect((await history(id)).data.map((message) => message.content)).toEqual([
      'before block',
    ]);
  });

  it('shares the send rate limit across REST and WebSocket paths', async () => {
    const { id } = await conversation();
    const socket = await connect();
    const limits = primary.app.get(ChatRateLimitService);
    for (let n = 0; n < 59; n++) await limits.consume('send', alice.id, 60);
    await sendRest(id, 'last permitted message');
    expect(await sendSocket(socket, id, 'over limit')).toMatchObject({
      ok: false,
      error: { status: 429 },
    });
    expect((await history(id)).data).toHaveLength(1);
  });

  it('cascades messages when a participant account is removed', async () => {
    const { id } = await conversation();
    await sendRest(id, 'cascade me');
    await db.user.delete({ where: { id: bob.id } });
    expect(await db.chatMessage.count({ where: { conversationId: id } })).toBe(
      0,
    );
    expect(await db.chatConversation.count({ where: { id } })).toBe(0);
  });

  it('delivers across Redis-connected instances and shares their rate counters', async () => {
    const url = process.env.CHAT_TEST_REDIS_URL;
    if (!url)
      throw new Error(
        'Set CHAT_TEST_REDIS_URL to a dedicated Redis/Valkey test instance',
      );
    const first = await start(url);
    const second = await start(url);
    const { id } = await conversation();
    const sender = await connect(alice, first);
    const receiver = await connect(bob, second);
    const delivery = pendingEvent<Message>(receiver, 'chat.message', 5000);
    const reply = await sendSocket(sender, id, 'cross-instance');
    expect(reply.ok).toBe(true);
    expect((await delivery).id).toBe(reply.message?.id);
    const key = `integration-${randomUUID()}`;
    await first.app.get(ChatRateLimitService).consume('test', key, 1);
    await expect(
      second.app.get(ChatRateLimitService).consume('test', key, 1),
    ).rejects.toThrow('Chat rate limit exceeded');
    const redis = first.app.get(ChatRedisService);
    await redis.onApplicationShutdown();
    await expect(
      first.app.get(ChatRateLimitService).consume('test', randomUUID(), 1),
    ).rejects.toThrow('Chat rate limiting is unavailable');
  });

  async function sendRich(
    id: string,
    content: string,
    extra: Record<string, unknown> = {},
    actor = alice,
    key = randomUUID(),
  ) {
    const response = await request(primary.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(actor.token, { type: 'bearer' })
      .send({ content, clientMessageId: key, ...extra })
      .expect(201);
    return response.body as { message: Message; created: boolean };
  }
  function presenceEvent(socket: Socket, userId: string, online: boolean) {
    return new Promise<{
      userId: string;
      online: boolean;
      expiresAt: number | null;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('chat.presence', listener);
        reject(new Error('Missing presence update'));
      }, 3000);
      const listener = (value: {
        userId: string;
        online: boolean;
        expiresAt: number | null;
      }) => {
        if (value.userId !== userId || value.online !== online) return;
        clearTimeout(timer);
        socket.off('chat.presence', listener);
        resolve(value);
      };
      socket.on('chat.presence', listener);
    });
  }

  it('shares online status only with conversation peers and keeps multi-device presence accurate', async () => {
    const { id } = await conversation();
    const receiver = await connect(bob);
    const cameOnline = presenceEvent(receiver, alice.id, true);
    const first = await connect(alice);
    expect((await cameOnline).expiresAt).toBeGreaterThan(Date.now());
    const second = await connect(alice);
    first.disconnect();
    const snapshot = await request(primary.server)
      .get(`/chat/conversations/${id}/presence`)
      .auth(bob.token, { type: 'bearer' })
      .expect(200);
    expect(snapshot.body).toMatchObject({ userId: alice.id, online: true });
    await request(primary.server)
      .get(`/chat/conversations/${id}/presence`)
      .auth(outsider.token, { type: 'bearer' })
      .expect(404);
    const offline = presenceEvent(receiver, alice.id, false);
    second.disconnect();
    expect((await offline).expiresAt).toBeNull();
    const reply: unknown = await receiver
      .timeout(3000)
      .emitWithAck('chat.presence.get', { conversationId: id });
    expect(reply).toMatchObject({
      ok: true,
      presence: { userId: alice.id, online: false },
    });
  });

  it('sends expiring typing updates only to the peer and rejects outsider typing', async () => {
    const { id } = await conversation();
    const sender = await connect(alice);
    const receiver = await connect(bob);
    const stranger = await connect(outsider);
    const leaked: unknown[] = [];
    stranger.on('chat.typing', (value: unknown) => leaked.push(value));
    const event = pendingEvent<{
      userId: string;
      typing: boolean;
      expiresAt: number;
    }>(receiver, 'chat.typing');
    const reply: unknown = await sender
      .timeout(3000)
      .emitWithAck('chat.typing', { conversationId: id, typing: true });
    expect(reply).toMatchObject({ ok: true });
    expect(await event).toMatchObject({ userId: alice.id, typing: true });
    const denied: unknown = await stranger
      .timeout(3000)
      .emitWithAck('chat.typing', { conversationId: id, typing: true });
    expect(denied).toMatchObject({ ok: false, error: { status: 404 } });
    expect(leaked).toEqual([]);
    expect((await history(id)).data).toEqual([]);
  });

  it('masks presence and stops typing when either peer has blocked the other', async () => {
    const { id } = await conversation();
    const sender = await connect(alice);
    await connect(bob);
    for (const actor of [alice, bob])
      await db.socialProfile.create({
        data: {
          userId: actor.id,
          handle: `pc_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
          displayName: 'Presence fixture',
        },
      });
    await db.socialBlock.create({
      data: { blockerId: bob.id, blockedId: alice.id },
    });
    expect(
      (
        await request(primary.server)
          .get(`/chat/conversations/${id}/presence`)
          .auth(alice.token, { type: 'bearer' })
          .expect(200)
      ).body,
    ).toMatchObject({ online: false });
    const reply: unknown = await sender
      .timeout(3000)
      .emitWithAck('chat.typing', { conversationId: id, typing: true });
    expect(reply).toMatchObject({ ok: false, error: { status: 403 } });
  });

  it('keeps quoted replies in the same conversation and masks spoiler excerpts and summaries', async () => {
    const { id } = await conversation();
    const original = await sendRich(id, 'SECRET_ENDING', { spoiler: true });
    const metadata = await request(primary.server)
      .get(`/chat/conversations/${id}`)
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(metadata.body)).not.toContain('SECRET_ENDING');
    const reply = await sendRich(
      id,
      'A reply',
      {
        replyToId: original.message.id,
        quote: {
          text: 'A book quote ||hidden words||',
          attribution: 'Reader supplied attribution',
        },
      },
      bob,
    );
    expect(reply.message.replyTo).toMatchObject({
      id: original.message.id,
      excerpt: '[Spoiler]',
      spoiler: true,
    });
    expect(reply.message.quote?.attribution).toBe(
      'Reader supplied attribution',
    );
    expect((await history(id)).data[0].segments).toEqual([
      { type: 'spoiler', text: 'SECRET_ENDING' },
    ]);
    const other = (
      await request(primary.server)
        .post('/chat/conversations')
        .auth(outsider.token, { type: 'bearer' })
        .send({ recipientId: bob.id })
        .expect(201)
    ).body as Conversation;
    const secret = await sendRich(
      other.id,
      'OTHER_PRIVATE_CONVERSATION',
      {},
      outsider,
    );
    await request(primary.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({
        clientMessageId: randomUUID(),
        content: 'Attack',
        replyToId: secret.message.id,
      })
      .expect(404);
    expect(JSON.stringify(await history(id))).not.toContain(
      'OTHER_PRIVATE_CONVERSATION',
    );
  });

  it('searches public catalogs, attaches trusted metadata and never searches the private library', async () => {
    const { id } = await conversation();
    await db.book.create({
      data: {
        ownerId: alice.id,
        title: 'PRIVATE_LIBRARY_SENTINEL',
        author: 'PRIVATE_AUTHOR',
      },
    });
    const found = await request(primary.server)
      .get('/chat/books/search?q=Public%20book&provider=openlibrary')
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(found.body)).not.toContain('PRIVATE_');
    expect(found.body).toMatchObject({
      data: [
        {
          provider: 'openlibrary',
          id: 'OL1W',
          title: 'Public catalog fixture',
        },
      ],
    });
    const rich = await sendRich(id, 'Read https://openlibrary.org/works/OL1W', {
      books: [{ provider: 'openlibrary', id: 'OL1W' }],
    });
    expect(rich.message.bookPreviews).toHaveLength(1);
    expect(rich.message.bookPreviews[0]).toMatchObject({
      title: 'Public catalog fixture',
      authors: ['Catalog Author'],
    });
    expect((await history(id, '', bob)).data[0].bookPreviews[0].id).toBe(
      'OL1W',
    );
    const count = catalogFetch.mock.calls.length;
    const hidden = await sendRich(id, '||https://openlibrary.org/works/OL2W||');
    expect(hidden.message.bookPreviews).toEqual([]);
    expect(catalogFetch).toHaveBeenCalledTimes(count);
    await request(primary.server)
      .get('/chat/books/search?q=Public')
      .expect(401);
    await request(primary.server)
      .get('/chat/books/preview?url=http%3A%2F%2F127.0.0.1%2Fprivate')
      .auth(alice.token, { type: 'bearer' })
      .expect(400);
  });

  it('keeps catalog failures from blocking ordinary pasted links and preserves rich retry intent', async () => {
    const { id } = await conversation();
    const key = randomUUID();
    catalogFetch.mockRejectedValueOnce(
      new Error('PRIVATE_CATALOG_DIAGNOSTICS'),
    );
    const content = 'https://openlibrary.org/works/OL99W';
    const first = await sendRich(id, content, {}, alice, key);
    expect(first.message.bookPreviews).toEqual([]);
    const retry = await sendRich(id, content, {}, alice, key);
    expect(retry.created).toBe(false);
    expect(retry.message.id).toBe(first.message.id);
    expect(catalogFetch).toHaveBeenCalledOnce();
    await request(primary.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({ clientMessageId: key, content, spoiler: true })
      .expect(409);
    await request(primary.server)
      .post(`/chat/conversations/${id}/messages`)
      .auth(alice.token, { type: 'bearer' })
      .send({
        clientMessageId: randomUUID(),
        content: 'Forged card',
        bookPreviews: [{ title: 'Forged metadata' }],
      })
      .expect(400);
  });

  it('broadcasts rich messages over WebSocket and deduplicates a rich retry across transports', async () => {
    const { id } = await conversation();
    const sender = await connect(alice);
    const receiver = await connect(bob);
    const original = await sendRich(id, 'Original');
    const key = randomUUID();
    const event = pendingEvent<Message>(receiver, 'chat.message');
    const extra = {
      replyToId: original.message.id,
      spoiler: true,
      quote: { text: 'Public quotation', attribution: 'Author' },
    };
    const sent = await sendSocket(sender, id, 'Spoiler body', key, extra);
    expect(sent.ok).toBe(true);
    expect((await event).replyTo?.id).toBe(original.message.id);
    expect(
      (await sendRich(id, 'Spoiler body', extra, alice, key)).created,
    ).toBe(false);
    const metadata = await request(primary.server)
      .get(`/chat/conversations/${id}`)
      .auth(alice.token, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(metadata.body)).not.toMatch(
      /Spoiler body|Public quotation/,
    );
  });

  it('shares expiring presence leases across Redis instances and keeps a remaining device online', async () => {
    const url = process.env.CHAT_TEST_REDIS_URL!;
    const first = await start(url);
    const second = await start(url);
    const { id } = await conversation();
    const observer = await connect(bob, first);
    const one = await connect(alice, first);
    const two = await connect(alice, second);
    one.disconnect();
    const response = await request(first.server)
      .get(`/chat/conversations/${id}/presence`)
      .auth(bob.token, { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({ userId: alice.id, online: true });
    const offline = presenceEvent(observer, alice.id, false);
    two.disconnect();
    expect((await offline).expiresAt).toBeNull();
    const redis = second.app.get(ChatRedisService);
    expect(
      (await redis.presence(outsider.id, 'abandoned-device', 'touch', 30))
        .online,
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(
      (
        await first.app
          .get(ChatRedisService)
          .presence(outsider.id, '', 'get', 45000)
      ).online,
    ).toBe(false);
  });
});
