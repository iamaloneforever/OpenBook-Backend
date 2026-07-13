import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/guards/auth/jwt-auth.guard';
import { CurrentUser } from 'src/decorators/Current-user.decorator';
import type { User } from 'src/generated/prisma/client';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

@Controller('user')
export class UserController {
  constructor(private readonly userservice: UserService) { }
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @UseGuards(JwtAuthGuard)
  Getuser(@CurrentUser() user: User) {
    return this.userservice.GetUserProfile(user.id);
  }
}
