import { describe, expect, it } from 'vitest';
import { createS3Storage } from '@/server/storage/s3';

const storage = createS3Storage({
  endpoint: 'https://example-account.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'rumahku-test',
  accessKeyId: 'AKIATESTTESTTESTTEST',
  secretAccessKey: 'secret-secret-secret-secret-secret-1234',
});

describe('adaptor S3/R2 (presigned URL)', () => {
  it('PUT: kedaluwarsa default 300 dtk dan terikat Content-Type', async () => {
    const u = new URL(
      await storage.presignPut('ws/abc/file.pdf', { contentType: 'application/pdf' }),
    );
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toContain('host');
    expect(u.pathname).toContain('/rumahku-test/ws/abc/file.pdf');
    expect(u.search).not.toContain('secret-secret');
  });
  it('GET: maksimum 5 menit (SPEC §8.5); lebih dari itu ditolak', async () => {
    const u = new URL(await storage.presignGet('ws/abc/file.pdf', { downloadName: 'a"b.pdf' }));
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(u.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="a_b.pdf"',
    );
    await expect(storage.presignGet('k', { expiresSec: 301 })).rejects.toThrow();
    await expect(storage.presignGet('k', { expiresSec: 0 })).rejects.toThrow();
    await expect(
      storage.presignPut('k', { contentType: 'x/y', expiresSec: 901 }),
    ).rejects.toThrow();
  });
  it('menolak key berbahaya (path traversal, absolut, backslash, kosong)', async () => {
    for (const key of ['../etc/passwd', '/abs', 'a\\b', '', 'a/../b']) {
      await expect(storage.presignGet(key)).rejects.toThrow('storage key tidak valid');
    }
  });
});
