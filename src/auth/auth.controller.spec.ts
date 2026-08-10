import { Test } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import type { Request, Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignupDto } from 'src/common/dtos/auth/signup.dto';

describe('AuthController', () => {
  let controller: AuthController;

  const service = {
    signup: vi.fn(),
    generateTokens: vi.fn(),
    refresh: vi.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('signup', () => {
    it('should signup user', async () => {
      const dto: SignupDto = {
        username: 'john',
        password: '123456',
      };

      const cookie = vi.fn();
      const res = { cookie } as unknown as Response;

      const user = {
        id: '1',
        username: 'john',
        createdAt: new Date(),
      };

      service.signup.mockResolvedValue({
        user,
        tokens: {
          accessToken: 'access',
          refreshToken: 'refresh',
        },
      });

      const result = await controller.signup(dto, res);

      expect(service.signup).toHaveBeenCalledWith(dto);

      expect(cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        }),
      );

      expect(result).toEqual({
        message: 'User created successfully',
        user,
        accessToken: 'access',
      });
    });
  });

  describe('login', () => {
    it('should login user and set refresh cookie', async () => {
      const req = {
        user: {
          id: '1',
          username: 'john',
        },
      } as unknown as Request;

      const cookie = vi.fn();
      const res = { cookie } as unknown as Response;

      service.generateTokens.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      const result = await controller.login(req, res);

      expect(service.generateTokens).toHaveBeenCalledWith('1', 'john');

      expect(cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        }),
      );

      expect(result).toEqual({
        accessToken: 'access',
      });
    });
  });

  describe('refresh', () => {
    it('should refresh tokens and update refresh cookie', async () => {
      const req = {
        cookies: {
          refreshToken: 'old-refresh-token',
        },
      } as unknown as Request;

      const cookie = vi.fn();
      const res = { cookie } as unknown as Response;

      service.refresh.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await controller.refresh(req, res);

      expect(service.refresh).toHaveBeenCalledWith('old-refresh-token');

      expect(cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        }),
      );

      expect(result).toEqual({
        accessToken: 'new-access-token',
      });
    });
  });
});
