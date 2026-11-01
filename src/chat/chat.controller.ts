import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/Current-user.decorator';
import { JwtAuthGuard } from '../common/guards/auth/jwt-auth.guard';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { PaginationDto } from '../common/dtos/shared/pagination.dto';
import { ChatService } from './chat.service';
import {
  ChatIdDto,
  CreateConversationDto,
  MessageHistoryDto,
  SendMessageDto,
} from './dto/chat.dto';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ChatPresenceService } from './chat-presence.service';

@Controller('chat/conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly limits: ChatRateLimitService,
    private readonly presence: ChatPresenceService,
  ) {}

  @Post()
  @Throttle({ ip: { limit: 20, ttl: 60_000 } })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ) {
    await this.limits.consume('create', user.id, 20);
    return this.chat.create(user.id, dto.recipientId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.chat.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param() params: ChatIdDto) {
    return this.chat.get(user.id, params.id);
  }

  @Get(':id/messages')
  history(
    @CurrentUser() user: AuthUser,
    @Param() params: ChatIdDto,
    @Query() query: MessageHistoryDto,
  ) {
    return this.chat.history(user.id, params.id, query);
  }

  @Get(':id/presence')
  presenceForPeer(@CurrentUser() user: AuthUser, @Param() params: ChatIdDto) {
    return this.presence.peer(user.id, params.id);
  }

  @Post(':id/messages')
  async send(
    @CurrentUser() user: AuthUser,
    @Param() params: ChatIdDto,
    @Body() dto: SendMessageDto,
  ) {
    await this.limits.consume('send', user.id, 60);
    return this.chat.send(user.id, params.id, dto);
  }
}
