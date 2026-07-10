import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';

import { BookController } from './book.controller';
import { BookService } from './book.service';

describe('BookController', () => {
  let controller: BookController;
  let service: BookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookController],
      providers: [
        {
          provide: BookService,
          useValue: {
            findAll: vi.fn(),
            findOne: vi.fn(),
            create: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(BookController);
    service = module.get(BookService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all books', async () => {
      const books = [
        {
          id: '1',
          title: 'Clean Code',
        },
        {
          id: '2',
          title: 'The Pragmatic Programmer',
        },
      ];

      vi.mocked(service.findAll).mockResolvedValue(books as never);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(books);
    });
  });

  describe('findOne', () => {
    it('should call bookService.findOne with correct id', async () => {
      const id = 'cmra83gn5000072sbax0sqhg1';

      vi.mocked(service.findOne).mockResolvedValue({
        id,
        title: 'Clean Code',
      } as never);

      const result = await controller.findOne({ id });

      expect(service.findOne).toHaveBeenCalledTimes(1);
      expect(service.findOne).toHaveBeenCalledWith(id);

      expect(result).toEqual({
        id,
        title: 'Clean Code',
      });
    });
  });

  describe('create', () => {
    it('should call bookService.create with dto', async () => {
      const dto = {
        title: 'Clean Code',
      };

      const createdBook = {
        id: '1',
        title: 'Clean Code',
      };

      vi.mocked(service.create).mockResolvedValue(createdBook as never);

      const result = await controller.create(dto as any);

      expect(service.create).toHaveBeenCalledTimes(1);
      expect(service.create).toHaveBeenCalledWith(dto);

      expect(result).toEqual(createdBook);
    });
  });
});
