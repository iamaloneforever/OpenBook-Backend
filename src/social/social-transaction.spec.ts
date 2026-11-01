import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { socialTransaction } from './social-transaction';

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('serialization conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });

describe('social transaction recovery', () => {
  it('retries serialization conflicts', async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue('done');
    expect(
      await socialTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        vi.fn(),
      ),
    ).toBe('done');
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('returns a retryable error when contention persists', async () => {
    const transaction = vi.fn().mockRejectedValue(conflict());
    await expect(
      socialTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        vi.fn(),
      ),
    ).rejects.toThrow('Please retry');
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it('does not mask unrelated failures', async () => {
    const error = new Error('database offline');
    const transaction = vi.fn().mockRejectedValue(error);
    await expect(
      socialTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        vi.fn(),
      ),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledOnce();
  });
  it.each(['40001', '40P01'])(
    'retries adapter-level commit conflicts with SQLSTATE %s',
    async (originalCode) => {
      const error = new Error('TransactionWriteConflict', {
        cause: {
          kind:
            originalCode === '40P01' ? 'Unknown' : 'TransactionWriteConflict',
          originalCode,
        },
      });
      const transaction = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('committed');
      expect(
        await socialTransaction(
          { $transaction: transaction } as unknown as PrismaService,
          vi.fn(),
        ),
      ).toBe('committed');
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );
  it('does not retry unrelated adapter failures', async () => {
    const error = new Error('DriverError', {
      cause: { kind: 'Unknown', originalCode: '23503' },
    });
    const transaction = vi.fn().mockRejectedValue(error);
    await expect(
      socialTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        vi.fn(),
      ),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledOnce();
  });
});
