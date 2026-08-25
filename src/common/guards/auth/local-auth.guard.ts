import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  handleRequest<TUser = any>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ExecutionContext,
  ): TUser {
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
