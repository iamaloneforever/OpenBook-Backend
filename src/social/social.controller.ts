import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SocialPrivacyInterceptor } from './social-privacy.interceptor';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/Current-user.decorator';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  CreatePostDto,
  EditPostDto,
  FeedQueryDto,
  HandleParamDto,
  ProfileSearchDto,
  SaveProfileDto,
  SocialIdParamDto,
  SocialPageDto,
} from './dto/social.dto';
import { FeedService } from './feed.service';
import { PostsService } from './posts.service';
import { ProfilesService } from './profiles.service';

@Controller('social')
@UseGuards(JwtAuthGuard)
@UseInterceptors(SocialPrivacyInterceptor)
export class SocialController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly posts: PostsService,
    private readonly feed: FeedService,
  ) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.profiles.getMine(user.id);
  }

  @Put('me')
  saveProfile(@CurrentUser() user: AuthUser, @Body() dto: SaveProfileDto) {
    return this.profiles.save(user.id, dto);
  }

  @Get('profiles')
  searchProfiles(
    @CurrentUser() user: AuthUser,
    @Query() query: ProfileSearchDto,
  ) {
    return this.profiles.search(query, user.id);
  }

  @Get('profiles/:handle')
  getProfile(@CurrentUser() user: AuthUser, @Param() params: HandleParamDto) {
    return this.profiles.getPublic(params.handle, user.id);
  }

  @Get('profiles/:handle/posts')
  getProfilePosts(
    @CurrentUser() user: AuthUser,
    @Param() params: HandleParamDto,
    @Query() query: SocialPageDto,
  ) {
    return this.feed.profilePosts(params.handle, user.id, query);
  }

  @Put('profiles/:handle/follow')
  follow(@CurrentUser() user: AuthUser, @Param() params: HandleParamDto) {
    return this.profiles.follow(user.id, params.handle);
  }

  @Delete('profiles/:handle/follow')
  unfollow(@CurrentUser() user: AuthUser, @Param() params: HandleParamDto) {
    return this.profiles.unfollow(user.id, params.handle);
  }

  @Put('profiles/:handle/block')
  block(@CurrentUser() user: AuthUser, @Param() params: HandleParamDto) {
    return this.profiles.block(user.id, params.handle);
  }

  @Delete('profiles/:handle/block')
  unblock(@CurrentUser() user: AuthUser, @Param() params: HandleParamDto) {
    return this.profiles.unblock(user.id, params.handle);
  }

  @Get('feed')
  getFeed(@CurrentUser() user: AuthUser, @Query() query: FeedQueryDto) {
    return this.feed.get(user.id, query);
  }

  @Post('posts')
  @Throttle({ ip: { limit: 20, ttl: 60_000 } })
  createPost(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.posts.create(user.id, dto);
  }

  @Get('posts/:id')
  getPost(@CurrentUser() user: AuthUser, @Param() params: SocialIdParamDto) {
    return this.posts.get(params.id, user.id);
  }

  @Patch('posts/:id')
  editPost(
    @CurrentUser() user: AuthUser,
    @Param() params: SocialIdParamDto,
    @Body() dto: EditPostDto,
  ) {
    return this.posts.edit(user.id, params.id, dto);
  }

  @Delete('posts/:id')
  removePost(@CurrentUser() user: AuthUser, @Param() params: SocialIdParamDto) {
    return this.posts.remove(user.id, params.id);
  }

  @Get('posts/:id/replies')
  getReplies(
    @CurrentUser() user: AuthUser,
    @Param() params: SocialIdParamDto,
    @Query() query: SocialPageDto,
  ) {
    return this.feed.replies(params.id, user.id, query);
  }

  @Put('posts/:id/like')
  likePost(@CurrentUser() user: AuthUser, @Param() params: SocialIdParamDto) {
    return this.posts.like(user.id, params.id);
  }

  @Delete('posts/:id/like')
  unlikePost(@CurrentUser() user: AuthUser, @Param() params: SocialIdParamDto) {
    return this.posts.unlike(user.id, params.id);
  }

  @Post('posts/:id/views')
  recordView(@CurrentUser() user: AuthUser, @Param() params: SocialIdParamDto) {
    return this.posts.view(user.id, params.id);
  }
}
