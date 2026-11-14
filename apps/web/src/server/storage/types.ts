// Antarmuka tunggal penyimpanan file; implementasi S3-compatible (R2/Supabase/MinIO) dapat diganti.
export const MAX_PUT_EXPIRES_SEC = 900;
export const MAX_GET_EXPIRES_SEC = 300; // SPEC §8.5: unduhan ≤ 5 menit

export interface ObjectStorage {
  presignPut(key: string, opts: { contentType: string; expiresSec?: number }): Promise<string>;
  presignGet(key: string, opts?: { expiresSec?: number; downloadName?: string }): Promise<string>;
}

export function assertSafeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\') || key.length > 512) {
    throw new Error('storage key tidak valid');
  }
}
