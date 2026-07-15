export const OWNER_CONFIG = {
  book: {
    delegate: 'book',
    ownerField: 'ownerId',
  },
  readList: {
    delegate: 'readList',
    ownerField: 'userId',
  },
} as const;
