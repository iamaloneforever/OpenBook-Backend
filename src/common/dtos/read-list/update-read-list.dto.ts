import { PartialType } from '@nestjs/mapped-types';
import { CreateReadListDto } from './create-read-list.dto';

export class UpdateReadListDto extends PartialType(CreateReadListDto) { }
