import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from '../common/dtos/auth/signup.dto';

interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const { username, password } = dto;

    const existingUser = await this.prisma.user.findUnique({
      where: {
        username,
      },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const hashedPassword = await argon2.hash(password);

    const user = await this.prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.username);

    return {
      user,
      tokens,
    };
  }

  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        username,
      },
    });

    if (!user) {
      return null;
    }

    const validPassword = await argon2.verify(user.password, password);

    if (!validPassword) {
      return null;
    }

    return user;
  }

  async refresh(refreshToken: unknown) {
    if (
      typeof refreshToken !== 'string' ||
      !refreshToken ||
      refreshToken.length > 4096
    ) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const payload = this.verifyRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const valid = await argon2.verify(user.refreshToken, refreshToken);

    if (!valid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateTokens(user.id, user.username, user.refreshToken);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        refreshToken: null,
      },
    });

    return {
      message: 'Logged out successfully',
    };
  }

  async generateTokens(
    userId: string,
    username: string,
    expectedRefreshToken?: string,
  ) {
    const payload = {
      sub: userId,
      username,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
      algorithm: 'HS256',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
      jwtid: randomUUID(),
      algorithm: 'HS256',
    });

    const hashedRefreshToken = await argon2.hash(refreshToken);

    if (expectedRefreshToken !== undefined) {
      // Only the request holding the current token can rotate the session.
      // A concurrent refresh or logout must not be overwritten.
      const result = await this.prisma.user.updateMany({
        where: { id: userId, refreshToken: expectedRefreshToken },
        data: { refreshToken: hashedRefreshToken },
      });
      if (result.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken: hashedRefreshToken },
      });
    }

    return {
      accessToken,
      refreshToken,
    };
  }

  private verifyRefreshToken(token: string): JwtPayload {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.sub.length > 128
      )
        throw new Error('Invalid subject');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
