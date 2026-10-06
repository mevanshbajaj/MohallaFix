import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';

const useCloud = !!(config.cloudinary.name && config.cloudinary.key && config.cloudinary.secret);
if (useCloud) {
  cloudinary.config({ cloud_name: config.cloudinary.name, api_key: config.cloudinary.key, api_secret: config.cloudinary.secret, secure: true });
}
export const UPLOAD_DIR = path.resolve('uploads');

/**
 * Stores an image buffer. Cloudinary in production; local disk in development.
 * Cloudinary re-encodes the image, which also strips EXIF/GPS metadata.
 * Returns { url, publicId }.
 */
export async function saveImage(buffer) {
  if (useCloud) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: 'mohallafix', resource_type: 'image', transformation: [{ width: 1600, crop: 'limit', quality: 'auto' }] },
          (err, r) => (err ? reject(err) : resolve({ url: r.secure_url, publicId: r.public_id }))
        )
        .end(buffer);
    });
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomUUID() + '.jpg';
  await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
  return { url: `${config.publicUrl}/uploads/${name}`, publicId: name };
}
