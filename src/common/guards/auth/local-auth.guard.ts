import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { LoginDto } from '../../dtos/auth/login.dto';
import { firstValueFrom, isObservable } from 'rxjs';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  private readonly validation = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    await this.validation.transform(req.body, {
      type: 'body',
      metatype: LoginDto,
    });
    const result = await super.canActivate(context);
    return isObservable(result) ? firstValueFrom(result) : result;
  }

  handleRequest<TUser = any>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ExecutionContext,
  ): TUser {
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
