import { serializableTransaction } from '../common/database/serializable-transaction';
import type { PrismaService } from '../prisma/prisma.service';
import type { SocialDb } from './social.select';

export function socialTransaction<T>(
  prisma: PrismaService,
  operation: (tx: SocialDb) => Promise<T>,
): Promise<T> {
  return serializableTransaction(
    prisma,
    operation,
    'Please retry this social update',
  );
}
