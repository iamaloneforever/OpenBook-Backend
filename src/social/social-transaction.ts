import { ServiceUnavailableException } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SocialDb } from './social.select';

function isTransactionConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  )
    return true;
  // adapter-pg can expose COMMIT failures directly instead of wrapping them in P2034.
  if (
    !(error instanceof Error) ||
    !error.cause ||
    typeof error.cause !== 'object'
  )
    return false;
  const cause = error.cause;
  return (
    'originalCode' in cause &&
    ['40001', '40P01'].includes(String(cause.originalCode))
  );
}

export async function socialTransaction<T>(
  prisma: PrismaService,
  operation: (tx: SocialDb) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isTransactionConflict(error)) throw error;
      if (attempt === 2)
        throw new ServiceUnavailableException(
          'Please retry this social update',
        );
      await setTimeout(5 * (attempt + 1));
    }
  }
  throw new ServiceUnavailableException();
}
