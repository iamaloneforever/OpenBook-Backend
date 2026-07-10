import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client';

import { BookService } from './book.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookDto } from '../dtos/book/create-book-dto';

describe('BookService', () => {
  let service: BookService;

  let prisma: {
    book: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      book: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(BookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all books', async () => {
      const books = [
        {
          id: '1',
          title: 'Clean Code',
        },
      ];

      prisma.book.findMany.mockResolvedValue(books);

      const result = await service.findAll();

      expect(result).toEqual(books);

      expect(prisma.book.findMany).toHaveBeenCalledWith({
        orderBy: {
          createdAt: 'desc',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return one book', async () => {
      const book = {
        id: '1',
        title: 'Clean Code',
      };

      prisma.book.findUnique.mockResolvedValue(book);

      const result = await service.findOne('1');

      expect(result).toEqual(book);

      expect(prisma.book.findUnique).toHaveBeenCalledWith({
        where: {
          id: '1',
        },
      });
    });

    it('should throw NotFoundException if book does not exist', async () => {
      prisma.book.findUnique.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);

      expect(prisma.book.findUnique).toHaveBeenCalledWith({
        where: {
          id: '1',
        },
      });
    });
  });

  describe('create', () => {
    const dto: CreateBookDto = {
      title: 'Clean Code',
      author: 'Robert C. Martin',
    };

    it('should create a book', async () => {
      const createdBook = {
        id: '1',
        ...dto,
      };

      prisma.book.create.mockResolvedValue(createdBook);

      const result = await service.create(dto);

      expect(result).toEqual(createdBook);

      expect(prisma.book.create).toHaveBeenCalledWith({
        data: dto,
      });
    });

    it('should throw ConflictException when ISBN already exists', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplicate key', {
        code: 'P2002',
        clientVersion: 'test',
      });

      prisma.book.create.mockRejectedValue(error);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for unknown errors', async () => {
      prisma.book.create.mockRejectedValue(new Error('Database crashed'));

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });
});
