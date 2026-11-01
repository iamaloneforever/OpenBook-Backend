import { configuredOrigins } from './http.config';

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (typeof config[name] !== 'string' || !config[name].trim()) {
      throw new Error(`${name} must be configured`);
    }
  }

  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different');
  }

  if (config.NODE_ENV === 'production') {
    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if ((config[name] as string).trim().length < 32) {
        throw new Error(
          `${name} must contain at least 32 characters in production`,
        );
      }
    }
  }
  configuredOrigins(config.CORS_ORIGINS);
  for (const name of ['GOOGLE_BOOKS_API_KEY', 'BOOK_CATALOG_USER_AGENT']) {
    const value = config[name];
    if (
      value !== undefined &&
      value !== '' &&
      (typeof value !== 'string' ||
        !value.trim() ||
        value.length > 512 ||
        /[\r\n]/.test(value))
    )
      throw new Error(
        `${name} must be a nonempty string of at most 512 characters without line breaks`,
      );
  }
  if (config.CHAT_REDIS_URL !== undefined && config.CHAT_REDIS_URL !== '') {
    try {
      if (typeof config.CHAT_REDIS_URL !== 'string') throw new Error();
      const redisUrl = new URL(config.CHAT_REDIS_URL);
      if (
        !['redis:', 'rediss:'].includes(redisUrl.protocol) ||
        !redisUrl.hostname ||
        redisUrl.hash
      )
        throw new Error();
    } catch {
      throw new Error(
        'CHAT_REDIS_URL must be a valid redis:// or rediss:// URL',
      );
    }
  }
  if (
    config.PORT !== undefined &&
    ((typeof config.PORT !== 'string' && typeof config.PORT !== 'number') ||
      !/^\d+$/.test(String(config.PORT)) ||
      Number(config.PORT) < 1 ||
      Number(config.PORT) > 65535)
  ) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  if (config.SOCIAL_PUBLIC_URL !== undefined) {
    try {
      if (typeof config.SOCIAL_PUBLIC_URL !== 'string') throw new Error();
      const url = new URL(config.SOCIAL_PUBLIC_URL);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        'SOCIAL_PUBLIC_URL must be an absolute HTTP(S) URL without credentials, query, or fragment',
      );
    }
  }

  return config;
}
