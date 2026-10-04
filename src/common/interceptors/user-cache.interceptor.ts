import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class UserCacheInterceptor extends CacheInterceptor {
  protected trackBy(context: ExecutionContext): string | undefined {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();
    if (request.method !== 'GET' || !request.user?.id) return undefined;

    return JSON.stringify(['user', request.user.id, request.originalUrl]);
  }
}
