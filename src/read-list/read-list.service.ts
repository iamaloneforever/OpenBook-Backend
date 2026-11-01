import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { serializableTransaction } from '../common/database/serializable-transaction';
import { PublicBooksService } from '../chat/books/public-books.service';
import { ChatRateLimitService } from '../chat/chat-rate-limit.service';
import {
  validReference,
  type PublicBookPreview,
} from '../chat/books/catalog.types';
import type { CreateReadListDto } from '../common/dtos/read-list/create-read-list.dto';
import type { UpdateReadListDto } from '../common/dtos/read-list/update-read-list.dto';
import type {
  AddReadListItemDto,
  ReadListCollaboratorDto,
  ReadListItemsQueryDto,
  ReadListQueryDto,
  ReorderReadListDto,
  UpdateReadListItemDto,
} from '../common/dtos/read-list/advanced-read-list.dto';
import { listItemSelect, listSummarySelect } from './read-list.select';

type Access = 'read' | 'edit' | 'owner';
type Tx = Prisma.TransactionClient;
const MAX_ITEMS = 500;
const pageMeta = (total: number, page: number, limit: number) => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});

@Injectable()
export class ReadListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: PublicBooksService,
    private readonly limits: ChatRateLimitService,
  ) {}

  private async blocked(tx: Tx, first: string, second: string) {
    return (
      (await tx.socialBlock.count({
        where: {
          OR: [
            { blockerId: first, blockedId: second },
            { blockerId: second, blockedId: first },
          ],
        },
      })) > 0
    );
  }

  private async access(
    tx: Tx,
    id: string,
    userId: string,
    required: Access = 'read',
  ) {
    const list = await tx.readList.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        visibility: true,
        revision: true,
        collaborators: { where: { userId }, select: { role: true } },
      },
    });
    if (!list) throw new NotFoundException('Read list not found');
    const owner = list.userId === userId;
    const role = list.collaborators[0]?.role;
    if (
      !owner &&
      ((await this.blocked(tx, userId, list.userId)) ||
        (list.visibility === 'PRIVATE' && !role))
    )
      throw new NotFoundException('Read list not found');
    if (
      !owner &&
      (required === 'owner' || (required === 'edit' && role !== 'EDITOR'))
    )
      throw new ForbiddenException(
        'You do not have permission to edit this read list',
      );
    return {
      ...list,
      role: owner ? ('OWNER' as const) : (role ?? ('READER' as const)),
    };
  }

  private checkRevision(actual: number, expected?: number) {
    if (expected !== undefined && actual !== expected)
      throw new ConflictException(
        'Read list changed; reload it and retry with its current revision',
      );
    if (actual >= 2147483646)
      throw new ConflictException('Read list revision limit reached');
  }

  private async transaction<T>(action: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await serializableTransaction(
        this.prisma,
        action,
        'Read list is busy; please retry',
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException(
            'This title or book already exists in the read list',
          );
        if (error.code === 'P2025')
          throw new NotFoundException('Read list or entry not found');
      }
      throw error;
    }
  }

  private mutate<T extends object>(
    id: string,
    userId: string,
    required: Access,
    expected: number | undefined,
    action: (tx: Tx) => Promise<T>,
  ) {
    return this.transaction(async (tx) => {
      const list = await this.access(tx, id, userId, required);
      this.checkRevision(list.revision, expected);
      const updated = await tx.readList.update({
        where: { id },
        data: { revision: { increment: 1 } },
        select: { revision: true },
      });
      const value = await action(tx);
      return { ...value, revision: updated.revision };
    });
  }

  private async visibleWhere(
    tx: Tx,
    userId: string,
  ): Promise<Prisma.ReadListWhereInput> {
    const blocks = await tx.socialBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return {
      userId: {
        notIn: blocks.map((b) =>
          b.blockerId === userId ? b.blockedId : b.blockerId,
        ),
      },
      OR: [
        { userId },
        { visibility: { in: ['PUBLIC', 'UNLISTED'] } },
        { collaborators: { some: { userId } } },
      ],
    };
  }

  async getLists(
    userId: string,
    query: ReadListQueryDto = {},
    discover = false,
  ) {
    const { page = 1, limit = 10, q, scope = 'owned' } = query;
    return this.transaction(async (tx) => {
      const where: Prisma.ReadListWhereInput = {
        AND: [await this.visibleWhere(tx, userId)],
      };
      if (discover) where.visibility = 'PUBLIC';
      else if (scope === 'owned') where.userId = userId;
      else if (scope === 'saved') where.saves = { some: { userId } };
      else if (scope === 'collaborating')
        where.collaborators = { some: { userId } };
      else
        where.OR = [
          { userId },
          { saves: { some: { userId } } },
          { collaborators: { some: { userId } } },
        ];
      if (q)
        (where.AND as Prisma.ReadListWhereInput[]).push({
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        });
      const data = await tx.readList.findMany({
        where,
        select: {
          ...listSummarySelect,
          saves: { where: { userId }, select: { userId: true } },
          collaborators: { where: { userId }, select: { role: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await tx.readList.count({ where });
      return {
        data: data.map(({ saves, collaborators, ...list }) => ({
          ...list,
          savedByMe: saves.length > 0,
          role:
            list.userId === userId
              ? 'OWNER'
              : (collaborators[0]?.role ?? 'READER'),
        })),
        meta: pageMeta(total, page, limit),
      };
    });
  }

  async getList(id: string, userId: string) {
    return this.transaction(async (tx) => {
      const access = await this.access(tx, id, userId);
      const list = await tx.readList.findUniqueOrThrow({
        where: { id },
        select: {
          ...listSummarySelect,
          items: {
            select: listItemSelect,
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        },
      });
      const saved = await tx.readListSave.count({
        where: { readListId: id, userId },
      });
      const books = await tx.book.aggregate({
        where: { readListBooks: { some: { readListId: id } } },
        _sum: { totalPages: true, ratingsCount: true },
        _avg: { averageRating: true },
      });
      return {
        ...list,
        role: access.role,
        savedByMe: saved > 0,
        itemsMeta: pageMeta(list._count.items, 1, 100),
        stats: {
          totalBooks: list._count.items,
          totalPages: books._sum.totalPages ?? 0,
          averageRating: Math.round((books._avg.averageRating ?? 0) * 10) / 10,
          totalRatings: books._sum.ratingsCount ?? 0,
        },
      };
    });
  }

  async getItems(
    id: string,
    userId: string,
    query: ReadListItemsQueryDto = {},
  ) {
    const { page = 1, limit = 10, sort = 'position' } = query;
    return this.transaction(async (tx) => {
      const list = await this.access(tx, id, userId);
      const orderBy: Prisma.ReadListBookOrderByWithRelationInput[] =
        sort === 'addedAt'
          ? [{ addedAt: 'desc' }, { position: 'asc' }]
          : [{ position: 'asc' }, { id: 'asc' }];
      // PostgreSQL JSON ordering handles public cards and library books together.
      if (sort === 'title') {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT item."id" FROM "ReadListBook" item LEFT JOIN "Book" book ON book."id" = item."bookId" WHERE item."readListId" = ${id} ORDER BY lower(COALESCE(book."title", item."catalogPreview"->>'title', '')), item."position", item."id" OFFSET ${(page - 1) * limit} LIMIT ${limit}`;
        const items = await tx.readListBook.findMany({
          where: { readListId: id, id: { in: rows.map((r) => r.id) } },
          select: listItemSelect,
        });
        const byId = new Map(items.map((item) => [item.id, item]));
        const total = await tx.readListBook.count({
          where: { readListId: id },
        });
        return {
          data: rows.map((row) => byId.get(row.id)!),
          meta: pageMeta(total, page, limit),
          revision: list.revision,
        };
      }
      const data = await tx.readListBook.findMany({
        where: { readListId: id },
        select: listItemSelect,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await tx.readListBook.count({ where: { readListId: id } });
      return {
        data,
        meta: pageMeta(total, page, limit),
        revision: list.revision,
      };
    });
  }

  async createList(userId: string, dto: CreateReadListDto) {
    return this.transaction((tx) =>
      tx.readList.create({
        data: { ...dto, userId },
        select: listSummarySelect,
      }),
    );
  }

  async updateList(id: string, dto: UpdateReadListDto, userId: string) {
    const { expectedRevision, ...data } = dto;
    return this.mutate(id, userId, 'owner', expectedRevision, (tx) =>
      tx.readList.update({ where: { id }, data, select: listSummarySelect }),
    );
  }

  async deleteList(id: string, userId: string, expectedRevision?: number) {
    return this.transaction(async (tx) => {
      const list = await this.access(tx, id, userId, 'owner');
      this.checkRevision(list.revision, expectedRevision);
      await tx.readList.delete({ where: { id } });
      return { message: 'Read list deleted successfully' };
    });
  }

  async addBook(
    id: string,
    bookId: string,
    userId: string,
    expectedRevision?: number,
  ) {
    return this.addItem(id, userId, { bookId, expectedRevision });
  }

  async addItem(id: string, userId: string, dto: AddReadListItemDto) {
    if (Number(Boolean(dto.bookId)) + Number(Boolean(dto.catalogBook)) !== 1)
      throw new BadRequestException(
        'Provide exactly one bookId or catalogBook',
      );
    // Reject unauthorized calls before provider IO; recheck permissions when persisting.
    const access = await this.access(this.prisma, id, userId, 'edit');
    this.checkRevision(access.revision, dto.expectedRevision);
    let preview: PublicBookPreview | undefined;
    if (dto.catalogBook) {
      const reference = validReference(
        dto.catalogBook.provider,
        dto.catalogBook.id,
      );
      await this.limits.consume('read-list-catalog', userId, 30);
      preview = await this.catalog.preview(reference);
    }
    return this.mutate(id, userId, 'edit', dto.expectedRevision, async (tx) => {
      if (
        dto.bookId &&
        !(await tx.book.findFirst({
          where: { id: dto.bookId, ownerId: userId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Book not found');
      if (
        (await tx.readListBook.count({ where: { readListId: id } })) >=
        MAX_ITEMS
      )
        throw new ConflictException('Read lists support at most 500 entries');
      const last = await tx.readListBook.aggregate({
        where: { readListId: id },
        _max: { position: true },
      });
      return tx.readListBook.create({
        data: {
          readListId: id,
          bookId: dto.bookId,
          catalogProvider: preview?.provider,
          catalogId: preview?.id,
          catalogPreview: preview
            ? (preview as unknown as Prisma.InputJsonValue)
            : undefined,
          note: dto.note,
          addedById: userId,
          position: (last._max.position ?? -1) + 1,
        },
        select: listItemSelect,
      });
    });
  }

  async updateItem(
    id: string,
    itemId: string,
    userId: string,
    dto: UpdateReadListItemDto,
  ) {
    return this.mutate(id, userId, 'edit', dto.expectedRevision, async (tx) => {
      if (
        !(await tx.readListBook.findFirst({
          where: { id: itemId, readListId: id },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Entry not found');
      return tx.readListBook.update({
        where: { id: itemId },
        data: { note: dto.note },
        select: listItemSelect,
      });
    });
  }

  async removeItem(
    id: string,
    itemId: string,
    userId: string,
    expectedRevision?: number,
  ) {
    return this.mutate(id, userId, 'edit', expectedRevision, async (tx) => {
      const removed = await tx.readListBook.deleteMany({
        where: { id: itemId, readListId: id },
      });
      if (!removed.count) throw new NotFoundException('Entry not found');
      return { message: 'Book removed from read list' };
    });
  }

  async removeBook(
    id: string,
    bookId: string,
    userId: string,
    expectedRevision?: number,
  ) {
    return this.mutate(id, userId, 'edit', expectedRevision, async (tx) => {
      const removed = await tx.readListBook.deleteMany({
        where: { readListId: id, bookId },
      });
      if (!removed.count)
        throw new NotFoundException('Book not found in read list');
      return { message: 'Book removed from read list' };
    });
  }

  async reorder(id: string, userId: string, dto: ReorderReadListDto) {
    return this.mutate(id, userId, 'edit', dto.expectedRevision, async (tx) => {
      const items = await tx.readListBook.findMany({
        where: { readListId: id },
        select: { id: true, position: true },
      });
      const existing = new Set(items.map((item) => item.id));
      if (
        dto.itemIds.length !== existing.size ||
        new Set(dto.itemIds).size !== existing.size ||
        dto.itemIds.some((item) => !existing.has(item))
      )
        throw new BadRequestException(
          'itemIds must contain every current entry exactly once',
        );
      const offset = Math.max(0, ...items.map((item) => item.position)) + 1;
      if (items.length) {
        await tx.readListBook.updateMany({
          where: { readListId: id },
          data: { position: { increment: offset } },
        });
        await tx.$executeRaw`UPDATE "ReadListBook" item SET "position" = ordered.ordinality - 1 FROM unnest(ARRAY[${Prisma.join(dto.itemIds)}]::text[]) WITH ORDINALITY AS ordered(id, ordinality) WHERE item."id" = ordered.id AND item."readListId" = ${id}`;
      }
      return { itemIds: dto.itemIds };
    });
  }

  async collaborators(id: string, userId: string) {
    return this.transaction(async (tx) => {
      await this.access(tx, id, userId, 'owner');
      return tx.readListCollaborator.findMany({
        where: { readListId: id },
        select: {
          user: { select: { id: true, username: true } },
          role: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      });
    });
  }

  async setCollaborator(
    id: string,
    userId: string,
    dto: ReadListCollaboratorDto,
  ) {
    return this.mutate(
      id,
      userId,
      'owner',
      dto.expectedRevision,
      async (tx) => {
        if (dto.userId === userId)
          throw new BadRequestException('The owner already has full access');
        if (
          !(await tx.user.findUnique({
            where: { id: dto.userId },
            select: { id: true },
          })) ||
          (await this.blocked(tx, userId, dto.userId))
        )
          throw new NotFoundException('Account unavailable');
        const existing = await tx.readListCollaborator.findUnique({
          where: { readListId_userId: { readListId: id, userId: dto.userId } },
        });
        if (
          !existing &&
          (await tx.readListCollaborator.count({
            where: { readListId: id },
          })) >= 100
        )
          throw new ConflictException(
            'Read lists support at most 100 collaborators',
          );
        const collaborator = await tx.readListCollaborator.upsert({
          where: { readListId_userId: { readListId: id, userId: dto.userId } },
          create: { readListId: id, userId: dto.userId, role: dto.role },
          update: { role: dto.role },
          select: {
            role: true,
            user: { select: { id: true, username: true } },
          },
        });
        return { collaborator };
      },
    );
  }

  async removeCollaborator(
    id: string,
    userId: string,
    target: string,
    expectedRevision?: number,
  ) {
    // Members can leave even if a block was added later.
    if (target === userId)
      return this.transaction(async (tx) => {
        const list = await tx.readList.findUnique({
          where: { id },
          select: { revision: true },
        });
        if (!list) throw new NotFoundException('Collaboration not found');
        this.checkRevision(list.revision, expectedRevision);
        const removed = await tx.readListCollaborator.deleteMany({
          where: { readListId: id, userId },
        });
        if (!removed.count)
          throw new NotFoundException('Collaboration not found');
        const updated = await tx.readList.update({
          where: { id },
          data: { revision: { increment: 1 } },
          select: { revision: true },
        });
        return { message: 'Collaboration removed', revision: updated.revision };
      });
    return this.mutate(id, userId, 'owner', expectedRevision, async (tx) => {
      await tx.readListCollaborator.deleteMany({
        where: { readListId: id, userId: target },
      });
      return { message: 'Collaboration removed' };
    });
  }

  async save(id: string, userId: string) {
    return this.transaction(async (tx) => {
      await this.access(tx, id, userId);
      await tx.readListSave.upsert({
        where: { readListId_userId: { readListId: id, userId } },
        create: { readListId: id, userId },
        update: {},
      });
      return { saved: true };
    });
  }

  async unsave(id: string, userId: string) {
    await this.prisma.readListSave.deleteMany({
      where: { readListId: id, userId },
    });
    return { saved: false };
  }

  async duplicate(id: string, userId: string, title: string) {
    return this.transaction(async (tx) => {
      await this.access(tx, id, userId);
      const source = await tx.readList.findUniqueOrThrow({
        where: { id },
        select: {
          description: true,
          coverUrl: true,
          items: {
            orderBy: { position: 'asc' },
            take: MAX_ITEMS + 1,
            select: {
              bookId: true,
              catalogProvider: true,
              catalogId: true,
              catalogPreview: true,
              note: true,
            },
          },
        },
      });
      if (source.items.length > MAX_ITEMS)
        throw new ConflictException(
          'Cannot duplicate a legacy list with more than 500 entries',
        );
      return tx.readList.create({
        data: {
          userId,
          title,
          description: source.description,
          coverUrl: source.coverUrl,
          visibility: 'PRIVATE',
          items: {
            create: source.items.map((item, position) => ({
              ...item,
              catalogPreview:
                item.catalogPreview === null
                  ? Prisma.DbNull
                  : item.catalogPreview,
              addedById: userId,
              position,
            })),
          },
        },
        select: listSummarySelect,
      });
    });
  }
}
