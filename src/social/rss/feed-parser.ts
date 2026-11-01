import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SaxesParser } from 'saxes';
import { Parser } from 'htmlparser2';
import { MAX_FEED_BYTES } from './safe-feed-fetcher';

export interface ImportedEntry {
  guidHash: string;
  title: string;
  summary: string;
  url: string | null;
  tags: string[];
  publishedAt: Date;
}
export interface ParsedFeed {
  title: string;
  entries: ImportedEntry[];
}

export function plainText(html: string, max: number): string {
  let result = '';
  let ignored = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (ignored || ['script', 'style', 'template'].includes(name))
          ignored++;
      },
      onclosetag() {
        if (ignored) ignored--;
        else if (result.length < max * 2) result += ' ';
      },
      ontext(text) {
        if (!ignored && result.length < max * 2) result += text;
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return result.replace(/\s+/gu, ' ').trim().slice(0, max);
}

function safeEntryUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (
      !raw ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.length > 2048
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseFeed(
  xml: string,
  sourceUrl: string,
  now = new Date(),
): ParsedFeed {
  try {
    if (
      Buffer.byteLength(xml) > MAX_FEED_BYTES ||
      /<!DOCTYPE|<!ENTITY/i.test(xml)
    )
      throw new Error();
    const parser = new SaxesParser({ xmlns: true });
    const path: string[] = [];
    const entries: ImportedEntry[] = [];
    let title = '';
    let root = '';
    let entryDepth = 0;
    let entry: Record<string, string> | undefined;
    parser.on('doctype', () => {
      throw new Error();
    });
    parser.on('opentag', (tag) => {
      path.push(tag.local);
      if (path.length > 32) throw new Error();
      if (path.length === 1) {
        root = tag.local;
        if (!['rss', 'feed'].includes(root)) throw new Error();
      }
      const attr = (name: string) =>
        Object.values(tag.attributes).find((value) => value.local === name)
          ?.value ?? '';
      if (
        (root === 'rss' && path.join('/') === 'rss/channel/item') ||
        (root === 'feed' && path.join('/') === 'feed/entry')
      ) {
        entry = Object.create(null) as Record<string, string>;
        entryDepth = path.length;
      }
      if (entry && path.length === entryDepth + 1) {
        if (
          tag.local === 'link' &&
          attr('href') &&
          ['', 'alternate'].includes(attr('rel'))
        )
          entry.link = attr('href');
        if (tag.local === 'category' && entry.category) entry.category += ' ';
        if (tag.local === 'category' && attr('term'))
          entry.category = `${entry.category ?? ''} ${attr('term')}`;
      }
    });
    const text = (value: string) => {
      if (
        entry &&
        path.length > entryDepth &&
        !path
          .slice(entryDepth + 1)
          .some((name) => ['script', 'style', 'template'].includes(name))
      ) {
        const field = path[entryDepth];
        if (
          [
            'title',
            'description',
            'summary',
            'content',
            'encoded',
            'id',
            'guid',
            'link',
            'pubDate',
            'published',
            'updated',
            'category',
          ].includes(field)
        ) {
          entry[field] = ((entry[field] ?? '') + value).slice(0, 8000);
        }
      } else if (
        (root === 'rss' && path.join('/') === 'rss/channel/title') ||
        (root === 'feed' && path.join('/') === 'feed/title')
      ) {
        title = (title + value).slice(0, 1000);
      }
    };
    parser.on('text', text);
    parser.on('cdata', text);
    parser.on('closetag', () => {
      if (entry && path.length > entryDepth + 1) {
        const field = path[entryDepth];
        if (entry[field] && entry[field].length < 8000) entry[field] += ' ';
      }
      if (entry && path.length === entryDepth) {
        if (entries.length < 200) {
          const entryTitle = plainText(entry.title ?? '', 300);
          const summary = plainText(
            entry.description ||
              entry.summary ||
              entry.encoded ||
              entry.content ||
              '',
            2000,
          );
          const url = safeEntryUrl(entry.link ?? '', sourceUrl);
          const parsedDate = Date.parse(
            entry.pubDate || entry.published || entry.updated || '',
          );
          const publishedAt =
            Number.isFinite(parsedDate) && parsedDate <= now.getTime()
              ? new Date(parsedDate)
              : now;
          if (entryTitle || summary)
            entries.push({
              guidHash: createHash('sha256')
                .update(
                  entry.guid || entry.id || url || `${entryTitle}\n${summary}`,
                )
                .digest('hex'),
              title: entryTitle || summary.slice(0, 300),
              summary,
              url,
              publishedAt,
              tags: [
                ...new Set(
                  (entry.category ?? '')
                    .normalize('NFKC')
                    .toLowerCase()
                    .split(/[\s,]+/u)
                    .filter(Boolean),
                ),
              ]
                .slice(0, 5)
                .map((tag) => tag.slice(0, 40)),
            });
        }
        entry = undefined;
      }
      path.pop();
    });
    parser.write(xml).close();
    if (!root) throw new Error();
    return {
      title: plainText(title, 200) || new URL(sourceUrl).hostname,
      entries: [
        ...new Map(entries.map((item) => [item.guidHash, item])).values(),
      ],
    };
  } catch {
    throw new BadRequestException(
      'Invalid RSS/Atom feed; DTDs, entities, deep XML, and feeds over 1 MiB are not supported',
    );
  }
}
