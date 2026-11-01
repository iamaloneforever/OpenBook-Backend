import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  HandleParamDto,
  SocialIdParamDto,
  SocialPageDto,
} from './dto/social.dto';
import { FeedService } from './feed.service';
import { PostsService } from './posts.service';
import { ProfilesService } from './profiles.service';
import { RssService } from './rss.service';

// Deliberately public URLs for sharing and RSS readers without bearer tokens.
@Controller('social/public')
export class PublicSocialController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly posts: PostsService,
    private readonly feed: FeedService,
  ) {}

  @Get('profiles/:handle')
  @Header('Cache-Control', 'no-store')
  profile(@Param() params: HandleParamDto) {
    return this.profiles.getPublic(params.handle);
  }

  @Get('profiles/:handle/posts')
  @Header('Cache-Control', 'no-store')
  profilePosts(@Param() params: HandleParamDto, @Query() query: SocialPageDto) {
    return this.feed.profilePosts(params.handle, undefined, query);
  }

  @Get('posts/:id')
  @Header('Cache-Control', 'no-store')
  post(@Param() params: SocialIdParamDto) {
    return this.posts.get(params.id);
  }
}

@Controller('social/rss')
export class SocialRssController {
  constructor(private readonly rss: RssService) {}

  @Get()
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  global() {
    return this.rss.render();
  }

  @Get('profiles/:handle')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  profile(@Param() params: HandleParamDto) {
    return this.rss.render(params.handle);
  }
}
