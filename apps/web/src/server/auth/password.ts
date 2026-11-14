import { hash, verify } from '@node-rs/argon2';

// Argon2id (algoritma bawaan @node-rs/argon2), parameter minimum OWASP: 19 MiB, t=2, p=1.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 12;

export const hashPassword = (password: string): Promise<string> => hash(password, OPTS);

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** Verifikasi palsu agar waktu respons email tak dikenal ≈ email dikenal (anti enumerasi). */
export async function burnVerifyTime(password: string): Promise<void> {
  dummy ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummy, password);
}
