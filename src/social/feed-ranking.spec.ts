import { describe, expect, it } from 'vitest';
import {
  activityWeight,
  addInterest,
  emptyInterests,
  rankPosts,
  scorePost,
} from './feed-ranking';
import type { RankingPost } from './feed-ranking';
import { extractTags } from './social.select';

const now = new Date('2026-10-31T10:00:00Z');
const post = (overrides: Partial<RankingPost> = {}): RankingPost => ({
  id: 'a',
  authorId: 'author-a',
  tags: [],
  createdAt: now,
  likes: 0,
  replies: 0,
  ...overrides,
});

describe('feed ranking', () => {
  it('prefers fresh posts for a new user', () => {
    expect(
      rankPosts(
        [
          post({
            id: 'old',
            authorId: 'old',
            createdAt: new Date(+now - 3 * 86_400_000),
          }),
          post(),
        ],
        emptyInterests(),
        now,
      ),
    ).toEqual(['a', 'old']);
  });
  it('uses followed authors and hashtag interests', () => {
    const interests = emptyInterests();
    interests.following.add('followed');
    interests.tags.set('books', 5);
    expect(
      rankPosts(
        [
          post(),
          post({ id: 'relevant', authorId: 'followed', tags: ['books'] }),
        ],
        interests,
        now,
      )[0],
    ).toBe('relevant');
  });
  it('uses recent author affinity', () => {
    const interests = emptyInterests();
    interests.authors.set('liked-author', 3);
    expect(
      scorePost(post({ authorId: 'liked-author' }), interests, now),
    ).toBeGreaterThan(scorePost(post(), interests, now));
  });
  it('reduces the rank of already viewed posts', () => {
    const interests = emptyInterests();
    interests.seen.add('seen');
    expect(
      rankPosts(
        [post({ id: 'seen' }), post({ id: 'new', authorId: 'other' })],
        interests,
        now,
      ),
    ).toEqual(['new', 'seen']);
  });
  it('caps popularity to limit engagement manipulation', () => {
    expect(
      scorePost(post({ likes: 1_000_000_000 }), emptyInterests(), now) -
        scorePost(post(), emptyInterests(), now),
    ).toBe(2);
  });
  it('halves activity affinity every seven days', () => {
    expect(activityWeight(new Date(+now - 7 * 86_400_000), now, 4)).toBe(2);
  });
  it('caps repeated activity on a single interest', () => {
    const map = new Map<string, number>();
    for (let n = 0; n < 100; n++) addInterest(map, 'books', 3);
    expect(map.get('books')).toBe(10);
  });
  it('breaks ties deterministically and avoids adjacent authors where possible', () => {
    const posts = [
      post({ id: 'c' }),
      post({ id: 'b' }),
      post({ id: 'a', authorId: 'other' }),
    ];
    expect(rankPosts(posts, emptyInterests(), now)).toEqual(['c', 'a', 'b']);
    expect(rankPosts([...posts].reverse(), emptyInterests(), now)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
  it('keeps all candidates without duplicates or modifying its input', () => {
    const posts = Array.from({ length: 300 }, (_, i) =>
      post({ id: String(i), authorId: String(i % 5) }),
    );
    const original = [...posts];
    const ranked = rankPosts(posts, emptyInterests(), now);
    expect(new Set(ranked).size).toBe(300);
    expect(posts).toEqual(original);
  });
});

describe('social hashtags', () => {
  it('normalizes and deduplicates Unicode hashtags', () => {
    expect(extractTags('#Books #BOOKS #کتاب #Ｃｏｄｅ')).toEqual([
      'books',
      'کتاب',
      'code',
    ]);
  });
  it('bounds tags and does not turn URL fragments into interests', () => {
    expect(
      extractTags('https://example.com/#private #a #b #c #d #e #f'),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('rejects partial matches of overlong hashtags', () => {
    expect(extractTags(`#${'a'.repeat(41)}`)).toEqual([]);
  });
});
