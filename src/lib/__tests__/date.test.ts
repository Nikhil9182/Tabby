import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatRelativeDate,
  toISOString,
  toLocalDate,
  isValidISODate,
  startOfMonth,
  endOfMonth,
  getMonthRange,
} from '../date';

describe('Date Utilities (src/lib/date.ts)', () => {
  describe('formatDate', () => {
    it('formats ISO string with default format (yyyy-MM-dd)', () => {
      expect(formatDate('2026-10-20T14:30:00.000Z')).toBe('2026-10-20');
      expect(formatDate('2026-01-05')).toBe('2026-01-05');
    });

    it('formats Date object with default format', () => {
      const date = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
      // In UTC or local, formatting the date instance
      expect(formatDate(date, 'yyyy')).toBe('2026');
    });

    it('formats with various custom format patterns', () => {
      const iso = '2026-10-20T14:30:00.000Z';
      expect(formatDate(iso, 'dd/MM/yyyy')).toBe('20/10/2026');
      expect(formatDate(iso, 'MMMM yyyy')).toBe('October 2026');
      expect(formatDate(iso, 'EEE, MMM d, yyyy')).toContain('Tue, Oct 20, 2026');
    });

    it('returns empty string for invalid date inputs', () => {
      expect(formatDate('invalid-date-string')).toBe('');
      expect(formatDate('2026-99-99')).toBe('');
      expect(formatDate(new Date('invalid'))).toBe('');
    });
  });

  describe('formatRelativeDate', () => {
    it('formats recent past dates with ago suffix', () => {
      const now = new Date();
      expect(formatRelativeDate(now)).toContain('ago');

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeDate(fiveMinutesAgo)).toContain('5 minutes ago');
    });

    it('formats dates from yesterday and last week', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(oneDayAgo)).toContain('day ago');

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(sevenDaysAgo)).toContain('7 days ago');
    });

    it('formats future dates with relative suffix', () => {
      const twoDaysInFuture = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(twoDaysInFuture)).toContain('in 2 days');
    });

    it('returns empty string for invalid dates', () => {
      expect(formatRelativeDate('not-a-date')).toBe('');
      expect(formatRelativeDate(new Date('invalid'))).toBe('');
    });
  });

  describe('toISOString & toLocalDate', () => {
    it('toISOString produces valid ISO 8601 UTC string', () => {
      const date = new Date('2026-10-20T15:45:00.000Z');
      const iso = toISOString(date);
      expect(iso).toBe('2026-10-20T15:45:00.000Z');
      expect(isValidISODate(iso)).toBe(true);
    });

    it('toLocalDate parses ISO string into Date object', () => {
      const iso = '2026-10-20T15:45:00.000Z';
      const parsed = toLocalDate(iso);
      expect(parsed instanceof Date).toBe(true);
      expect(parsed.toISOString()).toBe(iso);
    });
  });

  describe('isValidISODate', () => {
    it('accepts valid full ISO 8601 UTC strings', () => {
      expect(isValidISODate('2026-10-20T12:00:00.000Z')).toBe(true);
      expect(isValidISODate('2026-10-20T12:00:00Z')).toBe(true);
    });

    it('accepts valid date-only ISO strings', () => {
      expect(isValidISODate('2026-10-20')).toBe(true);
      expect(isValidISODate('2026-01-01')).toBe(true);
      expect(isValidISODate('2026-12-31')).toBe(true);
    });

    it('accepts valid ISO strings with timezone offsets', () => {
      expect(isValidISODate('2026-10-20T12:00:00+05:30')).toBe(true);
      expect(isValidISODate('2026-10-20T12:00:00-08:00')).toBe(true);
    });

    it('rejects invalid, malformed, and non-ISO strings', () => {
      expect(isValidISODate('')).toBe(false);
      expect(isValidISODate('   ')).toBe(false);
      expect(isValidISODate('invalid-date')).toBe(false);
      expect(isValidISODate('10/20/2026')).toBe(false); // US format, not ISO
      expect(isValidISODate('2026-99-99')).toBe(false);
      expect(isValidISODate('2026-13-01')).toBe(false);
      expect(isValidISODate('2026')).toBe(false);
      expect(isValidISODate('2026-10')).toBe(false);
    });

    it('rejects non-string types safely', () => {
      expect(isValidISODate(null as unknown as string)).toBe(false);
      expect(isValidISODate(undefined as unknown as string)).toBe(false);
      expect(isValidISODate(12345 as unknown as string)).toBe(false);
      expect(isValidISODate({} as unknown as string)).toBe(false);
    });
  });

  describe('startOfMonth & endOfMonth', () => {
    it('computes start of month correctly', () => {
      const midMonth = new Date(2026, 9, 15, 14, 30, 0); // October 15, 2026
      const start = startOfMonth(midMonth);
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
      expect(start.getMilliseconds()).toBe(0);
    });

    it('computes end of month for 31-day months (October)', () => {
      const midMonth = new Date(2026, 9, 15); // October
      const end = endOfMonth(midMonth);
      expect(end.getDate()).toBe(31);
    });

    it('computes end of month for 30-day months (November)', () => {
      const midMonth = new Date(2026, 10, 15); // November
      const end = endOfMonth(midMonth);
      expect(end.getDate()).toBe(30);
    });

    it('computes end of month for February in non-leap year (2026 -> 28 days)', () => {
      const feb2026 = new Date(2026, 1, 10);
      const end = endOfMonth(feb2026);
      expect(end.getDate()).toBe(28);
    });

    it('computes end of month for February in leap year (2024 -> 29 days)', () => {
      const feb2024 = new Date(2024, 1, 10);
      const end = endOfMonth(feb2024);
      expect(end.getDate()).toBe(29);
    });
  });

  describe('getMonthRange', () => {
    it('returns start and end of month for 1-based months (1 = Jan, 12 = Dec)', () => {
      const jan = getMonthRange(2026, 1);
      expect(jan.start.getFullYear()).toBe(2026);
      expect(jan.start.getMonth()).toBe(0);
      expect(jan.start.getDate()).toBe(1);
      expect(jan.end.getDate()).toBe(31);
      expect(formatDate(jan.start, 'yyyy-MM-dd')).toBe('2026-01-01');
      expect(formatDate(jan.end, 'yyyy-MM-dd')).toBe('2026-01-31');

      const dec = getMonthRange(2026, 12);
      expect(dec.start.getMonth()).toBe(11);
      expect(dec.end.getDate()).toBe(31);
      expect(formatDate(dec.start, 'yyyy-MM-dd')).toBe('2026-12-01');
      expect(formatDate(dec.end, 'yyyy-MM-dd')).toBe('2026-12-31');
    });

    it('handles February leap year vs non-leap year in getMonthRange', () => {
      // 2026 is non-leap year -> 28 days
      const feb2026 = getMonthRange(2026, 2);
      expect(feb2026.end.getDate()).toBe(28);
      expect(formatDate(feb2026.end, 'yyyy-MM-dd')).toBe('2026-02-28');

      // 2024 is leap year -> 29 days
      const feb2024 = getMonthRange(2024, 2);
      expect(feb2024.end.getDate()).toBe(29);
      expect(formatDate(feb2024.end, 'yyyy-MM-dd')).toBe('2024-02-29');
    });

    it('throws RangeError when month is less than 1 or greater than 12', () => {
      expect(() => getMonthRange(2026, 0)).toThrow(RangeError);
      expect(() => getMonthRange(2026, 13)).toThrow(RangeError);
      expect(() => getMonthRange(2026, -1)).toThrow(RangeError);
      expect(() => getMonthRange(2026, 100)).toThrow(RangeError);
    });
  });
});
