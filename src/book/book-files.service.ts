import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { open } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookFilesService {
  constructor(private readonly prisma: PrismaService) {}

  async download(bookId: string, ownerId: string): Promise<StreamableFile> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, ownerId },
      select: { digitalBook: { select: { filePath: true } } },
    });
    const storedPath = book?.digitalBook?.filePath;
    const filename = storedPath ? basename(storedPath) : '';
    // Resolve only server-generated filenames inside the private EPUB directory.
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.epub$/i.test(filename))
      throw new NotFoundException('Book file not found');
    try {
      const handle = await open(
        join(process.cwd(), 'uploads', 'books', 'files', filename),
        'r',
      );
      return new StreamableFile(handle.createReadStream(), {
        type: 'application/epub+zip',
        disposition: `attachment; filename="${filename}"`,
      });
    } catch {
      throw new NotFoundException('Book file not found');
    }
  }
}
