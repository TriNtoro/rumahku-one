// RFC 9457 problem+json. Kode stabil untuk klien; pesan tidak boleh memuat rahasia.
export type ProblemCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'VERSION_CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  errors?: { path: string; message: string }[];
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ProblemCode,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: { path: string; message: string }[],
    public readonly headers?: Record<string, string>,
  ) {
    super(title);
    this.name = 'AppError';
  }
}

export const notFound = () => new AppError(404, 'NOT_FOUND', 'Tidak ditemukan');

export function toProblemBody(e: AppError): ProblemBody {
  return {
    type: `urn:rumahku:problem:${e.code.toLowerCase().replace(/_/g, '-')}`,
    title: e.title,
    status: e.status,
    code: e.code,
    ...(e.detail ? { detail: e.detail } : {}),
    ...(e.errors ? { errors: e.errors } : {}),
  };
}

export function problemResponse(e: AppError): Response {
  return new Response(JSON.stringify(toProblemBody(e)), {
    status: e.status,
    headers: { 'content-type': 'application/problem+json', ...(e.headers ?? {}) },
  });
}
