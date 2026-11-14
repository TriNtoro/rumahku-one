// Uang = integer satuan terkecil (aturan 3). Tidak pernah float; mata uang selalu menyertai angka.
export interface Money {
  amount_minor: number;
  currency: string;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

const CURRENCY_RE = /^[A-Z]{3}$/;

function toSafeInteger(value: number | bigint | string): number {
  let n: number;
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new MoneyError('amount outside safe integer range');
    }
    n = Number(value);
  } else if (typeof value === 'string') {
    // bigint dari PostgreSQL datang sebagai string; hanya digit (dengan tanda) yang diterima.
    if (!/^-?\d+$/.test(value)) throw new MoneyError('amount must be an integer string');
    return toSafeInteger(BigInt(value));
  } else {
    n = value;
  }
  if (!Number.isSafeInteger(n)) throw new MoneyError('amount must be a safe integer');
  return n;
}

export function money(amount: number | bigint | string, currency: string): Money {
  if (!CURRENCY_RE.test(currency)) throw new MoneyError('currency must be ISO 4217 uppercase');
  return { amount_minor: toSafeInteger(amount), currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new MoneyError('currency mismatch');
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount_minor + b.amount_minor, a.currency);
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount_minor - b.amount_minor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.amount_minor, a.currency);
}

export function formatMoney(m: Money, locale = 'id-ID'): string {
  const digits =
    new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  // Pembagian float HANYA untuk tampilan; semua perhitungan tetap pada integer minor unit.
  const major = m.amount_minor / 10 ** digits;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(major);
}
