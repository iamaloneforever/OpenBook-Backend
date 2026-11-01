import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedCursorService } from './feed-cursor.service';
import { FeedService } from './feed.service';
import { PostsService } from './posts.service';
import { ProfilesService } from './profiles.service';
import {
  PublicSocialController,
  SocialRssController,
} from './public-social.controller';
import { RssSubscriptionsController } from './rss/rss-subscriptions.controller';
import { RssSubscriptionsService } from './rss/rss-subscriptions.service';
import { SafeFeedFetcher } from './rss/safe-feed-fetcher';
import { RssService } from './rss.service';
import { SocialController } from './social.controller';
import { SocialPrivacyInterceptor } from './social-privacy.interceptor';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [
    SocialController,
    PublicSocialController,
    RssSubscriptionsController,
    SocialRssController,
  ],
  providers: [
    RssSubscriptionsService,
    SafeFeedFetcher,
    ProfilesService,
    PostsService,
    FeedService,
    FeedCursorService,
    RssService,
    SocialPrivacyInterceptor,
  ],
})
export class SocialModule {}
