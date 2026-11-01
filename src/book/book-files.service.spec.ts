import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookFilesService } from './book-files.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('private EPUB downloads', () => {
  const findFirst = vi.fn();
  const service = new BookFilesService({
    book: { findFirst },
  } as unknown as PrismaService);
  const filename = '12345678-abcd-1234-abcd-123456789012.epub';
  let directory: string;

  beforeEach(async () => {
    findFirst.mockReset();
    directory = await mkdtemp(join(tmpdir(), 'openbook-files-'));
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    await mkdir(join(directory, 'uploads/books/files'), { recursive: true });
    await writeFile(
      join(directory, 'uploads/books/files', filename),
      'private epub',
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('streams an owned file as an attachment from the private directory', async () => {
    // The legacy stored path is supported without reopening the public directory.
    findFirst.mockResolvedValue({
      digitalBook: { filePath: `/uploads/books/${filename}` },
    });
    const result = await service.download('book', 'owner');
    const chunks: Buffer[] = [];
    for await (const chunk of result.getStream()) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('private epub');
    expect(result.getHeaders().type).toBe('application/epub+zip');
    expect(result.getHeaders().disposition).toContain('attachment');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'book', ownerId: 'owner' } }),
    );
  });

  it('does not open a file when the account does not own the book', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.download('book', 'stranger')).rejects.toThrow(
      'Book file not found',
    );
  });

  it.each(['/etc/passwd', '../../secret.env', null])(
    'rejects invalid storage references: %s',
    async (filePath) => {
      findFirst.mockResolvedValue({ digitalBook: { filePath } });
      await expect(service.download('book', 'owner')).rejects.toThrow(
        'Book file not found',
      );
    },
  );
});
