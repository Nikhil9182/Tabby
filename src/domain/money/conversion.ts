/**
 * Pure currency-conversion primitives. No network access lives here; rates are
 * passed in as a RateContext so every calculation is deterministic and testable.
 * Policy: see ARCHITECTURE.md §8.1.
 */
import { getMinorUnitMultiplier } from './money';

/** One exchange rate: `rate` units of `to` per 1 unit of `from`. */
export interface RateQuote {
  from: string;
  to: string;
  rate: number;
  /** 'latest' or the YYYY-MM-DD date that was asked for. */
  requestedDate: string;
  /** Date the provider says the rate applies to (weekends carry the prior business day). */
  effectiveDate: string;
  source: 'identity' | 'network' | 'cache';
  fetchedAt: string;
}

/** Rates keyed by rateKey(from, to, date). */
export type RateContext = ReadonlyMap<string, RateQuote>;

export const EMPTY_RATE_CONTEXT: RateContext = new Map();

export function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase();
}

export function rateKey(from: string, to: string, date?: string): string {
  return `${normalizeCurrency(from)}>${normalizeCurrency(to)}@${date || 'latest'}`;
}

export function identityQuote(currency: string, date?: string): RateQuote {
  const code = normalizeCurrency(currency);
  const today = new Date().toISOString().slice(0, 10);
  return {
    from: code,
    to: code,
    rate: 1,
    requestedDate: date || 'latest',
    effectiveDate: date || today,
    source: 'identity',
    fetchedAt: new Date().toISOString(),
  };
}

/** Rounds .5 away from zero so +x and -x round symmetrically. */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Converts integer minor units between currencies with different precisions.
 * `rate` is target units per 1 source unit. Rounds once, at the end.
 */
export function convertMinor(amountMinor: number, from: string, to: string, rate: number): number {
  if (normalizeCurrency(from) === normalizeCurrency(to)) return amountMinor;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid exchange rate ${rate} for ${from}→${to}`);
  }
  const fromMult = getMinorUnitMultiplier(from);
  const toMult = getMinorUnitMultiplier(to);
  return roundHalfAwayFromZero((amountMinor * rate * toMult) / fromMult);
}

/** Inverse of a quote (e.g. INR→USD from a USD→INR quote). */
export function invertQuote(quote: RateQuote): RateQuote {
  return { ...quote, from: quote.to, to: quote.from, rate: 1 / quote.rate };
}

/** Cross rate from→to via a common base: (base→to) / (base→from). */
export function crossQuote(baseToFrom: RateQuote, baseToTarget: RateQuote): RateQuote {
  if (baseToFrom.from !== baseToTarget.from) {
    throw new Error('Cross rate requires quotes from the same base currency');
  }
  return {
    from: baseToFrom.to,
    to: baseToTarget.to,
    rate: baseToTarget.rate / baseToFrom.rate,
    requestedDate: baseToTarget.requestedDate,
    effectiveDate: baseToTarget.effectiveDate,
    source: baseToFrom.source === 'cache' || baseToTarget.source === 'cache' ? 'cache' : 'network',
    fetchedAt: baseToTarget.fetchedAt,
  };
}

export function findQuote(rates: RateContext, from: string, to: string, date?: string): RateQuote | undefined {
  if (normalizeCurrency(from) === normalizeCurrency(to)) return identityQuote(from, date);
  return rates.get(rateKey(from, to, date));
}

// ---------------------------------------------------------------------------
// Single amounts
// ---------------------------------------------------------------------------

export type DisplayAmount =
  | { status: 'same'; amountMinor: number; currency: string }
  | { status: 'converted'; amountMinor: number; currency: string; quote: RateQuote }
  /** No rate: amount/currency are the ORIGINAL ones, never relabelled. */
  | { status: 'unavailable'; amountMinor: number; currency: string; targetCurrency: string };

export function getDisplayAmount(
  originalMinor: number,
  originalCurrency: string,
  displayCurrency: string,
  rates: RateContext,
  date?: string
): DisplayAmount {
  const from = normalizeCurrency(originalCurrency);
  const to = normalizeCurrency(displayCurrency);
  if (from === to) return { status: 'same', amountMinor: originalMinor, currency: from };

  const quote = findQuote(rates, from, to, date);
  if (!quote) {
    return { status: 'unavailable', amountMinor: originalMinor, currency: from, targetCurrency: to };
  }
  return { status: 'converted', amountMinor: convertMinor(originalMinor, from, to, quote.rate), currency: to, quote };
}

// ---------------------------------------------------------------------------
// Money bags: balances kept per transaction currency, never summed raw
// ---------------------------------------------------------------------------

/** currency → signed integer minor units. Zero entries are omitted. */
export type MoneyBag = Readonly<Record<string, number>>;

export const EMPTY_BAG: MoneyBag = Object.freeze({});

export function bagOf(currency: string, amountMinor: number): MoneyBag {
  return amountMinor === 0 ? EMPTY_BAG : { [normalizeCurrency(currency)]: amountMinor };
}

export function addToBag(bag: MoneyBag, currency: string, amountMinor: number): MoneyBag {
  if (amountMinor === 0) return bag;
  const code = normalizeCurrency(currency);
  const next = { ...bag, [code]: (bag[code] ?? 0) + amountMinor };
  if (next[code] === 0) delete next[code];
  return next;
}

export function mergeBags(...bags: MoneyBag[]): MoneyBag {
  let out: MoneyBag = EMPTY_BAG;
  for (const bag of bags) {
    for (const [code, amount] of Object.entries(bag)) out = addToBag(out, code, amount);
  }
  return out;
}

export function negateBag(bag: MoneyBag): MoneyBag {
  const out: Record<string, number> = {};
  for (const [code, amount] of Object.entries(bag)) out[code] = -amount;
  return out;
}

export function isZeroBag(bag: MoneyBag): boolean {
  return Object.values(bag).every((v) => v === 0);
}

export function bagCurrencies(bag: MoneyBag): string[] {
  return Object.keys(bag).filter((c) => bag[c] !== 0).sort();
}

/** Keeps only the positive (or negative) side of a bag. */
export function bagSide(bag: MoneyBag, side: 'positive' | 'negative'): MoneyBag {
  const out: Record<string, number> = {};
  for (const [code, amount] of Object.entries(bag)) {
    if (side === 'positive' ? amount > 0 : amount < 0) out[code] = amount;
  }
  return out;
}

export interface ConvertedBag {
  /** Sum in the display currency, or null when any bucket has no rate. */
  totalMinor: number | null;
  currency: string;
  /** True when at least one bucket was converted (show "≈"). */
  isApproximate: boolean;
  /** Currencies that could not be converted. */
  missing: string[];
  quotes: RateQuote[];
}

/** Converts each currency bucket once and sums in the display currency. */
export function convertBag(bag: MoneyBag, displayCurrency: string, rates: RateContext, date?: string): ConvertedBag {
  const to = normalizeCurrency(displayCurrency);
  let total = 0;
  let isApproximate = false;
  const missing: string[] = [];
  const quotes: RateQuote[] = [];

  for (const code of bagCurrencies(bag)) {
    const amount = bag[code];
    if (code === to) {
      total += amount;
      continue;
    }
    const quote = findQuote(rates, code, to, date);
    if (!quote) {
      missing.push(code);
      continue;
    }
    total += convertMinor(amount, code, to, quote.rate);
    isApproximate = true;
    quotes.push(quote);
  }

  return { totalMinor: missing.length ? null : total, currency: to, isApproximate, missing, quotes };
}
