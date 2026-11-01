import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainText } from '../../social/rss/feed-parser';
import { CatalogHttpService } from './catalog-http.service';
import { CatalogProvider, type CatalogSearchDto } from './catalog.dto';
import {
  asRecord,
  previewSnapshot,
  validReference,
  type BookReference,
  type PublicBookPreview,
} from './catalog.types';

// eslint-disable-next-line no-control-regex -- vendor text must be valid PostgreSQL JSON and safe plain text.
const CATALOG_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const text = (value: unknown, max: number) =>
  typeof value === 'string'
    ? plainText(value, max)
        .replace(CATALOG_CONTROLS, '')
        .replace(/[\uD800-\uDFFF]/gu, '\uFFFD')
    : '';

@Injectable()
export class PublicBooksService {
  private readonly cache = new Map<
    string,
    { expires: number; value: unknown }
  >();
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(
    private readonly http: CatalogHttpService,
    private readonly config: ConfigService,
  ) {}

  private async memo<T>(
    key: string,
    ttl: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.value as T;
    const active = this.pending.get(key);
    if (active) return active as Promise<T>;
    if (this.pending.size >= 20)
      throw new ServiceUnavailableException('Public book lookup is busy');
    const operation = action()
      .then((value) => {
        if (this.cache.size >= 500)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { expires: Date.now() + ttl, value });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }

  private googleKey() {
    const key = this.config.get<string>('GOOGLE_BOOKS_API_KEY');
    if (!key)
      throw new ServiceUnavailableException('Google Books is not configured');
    return key;
  }

  private openLibrary(
    item: Record<string, unknown>,
    id: string,
  ): PublicBookPreview | null {
    const covers: unknown[] = Array.isArray(item.covers) ? item.covers : [];
    const cover: unknown =
      typeof item.cover_i === 'number'
        ? item.cover_i
        : covers.find((x) => typeof x === 'number' && x > 0);
    const description =
      typeof item.description === 'string'
        ? item.description
        : asRecord(item.description).value;
    const authors: unknown[] = Array.isArray(item.author_name)
      ? item.author_name
      : [];
    const isbn: unknown = Array.isArray(item.isbn)
      ? item.isbn.find(
          (x) => typeof x === 'string' && /^[0-9Xx-]{10,17}$/.test(x),
        )
      : null;
    return previewSnapshot({
      provider: CatalogProvider.OPEN_LIBRARY,
      id,
      title: text(item.title, 300),
      authors: authors
        .filter((x): x is string => typeof x === 'string')
        .map((x) => text(x, 150)),
      description: text(description, 1000) || null,
      publishedYear:
        typeof item.first_publish_year === 'number'
          ? item.first_publish_year
          : null,
      isbn,
      coverUrl:
        typeof cover === 'number' && Number.isSafeInteger(cover) && cover > 0
          ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg`
          : null,
    });
  }

  private google(item: Record<string, unknown>): PublicBookPreview | null {
    if (typeof item.id !== 'string') return null;
    const info = asRecord(item.volumeInfo);
    const images = asRecord(info.imageLinks);
    const year =
      typeof info.publishedDate === 'string'
        ? /^([0-9]{4})/.exec(info.publishedDate)
        : null;
    const identifiers = Array.isArray(info.industryIdentifiers)
      ? info.industryIdentifiers
      : [];
    const isbn = identifiers
      .map(asRecord)
      .find((x) => x.type === 'ISBN_13' || x.type === 'ISBN_10')?.identifier;
    return previewSnapshot({
      provider: CatalogProvider.GOOGLE,
      id: item.id,
      title: text(info.title, 300),
      authors: Array.isArray(info.authors)
        ? info.authors.map((x) => text(x, 150))
        : [],
      description: text(info.description, 1000) || null,
      publishedYear: year ? Number(year[1]) : null,
      isbn,
      coverUrl:
        images.thumbnail || images.smallThumbnail
          ? `https://books.google.com/books/content?id=${item.id}&printsec=frontcover&img=1&zoom=1`
          : null,
      previewUrl: info.previewLink ? true : null,
    });
  }

  async search(query: CatalogSearchDto) {
    if (query.provider === 'google') this.googleKey();
    return this.memo(
      `search:${query.provider}:${query.limit}:${query.q.toLowerCase()}`,
      300000,
      async () => {
        const providers =
          query.provider === 'all'
            ? [
                CatalogProvider.OPEN_LIBRARY,
                ...(this.config.get<string>('GOOGLE_BOOKS_API_KEY')
                  ? [CatalogProvider.GOOGLE]
                  : []),
              ]
            : [query.provider as CatalogProvider];
        const results = await Promise.allSettled(
          providers.map(async (provider) => {
            const url = new URL(
              provider === CatalogProvider.OPEN_LIBRARY
                ? 'https://openlibrary.org/search.json'
                : 'https://www.googleapis.com/books/v1/volumes',
            );
            url.searchParams.set('q', query.q);
            url.searchParams.set(
              provider === CatalogProvider.OPEN_LIBRARY
                ? 'limit'
                : 'maxResults',
              String(query.limit),
            );
            if (provider === CatalogProvider.OPEN_LIBRARY)
              url.searchParams.set(
                'fields',
                'key,title,author_name,cover_i,first_publish_year,isbn',
              );
            else {
              url.searchParams.set('key', this.googleKey());
              url.searchParams.set('printType', 'books');
            }
            const body = asRecord(await this.http.json(provider, url));
            const items =
              provider === CatalogProvider.OPEN_LIBRARY
                ? body.docs
                : body.items;
            if (!Array.isArray(items)) return [];
            return items
              .slice(0, query.limit)
              .map(asRecord)
              .map((item) =>
                provider === CatalogProvider.OPEN_LIBRARY
                  ? this.openLibrary(
                      item,
                      typeof item.key === 'string'
                        ? item.key.replace(/^\/works\//, '')
                        : '',
                    )
                  : this.google(item),
              )
              .filter((item): item is PublicBookPreview =>
                Boolean(item?.title),
              );
          }),
        );
        if (results.every((result) => result.status === 'rejected'))
          throw new BadGatewayException('Public book catalogs are unavailable');
        const data: PublicBookPreview[] = [];
        const batches = results.map((result) =>
          result.status === 'fulfilled' ? result.value : [],
        );
        for (const batch of batches)
          for (const item of batch) {
            this.cache.set(`book:${item.provider}:${item.id}`, {
              expires: Date.now() + 3600000,
              value: item,
            });
          }
        for (
          let index = 0;
          data.length < query.limit &&
          batches.some((batch) => batch.length > index);
          index++
        )
          for (const batch of batches)
            if (batch[index] && data.length < query.limit)
              data.push(batch[index]);
        while (this.cache.size > 500)
          this.cache.delete(this.cache.keys().next().value!);
        return {
          data,
          providers: {
            openlibrary: providers.includes(CatalogProvider.OPEN_LIBRARY)
              ? results[providers.indexOf(CatalogProvider.OPEN_LIBRARY)]
                  .status === 'fulfilled'
                ? 'ok'
                : 'unavailable'
              : 'not_requested',
            google: providers.includes(CatalogProvider.GOOGLE)
              ? results[providers.indexOf(CatalogProvider.GOOGLE)].status ===
                'fulfilled'
                ? 'ok'
                : 'unavailable'
              : this.config.get<string>('GOOGLE_BOOKS_API_KEY')
                ? 'not_requested'
                : 'not_configured',
          },
        };
      },
    );
  }

  async preview(reference: BookReference): Promise<PublicBookPreview> {
    const { provider, id } = validReference(reference.provider, reference.id);
    return this.memo(`book:${provider}:${id}`, 3600000, async () => {
      const url = new URL(
        provider === CatalogProvider.OPEN_LIBRARY
          ? `https://openlibrary.org/${id.endsWith('W') ? 'works' : 'books'}/${id}.json`
          : `https://www.googleapis.com/books/v1/volumes/${id}`,
      );
      if (provider === CatalogProvider.GOOGLE)
        url.searchParams.set('key', this.googleKey());
      const item = asRecord(await this.http.json(provider, url));
      const preview =
        provider === CatalogProvider.OPEN_LIBRARY
          ? this.openLibrary(item, id)
          : this.google(item);
      if (!preview?.title || preview.id !== id)
        throw new NotFoundException('Public book not found');
      return preview;
    });
  }
}
