import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';

export function configuredOrigins(value: unknown): string[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string')
    throw new Error('CORS_ORIGINS must be a string');
  return value.split(',').map((entry) => {
    const origin = entry.trim();
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
        throw new Error();
      return origin;
    } catch {
      throw new Error(
        'CORS_ORIGINS must contain exact HTTP(S) origins without paths or wildcards',
      );
    }
  });
}

// Used by the production entry point and HTTP security regression tests.
export function configureHttp(app: NestExpressApplication) {
  const origins = configuredOrigins(process.env.CORS_ORIGINS);
  const trustedOrigins = new Set(origins);
  if (process.env.SOCIAL_PUBLIC_URL)
    trustedOrigins.add(new URL(process.env.SOCIAL_PUBLIC_URL).origin);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('Origin');
      // CORS alone does not stop browsers submitting credentialed form requests.
      if (
        (origin !== undefined && !trustedOrigins.has(origin)) ||
        (origin === undefined && req.get('Sec-Fetch-Site') === 'cross-site')
      ) {
        res.status(403).json({
          statusCode: 403,
          message: 'Untrusted request origin',
          error: 'Forbidden',
        });
        return;
      }
    }
    next();
  });
  app.enableCors({ origin: origins, credentials: true });
  app.useBodyParser('json', { limit: '64kb' });
  app.useBodyParser('urlencoded', {
    extended: false,
    limit: '64kb',
    parameterLimit: 20,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
