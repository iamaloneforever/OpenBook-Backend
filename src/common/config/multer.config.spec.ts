import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom, throwError } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';

import {
  BookUploadValidationInterceptor,
  hasValidBookFileSignature,
} from './multer.config';

describe('hasValidBookFileSignature', () => {
  it('removes accepted uploads when downstream validation or persistence fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openbook-upload-'));
    const path = join(directory, 'cover.png');
    try {
      await writeFile(
        path,
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            files: {
              cover: [
                {
                  path,
                  fieldname: 'cover',
                  mimetype: 'image/png',
                  originalname: 'cover.png',
                },
              ],
            },
          }),
        }),
      } as unknown as ExecutionContext;
      const error = new Error('Request rejected');
      const result = await new BookUploadValidationInterceptor().intercept(
        context,
        { handle: () => throwError(() => error) },
      );
      await expect(firstValueFrom(result)).rejects.toBe(error);
      await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
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
