import { getEnv } from '../env';
import { createS3Storage } from './s3';
import type { ObjectStorage } from './types';

export function getStorage(): ObjectStorage {
  const e = getEnv();
  if (!e.S3_ENDPOINT || !e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
    throw new Error('Penyimpanan file belum dikonfigurasi (S3_*)');
  }
  return createS3Storage({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    bucket: e.S3_BUCKET,
    accessKeyId: e.S3_ACCESS_KEY_ID,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY,
  });
}

export * from './types';
