import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { LocalStrategy } from '../../auth/strategies/local.strategy';
import { configureHttp } from './http.config';

describe('HTTP security policy', () => {
  let app: NestExpressApplication;
  let server: Server;
  const auth = {
    signup: vi.fn(),
    validateUser: vi.fn(),
    generateTokens: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('CORS_ORIGINS', 'https://reader.example');
    vi.stubEnv('SOCIAL_PUBLIC_URL', 'https://api.example');
    vi.stubEnv('NODE_ENV', 'production');
    auth.validateUser.mockResolvedValue({ id: 'user', username: 'reader' });
    auth.generateTokens.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AuthController],
      providers: [LocalStrategy, { provide: AuthService, useValue: auth }],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureHttp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it.each([
    { username: { equals: 'reader' }, password: 'password' },
    { username: 'reader', password: ['password'] },
    { username: 'reader', password: 'p'.repeat(129) },
    { username: 'reader', password: 'password', role: 'admin' },
  ])(
    'rejects malformed login credentials before database or password work',
    async (body) => {
      await request(server).post('/auth/login').send(body).expect(400);
      expect(auth.validateUser).not.toHaveBeenCalled();
    },
  );

  it('rejects cross-origin form submissions before authentication', async () => {
    for (const path of ['login', 'signup', 'refresh', 'logout']) {
      await request(server)
        .post(`/auth/${path}`)
        .set('Origin', 'https://attacker.example')
        .type('form')
        .send({ username: 'reader', password: 'password' })
        .expect(403);
    }
    expect(auth.validateUser).not.toHaveBeenCalled();
    expect(auth.signup).not.toHaveBeenCalled();
  });

  it('rejects cross-site requests without an Origin header', async () => {
    await request(server)
      .post('/auth/login')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ username: 'reader', password: 'password' })
      .expect(403);
  });

  it.each(['https://reader.example', 'https://api.example', undefined])(
    'accepts a trusted origin or a native client: %s',
    async (origin) => {
      const call = request(server).post('/auth/login');
      if (origin) call.set('Origin', origin);
      const response = await call
        .send({ username: 'reader', password: 'password' })
        .expect(201);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies[0]).toContain('Path=/auth;');
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[0]).toContain('Secure');
      expect(cookies[0]).toContain('SameSite=Lax');
      if (origin === 'https://reader.example')
        expect(response.headers['access-control-allow-origin']).toBe(origin);
    },
  );

  it('rejects oversized JSON bodies before authentication', async () => {
    await request(server)
      .post('/auth/login')
      .send({ username: 'reader', password: 'x'.repeat(65536) })
      .expect(413);
    expect(auth.validateUser).not.toHaveBeenCalled();
  });

  it('does not grant CORS access to an unlisted origin', async () => {
    const response = await request(server)
      .options('/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
