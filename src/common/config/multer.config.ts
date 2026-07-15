import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

export const CoverUploadInterceptor = FileInterceptor('cover', {
  storage: diskStorage({
    destination: './uploads/books/covers',

    filename: (_, file, callback) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

      callback(null, uniqueName + extname(file.originalname));
    },
  }),

  fileFilter: (_, file, callback) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    const ext = extname(file.originalname).toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      return callback(
        new BadRequestException(
          'Only jpg, jpeg, png and webp images are allowed.',
        ),
        false,
      );
    }

    callback(null, true);
  },

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});
