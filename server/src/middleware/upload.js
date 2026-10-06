import multer from 'multer';
import { HttpError } from './error.js';

const raw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) =>
    /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(415, 'BAD_FILE', 'Only JPEG, PNG or WebP photos are allowed')),
});

/** Checks the real file signature: the client-supplied MIME type can be faked. */
export function looksLikeImage(b) {
  if (b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  const heic = b.toString('ascii', 4, 8) === 'ftyp' && /heic|heix|mif1|msf1|hevc/.test(b.toString('ascii', 8, 12));
  return jpeg || png || webp || heic;
}

export const filesOf = (req) => (req.file ? [req.file] : Object.values(req.files || {}).flat());

function sniff(req, _res, next) {
  for (const f of filesOf(req)) if (!looksLikeImage(f.buffer)) return next(new HttpError(415, 'BAD_FILE', `${f.originalname || 'That file'} is not a valid photo`));
  next();
}

export const uploadPhoto = [raw.single('photo'), sniff];                                            // one photo
export const uploadPhotos = [raw.fields([{ name: 'photos', maxCount: 4 }, { name: 'photo', maxCount: 1 }]), sniff]; // up to 4
