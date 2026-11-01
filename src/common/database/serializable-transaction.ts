import { ServiceUnavailableException } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

export async function serializableTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  retryMessage = 'Please retry this update',
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const conflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034';
      const cause =
        error instanceof Error && typeof error.cause === 'object'
          ? error.cause
          : null;
      const adapterConflict =
        cause &&
        'originalCode' in cause &&
        ['40001', '40P01'].includes(String(cause.originalCode));
      if (!conflict && !adapterConflict) throw error;
      if (attempt === 2) throw new ServiceUnavailableException(retryMessage);
      await setTimeout(5 * (attempt + 1));
    }
  }
  throw new ServiceUnavailableException(retryMessage);
}
