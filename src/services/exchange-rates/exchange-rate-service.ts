import { supabase, checkSupabaseConfig } from '../../lib/supabase';
import type { ExchangeRateCache } from '../../domain/models/types';
import {
  convertMinor,
  identityQuote,
  normalizeCurrency,
  rateKey,
  type RateQuote,
} from '../../domain/money/conversion';

export const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v2';

const CURRENCY_CACHE_KEY = 'tabby_currencies_cache';

/** How long a "latest" rate is reused before asking the provider again. */
const LATEST_RATE_TTL_MS = 60 * 60 * 1000;

export type ExchangeRateErrorKind = 'unsupported' | 'network' | 'unavailable';

/** Thrown when no valid rate can be produced. Never swallowed into a 1:1 rate. */
export class ExchangeRateError extends Error {
  readonly kind: ExchangeRateErrorKind;
  readonly from: string;
  readonly to: string;
  readonly date?: string;

  constructor(kind: ExchangeRateErrorKind, from: string, to: string, date: string | undefined, detail: string) {
    const when = date ? ` on ${date}` : '';
    super(`No exchange rate from ${from} to ${to}${when}: ${detail}`);
    this.name = 'ExchangeRateError';
    this.kind = kind;
    this.from = from;
    this.to = to;
    this.date = date;
  }
}

export interface CurrencyConversionResult {
  convertedMinor: number;
  rate: number;
  rateDate: string;
  source: 'identity' | 'network' | 'cache';
  quote: RateQuote;
}

const CODE_RE = /^[A-Z]{3}$/;

function toLegacyCache(quote: RateQuote): ExchangeRateCache {
  return {
    baseCurrency: quote.from,
    quoteCurrency: quote.to,
    rate: quote.rate,
    rateDate: quote.effectiveDate,
    fetchedAt: quote.fetchedAt,
    source: quote.source === 'network' ? 'frankfurter' : quote.source,
  };
}

export class ExchangeRateService {
  private currenciesMemoryCache: Record<string, string> | null = null;
  /** L1: successful quotes only. Historical entries never expire. */
  private memory = new Map<string, RateQuote>();
  /** Requests in flight, so concurrent callers share one network call. */
  private inFlight = new Map<string, Promise<RateQuote>>();

  async getAvailableCurrencies(): Promise<Record<string, string>> {
    // 1. Try in-memory cache
    if (this.currenciesMemoryCache) {
      return this.currenciesMemoryCache;
    }

    // 2. Try fetching from network
    try {
      const response = await fetch(`${FRANKFURTER_BASE}/currencies`);
      if (response.ok) {
        const data = await response.json();
        const currencyMap: Record<string, string> = {};

        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.iso_code && item.name) {
              currencyMap[item.iso_code] = item.name;
            }
          }
        } else if (typeof data === 'object' && data !== null) {
          Object.assign(currencyMap, data);
        }

        if (Object.keys(currencyMap).length > 0) {
          this.currenciesMemoryCache = currencyMap;
          try {
            localStorage.setItem(CURRENCY_CACHE_KEY, JSON.stringify(currencyMap));
          } catch {
            // Ignore localStorage quota or private browsing errors
          }
          return currencyMap;
        }
      }
    } catch {
      // Network failure, proceed to fallback cache
    }

    // 3. Fallback to localStorage cache
    try {
      const cached = localStorage.getItem(CURRENCY_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          this.currenciesMemoryCache = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }

    // 4. Return standard offline fallback currencies if everything else fails
    return {
      USD: 'United States Dollar',
      EUR: 'Euro',
      GBP: 'British Pound',
      CAD: 'Canadian Dollar',
      AUD: 'Australian Dollar',
      JPY: 'Japanese Yen',
      CHF: 'Swiss Franc',
      INR: 'Indian Rupee',
      SGD: 'Singapore Dollar',
      NZD: 'New Zealand Dollar',
    };
  }

  /**
   * Rate for from→to. With `date` (YYYY-MM-DD) returns that date's rate or throws;
   * it never substitutes another date. Without `date` returns the latest rate,
   * falling back to the newest cached rate (marked source 'cache') when offline.
   */
  async getRate(fromCurrency: string, toCurrency: string, date?: string): Promise<RateQuote> {
    const from = normalizeCurrency(fromCurrency);
    const to = normalizeCurrency(toCurrency);
    if (from === to) return identityQuote(from, date);

    if (!CODE_RE.test(from) || !CODE_RE.test(to)) {
      throw new ExchangeRateError('unsupported', from, to, date, 'invalid currency code');
    }

    const key = rateKey(from, to, date);
    const remembered = this.memory.get(key);
    if (remembered && (date || Date.now() - Date.parse(remembered.fetchedAt) < LATEST_RATE_TTL_MS)) {
      return remembered;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.resolveRate(from, to, date).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async resolveRate(from: string, to: string, date?: string): Promise<RateQuote> {
    // Historical rates are immutable: a stored copy is as good as a fresh one
    if (date) {
      const stored = await this.readStoredRate(from, to, date);
      if (stored) {
        this.memory.set(rateKey(from, to, date), stored);
        return stored;
      }
    }

    try {
      const quote = await this.fetchRate(from, to, date);
      this.memory.set(rateKey(from, to, date), quote);
      void this.persistRate(quote);
      return quote;
    } catch (err) {
      if (err instanceof ExchangeRateError && err.kind === 'unsupported') throw err;
      if (!date) {
        // Offline: the newest stored rate, clearly marked as cached
        const stored = await this.readStoredRate(from, to);
        if (stored) return stored;
      }
      if (err instanceof ExchangeRateError) throw err;
      throw new ExchangeRateError('network', from, to, date, (err as Error).message);
    }
  }

  private async fetchRate(from: string, to: string, date?: string): Promise<RateQuote> {
    const url = `${FRANKFURTER_BASE}/rate/${from}/${to}${date ? `?date=${encodeURIComponent(date)}` : ''}`;
    const response = await fetch(url);

    if (response.status === 404 || response.status === 422) {
      throw new ExchangeRateError('unsupported', from, to, date, 'currency pair not supported by the provider');
    }
    if (!response.ok) {
      throw new ExchangeRateError('network', from, to, date, `provider returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (typeof data?.rate !== 'number' || !(data.rate > 0)) {
      throw new ExchangeRateError('unavailable', from, to, date, 'provider returned no usable rate');
    }

    return {
      from,
      to,
      rate: data.rate,
      requestedDate: date || 'latest',
      effectiveDate: typeof data.date === 'string' ? data.date : date || new Date().toISOString().slice(0, 10),
      source: 'network',
      fetchedAt: new Date().toISOString(),
    };
  }

  /** L2 lookup. With a date: that exact date only. Without: the newest stored rate. */
  private async readStoredRate(from: string, to: string, date?: string): Promise<RateQuote | undefined> {
    if (!checkSupabaseConfig().isConfigured) return undefined;
    try {
      let query = (supabase.from('currency_rates_cache') as any)
        .select('*')
        .eq('base_currency', from)
        .eq('quote_currency', to);
      query = date ? query.eq('rate_date', date) : query.order('rate_date', { ascending: false });
      const { data } = await query.limit(1);
      const row = data?.[0];
      if (!row || !(Number(row.rate) > 0)) return undefined;
      return {
        from,
        to,
        rate: Number(row.rate),
        requestedDate: date || 'latest',
        effectiveDate: row.rate_date,
        source: 'cache',
        fetchedAt: row.fetched_at,
      };
    } catch {
      return undefined;
    }
  }

  private async persistRate(quote: RateQuote): Promise<void> {
    if (!checkSupabaseConfig().isConfigured || quote.source !== 'network') return;
    try {
      await (supabase.from('currency_rates_cache') as any).upsert(
        {
          base_currency: quote.from,
          quote_currency: quote.to,
          rate: quote.rate,
          rate_date: quote.effectiveDate,
          source: 'frankfurter',
          fetched_at: quote.fetchedAt,
        },
        { onConflict: 'base_currency,quote_currency,rate_date', ignoreDuplicates: true }
      );
    } catch {
      // Ignore background cache write failures
    }
  }

  // --- Compatibility wrappers -------------------------------------------------

  async getLatestRate(base: string, quote: string): Promise<ExchangeRateCache> {
    return toLegacyCache(await this.getRate(base, quote));
  }

  async getHistoricalRate(base: string, quote: string, date: string): Promise<ExchangeRateCache> {
    return toLegacyCache(await this.getRate(base, quote, date));
  }

  async convertAmount(
    amountMinor: number,
    fromCurrency: string,
    toCurrency: string,
    date?: string
  ): Promise<CurrencyConversionResult> {
    const quote = await this.getRate(fromCurrency, toCurrency, date);
    return {
      convertedMinor: convertMinor(amountMinor, quote.from, quote.to, quote.rate),
      rate: quote.rate,
      rateDate: quote.effectiveDate,
      source: quote.source,
      quote,
    };
  }

  async convert(
    amountMinor: number,
    fromCurrency: string,
    toCurrency: string,
    date?: string
  ): Promise<CurrencyConversionResult> {
    return this.convertAmount(amountMinor, fromCurrency, toCurrency, date);
  }

  /** Test hook: forget all cached rates. */
  clearMemoryCache(): void {
    this.memory.clear();
    this.inFlight.clear();
  }
}

export const exchangeRateService = new ExchangeRateService();
