import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnsupportedMediaTypeException,
  BadRequestException,
} from '@nestjs/common';
import { catchError, type Observable } from 'rxjs';

import { diskStorage } from 'multer';

import { extname } from 'path';

import { randomUUID } from 'crypto';

import * as fs from 'fs';
import * as path from 'path';

export const BookUploadInterceptor = FileFieldsInterceptor(
  [
    {
      name: 'cover',
      maxCount: 1,
    },
    {
      name: 'file',
      maxCount: 1,
    },
  ],
  {
    storage: diskStorage({
      destination: (_, file, callback) => {
        const uploadDir = path.resolve(
          process.cwd(),
          './uploads/books',
          file.fieldname === 'cover' ? 'covers' : 'files',
        );

        fs.mkdir(uploadDir, { recursive: true }, (err) => {
          if (err) {
            return callback(err, '');
          }

          callback(null, uploadDir);
        });
      },

      filename: (_, file, callback) => {
        const filename = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;

        callback(null, filename);
      },
    }),

    fileFilter: (_, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();

      if (file.fieldname === 'file' && extension !== '.epub') {
        return callback(
          new BadRequestException('Only EPUB files are allowed'),
          false,
        );
      }

      if (
        file.fieldname === 'cover' &&
        !['.jpg', '.jpeg', '.png', '.webp'].includes(extension)
      ) {
        return callback(new BadRequestException('Invalid cover format'), false);
      }

      callback(null, true);
    },

    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 2,
      fields: 16,
      parts: 18,
      fieldSize: 16 * 1024,
    },
  },
);

const hasPrefix = (buffer: Buffer, signature: number[]) =>
  signature.every((byte, index) => buffer[index] === byte);

export function hasValidBookFileSignature(
  file: Pick<Express.Multer.File, 'fieldname' | 'mimetype' | 'originalname'>,
  header: Buffer,
) {
  const extension = extname(file.originalname).toLowerCase();

  if (file.fieldname === 'file') {
    return (
      extension === '.epub' &&
      file.mimetype === 'application/epub+zip' &&
      hasPrefix(header, [0x50, 0x4b, 0x03, 0x04])
    );
  }

  if (file.fieldname !== 'cover') {
    return false;
  }

  if (['.jpg', '.jpeg'].includes(extension) && file.mimetype === 'image/jpeg') {
    return hasPrefix(header, [0xff, 0xd8, 0xff]);
  }

  if (extension === '.png' && file.mimetype === 'image/png') {
    return hasPrefix(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (extension === '.webp' && file.mimetype === 'image/webp') {
    return (
      header.subarray(0, 4).toString('ascii') === 'RIFF' &&
      header.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

@Injectable()
export class BookUploadValidationInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      files?: Record<string, Express.Multer.File[]>;
    }>();
    const files = Object.values(request.files ?? {}).flat();

    try {
      for (const file of files) {
        const handle = await fs.promises.open(file.path, 'r');
        const header = Buffer.alloc(12);

        try {
          await handle.read(header, 0, header.length, 0);
        } finally {
          await handle.close();
        }

        if (!hasValidBookFileSignature(file, header)) {
          throw new UnsupportedMediaTypeException(
            `Invalid ${file.fieldname} file content`,
          );
        }
      }
    } catch (error) {
      await Promise.allSettled(
        files.map((file) => fs.promises.unlink(file.path)),
      );
      throw error;
    }

    return next.handle().pipe(
      catchError(async (error: unknown) => {
        await Promise.allSettled(
          files.map((file) => fs.promises.unlink(file.path)),
        );
        throw error;
      }),
    );
  }
}
