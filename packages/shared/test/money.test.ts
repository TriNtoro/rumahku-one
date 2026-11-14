import { describe, expect, it } from 'vitest';
import { add, formatMoney, money, MoneyError, negate, sub } from '../src/index';

describe('money', () => {
  it('menerima integer aman, bigint, dan string digit dari PostgreSQL', () => {
    expect(money(1500, 'IDR').amount_minor).toBe(1500);
    expect(money(10n, 'IDR').amount_minor).toBe(10);
    expect(money('-250', 'IDR').amount_minor).toBe(-250);
  });
  it('menolak float, NaN, di luar rentang aman, dan mata uang tidak valid', () => {
    expect(() => money(1.5, 'IDR')).toThrow(MoneyError);
    expect(() => money(Number.NaN, 'IDR')).toThrow(MoneyError);
    expect(() => money(2 ** 53, 'IDR')).toThrow(MoneyError);
    expect(() => money(1, 'rp')).toThrow(MoneyError);
    expect(() => money(1, 'idr')).toThrow(MoneyError);
    expect(() => money('1.5', 'IDR')).toThrow(MoneyError);
  });
  it('aritmetika tepat dan menolak campur mata uang', () => {
    expect(add(money(100, 'IDR'), money(250, 'IDR')).amount_minor).toBe(350);
    expect(sub(money(100, 'IDR'), money(250, 'IDR')).amount_minor).toBe(-150);
    expect(negate(money(5, 'IDR')).amount_minor).toBe(-5);
    expect(() => add(money(1, 'IDR'), money(1, 'USD'))).toThrow(MoneyError);
  });
  it('0.1 + 0.2 tidak pernah muncul: semua dalam minor unit', () => {
    expect(add(money(10, 'USD'), money(20, 'USD')).amount_minor).toBe(30);
    expect(formatMoney(money(1500, 'IDR'))).toMatch(/1[.,\s]?500/);
  });
});
