import { FileFieldsInterceptor } from '@nestjs/platform-express';

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

        fs.mkdirSync(uploadDir, { recursive: true });

        callback(null, uploadDir);
      },

      filename: (_, file, callback) => {
        const filename = `${randomUUID()}${extname(file.originalname)}`;

        callback(null, filename);
      },
    }),

    fileFilter: (_, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();

      if (file.fieldname === 'file' && extension !== '.epub') {
        return callback(new Error('Only EPUB files are allowed'), false);
      }

      if (
        file.fieldname === 'cover' &&
        !['.jpg', '.jpeg', '.png', '.webp'].includes(extension)
      ) {
        return callback(new Error('Invalid cover format'), false);
      }

      callback(null, true);
    },

    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  },
);
