/**
 * Currency metadata specification.
 */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * Currency information map with decimal precisions and standard symbols.
 */
export const CURRENCY_INFO: Record<string, CurrencyInfo> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  NZD: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
  BRL: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  MXN: { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', decimals: 2 },
  ZAR: { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
  SEK: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
  NOK: { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2 },
  DKK: { code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2 },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2 },
  BHD: { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3 },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', decimals: 3 },
  OMR: { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', decimals: 3 },
};

/**
 * Validates whether the given string is a valid 3-letter currency code.
 *
 * @param code The 3-letter currency code.
 * @returns True if valid 3-letter alphabetic code, false otherwise.
 */
export function isValidCurrencyCode(code: string): boolean {
  if (typeof code !== 'string') {
    return false;
  }
  const clean = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(clean);
}

/**
 * Returns the minor unit multiplier (e.g., 100 for USD, 1000 for BHD, 1 for JPY).
 * Defaults to 100 for unknown currencies.
 *
 * @param currency ISO 3-letter currency code.
 * @returns Multiplier representing 10^decimals.
 */
export function getMinorUnitMultiplier(currency: string): number {
  const upper = currency.toUpperCase();
  const info = CURRENCY_INFO[upper];
  if (info !== undefined) {
    return Math.pow(10, info.decimals);
  }
  return 100;
}

/**
 * Returns the common symbol for the given currency code.
 * Falls back to the uppercase currency code if symbol is unavailable.
 *
 * @param currency ISO 3-letter currency code.
 * @returns Currency symbol string.
 */
export function getCurrencySymbol(currency: string): string {
  const upper = currency.toUpperCase();
  return CURRENCY_INFO[upper]?.symbol ?? upper;
}

/**
 * Converts minor unit integer amount to major units (for display purposes only).
 * Authoritative financial calculations must never use this result.
 *
 * @param amountMinor Amount in integer minor units.
 * @param currency ISO 3-letter currency code.
 * @returns Number in major units (e.g., 1250 cents -> 12.50 dollars).
 */
export function toMajorUnits(amountMinor: number, currency: string): number {
  const multiplier = getMinorUnitMultiplier(currency);
  return amountMinor / multiplier;
}

/**
 * Converts a major unit decimal amount to integer minor units.
 * Rounds to the nearest minor unit.
 *
 * @param majorAmount Number in major units.
 * @param currency ISO 3-letter currency code.
 * @returns Integer minor units.
 */
export function toMinorUnits(majorAmount: number, currency: string): number {
  const multiplier = getMinorUnitMultiplier(currency);
  return Math.round(majorAmount * multiplier);
}

/**
 * Formats an amount in minor units into a localized currency string.
 *
 * @param amountMinor Amount in integer minor units.
 * @param currency ISO 3-letter currency code.
 * @param locale Optional BCP 47 language tag (defaults to 'en-US').
 * @returns Formatted currency string (e.g., "$12.50").
 */
export function formatMoney(amountMinor: number, currency: string, locale = 'en-US'): string {
  const upper = currency.toUpperCase();
  const info = CURRENCY_INFO[upper];
  const decimals = info !== undefined ? info.decimals : 2;
  const major = amountMinor / Math.pow(10, decimals);

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: upper,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(major);
  } catch {
    const symbol = getCurrencySymbol(upper);
    const absMajor = Math.abs(major).toFixed(decimals);
    const sign = amountMinor < 0 ? '-' : '';
    return `${sign}${symbol}${absMajor}`;
  }
}

/**
 * Parses user input string to integer minor units without floating-point inaccuracies.
 * Handles negative signs, currency symbols, and international decimal separators.
 *
 * @param input Raw user input string (e.g. "$1,234.56", "1500", "-12.50").
 * @param currency Target ISO currency code to determine minor unit precision.
 * @returns Integer amount in minor units.
 */
export function parseMoney(input: string, currency: string): number {
  if (typeof input !== 'string') {
    return 0;
  }
  let str = input.trim();
  if (str.length === 0) {
    return 0;
  }

  const isNegative = str.startsWith('-') || /^\(.*\)$/.test(str);
  str = str.replace(/[()]/g, '').replace(/^-/, '');
  str = str.replace(/[^0-9.,]/g, '');
  if (!str) {
    return 0;
  }

  const upper = currency.toUpperCase();
  const info = CURRENCY_INFO[upper];
  const decimals = info !== undefined ? info.decimals : 2;

  let decSep = '.';
  const lastDot = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    decSep = lastDot > lastComma ? '.' : ',';
  } else if (lastComma !== -1 && lastDot === -1) {
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      decSep = ',';
    } else if (parts.length === 2 && decimals === 3) {
      decSep = ',';
    } else {
      decSep = '.';
    }
  }

  const parts = str.split(decSep);
  let intPartStr = parts[0].replace(/[^0-9]/g, '') || '0';
  let decPartStr = parts.length > 1 ? parts.slice(1).join('').replace(/[^0-9]/g, '') : '';

  if (decimals === 0) {
    let intVal = parseInt(intPartStr, 10);
    if (decPartStr.length > 0 && parseInt(decPartStr[0], 10) >= 5) {
      intVal += 1;
    }
    return isNegative ? -intVal : intVal;
  }

  if (decPartStr.length > decimals) {
    const nextDigit = parseInt(decPartStr[decimals], 10);
    let kept = parseInt(decPartStr.slice(0, decimals), 10);
    if (nextDigit >= 5) {
      kept += 1;
    }
    decPartStr = kept.toString().padStart(decimals, '0');
    if (decPartStr.length > decimals) {
      intPartStr = (parseInt(intPartStr, 10) + 1).toString();
      decPartStr = decPartStr.slice(1);
    }
  } else {
    decPartStr = decPartStr.padEnd(decimals, '0');
  }

  const totalMinor =
    parseInt(intPartStr, 10) * Math.pow(10, decimals) + parseInt(decPartStr, 10);
  return isNegative ? -totalMinor : totalMinor;
}

/**
 * Safe integer addition for minor units.
 *
 * @param a First minor unit amount.
 * @param b Second minor unit amount.
 * @returns Sum in integer minor units.
 */
export function addMoney(a: number, b: number): number {
  return Math.round(a) + Math.round(b);
}

/**
 * Safe integer subtraction for minor units.
 *
 * @param a Minuend in minor units.
 * @param b Subtrahend in minor units.
 * @returns Difference in integer minor units.
 */
export function subtractMoney(a: number, b: number): number {
  return Math.round(a) - Math.round(b);
}

/**
 * Multiplies an amount in minor units by a scalar factor and rounds to nearest integer.
 *
 * @param amountMinor Amount in integer minor units.
 * @param multiplier Scalar multiplier.
 * @returns Result in integer minor units.
 */
export function multiplyMoney(amountMinor: number, multiplier: number): number {
  return Math.round(Math.round(amountMinor) * multiplier);
}

/**
 * Divides an amount in minor units by a divisor and rounds to nearest integer.
 *
 * @param amountMinor Amount in integer minor units.
 * @param divisor Divisor.
 * @returns Result in integer minor units.
 * @throws Error if divisor is zero.
 */
export function divideMoney(amountMinor: number, divisor: number): number {
  if (divisor === 0) {
    throw new Error('Division by zero');
  }
  return Math.round(Math.round(amountMinor) / divisor);
}

/**
 * Converts minor unit amount to another currency using an exchange rate.
 * Correctly accounts for different minor unit precisions between currencies.
 *
 * @param amountMinor Amount in source integer minor units.
 * @param rate Exchange rate (1 source major unit = rate target major units).
 * @param fromCurrency Source ISO currency code (defaults to 2 decimals if omitted).
 * @param toCurrency Target ISO currency code (defaults to 2 decimals if omitted).
 * @returns Target amount in integer minor units.
 */
export function convertCurrency(
  amountMinor: number,
  rate: number,
  fromCurrency?: string,
  toCurrency?: string
): number {
  if (rate <= 0) {
    throw new Error('Exchange rate must be positive');
  }
  const fromMult = fromCurrency ? getMinorUnitMultiplier(fromCurrency) : 100;
  const toMult = toCurrency ? getMinorUnitMultiplier(toCurrency) : 100;
  return Math.round((Math.round(amountMinor) * rate * toMult) / fromMult);
}
