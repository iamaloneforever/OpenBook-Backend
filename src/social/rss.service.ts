import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostsService } from './posts.service';
import { ProfilesService } from './profiles.service';

export function escapeXml(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- XML 1.0 forbids these control characters.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

@Injectable()
export class RssService {
  constructor(
    private readonly posts: PostsService,
    private readonly profiles: ProfilesService,
    private readonly config: ConfigService,
  ) {}

  async render(handle?: string): Promise<string> {
    const profile = handle ? await this.profiles.getPublic(handle) : undefined;
    const posts = await this.posts.list(
      { parentId: null, ...(profile ? { authorId: profile.userId } : {}) },
      undefined,
      { take: 50 },
    );
    // This trusted deployment URL never comes from Host / forwarded headers.
    const base = (
      this.config.get<string>('SOCIAL_PUBLIC_URL') ?? 'http://localhost:5000'
    ).replace(/\/$/, '');
    const channelUrl = `${base}/social/${profile ? `public/profiles/${encodeURIComponent(profile.handle)}` : 'rss'}`;
    const title = profile
      ? `${profile.displayName} (@${profile.handle}) — OpenBook`
      : 'OpenBook social feed';
    const items = posts
      .map((post) => {
        const url = `${base}/social/public/posts/${post.id}`;
        // RSS descriptions are interpreted as HTML after XML decoding: escape twice.
        const description = escapeXml(escapeXml(post.content));
        return (
          `<item><title>${escapeXml(post.content.slice(0, 80))}</title>` +
          `<link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid>` +
          `<description>${description}</description><pubDate>${post.createdAt.toUTCString()}</pubDate>` +
          `<dc:creator>${escapeXml(post.author.handle)}</dc:creator></item>`
        );
      })
      .join('');
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      `<channel><title>${escapeXml(title)}</title><link>${escapeXml(channelUrl)}</link>` +
      `<description>${escapeXml(escapeXml(profile?.bio || 'Public posts from the OpenBook community'))}</description>` +
      `<language>en</language>${items}</channel></rss>`
    );
  }
}
