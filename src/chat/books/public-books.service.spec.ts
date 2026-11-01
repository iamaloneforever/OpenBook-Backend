import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { PublicBooksService } from './public-books.service';
import type { CatalogHttpService } from './catalog-http.service';
import { CatalogProvider } from './catalog.dto';

function setup(key = '') {
  const json = vi.fn();
  const service = new PublicBooksService(
    { json } as unknown as CatalogHttpService,
    new ConfigService({ GOOGLE_BOOKS_API_KEY: key }),
  );
  return { service, json };
}

describe('public book discovery', () => {
  it('interleaves public sources so one provider cannot crowd out the other', async () => {
    const { service, json } = setup('key');
    json.mockImplementation((provider: CatalogProvider) =>
      Promise.resolve(
        provider === CatalogProvider.OPEN_LIBRARY
          ? {
              docs: [
                { key: '/works/OL1W', title: 'OL one' },
                { key: '/works/OL2W', title: 'OL two' },
              ],
            }
          : { items: [{ id: 'Google1', volumeInfo: { title: 'Google one' } }] },
      ),
    );
    const result = await service.search({
      q: 'Book',
      provider: 'all',
      limit: 2,
    });
    expect(result.data.map((book) => book.provider)).toEqual([
      'openlibrary',
      'google',
    ]);
  });
  it('searches public Open Library metadata and reuses trusted results for previews', async () => {
    const { service, json } = setup();
    json.mockResolvedValue({
      docs: [
        {
          key: '/works/OL1W',
          title: 'Public book',
          author_name: ['Author'],
          cover_i: 123,
          first_publish_year: 1950,
          isbn: ['9780140328721'],
        },
      ],
    });
    const result = await service.search({
      q: 'Public book',
      provider: 'all',
      limit: 10,
    });
    expect(result.providers.google).toBe('not_configured');
    expect(result.data[0]).toMatchObject({
      provider: 'openlibrary',
      id: 'OL1W',
      title: 'Public book',
      authors: ['Author'],
      coverUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg',
    });
    expect(
      await service.preview({
        provider: CatalogProvider.OPEN_LIBRARY,
        id: 'OL1W',
      }),
    ).toEqual(result.data[0]);
    expect(json).toHaveBeenCalledOnce();
    const url = json.mock.calls[0][1] as URL;
    expect(url.origin).toBe('https://openlibrary.org');
    expect(url.searchParams.get('q')).toBe('Public book');
    expect(url.searchParams.get('fields')).not.toContain('*');
  });
  it('combines Google Books and Open Library, strips active markup and keeps API keys server-side', async () => {
    const { service, json } = setup('PRIVATE_API_KEY');
    json.mockImplementation((provider: CatalogProvider) =>
      Promise.resolve(
        provider === CatalogProvider.OPEN_LIBRARY
          ? { docs: [] }
          : {
              items: [
                {
                  id: 'Google1',
                  volumeInfo: {
                    title: 'Book',
                    authors: ['Author'],
                    description:
                      '<script>PRIVATE_SCRIPT</script><p>Readable &amp; safe</p>',
                    publishedDate: '2001-01',
                    imageLinks: {
                      thumbnail: 'http://attacker.example/tracker',
                    },
                    previewLink: 'http://attacker.example/',
                  },
                },
              ],
            },
      ),
    );
    const result = await service.search({
      q: 'Book',
      provider: 'all',
      limit: 10,
    });
    expect(result.data[0]).toMatchObject({
      description: 'Readable & safe',
      publishedYear: 2001,
      url: 'https://books.google.com/books?id=Google1',
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|attacker/);
    const googleCall = json.mock.calls.find(
      (call) => call[0] === CatalogProvider.GOOGLE,
    )!;
    expect((googleCall[1] as URL).searchParams.get('key')).toBe(
      'PRIVATE_API_KEY',
    );
  });
  it('returns available provider results when another public catalog fails', async () => {
    const { service, json } = setup('key');
    json.mockImplementation((provider: CatalogProvider) =>
      provider === CatalogProvider.GOOGLE
        ? Promise.reject(new Error('PRIVATE_UPSTREAM_DIAGNOSTICS'))
        : Promise.resolve({
            docs: [{ key: '/works/OL1W', title: 'Available' }],
          }),
    );
    const result = await service.search({
      q: 'Book',
      provider: 'all',
      limit: 10,
    });
    expect(result.providers).toMatchObject({
      openlibrary: 'ok',
      google: 'unavailable',
    });
    expect(result.data).toHaveLength(1);
  });
  it('requires a Google key only when Google is explicitly requested', async () => {
    const { service, json } = setup();
    await expect(
      service.search({ q: 'Book', provider: 'google', limit: 10 }),
    ).rejects.toThrow('not configured');
    expect(json).not.toHaveBeenCalled();
  });
  it('deduplicates concurrent preview lookups and never fetches a client-controlled host', async () => {
    const { service, json } = setup();
    json.mockResolvedValue({
      title: 'Book',
      description: { value: 'Description' },
      covers: [42],
    });
    const ref = { provider: CatalogProvider.OPEN_LIBRARY, id: 'OL42W' };
    const results = await Promise.all([
      service.preview(ref),
      service.preview(ref),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(json).toHaveBeenCalledOnce();
    expect((json.mock.calls[0][1] as URL).href).toBe(
      'https://openlibrary.org/works/OL42W.json',
    );
    await expect(
      service.preview({ ...ref, id: '../../secret' }),
    ).rejects.toThrow('Invalid public book');
  });
});
