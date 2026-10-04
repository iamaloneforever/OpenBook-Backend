import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import * as argon2 from 'argon2';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';

vi.mock('argon2', () => ({
  hash: vi.fn(),
  verify: vi.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const jwt = {
    signAsync: vi.fn(),
    verify: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: JwtService,
          useValue: jwt,
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('signup', () => {
    it('should create a new user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      vi.mocked(argon2.hash).mockResolvedValue('hashed-password');

      prisma.user.create.mockResolvedValue({
        id: '1',
        username: 'john',
        createdAt: new Date(),
      });

      jwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      prisma.user.update.mockResolvedValue({});

      const result = await service.signup({
        username: 'john',
        password: '123456',
      });

      expect(prisma.user.findUnique).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.tokens.accessToken).toBe('access-token');
      expect(result.tokens.refreshToken).toBe('refresh-token');
    });

    it('should throw if username exists', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
      });

      await expect(
        service.signup({
          username: 'john',
          password: '123456',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('validateUser', () => {
    it('should return null when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('john', '123456');

      expect(result).toBeNull();
    });

    it('should return null when password is invalid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        username: 'john',
        password: 'hashed',
      });

      vi.mocked(argon2.verify).mockResolvedValue(false);

      const result = await service.validateUser('john', '123456');

      expect(result).toBeNull();
    });

    it('should return user when password is valid', async () => {
      const user = {
        id: '1',
        username: 'john',
        password: 'hashed',
      };

      prisma.user.findUnique.mockResolvedValue(user);

      vi.mocked(argon2.verify).mockResolvedValue(true);

      const result = await service.validateUser('john', '123456');

      expect(result).toEqual(user);
    });
  });

  describe('logout', () => {
    it('should clear refresh token', async () => {
      prisma.user.update.mockResolvedValue({});

      const result = await service.logout('1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: {
          id: '1',
        },
        data: {
          refreshToken: null,
        },
      });

      expect(result).toEqual({
        message: 'Logged out successfully',
      });
    });
  });

  describe('generateTokens', () => {
    it('issues distinct refresh tokens even within the same second', async () => {
      const realJwt = new JwtService();
      jwt.signAsync.mockImplementation(
        (payload: object, options: JwtSignOptions) =>
          realJwt.signAsync(payload, { ...options, secret: 'test-secret' }),
      );
      vi.mocked(argon2.hash).mockResolvedValue('hashed');
      vi.useFakeTimers();
      try {
        const first = await service.generateTokens('1', 'john');
        const second = await service.generateTokens('1', 'john');
        expect(first.refreshToken).not.toBe(second.refreshToken);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should generate access and refresh tokens', async () => {
      jwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      vi.mocked(argon2.hash).mockResolvedValue('hashed-refresh');

      prisma.user.update.mockResolvedValue({});

      const result = await service.generateTokens('1', 'john');

      expect(jwt.signAsync).toHaveBeenCalledTimes(2);

      expect(prisma.user.update).toHaveBeenCalled();

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('refresh', () => {
    it('allows only one concurrent refresh of the same session', async () => {
      jwt.verify.mockReturnValue({ sub: '1' });
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        username: 'john',
        refreshToken: 'old-hash',
      });
      vi.mocked(argon2.verify).mockResolvedValue(true);
      vi.mocked(argon2.hash).mockResolvedValue('new-hash');
      jwt.signAsync.mockResolvedValue('new-token');
      let storedHash = 'old-hash';
      prisma.user.updateMany.mockImplementation(
        ({
          where,
          data,
        }: {
          where: { refreshToken: string };
          data: { refreshToken: string };
        }) => {
          if (where.refreshToken !== storedHash) return { count: 0 };
          storedHash = data.refreshToken;
          return { count: 1 };
        },
      );

      const results = await Promise.allSettled([
        service.refresh('old-token'),
        service.refresh('old-token'),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('does not restore a session revoked during token verification', async () => {
      jwt.verify.mockReturnValue({ sub: '1' });
      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        username: 'john',
        refreshToken: 'old-hash',
      });
      vi.mocked(argon2.verify).mockResolvedValue(true);
      vi.mocked(argon2.hash).mockResolvedValue('new-hash');
      jwt.signAsync.mockResolvedValue('new-token');
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.refresh('old-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should throw when refresh token is missing', async () => {
      await expect(service.refresh('')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when jwt is invalid', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error();
      });

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should refresh tokens', async () => {
      jwt.verify.mockReturnValue({
        sub: '1',
      });

      prisma.user.findUnique.mockResolvedValue({
        id: '1',
        username: 'john',
        refreshToken: 'hashed',
      });

      vi.mocked(argon2.verify).mockResolvedValue(true);

      jwt.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');

      vi.mocked(argon2.hash).mockResolvedValue('hashed-new-refresh');

      prisma.user.update.mockResolvedValue({});

      const result = await service.refresh('refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
    });
  });
});
