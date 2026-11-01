import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/Current-user.decorator';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import type { User } from '../generated/prisma/client';

import type { CookieOptions, Request, Response } from 'express';
import { createHash } from 'crypto';
import { Throttle } from '@nestjs/throttler';

import { SignupDto } from '../common/dtos/auth/signup.dto';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from '../common/guards/auth/local-auth.guard';

type TrackerRequest = {
  body?: { username?: unknown };
  cookies?: { refreshToken?: unknown };
  ip?: string;
  socket?: { remoteAddress?: string };
};

const ipTracker = (req: TrackerRequest) =>
  `ip:${req.ip ?? req.socket?.remoteAddress ?? 'unknown'}`;

const authAccountTracker = (req: TrackerRequest) => {
  const username = req.body?.username;
  return typeof username === 'string' && username.trim()
    ? `username:${username.trim().toLowerCase()}`
    : ipTracker(req);
};

const refreshTracker = (req: TrackerRequest) => {
  const token = req.cookies?.refreshToken;
  return typeof token === 'string' && token
    ? `refresh:${createHash('sha256').update(token).digest('hex')}`
    : ipTracker(req);
};

const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/auth',
});

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie('refreshToken', token, {
    ...refreshCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @Throttle({ ip: { limit: 10, ttl: 60_000 } })
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.signup(dto);

    setRefreshCookie(res, tokens.refreshToken);

    return {
      message: 'User created successfully',
      user,
      accessToken: tokens.accessToken,
    };
  }
  @Post('login')
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000, getTracker: authAccountTracker },
  })
  @UseGuards(LocalAuthGuard)
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as {
      id: string;
      username: string;
    };

    const tokens = await this.authService.generateTokens(
      user.id,
      user.username,
    );

    setRefreshCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
    };
  }
  @Post('refresh')
  @Throttle({
    ip: { limit: 10, ttl: 60_000 },
    account: { limit: 5, ttl: 60_000, getTracker: refreshTracker },
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken: unknown = req.cookies?.refreshToken;

    const tokens = await this.authService.refresh(refreshToken);

    setRefreshCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
    };
  }
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id);
    res.clearCookie('refreshToken', refreshCookieOptions());
    // Expire cookies issued before refresh cookies were scoped to /auth.
    res.clearCookie('refreshToken', { ...refreshCookieOptions(), path: '/' });

    return {
      message: 'Logged out successfully',
    };
  }
}
