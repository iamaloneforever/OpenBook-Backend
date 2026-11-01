import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedCursorService } from './feed-cursor.service';
import type { FeedCursor } from './feed-cursor.service';

const id = 'c123456789012345678901234';
let service: FeedCursorService;
let cursor: FeedCursor;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-31T10:00:00Z'));
  service = new FeedCursorService(
    new ConfigService({ JWT_ACCESS_SECRET: 'test-secret' }),
  );
  cursor = {
    scope: 'feed:for-you:alice',
    issuedAt: Date.now(),
    asOf: new Date().toISOString(),
    remaining: [id],
  };
});
afterEach(() => vi.useRealTimers());

describe('signed feed cursors', () => {
  it('round-trips a ranked snapshot and chronological position', () => {
    expect(service.decode(service.encode(cursor), cursor.scope)).toEqual(
      cursor,
    );
    const chronological = {
      ...cursor,
      remaining: undefined,
      before: { id, createdAt: cursor.asOf },
    };
    expect(service.decode(service.encode(chronological), cursor.scope)).toEqual(
      chronological,
    );
  });
  it('rejects tampering', () => {
    const token = service.encode(cursor);
    expect(() => service.decode(`x${token.slice(1)}`, cursor.scope)).toThrow(
      'Invalid or expired',
    );
  });
  it.each(['feed:for-you:bob', 'feed:recent:alice', 'profile:alice:public'])(
    'rejects scope reuse for %s',
    (scope) => {
      expect(() => service.decode(service.encode(cursor), scope)).toThrow(
        'Invalid or expired',
      );
    },
  );
  it('expires after fifteen minutes', () => {
    const token = service.encode(cursor);
    vi.advanceTimersByTime(15 * 60_000 + 1);
    expect(() => service.decode(token, cursor.scope)).toThrow(
      'Invalid or expired',
    );
  });
  it.each(['', '.', 'bad.token', 'bad.token.extra', 'a'.repeat(16001)])(
    'rejects malformed tokens',
    (token) => {
      expect(() => service.decode(token, cursor.scope)).toThrow(
        'Invalid or expired',
      );
    },
  );
  it.each([
    { asOf: 'invalid' },
    { issuedAt: Infinity },
    { issuedAt: Date.parse('2030-01-01') },
    { remaining: ['invalid-id'] },
    { remaining: [id, id] },
    { remaining: undefined },
    { before: { id, createdAt: 'invalid' } },
    { remaining: undefined, before: { id, createdAt: '2030-01-01' } },
  ])('rejects invalid signed payloads: %j', (change) => {
    const bad = { ...cursor, ...change };
    expect(() => service.decode(service.encode(bad), cursor.scope)).toThrow(
      'Invalid or expired',
    );
  });
  it('fails safely when the signing secret changes', () => {
    const token = service.encode(cursor);
    const other = new FeedCursorService(
      new ConfigService({ JWT_ACCESS_SECRET: 'other-secret' }),
    );
    expect(() => other.decode(token, cursor.scope)).toThrow(
      'Invalid or expired',
    );
  });
  it('keeps a full snapshot below common reverse-proxy request-line limits', () => {
    const remaining = Array.from(
      { length: 300 },
      () =>
        'c' +
        [...randomBytes(24)].map((value) => (value % 36).toString(36)).join(''),
    );
    const full = { ...cursor, remaining };
    const token = service.encode(full);
    expect(token.length).toBeLessThan(7500);
    expect(service.decode(token, cursor.scope)).toEqual(full);
  });
});
