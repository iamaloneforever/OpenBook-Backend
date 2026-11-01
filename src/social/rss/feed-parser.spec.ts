import { describe, expect, it } from 'vitest';
import { parseFeed, plainText } from './feed-parser';

const base = 'https://example.com/rss';
const now = new Date('2026-10-31T10:00:00Z');
const wrap = (items: string) =>
  `<rss version="2.0"><channel><title>News &amp; Books</title>${items}</channel></rss>`;

describe('RSS and Atom import parsing', () => {
  it('parses RSS, decodes entities, strips HTML, and resolves relative links', () => {
    const feed = parseFeed(
      wrap(
        '<item><guid>article-1</guid><title>A &amp; B</title><description><![CDATA[<p>Hello <b>reader</b></p><script>steal()</script>]]></description><link>/article</link><category>Books</category><category>Science</category><pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate></item>',
      ),
      base,
      now,
    );
    expect(feed.title).toBe('News & Books');
    expect(feed.entries[0]).toMatchObject({
      title: 'A & B',
      summary: 'Hello reader',
      url: 'https://example.com/article',
      tags: ['books', 'science'],
      publishedAt: new Date('2026-10-30T10:00:00Z'),
    });
  });
  it('parses namespaced Atom and alternate links', () => {
    const feed = parseFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>urn:1</id><title>Entry</title><link rel="self" href="https://example.com/api"/><link rel="alternate" href="/story"/><summary type="html">&lt;p&gt;Text&lt;/p&gt;</summary><category term="Science"/><updated>2026-10-30T00:00:00Z</updated></entry></feed>',
      base,
      now,
    );
    expect(feed.entries[0]).toMatchObject({
      title: 'Entry',
      summary: 'Text',
      url: 'https://example.com/story',
      tags: ['science'],
    });
  });
  it('deduplicates GUIDs and keeps fallback identifiers stable across refreshes', () => {
    const xml = wrap(
      '<item><title>Same</title><description>Content</description></item><item><title>Same</title><description>Content</description></item>',
    );
    const first = parseFeed(xml, base, now);
    const next = parseFeed(xml, base, new Date(+now + 1000));
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0].guidHash).toBe(next.entries[0].guidHash);
  });
  it('bounds entries and text, and clamps future or invalid dates', () => {
    const item = `<item><title>${'a'.repeat(500)}</title><description>${'b'.repeat(3000)}</description><pubDate>9999-01-01</pubDate></item>`;
    const parsed = parseFeed(wrap(item), base, now).entries[0];
    expect(parsed.title).toHaveLength(300);
    expect(parsed.summary).toHaveLength(2000);
    expect(parsed.publishedAt).toEqual(now);
    expect(
      parseFeed(
        wrap(
          Array.from(
            { length: 250 },
            (_, i) => `<item><guid>${i}</guid><title>Item</title></item>`,
          ).join(''),
        ),
        base,
      ).entries,
    ).toHaveLength(200);
  });
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:password@example.com/a',
  ])('drops unsafe item links %s', (link) => {
    expect(
      parseFeed(
        wrap(`<item><title>Text</title><link>${link}</link></item>`),
        base,
      ).entries[0].url,
    ).toBeNull();
  });
  it.each([
    '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',
    '<!DOCTYPE rss [<!ENTITY x "lol">]><rss/>',
    '<rss><channel>',
    '<html/>',
    '',
    `<rss>${'<x>'.repeat(33)}${'</x>'.repeat(33)}</rss>`,
    'a'.repeat(1_048_577),
  ])('rejects malformed, entity-bearing, deep, or oversized XML', (xml) => {
    expect(() => parseFeed(xml, base)).toThrow('Invalid RSS/Atom');
  });
  it('does not expose script contents from Atom XHTML', () => {
    const parsed = parseFeed(
      '<feed><entry><title>T</title><content><div>Safe<script>steal()</script><p>text</p></div></content></entry></feed>',
      base,
    );
    expect(parsed.entries[0].summary).not.toContain('steal');
  });
  it('treats prototype-like XML fields as data without object pollution', () => {
    parseFeed(
      wrap(
        '<item><title>Safe</title><__proto__><polluted>yes</polluted></__proto__></item>',
      ),
      base,
    );
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('removes active HTML and decodes text without rendering', () => {
    expect(
      plainText(
        '<p>Safe &amp; sound</p><style>hide</style><script>steal()</script><img src="http://internal/">',
        100,
      ),
    ).toBe('Safe & sound');
  });
});
