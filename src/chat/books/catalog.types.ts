import { BadRequestException } from '@nestjs/common';
import { CatalogProvider } from './catalog.dto';

export interface PublicBookPreview {
  provider: CatalogProvider;
  id: string;
  title: string;
  authors: string[];
  description: string | null;
  publishedYear: number | null;
  isbn: string | null;
  url: string;
  coverUrl: string | null;
  previewUrl: string | null;
}

export interface BookReference {
  provider: CatalogProvider;
  id: string;
}

export function validReference(
  provider: CatalogProvider,
  id: string,
): BookReference {
  const valid =
    provider === CatalogProvider.OPEN_LIBRARY
      ? /^OL[0-9]{1,12}[WM]$/.test(id)
      : provider === CatalogProvider.GOOGLE && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
  if (!valid) throw new BadRequestException('Invalid public book reference');
  return { provider, id };
}

export function referenceFromUrl(raw: string): BookReference {
  try {
    const url = new URL(raw);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error();
    if (['openlibrary.org', 'www.openlibrary.org'].includes(url.hostname)) {
      const match =
        /^\/(works|books)\/(OL[0-9]{1,12}[WM])(?:\/[^/]*)?\/?$/.exec(
          url.pathname,
        );
      if (!match || (match[1] === 'works') !== match[2].endsWith('W'))
        throw new Error();
      return validReference(CatalogProvider.OPEN_LIBRARY, match[2]);
    }
    if (['books.google.com', 'www.books.google.com'].includes(url.hostname)) {
      const edition = /^\/books\/edition\/[^/]+\/([a-zA-Z0-9_-]+)\/?$/.exec(
        url.pathname,
      );
      const id =
        url.pathname === '/books' ? url.searchParams.get('id') : edition?.[1];
      if (id) return validReference(CatalogProvider.GOOGLE, id);
    }
  } catch {
    /* Return a uniform error without echoing user URLs. */
  }
  throw new BadRequestException(
    'Use an Open Library or Google Books book link',
  );
}

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function previewSnapshot(value: unknown): PublicBookPreview | null {
  const item = asRecord(value);
  if (
    !Object.values(CatalogProvider).includes(
      item.provider as CatalogProvider,
    ) ||
    typeof item.id !== 'string' ||
    typeof item.title !== 'string'
  )
    return null;
  try {
    validReference(item.provider as CatalogProvider, item.id);
  } catch {
    return null;
  }
  const provider = item.provider as CatalogProvider;
  const url =
    provider === CatalogProvider.OPEN_LIBRARY
      ? `https://openlibrary.org/${item.id.endsWith('W') ? 'works' : 'books'}/${item.id}`
      : `https://books.google.com/books?id=${item.id}`;
  const image = typeof item.coverUrl === 'string' ? item.coverUrl : null;
  const allowedCover =
    image &&
    (/^https:\/\/covers\.openlibrary\.org\/b\/id\/[0-9]+-M\.jpg$/.test(image) ||
      /^https:\/\/books\.google\.com\/books\/content\?/.test(image))
      ? image
      : null;
  return {
    provider,
    id: item.id,
    title: item.title.slice(0, 300),
    authors: Array.isArray(item.authors)
      ? item.authors
          .filter((x): x is string => typeof x === 'string')
          .slice(0, 5)
          .map((x) => x.slice(0, 150))
      : [],
    description:
      typeof item.description === 'string'
        ? item.description.slice(0, 1000)
        : null,
    publishedYear:
      typeof item.publishedYear === 'number' &&
      Number.isInteger(item.publishedYear)
        ? item.publishedYear
        : null,
    isbn:
      typeof item.isbn === 'string' && /^[0-9Xx-]{10,17}$/.test(item.isbn)
        ? item.isbn
        : null,
    url,
    coverUrl: allowedCover,
    previewUrl:
      provider === CatalogProvider.GOOGLE && item.previewUrl
        ? `${url}&printsec=frontcover`
        : null,
  };
}
