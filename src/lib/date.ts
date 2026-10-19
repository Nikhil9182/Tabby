import {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  startOfMonth as dateFnsStartOfMonth,
  endOfMonth as dateFnsEndOfMonth,
} from 'date-fns';

/**
 * Standard date formatting using date-fns.
 *
 * @param date The Date object or ISO date string to format.
 * @param formatPattern The date format pattern (defaults to 'yyyy-MM-dd').
 * @returns The formatted date string, or empty string if invalid.
 */
export function formatDate(date: string | Date, formatPattern = 'yyyy-MM-dd'): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsedDate)) {
    return '';
  }
  return format(parsedDate, formatPattern);
}

/**
 * Formats a date relative to now (e.g., "5 minutes ago", "in 2 days").
 *
 * @param date The Date object or ISO date string.
 * @returns Human-readable relative time string.
 */
export function formatRelativeDate(date: string | Date): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(parsedDate)) {
    return '';
  }
  return formatDistanceToNow(parsedDate, { addSuffix: true });
}

/**
 * Converts a Date object to a standard ISO 8601 UTC string.
 *
 * @param date The Date instance.
 * @returns An ISO 8601 UTC string (e.g. '2026-10-20T04:25:00.000Z').
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Converts an ISO date/datetime string to a Date object.
 *
 * @param isoString The ISO string to parse.
 * @returns A Date object representing the given ISO string.
 */
export function toLocalDate(isoString: string): Date {
  return parseISO(isoString);
}

/**
 * Validates whether the given string is a valid ISO 8601 date or datetime.
 * Supports both full UTC datetimes (e.g. '2026-10-20T04:25:00.000Z')
 * and date-only representations (e.g. '2026-10-20').
 *
 * @param dateStr String to validate.
 * @returns True if valid ISO 8601 date, false otherwise.
 */
export function isValidISODate(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || dateStr.trim().length === 0) {
    return false;
  }
  // Check ISO 8601 structure (date or datetime with optional offset)
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;
  if (!isoPattern.test(dateStr)) {
    return false;
  }
  const parsed = parseISO(dateStr);
  return isValid(parsed);
}

/**
 * Returns the start of the month for the given Date.
 *
 * @param date The Date instance.
 * @returns Date representing the first millisecond of the month.
 */
export function startOfMonth(date: Date): Date {
  return dateFnsStartOfMonth(date);
}

/**
 * Returns the end of the month for the given Date.
 *
 * @param date The Date instance.
 * @returns Date representing the last millisecond of the month.
 */
export function endOfMonth(date: Date): Date {
  return dateFnsEndOfMonth(date);
}

/**
 * Returns the start and end Date for a given year and month.
 * Month is 1-indexed (1 = January, 12 = December).
 *
 * @param year The full calendar year (e.g., 2026).
 * @param month 1-based month index (1 to 12).
 * @returns An object containing start and end Date of the month.
 */
export function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  if (month < 1 || month > 12) {
    throw new RangeError(`Month must be between 1 and 12, received ${month}`);
  }
  const targetDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  return {
    start: dateFnsStartOfMonth(targetDate),
    end: dateFnsEndOfMonth(targetDate),
  };
}
