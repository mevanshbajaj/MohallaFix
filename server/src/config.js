import 'dotenv/config';

const need = (k) => {
  if (!process.env[k]) throw new Error(`Missing required env var ${k}`);
  return process.env[k];
};

export const config = {
  port: +process.env.PORT || 4000,
  databaseUrl: need('DATABASE_URL'),
  pgssl: process.env.PGSSL === 'true',
  jwtSecret: need('JWT_SECRET'),
  jwtExpires: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  cloudinary: {
    name: process.env.CLOUDINARY_CLOUD_NAME,
    key: process.env.CLOUDINARY_API_KEY,
    secret: process.env.CLOUDINARY_API_SECRET,
  },
};
