import { Test, TestingModule } from '@nestjs/testing';
import { ReadListController } from './read-list.controller';

describe('ReadListController', () => {
  let controller: ReadListController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReadListController],
    }).compile();

    controller = module.get<ReadListController>(ReadListController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
