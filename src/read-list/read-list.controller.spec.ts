import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import { ReadListController } from './read-list.controller';
import { ReadListService } from './read-list.service';
import { OwnerGuard } from '../common/guards/auth/owner.guard';
import type { User } from '../generated/prisma/client';

describe('ReadListController', () => {
  let controller: ReadListController;

  const readListService = {
    getLists: vi.fn(),
    getList: vi.fn(),
    createList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    addBook: vi.fn(),
    removeBook: vi.fn(),
  };

  const mockUser: User = {
    id: 'user-1',
    username: 'testuser',
    password: 'hashed-password',
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReadListController],
      providers: [
        {
          provide: ReadListService,
          useValue: readListService,
        },
      ],
    })
      .overrideGuard(OwnerGuard)
      .useValue({
        canActivate: vi.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<ReadListController>(ReadListController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLists', () => {
    it('should return paginated read lists for user', async () => {
      const query = { page: 1, limit: 10 };
      const result = {
        data: [
          {
            id: 'list-1',
            title: 'Favorites',
            _count: { items: 3 },
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      readListService.getLists.mockResolvedValue(result);

      const response = await controller.getLists(mockUser, query);

      expect(readListService.getLists).toHaveBeenCalledWith('user-1', 1, 10);
      expect(response).toEqual(result);
    });

    it('should use default pagination when not provided', async () => {
      readListService.getLists.mockResolvedValue({ data: [], meta: {} });

      await controller.getLists(mockUser, {});

      expect(readListService.getLists).toHaveBeenCalledWith('user-1', 1, 10);
    });
  });

  describe('getList', () => {
    it('should return a single read list', async () => {
      const result = {
        id: 'list-1',
        title: 'Favorites',
        items: [],
        stats: {
          totalBooks: 0,
          totalPages: 0,
          averageRating: 0,
          totalRatings: 0,
        },
      };

      readListService.getList.mockResolvedValue(result);

      const response = await controller.getList('list-1');

      expect(readListService.getList).toHaveBeenCalledWith('list-1');
      expect(response).toEqual(result);
    });
  });

  describe('createList', () => {
    it('should create a new read list', async () => {
      const dto = { title: 'Favorites', description: 'My top picks' };
      const result = {
        id: 'list-1',
        ...dto,
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      readListService.createList.mockResolvedValue(result);

      const response = await controller.createList(dto, mockUser);

      expect(readListService.createList).toHaveBeenCalledWith('user-1', dto);
      expect(response).toEqual(result);
    });
  });

  describe('updateList', () => {
    it('should update a read list', async () => {
      const dto = { title: 'Updated Title' };
      const result = {
        id: 'list-1',
        ...dto,
        userId: 'user-1',
      };

      readListService.updateList.mockResolvedValue(result);

      const response = await controller.updateList('list-1', dto);

      expect(readListService.updateList).toHaveBeenCalledWith('list-1', dto);
      expect(response).toEqual(result);
    });
  });

  describe('deleteList', () => {
    it('should delete a read list', async () => {
      const result = {
        message: 'Read list deleted successfully',
      };

      readListService.deleteList.mockResolvedValue(result);

      const response = await controller.deleteList('list-1');

      expect(readListService.deleteList).toHaveBeenCalledWith('list-1');
      expect(response).toEqual(result);
    });
  });

  describe('addBook', () => {
    it('should add a book to a read list', async () => {
      const dto = { bookId: 'book-1' };
      const result = {
        readListId: 'list-1',
        bookId: 'book-1',
      };

      readListService.addBook.mockResolvedValue(result);

      const response = await controller.addBook('list-1', dto);

      expect(readListService.addBook).toHaveBeenCalledWith('list-1', 'book-1');
      expect(response).toEqual(result);
    });
  });

  describe('removeBook', () => {
    it('should remove a book from a read list', async () => {
      const result = {
        message: 'Book removed from read list',
      };

      readListService.removeBook.mockResolvedValue(result);

      const response = await controller.removeBook('list-1', 'book-1');

      expect(readListService.removeBook).toHaveBeenCalledWith(
        'list-1',
        'book-1',
      );
      expect(response).toEqual(result);
    });
  });
});
