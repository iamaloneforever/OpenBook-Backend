import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import { ReadListService } from './read-list.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReadListService', () => {
  let service: ReadListService;

  const prisma = {
    readList: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },

    readListBook: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadListService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(ReadListService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
