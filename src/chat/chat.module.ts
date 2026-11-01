import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatPresenceService } from './chat-presence.service';
import { PublicBooksModule } from './books/public-books.module';
import { ChatInfrastructureModule } from './chat-infrastructure.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.register({}),
    PublicBooksModule,
    ChatInfrastructureModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatRealtimeService,
    ChatGateway,
    ChatPresenceService,
  ],
  exports: [ChatInfrastructureModule],
})
export class ChatModule {}
