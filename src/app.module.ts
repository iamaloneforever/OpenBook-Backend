import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookModule } from './book/book.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ReadListModule } from './read-list/read-list.module';
import { UserModule } from './user/user.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from './common/config/env.validation';
import { SocialModule } from './social/social.module';
import { ChatModule } from './chat/chat.module';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';

@Module({
  imports: [
    BookModule,
    PrismaModule,
    AuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      { name: 'ip', ttl: 60_000, limit: 100 },
      { name: 'account', ttl: 60_000, limit: 1_000 },
    ]),
    CacheModule.register({
      isGlobal: true,
      ttl: 60_000,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads', 'books', 'covers'),
      serveRoot: '/uploads/books/covers',
      serveStaticOptions: {
        index: false,
        fallthrough: false,
        dotfiles: 'deny',
        cacheControl: false,
      },
    }),
    ReadListModule,
    UserModule,
    SocialModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: HttpThrottlerGuard,
    },
  ],
})
export class AppModule {}
