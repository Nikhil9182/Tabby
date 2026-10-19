import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  parseMoney,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  convertCurrency,
  getMinorUnitMultiplier,
  toMajorUnits,
  toMinorUnits,
  getCurrencySymbol,
  isValidCurrencyCode,
  CURRENCY_INFO,
} from '../money/money';

describe('Money Utilities (src/domain/money/money.ts)', () => {
  describe('formatMoney', () => {
    it('formats USD correctly with 2 decimal places and $ symbol', () => {
      expect(formatMoney(1234, 'USD')).toBe('$12.34');
      expect(formatMoney(0, 'USD')).toBe('$0.00');
      expect(formatMoney(50, 'USD')).toBe('$0.50');
      expect(formatMoney(5, 'USD')).toBe('$0.05');
      expect(formatMoney(100000, 'USD')).toBe('$1,000.00');
    });

    it('formats negative amounts with minus sign', () => {
      expect(formatMoney(-500, 'USD')).toBe('-$5.00');
      expect(formatMoney(-1234, 'USD')).toBe('-$12.34');
      expect(formatMoney(-1, 'USD')).toBe('-$0.01');
    });

    it('formats EUR correctly', () => {
      const formatted = formatMoney(1234, 'EUR');
      expect(formatted).toContain('12.34');
      expect(formatted).toContain('€');
    });

    it('formats GBP correctly', () => {
      expect(formatMoney(1234, 'GBP')).toBe('£12.34');
      expect(formatMoney(9999, 'GBP')).toBe('£99.99');
    });

    it('formats INR correctly with ₹ symbol', () => {
      const formatted = formatMoney(50000, 'INR');
      expect(formatted).toContain('500.00');
      expect(formatted).toContain('₹');
    });

    it('formats zero-decimal currencies like JPY and KRW without decimal points', () => {
      expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
      expect(formatMoney(0, 'JPY')).toBe('¥0');
      expect(formatMoney(25000, 'KRW')).toBe('₩25,000');
      expect(formatMoney(-1500, 'JPY')).toBe('-¥1,500');
    });

    it('formats 3-decimal currencies like BHD, KWD, OMR with 3 decimals', () => {
      const bhd = formatMoney(1250, 'BHD');
      expect(bhd).toContain('1.250');

      const kwd = formatMoney(5678, 'KWD');
      expect(kwd).toContain('5.678');

      const omr = formatMoney(100, 'OMR');
      expect(omr).toContain('0.100');
    });

    it('falls back gracefully for unknown currency codes', () => {
      // 'XYZ' is an ISO code that Intl formats with code and amount
      const result = formatMoney(1234, 'XYZ');
      expect(result).toContain('XYZ');
      expect(result).toContain('12.34');

      // 'TOOLONG' is rejected by Intl.NumberFormat, triggering the catch block fallback
      const catchResult = formatMoney(1234, 'TOOLONG');
      expect(catchResult).toBe('TOOLONG12.34');

      const negCatchResult = formatMoney(-1234, 'TOOLONG');
      expect(negCatchResult).toBe('-TOOLONG12.34');
    });

    it('respects custom locales', () => {
      const deFormatted = formatMoney(123456, 'EUR', 'de-DE');
      // In German locale: 1.234,56 €
      expect(deFormatted).toContain('1.234,56');
    });
  });

  describe('parseMoney', () => {
    it('parses standard decimal strings to integer minor units', () => {
      expect(parseMoney('100', 'USD')).toBe(10000);
      expect(parseMoney('100.50', 'USD')).toBe(10050);
      expect(parseMoney('100.05', 'USD')).toBe(10005);
      expect(parseMoney('100.5', 'USD')).toBe(10050);
      expect(parseMoney('0.01', 'USD')).toBe(1);
      expect(parseMoney('0', 'USD')).toBe(0);
    });

    it('parses formatted strings with currency symbols and thousands separators', () => {
      expect(parseMoney('$1,000.00', 'USD')).toBe(100000);
      expect(parseMoney('$1,234,567.89', 'USD')).toBe(123456789);
      expect(parseMoney('₹500.00', 'INR')).toBe(50000);
      expect(parseMoney('£12.34', 'GBP')).toBe(1234);
      expect(parseMoney('€ 99.95', 'EUR')).toBe(9995);
    });

    it('parses zero-decimal currency strings (JPY, KRW)', () => {
      expect(parseMoney('1500', 'JPY')).toBe(1500);
      expect(parseMoney('¥1,500', 'JPY')).toBe(1500);
      expect(parseMoney('1500.4', 'JPY')).toBe(1500); // rounds down
      expect(parseMoney('1500.5', 'JPY')).toBe(1501); // rounds up half
    });

    it('parses 3-decimal currency strings (BHD, KWD, OMR)', () => {
      expect(parseMoney('1.250', 'BHD')).toBe(1250);
      expect(parseMoney('1.25', 'BHD')).toBe(1250);
      expect(parseMoney('1.2', 'BHD')).toBe(1200);
      expect(parseMoney('1', 'BHD')).toBe(1000);
      expect(parseMoney('0.005', 'BHD')).toBe(5);
    });

    it('parses negative amounts and accounting parenthesis notation', () => {
      expect(parseMoney('-100', 'USD')).toBe(-10000);
      expect(parseMoney('-$50.25', 'USD')).toBe(-5025);
      expect(parseMoney('(50.25)', 'USD')).toBe(-5025);
      expect(parseMoney('($1,000.00)', 'USD')).toBe(-100000);
    });

    it('rounds extra fractional digits using half-up rounding', () => {
      expect(parseMoney('10.555', 'USD')).toBe(1056);
      expect(parseMoney('10.554', 'USD')).toBe(1055);
      expect(parseMoney('10.556', 'USD')).toBe(1056);
    });

    it('returns 0 for empty, whitespace, and non-numeric inputs', () => {
      expect(parseMoney('', 'USD')).toBe(0);
      expect(parseMoney('   ', 'USD')).toBe(0);
      expect(parseMoney('abc', 'USD')).toBe(0);
      expect(parseMoney('$$$', 'USD')).toBe(0);
      expect(parseMoney('---', 'USD')).toBe(0);
      expect(parseMoney(null as unknown as string, 'USD')).toBe(0);
      expect(parseMoney(undefined as unknown as string, 'USD')).toBe(0);
    });
  });

  describe('Integer arithmetic', () => {
    it('addMoney adds amounts safely', () => {
      expect(addMoney(100, 200)).toBe(300);
      expect(addMoney(0, 0)).toBe(0);
      expect(addMoney(-50, 50)).toBe(0);
      expect(addMoney(-100, -200)).toBe(-300);
      // Handles fractional inputs by rounding to integer minor units
      expect(addMoney(10.2, 20.7)).toBe(31);
    });

    it('subtractMoney subtracts amounts safely', () => {
      expect(subtractMoney(500, 200)).toBe(300);
      expect(subtractMoney(200, 500)).toBe(-300);
      expect(subtractMoney(0, 0)).toBe(0);
      expect(subtractMoney(-100, -50)).toBe(-50);
      expect(subtractMoney(10.2, 4.8)).toBe(5);
    });

    it('multiplyMoney scales amounts and rounds to integer minor units', () => {
      expect(multiplyMoney(1000, 2)).toBe(2000);
      expect(multiplyMoney(1000, 0.5)).toBe(500);
      expect(multiplyMoney(1000, 0.3333)).toBe(333);
      expect(multiplyMoney(1000, 0.33333333)).toBe(333);
      expect(multiplyMoney(100, 0.335)).toBe(34);
      expect(multiplyMoney(0, 100)).toBe(0);
      expect(multiplyMoney(-100, 2)).toBe(-200);
    });

    it('divideMoney divides amounts and rounds to integer minor units', () => {
      expect(divideMoney(100, 2)).toBe(50);
      expect(divideMoney(100, 3)).toBe(33); // 33.333... -> 33
      expect(divideMoney(200, 3)).toBe(67); // 66.666... -> 67
      expect(divideMoney(0, 5)).toBe(0);
      expect(divideMoney(-100, 2)).toBe(-50);
      expect(divideMoney(-100, 3)).toBe(-33);
    });

    it('divideMoney throws when divisor is zero', () => {
      expect(() => divideMoney(100, 0)).toThrow('Division by zero');
      expect(() => divideMoney(0, 0)).toThrow('Division by zero');
    });
  });

  describe('convertCurrency', () => {
    it('converts currencies with same decimal precision (USD -> EUR)', () => {
      // $10.00 (1000 minor) at rate 0.92 = €9.20 (920 minor)
      expect(convertCurrency(1000, 0.92, 'USD', 'EUR')).toBe(920);
    });

    it('converts 2-decimal to 0-decimal currency (USD -> JPY)', () => {
      // $10.00 (1000 minor) at rate 150.0 = ¥1,500 (1500 minor)
      expect(convertCurrency(1000, 150.0, 'USD', 'JPY')).toBe(1500);
    });

    it('converts 0-decimal to 2-decimal currency (JPY -> USD)', () => {
      // ¥1,500 (1500 minor) at rate 0.0067 = $10.05 (1005 minor)
      expect(convertCurrency(1500, 0.0067, 'JPY', 'USD')).toBe(1005);
    });

    it('converts 2-decimal to 3-decimal currency (USD -> BHD)', () => {
      // $10.00 (1000 minor) at rate 0.38 = 3.800 BHD (3800 minor)
      expect(convertCurrency(1000, 0.38, 'USD', 'BHD')).toBe(3800);
    });

    it('converts 3-decimal to 2-decimal currency (BHD -> USD)', () => {
      // 3.800 BHD (3800 minor) at rate 2.65 = $10.07 (1007 minor)
      expect(convertCurrency(3800, 2.65, 'BHD', 'USD')).toBe(1007);
    });

    it('throws error for non-positive exchange rate', () => {
      expect(() => convertCurrency(100, 0, 'USD', 'EUR')).toThrow('Exchange rate must be positive');
      expect(() => convertCurrency(100, -1.5, 'USD', 'EUR')).toThrow('Exchange rate must be positive');
    });
  });

  describe('getMinorUnitMultiplier', () => {
    it('returns 1 for 0-decimal currencies', () => {
      expect(getMinorUnitMultiplier('JPY')).toBe(1);
      expect(getMinorUnitMultiplier('KRW')).toBe(1);
    });

    it('returns 100 for 2-decimal currencies', () => {
      const twoDecimals = [
        'USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'CHF', 'CNY',
        'HKD', 'SGD', 'NZD', 'BRL', 'MXN', 'ZAR', 'SEK', 'NOK', 'DKK', 'THB',
      ];
      for (const curr of twoDecimals) {
        expect(getMinorUnitMultiplier(curr)).toBe(100);
      }
    });

    it('returns 1000 for 3-decimal currencies', () => {
      expect(getMinorUnitMultiplier('BHD')).toBe(1000);
      expect(getMinorUnitMultiplier('KWD')).toBe(1000);
      expect(getMinorUnitMultiplier('OMR')).toBe(1000);
    });

    it('defaults to 100 for unknown currency codes', () => {
      expect(getMinorUnitMultiplier('UNKNOWN')).toBe(100);
      expect(getMinorUnitMultiplier('XYZ')).toBe(100);
    });
  });

  describe('toMajorUnits and toMinorUnits roundtrip', () => {
    it('roundtrips USD amounts accurately', () => {
      const originalMinor = 1250;
      const major = toMajorUnits(originalMinor, 'USD');
      expect(major).toBe(12.5);
      const backToMinor = toMinorUnits(major, 'USD');
      expect(backToMinor).toBe(originalMinor);
    });

    it('roundtrips JPY amounts accurately', () => {
      const originalMinor = 1500;
      const major = toMajorUnits(originalMinor, 'JPY');
      expect(major).toBe(1500);
      const backToMinor = toMinorUnits(major, 'JPY');
      expect(backToMinor).toBe(originalMinor);
    });

    it('roundtrips BHD amounts accurately', () => {
      const originalMinor = 1250;
      const major = toMajorUnits(originalMinor, 'BHD');
      expect(major).toBe(1.25);
      const backToMinor = toMinorUnits(major, 'BHD');
      expect(backToMinor).toBe(originalMinor);
    });

    it('rounds toMinorUnits when fractional minor units are passed', () => {
      expect(toMinorUnits(12.345, 'USD')).toBe(1235);
      expect(toMinorUnits(12.344, 'USD')).toBe(1234);
    });
  });

  describe('getCurrencySymbol', () => {
    it('returns correct symbol for standard currencies', () => {
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('EUR')).toBe('€');
      expect(getCurrencySymbol('GBP')).toBe('£');
      expect(getCurrencySymbol('INR')).toBe('₹');
      expect(getCurrencySymbol('JPY')).toBe('¥');
      expect(getCurrencySymbol('BHD')).toBe('BD');
      expect(getCurrencySymbol('KWD')).toBe('KD');
      expect(getCurrencySymbol('OMR')).toBe('OMR');
    });

    it('falls back to uppercase currency code when symbol is unknown', () => {
      expect(getCurrencySymbol('XYZ')).toBe('XYZ');
      expect(getCurrencySymbol('abc')).toBe('ABC');
    });
  });

  describe('isValidCurrencyCode', () => {
    it('validates 3-letter alphabetic currency codes', () => {
      expect(isValidCurrencyCode('USD')).toBe(true);
      expect(isValidCurrencyCode('EUR')).toBe(true);
      expect(isValidCurrencyCode('gbp')).toBe(true);
      expect(isValidCurrencyCode('InR')).toBe(true);
      expect(isValidCurrencyCode('XYZ')).toBe(true);
    });

    it('rejects invalid currency codes', () => {
      expect(isValidCurrencyCode('')).toBe(false);
      expect(isValidCurrencyCode(' ')).toBe(false);
      expect(isValidCurrencyCode('US')).toBe(false);
      expect(isValidCurrencyCode('USDD')).toBe(false);
      expect(isValidCurrencyCode('123')).toBe(false);
      expect(isValidCurrencyCode('U$D')).toBe(false);
      expect(isValidCurrencyCode('US1')).toBe(false);
      expect(isValidCurrencyCode(null as unknown as string)).toBe(false);
      expect(isValidCurrencyCode(undefined as unknown as string)).toBe(false);
      expect(isValidCurrencyCode(123 as unknown as string)).toBe(false);
    });
  });

  describe('Edge cases and extreme values', () => {
    it('handles zero amounts across all operations', () => {
      expect(formatMoney(0, 'USD')).toBe('$0.00');
      expect(parseMoney('0', 'USD')).toBe(0);
      expect(addMoney(0, 0)).toBe(0);
      expect(subtractMoney(0, 0)).toBe(0);
      expect(multiplyMoney(0, 10)).toBe(0);
      expect(toMajorUnits(0, 'USD')).toBe(0);
      expect(toMinorUnits(0, 'USD')).toBe(0);
    });

    it('handles very large amounts within safe integer range', () => {
      // 10 billion minor units = $100,000,000.00
      const largeMinor = 10_000_000_000;
      expect(addMoney(largeMinor, 500)).toBe(10_000_000_500);
      expect(subtractMoney(largeMinor, 500)).toBe(9_999_999_500);
      expect(toMajorUnits(largeMinor, 'USD')).toBe(100_000_000);
      expect(parseMoney('100,000,000.00', 'USD')).toBe(largeMinor);
    });

    it('handles negative amounts across all operations', () => {
      expect(formatMoney(-1000, 'USD')).toBe('-$10.00');
      expect(parseMoney('-10.00', 'USD')).toBe(-1000);
      expect(addMoney(-1000, -500)).toBe(-1500);
      expect(subtractMoney(-1000, -500)).toBe(-500);
      expect(multiplyMoney(-1000, 2)).toBe(-2000);
      expect(divideMoney(-1000, 2)).toBe(-500);
    });
  });

  describe('CRITICAL: Floating point accuracy verification', () => {
    it('avoids classic 0.1 + 0.2 floating point inaccuracy using integer minor units', () => {
      // In raw IEEE 754 float: 0.1 + 0.2 === 0.30000000000000004 !== 0.3
      // In minor units (cents): 10 cents + 20 cents = 30 cents exactly
      const cents1 = parseMoney('0.10', 'USD');
      const cents2 = parseMoney('0.20', 'USD');
      expect(cents1).toBe(10);
      expect(cents2).toBe(20);

      const totalCents = addMoney(cents1, cents2);
      expect(totalCents).toBe(30);
      expect(formatMoney(totalCents, 'USD')).toBe('$0.30');
      expect(toMajorUnits(totalCents, 'USD')).toBe(0.3);
    });

    it('accumulating 10 cents ten times yields exactly 100 cents ($1.00), not 0.9999999999999999', () => {
      let accumulated = 0;
      const tenCents = parseMoney('0.10', 'USD');
      for (let i = 0; i < 10; i++) {
        accumulated = addMoney(accumulated, tenCents);
      }
      expect(accumulated).toBe(100);
      expect(formatMoney(accumulated, 'USD')).toBe('$1.00');
    });

    it('handles 1000 * 33.33% cleanly in minor units', () => {
      // $10.00 = 1000 minor units
      // 33.33% = 0.3333
      const result = multiplyMoney(1000, 0.3333);
      expect(result).toBe(333); // exactly 333 cents ($3.33)
      expect(Number.isInteger(result)).toBe(true);
    });
  });
});
