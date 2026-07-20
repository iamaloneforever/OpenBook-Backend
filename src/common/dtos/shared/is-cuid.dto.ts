import { IsCuid } from '../../validators/is-cuid.decorator';
export class BookIDParamDto {
  @IsCuid()
  id: string;
}
