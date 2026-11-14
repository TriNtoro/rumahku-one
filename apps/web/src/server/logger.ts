import pino, { type DestinationStream, type Logger } from 'pino';

// Redaksi: rahasia tidak boleh masuk log (aturan 8).
export const REDACT_PATHS = [
  'password',
  '*.password',
  'password_hash',
  '*.password_hash',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'set-cookie',
  '*.set-cookie',
  'req.headers.authorization',
  'req.headers.cookie',
];

export function createLogger(destination?: DestinationStream, level = 'info'): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, destination);
}

let shared: Logger | undefined;
export function getLogger(): Logger {
  shared ??= createLogger(undefined, process.env.LOG_LEVEL ?? 'info');
  return shared;
}
