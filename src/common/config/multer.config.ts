import { FileFieldsInterceptor } from '@nestjs/platform-express';

import { diskStorage } from 'multer';

import { extname } from 'path';

import { randomUUID } from 'crypto';

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
        if (file.fieldname === 'cover') {
          callback(null, './uploads/books/covers');
        } else {
          callback(null, './uploads/books/files');
        }
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
