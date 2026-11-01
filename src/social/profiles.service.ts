import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ProfileSearchDto, SaveProfileDto } from './dto/social.dto';
import { publicProfileSelect } from './social.select';
import {
  requireSocialProfile,
  requireVisibleProfile,
  visibleProfileWhere,
} from './social-policy';
import { socialTransaction } from './social-transaction';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    const profile = await this.prisma.socialProfile.findUnique({
      where: { userId },
      select: {
        ...publicProfileSelect,
        isPublic: true,
        personalizeFeed: true,
        updatedAt: true,
      },
    });
    return { profile };
  }

  async save(userId: string, dto: SaveProfileDto) {
    try {
      return await socialTransaction(this.prisma, async (tx) => {
        const profile = await tx.socialProfile.upsert({
          where: { userId },
          create: { userId, ...dto },
          update: dto,
          select: {
            ...publicProfileSelect,
            isPublic: true,
            personalizeFeed: true,
            updatedAt: true,
          },
        });
        if (!profile.personalizeFeed)
          await tx.socialPostView.deleteMany({ where: { userId } });
        return profile;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This social handle is already in use');
      }
      throw error;
    }
  }

  search(query: ProfileSearchDto, viewerId?: string) {
    return this.prisma.socialProfile.findMany({
      where: {
        ...visibleProfileWhere(viewerId),
        ...(query.q
          ? {
              OR: [
                { handle: { contains: query.q, mode: 'insensitive' } },
                { displayName: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: publicProfileSelect,
      orderBy: { handle: 'asc' },
      take: query.limit,
    });
  }

  async getPublic(handle: string, viewerId?: string) {
    const profile = await this.prisma.socialProfile.findFirst({
      where: { handle, ...visibleProfileWhere(viewerId) },
      select: {
        ...publicProfileSelect,
        _count: {
          select: {
            followers: { where: { follower: visibleProfileWhere(viewerId) } },
            following: { where: { following: visibleProfileWhere(viewerId) } },
            posts: { where: { parentId: null } },
          },
        },
        followers: {
          where: { followerId: viewerId ?? '' },
          select: { followerId: true },
          take: 1,
        },
      },
    });
    if (!profile) throw new NotFoundException('Social profile not found');
    const { _count, followers, ...fields } = profile;
    return { ...fields, counts: _count, followedByMe: followers.length > 0 };
  }

  async follow(userId: string, handle: string) {
    return socialTransaction(this.prisma, async (tx) => {
      await requireSocialProfile(tx, userId);
      const target = await requireVisibleProfile(tx, handle, userId);
      if (target.userId === userId)
        throw new BadRequestException('You cannot follow yourself');
      await tx.socialFollow.createMany({
        data: [{ followerId: userId, followingId: target.userId }],
        skipDuplicates: true,
      });
      return { following: true };
    });
  }

  async unfollow(userId: string, handle: string) {
    // Allow cleanup even when a profile has been disabled or a block exists.
    await this.prisma.socialFollow.deleteMany({
      where: { followerId: userId, following: { handle } },
    });
    return { following: false };
  }

  async block(userId: string, handle: string) {
    return socialTransaction(this.prisma, async (tx) => {
      const own = await tx.socialProfile.findUnique({
        where: { userId },
        select: { userId: true },
      });
      if (!own)
        throw new BadRequestException('Create your social profile first');
      const target = await tx.socialProfile.findUnique({
        where: { handle },
        select: { userId: true },
      });
      if (!target) throw new NotFoundException('Social profile not found');
      if (target.userId === userId)
        throw new BadRequestException('You cannot block yourself');
      await tx.socialBlock.createMany({
        data: [{ blockerId: userId, blockedId: target.userId }],
        skipDuplicates: true,
      });
      await tx.socialFollow.deleteMany({
        where: {
          OR: [
            { followerId: userId, followingId: target.userId },
            { followerId: target.userId, followingId: userId },
          ],
        },
      });
      return { blocked: true };
    });
  }

  async unblock(userId: string, handle: string) {
    await this.prisma.socialBlock.deleteMany({
      where: { blockerId: userId, blocked: { handle } },
    });
    return { blocked: false };
  }
}
