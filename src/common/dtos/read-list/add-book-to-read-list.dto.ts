import { IsCuid } from '../../validators/is-cuid.decorator';
import { ReadListMutationDto } from './advanced-read-list.dto';

export class AddBookToReadListDto extends ReadListMutationDto {
  @IsCuid()
  bookId!: string;
}
