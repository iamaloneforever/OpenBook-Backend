// common/guards/owner.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/prisma/prisma.service';
import { OWNER_KEY } from '../../decorators/owner.decorator';
import { OWNER_CONFIG } from '../../config/owner.config';

@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.get<{
      resource: keyof typeof OWNER_CONFIG;
      param: string;
    }>(OWNER_KEY, context.getHandler());

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const user = request.user;
    const id = request.params[metadata.param];

    const config = OWNER_CONFIG[metadata.resource];

    const delegate = this.prisma[config.delegate as keyof PrismaService] as {
      findFirst(args: unknown): Promise<unknown>;
    };

    const entity = await delegate.findFirst({
      where: {
        id,
        [config.ownerField]: user.id,
      },
    });

    if (!entity) {
      throw new NotFoundException(`${metadata.resource} not found`);
    }

    request.resource = entity;

    return true;
  }
}
