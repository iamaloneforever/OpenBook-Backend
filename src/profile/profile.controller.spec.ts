import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheModule } from '@nestjs/cache-manager';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

describe('ProfileController', () => {
  let controller: ProfileController;

  const service = {
    getPublicProfile: vi.fn(),
    getProfileBooks: vi.fn(),
    getProfileReadLists: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: service }],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return public profile', async () => {
      const mockProfile = {
        id: 'user-1',
        username: 'alice',
        createdAt: new Date(),
        booksVisible: true,
        readListsVisible: true,
        bookCount: 5,
        readListCount: 2,
      };

      service.getPublicProfile.mockResolvedValue(mockProfile);

      const result = await controller.getProfile({ userId: 'user-1' });

      expect(result).toEqual(mockProfile);
      expect(service.getPublicProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getProfileBooks', () => {
    it('should return paginated books', async () => {
      const mockResult = {
        data: [{ id: 'book-1', title: 'Test' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      service.getProfileBooks.mockResolvedValue(mockResult);

      const result = await controller.getProfileBooks(
        { userId: 'user-1' },
        { page: 1, limit: 10 },
      );

      expect(result).toEqual(mockResult);
      expect(service.getProfileBooks).toHaveBeenCalledWith('user-1', {
        page: 1,
        limit: 10,
      });
    });
  });

  describe('getProfileReadLists', () => {
    it('should return paginated read lists', async () => {
      const mockResult = {
        data: [{ id: 'list-1', title: 'Favorites', bookCount: 3 }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      service.getProfileReadLists.mockResolvedValue(mockResult);

      const result = await controller.getProfileReadLists(
        { userId: 'user-1' },
        { page: 1, limit: 10 },
      );

      expect(result).toEqual(mockResult);
      expect(service.getProfileReadLists).toHaveBeenCalledWith('user-1', {
        page: 1,
        limit: 10,
      });
    });
  });
});
