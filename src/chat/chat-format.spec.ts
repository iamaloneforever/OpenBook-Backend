import { describe, expect, it } from 'vitest';
import {
  messageExcerpt,
  messageReferences,
  messageSegments,
} from './chat-format';
import { CatalogProvider } from './books/catalog.dto';
import { previewSnapshot, referenceFromUrl } from './books/catalog.types';

describe('chat formatting and public book links', () => {
  it('marks inline spoilers without turning HTML into executable markup', () => {
    expect(
      messageSegments('Read <b>this</b> ||the ending|| https://example.com.'),
    ).toEqual([
      { type: 'text', text: 'Read <b>this</b> ' },
      { type: 'spoiler', text: 'the ending' },
      { type: 'text', text: ' ' },
      {
        type: 'link',
        text: 'https://example.com',
        href: 'https://example.com/',
      },
      { type: 'text', text: '.' },
    ]);
    expect(messageExcerpt('Public ||SECRET ENDING|| text')).toBe(
      'Public [Spoiler] text',
    );
    expect(messageExcerpt('SECRET BODY', true)).toBe('[Spoiler]');
  });
  it('keeps unmatched spoiler markers literal and bounds pathological formatting', () => {
    expect(messageSegments('unclosed || text')).toEqual([
      { type: 'text', text: 'unclosed || text' },
    ]);
    const content = 'a||hidden||'.repeat(150);
    expect(messageSegments(content)).toHaveLength(1);
    expect(messageExcerpt(content)).toBe('[Spoiler]');
  });
  it.each([
    [
      'https://openlibrary.org/works/OL45804W/The_Wonderful_Wizard_of_Oz',
      'openlibrary',
      'OL45804W',
    ],
    [
      'http://openlibrary.org/books/OL123M?tracking=ignored',
      'openlibrary',
      'OL123M',
    ],
    [
      'https://books.google.com/books?id=Ab_c-12&source=chat',
      'google',
      'Ab_c-12',
    ],
    [
      'https://books.google.com/books/edition/Title/Abc_123',
      'google',
      'Abc_123',
    ],
  ])('recognizes public catalog identity from %s', (url, provider, id) => {
    expect(referenceFromUrl(url)).toEqual({ provider, id });
  });
  it.each([
    'http://127.0.0.1/book',
    'https://openlibrary.org.attacker.example/works/OL1W',
    'https://user:password@openlibrary.org/works/OL1W',
    'https://openlibrary.org:8443/works/OL1W',
    'https://openlibrary.org/works/../../secret',
    'javascript:alert(1)',
    'https://books.google.com/books?id=http://localhost',
  ])('rejects unsupported links: %s', (url) => {
    expect(() => referenceFromUrl(url)).toThrow();
  });
  it('extracts only non-spoiler supported links, deduplicates and bounds attachments', () => {
    const dto = {
      clientMessageId: 'unused',
      content:
        'https://openlibrary.org/works/OL1W ||https://openlibrary.org/works/OL2W|| https://example.com',
      books: [{ provider: CatalogProvider.OPEN_LIBRARY, id: 'OL1W' }],
    };
    expect(messageReferences(dto).refs).toEqual([
      { provider: 'openlibrary', id: 'OL1W' },
    ]);
    expect(() =>
      messageReferences({
        ...dto,
        books: [1, 2, 3, 4].map((n) => ({
          provider: CatalogProvider.OPEN_LIBRARY,
          id: `OL${n}W`,
        })),
      }),
    ).toThrow('at most three');
  });
  it('discards untrusted cover URLs from public metadata', () => {
    const card = previewSnapshot({
      provider: 'google',
      id: 'Abc',
      title: 'Book',
      authors: ['Author'],
      coverUrl: 'http://127.0.0.1/secret',
      previewUrl: 'javascript:alert(1)',
    });
    expect(card?.coverUrl).toBeNull();
    expect(card?.previewUrl).toBe(
      'https://books.google.com/books?id=Abc&printsec=frontcover',
    );
  });
});
