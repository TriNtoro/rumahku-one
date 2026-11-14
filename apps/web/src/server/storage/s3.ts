import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  assertSafeKey,
  MAX_GET_EXPIRES_SEC,
  MAX_PUT_EXPIRES_SEC,
  type ObjectStorage,
} from './types';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createS3Storage(cfg: S3Config): ObjectStorage {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

  return {
    async presignPut(key, { contentType, expiresSec = 300 }) {
      assertSafeKey(key);
      if (expiresSec < 1 || expiresSec > MAX_PUT_EXPIRES_SEC)
        throw new Error('expiresSec di luar batas');
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }),
        { expiresIn: expiresSec },
      );
    },
    async presignGet(key, { expiresSec = MAX_GET_EXPIRES_SEC, downloadName } = {}) {
      assertSafeKey(key);
      if (expiresSec < 1 || expiresSec > MAX_GET_EXPIRES_SEC)
        throw new Error('expiresSec di luar batas');
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          ...(downloadName
            ? {
                ResponseContentDisposition: `attachment; filename="${downloadName.replace(/["\\\r\n]/g, '_')}"`,
              }
            : {}),
        }),
        { expiresIn: expiresSec },
      );
    },
  };
}
