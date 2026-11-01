import { IntersectionType, PartialType } from '@nestjs/mapped-types';
import { CreateReadListDto } from './create-read-list.dto';
import { ReadListMutationDto } from './advanced-read-list.dto';

export class UpdateReadListDto extends IntersectionType(
  PartialType(CreateReadListDto, { skipNullProperties: false }),
  ReadListMutationDto,
) {}
