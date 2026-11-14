import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from './password';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email terlalu panjang')
  .pipe(z.email('Email tidak valid'));

export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter`)
    .max(128, 'Kata sandi maksimal 128 karakter'),
  display_name: z.string().trim().min(1, 'Nama wajib diisi').max(80, 'Nama maksimal 80 karakter'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Kata sandi wajib diisi').max(128),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  display_name: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
