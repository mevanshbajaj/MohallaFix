import multer from 'multer';
import { HttpError } from './error.js';

// Memory storage, 5 MB cap, images only
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(415, 'BAD_FILE', 'Only JPEG, PNG or WebP photos are allowed')),
});
