import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it.each([
    { GOOGLE_BOOKS_API_KEY: 123 },
    { GOOGLE_BOOKS_API_KEY: '   ' },
    { BOOK_CATALOG_USER_AGENT: 'OpenBook\r\nInjected: value' },
    { BOOK_CATALOG_USER_AGENT: 'x'.repeat(513) },
  ])('rejects invalid public catalog configuration %j', (extra) => {
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        ...extra,
      }),
    ).toThrow(/GOOGLE_BOOKS_API_KEY|BOOK_CATALOG_USER_AGENT/);
  });
  it.each([
    'https://redis.example',
    'redis://',
    'redis://example.com/#fragment',
    {},
  ])('rejects invalid chat Redis configuration %j', (CHAT_REDIS_URL) => {
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        CHAT_REDIS_URL,
      }),
    ).toThrow('CHAT_REDIS_URL');
  });
  const secrets = {
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
  };

  it('rejects short production signing secrets', () => {
    expect(() =>
      validateEnvironment({
        ...secrets,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'short',
      }),
    ).toThrow('at least 32 characters');
  });

  it.each([
    '*',
    'https://example.com/path',
    'https://example.com/',
    'https://example.com,',
    'null',
  ])('rejects unsafe CORS configuration: %s', (CORS_ORIGINS) => {
    expect(() => validateEnvironment({ ...secrets, CORS_ORIGINS })).toThrow(
      'CORS_ORIGINS',
    );
  });

  it.each(['0', '-1', '65536', '1.5', 'named-pipe'])(
    'rejects invalid ports: %s',
    (PORT) => {
      expect(() => validateEnvironment({ ...secrets, PORT })).toThrow('PORT');
    },
  );
  it('requires both JWT secrets', () => {
    expect(() =>
      validateEnvironment({ JWT_ACCESS_SECRET: 'access-secret' }),
    ).toThrow('JWT_REFRESH_SECRET must be configured');
  });

  it('requires distinct JWT secrets', () => {
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: 'same-secret',
        JWT_REFRESH_SECRET: 'same-secret',
      }),
    ).toThrow('JWT access and refresh secrets must be different');
  });
  it.each([
    'ftp://example.com',
    'https://user:password@example.com',
    'https://example.com?query=1',
    'https://example.com/#fragment',
    'relative',
    '',
    null,
  ])('rejects invalid social public URL %j', (SOCIAL_PUBLIC_URL) => {
    expect(() =>
      validateEnvironment({
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        SOCIAL_PUBLIC_URL,
      }),
    ).toThrow('SOCIAL_PUBLIC_URL');
  });
  it('accepts a configured public URL with a deployment prefix', () => {
    expect(
      validateEnvironment({
        JWT_ACCESS_SECRET: 'access',
        JWT_REFRESH_SECRET: 'refresh',
        SOCIAL_PUBLIC_URL: 'https://example.com/api',
      }).SOCIAL_PUBLIC_URL,
    ).toBe('https://example.com/api');
  });
});
