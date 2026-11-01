import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { PrismaService } from '../prisma/prisma.service';

describe('JWT input boundaries', () => {
  const secret = 'test-refresh-signing-secret-at-least-32-characters';
  const findUnique = vi.fn();
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const jwt = new JwtService();
  const service = new AuthService(prisma, jwt);

  beforeEach(() => {
    findUnique.mockReset();
    vi.stubEnv('JWT_REFRESH_SECRET', secret);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, null, {}, [], 1, '', 'x'.repeat(129)])(
    'rejects a refresh token with invalid subject %j before database access',
    async (sub) => {
      const token = jwt.sign(
        { sub },
        { secret, algorithm: 'HS256', expiresIn: '1m' },
      );
      await expect(service.refresh(token)).rejects.toThrow(
        'Invalid refresh token',
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['HS384', 'HS512'] as const)(
    'rejects refresh tokens signed with %s',
    async (algorithm) => {
      const token = jwt.sign(
        { sub: 'owner' },
        { secret, algorithm, expiresIn: '1m' },
      );
      await expect(service.refresh(token)).rejects.toThrow(
        'Invalid refresh token',
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, {}, [], 1, '', 'x'.repeat(129)])(
    'rejects an invalid access-token subject %j before database access',
    async (sub) => {
      const strategy = new JwtStrategy(
        new ConfigService({ JWT_ACCESS_SECRET: secret }),
        prisma,
      );
      await expect(
        strategy.validate({ sub } as { sub: string }),
      ).rejects.toThrow('Unauthorized');
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, {}, [], 'x'.repeat(4097)])(
    'rejects malformed refresh cookie %j before database access',
    async (cookie) => {
      await expect(service.refresh(cookie)).rejects.toThrow(
        'Refresh token not found',
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );
});
