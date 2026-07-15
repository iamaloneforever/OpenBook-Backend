import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import { ReadListController } from './read-list.controller';
import { ReadListService } from './read-list.service';
import { OwnerGuard } from '../common/guards/auth/owner.guard';

describe('ReadListController', () => {
  let controller: ReadListController;

  const readListService = {
    getLists: vi.fn(),
  };

  beforeEach(async () => {
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
});
