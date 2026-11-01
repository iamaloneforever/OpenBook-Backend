import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export interface FeedCursor {
  scope: string;
  issuedAt: number;
  asOf: string;
  before?: { createdAt: string; id: string };
  remaining?: string[];
}

const CUID = /^c[a-z0-9]{24}$/;
const validDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

@Injectable()
export class FeedCursorService {
  constructor(private readonly config: ConfigService) {}

  encode(cursor: FeedCursor): string {
    // Compression keeps a 300-item snapshot within common reverse-proxy URL limits.
    const body = deflateRawSync(Buffer.from(JSON.stringify(cursor))).toString(
      'base64url',
    );
    return `${body}.${this.sign(body).toString('base64url')}`;
  }

  decode(token: string, scope: string): FeedCursor {
    try {
      if (token.length > 16000) throw new Error();
      const parts = token.split('.');
      if (parts.length !== 2) throw new Error();
      const [body, signature] = parts;
      const expected = this.sign(body);
      const actual = Buffer.from(signature, 'base64url');
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new Error();
      const value = JSON.parse(
        inflateRawSync(Buffer.from(body, 'base64url'), {
          maxOutputLength: 16000,
        }).toString(),
      ) as FeedCursor;
      const now = Date.now();
      if (
        value.scope !== scope ||
        !Number.isSafeInteger(value.issuedAt) ||
        value.issuedAt > now ||
        now - value.issuedAt > 15 * 60_000 ||
        !validDate(value.asOf) ||
        Date.parse(value.asOf) > now ||
        (!value.before && !value.remaining) ||
        (value.before && value.remaining)
      )
        throw new Error();
      if (
        value.before &&
        (!validDate(value.before.createdAt) ||
          Date.parse(value.before.createdAt) > Date.parse(value.asOf) ||
          !CUID.test(value.before.id))
      )
        throw new Error();
      if (
        value.remaining &&
        (!Array.isArray(value.remaining) ||
          value.remaining.length > 300 ||
          !value.remaining.every(
            (id) => typeof id === 'string' && CUID.test(id),
          ) ||
          new Set(value.remaining).size !== value.remaining.length)
      )
        throw new Error();
      return value;
    } catch {
      throw new BadRequestException('Invalid or expired feed cursor');
    }
  }

  private sign(body: string): Buffer {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update('openbook:social-feed:v1:')
      .update(body)
      .digest();
  }
}
