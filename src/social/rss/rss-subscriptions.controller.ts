import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/Current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/auth/jwt-auth.guard';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { SocialIdParamDto } from '../dto/social.dto';
import { SocialPrivacyInterceptor } from '../social-privacy.interceptor';
import { RssSubscriptionsService } from './rss-subscriptions.service';

export class SubscribeRssDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2048)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  url!: string;
}

@Controller('social/rss')
@UseGuards(JwtAuthGuard)
@UseInterceptors(SocialPrivacyInterceptor)
export class RssSubscriptionsController {
  constructor(private readonly subscriptions: RssSubscriptionsService) {}

  @Get('subscriptions')
  list(@CurrentUser() user: AuthUser) {
    return this.subscriptions.list(user.id);
  }

  @Post('subscriptions')
  @Throttle({ ip: { limit: 10, ttl: 60_000 } })
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeRssDto) {
    return this.subscriptions.subscribe(user.id, dto.url);
  }

  @Post('subscriptions/:id/refresh')
  @Throttle({ ip: { limit: 10, ttl: 60_000 } })
  refresh(@CurrentUser() user: AuthUser, @Param() params: SocialIdParamDto) {
    return this.subscriptions.refresh(user.id, params.id);
  }

  @Delete('subscriptions/:id')
  unsubscribe(
    @CurrentUser() user: AuthUser,
    @Param() params: SocialIdParamDto,
  ) {
    return this.subscriptions.unsubscribe(user.id, params.id);
  }

  @Put('entries/:id/read')
  read(@CurrentUser() user: AuthUser, @Param() params: SocialIdParamDto) {
    return this.subscriptions.markRead(user.id, params.id);
  }
}
