import { IsCuid } from '../../validators/is-cuid.decorator';

export class AddBookToReadListDto {
  @IsCuid()
  bookId: string;
}
