import { BadRequestException } from '@nestjs/common';
import type { SendMessageDto } from './dto/chat.dto';
import {
  referenceFromUrl,
  validReference,
  type BookReference,
} from './books/catalog.types';

export interface ChatSegment {
  type: 'text' | 'link' | 'spoiler';
  text: string;
  href?: string;
}

function linkSegments(text: string): ChatSegment[] {
  const result: ChatSegment[] = [];
  let start = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
    const raw = match[0].replace(/[),.!?;:]+$/u, '');
    let url: URL;
    try {
      url = new URL(raw);
      if (url.username || url.password || raw.length > 2048) continue;
    } catch {
      continue;
    }
    if (match.index > start)
      result.push({ type: 'text', text: text.slice(start, match.index) });
    result.push({ type: 'link', text: raw, href: url.href });
    start = match.index + raw.length;
  }
  if (start < text.length)
    result.push({ type: 'text', text: text.slice(start) });
  return result;
}

export function messageSegments(
  content: string,
  spoiler = false,
): ChatSegment[] {
  if (spoiler) return [{ type: 'spoiler', text: content }];
  const segments: ChatSegment[] = [];
  let start = 0;
  for (const match of content.matchAll(/\|\|([\s\S]*?)\|\|/g)) {
    segments.push(...linkSegments(content.slice(start, match.index)));
    if (match[1]) segments.push({ type: 'spoiler', text: match[1] });
    start = match.index + match[0].length;
  }
  segments.push(...linkSegments(content.slice(start)));
  if (segments.length > 128)
    return [
      { type: content.includes('||') ? 'spoiler' : 'text', text: content },
    ];
  return segments;
}

export function messageExcerpt(content: string, spoiler = false) {
  return messageSegments(content, spoiler)
    .map((segment) => (segment.type === 'spoiler' ? '[Spoiler]' : segment.text))
    .join('')
    .slice(0, 240);
}

export function messageReferences(dto: SendMessageDto) {
  const explicit: BookReference[] = [
    ...(dto.books ?? []).map((book) => validReference(book.provider, book.id)),
    ...(dto.bookUrls ?? []).map(referenceFromUrl),
  ];
  const automatic: BookReference[] = [];
  for (const segment of messageSegments(dto.content, dto.spoiler))
    if (segment.type === 'link' && segment.href) {
      try {
        automatic.push(referenceFromUrl(segment.href));
      } catch {
        /* Ordinary links stay text-only. */
      }
    }
  const refs = [
    ...new Map(
      [...explicit, ...automatic].map((ref) => [
        `${ref.provider}:${ref.id}`,
        ref,
      ]),
    ).values(),
  ];
  if (refs.length > 3)
    throw new BadRequestException('A message can preview at most three books');
  return {
    refs,
    explicit: new Set(explicit.map((ref) => `${ref.provider}:${ref.id}`)),
  };
}
