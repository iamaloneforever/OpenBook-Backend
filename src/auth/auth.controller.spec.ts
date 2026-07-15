import { Test } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignupDto } from 'src/common/dtos/auth/signup.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            signup: vi.fn(),
            generateTokens: vi.fn(),
            refresh: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    service = module.get(AuthService);
  });

  describe('signup', () => {
    it('should signup user', async () => {
      const dto: SignupDto = {
        username: 'john',
        password: '123456',
      };

      const res = {
        cookie: vi.fn(),
      } as any;

      const user = {
        id: '1',
        username: 'john',
        createdAt: new Date(),
      };

      vi.mocked(service.signup).mockResolvedValue({
        user,
        tokens: {
          accessToken: 'access',
          refreshToken: 'refresh',
        },
      });

      const result = await controller.signup(dto, res);

      expect(service.signup).toHaveBeenCalledWith(dto);

      expect(res.cookie).toHaveBeenCalledWith(
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
      } as any;

      const res = {
        cookie: vi.fn(),
      } as any;

      vi.mocked(service.generateTokens).mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      const result = await controller.login(req, res);

      expect(service.generateTokens).toHaveBeenCalledWith('1', 'john');

      expect(res.cookie).toHaveBeenCalledWith(
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
      } as any;

      const res = {
        cookie: vi.fn(),
      } as any;

      vi.mocked(service.refresh).mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await controller.refresh(req, res);

      expect(service.refresh).toHaveBeenCalledWith('old-refresh-token');

      expect(res.cookie).toHaveBeenCalledWith(
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

  describe('logout', () => {
    it('should clear refresh cookie', () => {
      const res = {
        clearCookie: vi.fn(),
      } as any;

      const result = controller.logout(res);

      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');

      expect(result).toEqual({
        message: 'Logged out successfully',
      });
    });
  });
});
