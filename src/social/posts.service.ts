import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreatePostDto, EditPostDto } from './dto/social.dto';
import { extractTags, postSelect } from './social.select';
import {
  requireSocialProfile,
  requireVisiblePost,
  visiblePostWhere,
  visibleProfileWhere,
} from './social-policy';
import { socialTransaction } from './social-transaction';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    where: Prisma.SocialPostWhereInput,
    viewerId?: string,
    options: {
      take?: number;
      orderBy?: Prisma.SocialPostOrderByWithRelationInput[];
    } = {},
  ) {
    const rows = await this.prisma.socialPost.findMany({
      where: { AND: [visiblePostWhere(viewerId), where] },
      select: {
        ...postSelect,
        _count: {
          select: {
            likes: { where: { user: visibleProfileWhere(viewerId) } },
            replies: { where: { author: visibleProfileWhere(viewerId) } },
          },
        },
        likes: {
          where: { userId: viewerId ?? '' },
          select: { userId: true },
          take: 1,
        },
      },
      orderBy: options.orderBy ?? [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.take ?? 50,
    });
    return rows.map(({ _count, likes, ...post }) => ({
      ...post,
      type: 'post' as const,
      likeCount: _count.likes,
      replyCount: _count.replies,
      likedByMe: likes.length > 0,
    }));
  }

  async get(id: string, viewerId?: string) {
    const [post] = await this.list({ id }, viewerId, { take: 1 });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async create(userId: string, dto: CreatePostDto) {
    const post = await socialTransaction(this.prisma, async (tx) => {
      await requireSocialProfile(tx, userId);
      if (dto.parentId) {
        const parent = await requireVisiblePost(tx, dto.parentId, userId);
        if (parent.parentId)
          throw new BadRequestException('Reply to the original post');
      }
      return tx.socialPost.create({
        data: {
          authorId: userId,
          content: dto.content,
          tags: extractTags(dto.content),
          parentId: dto.parentId,
        },
        select: { id: true },
      });
    });
    return this.get(post.id, userId);
  }

  async edit(userId: string, id: string, dto: EditPostDto) {
    // Ownership is part of the write predicate, so a concurrent write cannot bypass it.
    const result = await this.prisma.socialPost.updateMany({
      where: { id, authorId: userId },
      data: { content: dto.content, tags: extractTags(dto.content) },
    });
    if (!result.count) throw new NotFoundException('Post not found');
    // An owner can edit their hidden post without making it public.
    return this.prisma.socialPost.findUnique({
      where: { id },
      select: postSelect,
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.socialPost.deleteMany({
      where: { id, authorId: userId },
    });
    if (!result.count) throw new NotFoundException('Post not found');
    return { deleted: true };
  }

  async like(userId: string, id: string) {
    return socialTransaction(this.prisma, async (tx) => {
      await requireSocialProfile(tx, userId);
      await requireVisiblePost(tx, id, userId);
      await tx.socialLike.createMany({
        data: [{ userId, postId: id }],
        skipDuplicates: true,
      });
      return { liked: true };
    });
  }

  async unlike(userId: string, id: string) {
    await this.prisma.socialLike.deleteMany({ where: { userId, postId: id } });
    return { liked: false };
  }

  async view(userId: string, id: string) {
    return socialTransaction(this.prisma, async (tx) => {
      const profile = await requireSocialProfile(tx, userId);
      await requireVisiblePost(tx, id, userId);
      if (!profile.personalizeFeed) return { recorded: false };
      await tx.socialPostView.upsert({
        where: { userId_postId: { userId, postId: id } },
        create: { userId, postId: id },
        update: { updatedAt: new Date() },
      });
      const retained = await tx.socialPostView.findMany({
        where: {
          userId,
          updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
        select: { postId: true },
        orderBy: [{ updatedAt: 'desc' }, { postId: 'desc' }],
        take: 100,
      });
      await tx.socialPostView.deleteMany({
        where: {
          userId,
          postId: { notIn: retained.map((view) => view.postId) },
        },
      });
      return { recorded: true };
    });
  }
}
