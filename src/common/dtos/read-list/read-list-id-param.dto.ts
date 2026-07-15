import { IsCuid } from '../../validators/is-cuid.decorator';

export class ReadListIdParamDto {
  @IsCuid()
  id: string;
}
