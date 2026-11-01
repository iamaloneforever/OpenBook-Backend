export interface RankingPost {
  id: string;
  authorId: string;
  tags: string[];
  createdAt: Date;
  likes: number;
  replies: number;
}
export interface FeedInterests {
  authors: Map<string, number>;
  tags: Map<string, number>;
  following: Set<string>;
  seen: Set<string>;
}
export const emptyInterests = (): FeedInterests => ({
  authors: new Map(),
  tags: new Map(),
  following: new Set(),
  seen: new Set(),
});

export function addInterest(
  map: Map<string, number>,
  key: string,
  weight: number,
) {
  map.set(key, Math.min(10, (map.get(key) ?? 0) + weight));
}

export function activityWeight(at: Date, now: Date, strength: number): number {
  const days = Math.max(0, (now.getTime() - at.getTime()) / 86_400_000);
  return strength * Math.pow(0.5, days / 7);
}

export function scorePost(
  post: RankingPost,
  interests: FeedInterests,
  now: Date,
): number {
  const hours = Math.max(
    0,
    (now.getTime() - post.createdAt.getTime()) / 3_600_000,
  );
  const freshness = 8 * Math.pow(0.5, hours / 24);
  const author = Math.min(4, interests.authors.get(post.authorId) ?? 0);
  const tags = Math.min(
    6,
    post.tags.reduce((sum, tag) => sum + (interests.tags.get(tag) ?? 0), 0),
  );
  // Logarithmic, capped popularity prevents raw engagement from overwhelming relevance.
  const engagement = Math.min(2, Math.log1p(post.likes + 2 * post.replies) / 3);
  return (
    freshness +
    author +
    tags +
    engagement +
    (interests.following.has(post.authorId) ? 4 : 0) -
    (interests.seen.has(post.id) ? 6 : 0)
  );
}

export function rankPosts(
  posts: RankingPost[],
  interests: FeedInterests,
  now: Date,
): string[] {
  const sorted = posts
    .map((post) => ({ post, score: scorePost(post, interests, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.post.createdAt.getTime() - a.post.createdAt.getTime() ||
        b.post.id.localeCompare(a.post.id),
    );
  // Soft diversity: avoid adjacent posts from the same author when another is available.
  const result: string[] = [];
  let lastAuthor: string | undefined;
  while (sorted.length) {
    const next = sorted.findIndex(({ post }) => post.authorId !== lastAuthor);
    const [{ post }] = sorted.splice(next < 0 ? 0 : next, 1);
    result.push(post.id);
    lastAuthor = post.authorId;
  }
  return result;
}
