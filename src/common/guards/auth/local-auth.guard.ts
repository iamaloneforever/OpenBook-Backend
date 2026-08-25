import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import type { User } from '../../../generated/prisma/client';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  handleRequest(err: unknown, user: User | false, info: unknown) {
    console.log('Guard error:', err);
    console.log('User:', user);
    console.log('Info:', info);

    if (err) {
      throw err as Error;
    }

    if (!user) {
      const message =
        info && typeof info === 'object' && 'message' in info
          ? (info as { message?: string }).message
          : undefined;

      if (message === 'Missing credentials') {
        throw new BadRequestException('Username and password are required');
      }

      throw new UnauthorizedException(message ?? 'Unauthorized');
    }

    return user;
  }
}
