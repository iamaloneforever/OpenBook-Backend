import {
  BadGatewayException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRateLimitService } from '../chat-rate-limit.service';
import { CatalogProvider } from './catalog.dto';
import { setTimeout } from 'node:timers/promises';

export const CATALOG_FETCH = Symbol('CATALOG_FETCH');

@Injectable()
export class CatalogHttpService {
  constructor(
    private readonly limits: ChatRateLimitService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(CATALOG_FETCH)
    private readonly request: typeof fetch = fetch,
  ) {}

  async json(provider: CatalogProvider, url: URL): Promise<unknown> {
    const allowed =
      provider === CatalogProvider.OPEN_LIBRARY
        ? 'https://openlibrary.org'
        : 'https://www.googleapis.com';
    if (url.origin !== allowed || url.username || url.password)
      throw new BadGatewayException('Invalid catalog endpoint');
    try {
      await this.limits.consume(
        'catalog-provider',
        provider,
        provider === CatalogProvider.OPEN_LIBRARY ? 1 : 5,
        1000,
      );
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() !== 429)
        throw error;
      await setTimeout(1000);
      await this.limits.consume(
        'catalog-provider',
        provider,
        provider === CatalogProvider.OPEN_LIBRARY ? 1 : 5,
        1000,
      );
    }
    try {
      const response = await this.request(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'application/json',
          'User-Agent':
            this.config.get<string>('BOOK_CATALOG_USER_AGENT') ||
            'OpenBook/1.0 (public book lookup)',
        },
      });
      if (response.status === 404) {
        await response.body?.cancel();
        throw new NotFoundException('Public book not found');
      }
      if (
        !response.ok ||
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .includes('application/json') ||
        Number(response.headers.get('content-length') ?? 0) > 1048576
      ) {
        await response.body?.cancel();
        throw new Error();
      }
      if (!response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1048576) {
            await reader.cancel();
            throw new Error();
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      ) as unknown;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadGatewayException('Public book catalog is unavailable');
    }
  }
}
