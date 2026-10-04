import { describe, expect, it } from 'vitest';

import { hasValidBookFileSignature } from './multer.config';

describe('hasValidBookFileSignature', () => {
  it('accepts a matching PNG upload', () => {
    expect(
      hasValidBookFileSignature(
        {
          fieldname: 'cover',
          mimetype: 'image/png',
          originalname: 'cover.png',
        },
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
  });

  it('rejects content whose signature does not match its extension and MIME', () => {
    expect(
      hasValidBookFileSignature(
        {
          fieldname: 'cover',
          mimetype: 'image/jpeg',
          originalname: 'cover.jpg',
        },
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(false);
  });

  it('rejects a ZIP renamed to EPUB with the wrong MIME type', () => {
    expect(
      hasValidBookFileSignature(
        {
          fieldname: 'file',
          mimetype: 'application/zip',
          originalname: 'book.epub',
        },
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      ),
    ).toBe(false);
  });
});
