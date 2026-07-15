import { SetMetadata } from '@nestjs/common';

export const OWNER_KEY = 'owner';
export const Owner = (resource: 'book' | 'readList', param = 'id') =>
  SetMetadata(OWNER_KEY, {
    resource,
    param,
  });
