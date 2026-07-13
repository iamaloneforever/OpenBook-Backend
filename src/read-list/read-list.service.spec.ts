import { Test, TestingModule } from '@nestjs/testing';
import { ReadListService } from './read-list.service';

describe('ReadListService', () => {
  let service: ReadListService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReadListService],
    }).compile();

    service = module.get<ReadListService>(ReadListService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
