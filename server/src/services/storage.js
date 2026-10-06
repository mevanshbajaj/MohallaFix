import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';

const useCloud = !!(config.cloudinary.name && config.cloudinary.key && config.cloudinary.secret);
if (useCloud) {
  cloudinary.config({ cloud_name: config.cloudinary.name, api_key: config.cloudinary.key, api_secret: config.cloudinary.secret, secure: true });
} else if (process.env.NODE_ENV === 'production') {
  // Hosting disks are wiped on redeploy: never silently fall back to local files in production
  throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
}
export const UPLOAD_DIR = path.resolve('uploads');

async function saveOne(buffer) {
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

/** Best-effort removal of stored images (Cloudinary assets or dev files). Never throws. */
export async function deleteImages(publicIds) {
  const ids = (publicIds || []).filter(Boolean);
  const cloudIds = ids.filter((i) => i.includes('/'));
  try { if (useCloud && cloudIds.length) await cloudinary.api.delete_resources(cloudIds); } catch (e) { console.error('cloudinary delete failed:', e.message); }
  await Promise.all(ids.filter((i) => !i.includes('/')).map((i) => fs.unlink(path.join(UPLOAD_DIR, path.basename(i))).catch(() => {})));
}

/** All-or-nothing upload of several buffers. On any failure, already-uploaded ones are removed and a friendly error is thrown. */
export async function saveImages(buffers) {
  const results = await Promise.allSettled(buffers.map(saveOne));
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) {
    console.error('image upload failed:', failed.reason?.message || failed.reason);
    await deleteImages(ok.map((i) => i.publicId));
    throw new HttpError(502, 'IMAGE_UPLOAD_FAILED', 'We could not upload your photo. Please check your connection and try again.');
  }
  return ok;
}

export const saveImage = async (buffer) => (await saveImages([buffer]))[0];
