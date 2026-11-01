import type { PostsService } from './posts.service';
import type { RssSubscriptionsService } from './rss/rss-subscriptions.service';
import type { RankingPost } from './feed-ranking';

export type FeedItem =
  | Awaited<ReturnType<PostsService['list']>>[number]
  | Awaited<ReturnType<RssSubscriptionsService['listEntries']>>[number];

export function compareFeedItems(a: FeedItem, b: FeedItem): number {
  return (
    b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)
  );
}

export function toRankingPost(item: FeedItem): RankingPost {
  return {
    id: item.id,
    tags: item.tags,
    createdAt: item.createdAt,
    authorId:
      item.type === 'post' ? item.author.userId : `rss:${item.subscription.id}`,
    likes: item.type === 'post' ? item.likeCount : 0,
    replies: item.type === 'post' ? item.replyCount : 0,
  };
}
