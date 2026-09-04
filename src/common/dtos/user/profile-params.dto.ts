import { IsCuid } from '../../validators/is-cuid.decorator';

export class ProfileParamsDto {
  @IsCuid()
  userId!: string;
}
