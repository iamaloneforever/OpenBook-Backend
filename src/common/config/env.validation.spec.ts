import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
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
});
