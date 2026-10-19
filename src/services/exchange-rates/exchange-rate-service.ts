import { db } from '../../storage/local/database';
import type { ExchangeRateCache } from '../../domain/models/types';

export const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v2';

const CURRENCY_CACHE_KEY = 'tabby_currencies_cache';

export interface CurrencyConversionResult {
  convertedMinor: number;
  rate: number;
  rateDate: string;
  source: 'identity' | 'network' | 'cache';
}

export class ExchangeRateService {
  private currenciesMemoryCache: Record<string, string> | null = null;

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

  async getLatestRate(base: string, quote: string): Promise<ExchangeRateCache> {
    const normBase = base.toUpperCase();
    const normQuote = quote.toUpperCase();

    if (normBase === normQuote) {
      const today = new Date().toISOString().slice(0, 10);
      return {
        baseCurrency: normBase,
        quoteCurrency: normQuote,
        rateDate: today,
        rate: 1.0,
        fetchedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(`${FRANKFURTER_BASE}/rate/${normBase}/${normQuote}`);
      if (!response.ok) {
        throw new Error(`Frankfurter rate error: HTTP ${response.status}`);
      }

      const data = await response.json();
      if (typeof data.rate !== 'number') {
        throw new Error(`Invalid rate format received from Frankfurter: ${JSON.stringify(data)}`);
      }

      const entry: ExchangeRateCache = {
        baseCurrency: normBase,
        quoteCurrency: normQuote,
        rateDate: data.date || new Date().toISOString().slice(0, 10),
        rate: data.rate,
        fetchedAt: new Date().toISOString(),
      };

      await db.exchangeRateCache.put(entry);
      return entry;
    } catch (networkError) {
      const cached = await this.getCachedRate(normBase, normQuote);
      if (cached) {
        return cached;
      }
      throw new Error(
        `Unable to fetch exchange rate from ${normBase} to ${normQuote} and no cached rate found: ${(networkError as Error).message}`
      );
    }
  }

  async getHistoricalRate(base: string, quote: string, date: string): Promise<ExchangeRateCache> {
    const normBase = base.toUpperCase();
    const normQuote = quote.toUpperCase();

    if (normBase === normQuote) {
      return {
        baseCurrency: normBase,
        quoteCurrency: normQuote,
        rateDate: date,
        rate: 1.0,
        fetchedAt: new Date().toISOString(),
      };
    }

    // Check if we already have this exact date cached
    const existingCache = await this.getCachedRate(normBase, normQuote, date);
    if (existingCache) {
      return existingCache;
    }

    try {
      const url = `${FRANKFURTER_BASE}/rate/${normBase}/${normQuote}?date=${encodeURIComponent(date)}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Frankfurter historical rate error: HTTP ${response.status}`);
      }

      const data = await response.json();
      if (typeof data.rate !== 'number') {
        throw new Error(`Invalid historical rate format: ${JSON.stringify(data)}`);
      }

      const entry: ExchangeRateCache = {
        baseCurrency: normBase,
        quoteCurrency: normQuote,
        rateDate: data.date || date,
        rate: data.rate,
        fetchedAt: new Date().toISOString(),
      };

      await db.exchangeRateCache.put(entry);
      return entry;
    } catch (networkError) {
      // Fallback to closest cached rate for this pair if exact date is missing
      const cached = await this.getCachedRate(normBase, normQuote);
      if (cached) {
        return cached;
      }
      throw new Error(
        `Unable to fetch historical rate from ${normBase} to ${normQuote} on ${date}: ${(networkError as Error).message}`
      );
    }
  }

  async getCachedRate(base: string, quote: string, date?: string): Promise<ExchangeRateCache | undefined> {
    const normBase = base.toUpperCase();
    const normQuote = quote.toUpperCase();

    if (normBase === normQuote) {
      return {
        baseCurrency: normBase,
        quoteCurrency: normQuote,
        rateDate: date || new Date().toISOString().slice(0, 10),
        rate: 1.0,
        fetchedAt: new Date().toISOString(),
      };
    }

    if (date) {
      const exact = await db.exchangeRateCache.get([normBase, normQuote, date]);
      if (exact) {
        return exact;
      }
    }

    // If no exact date or no date provided, find the most recently fetched/dated rate
    const candidates = await db.exchangeRateCache
      .where('baseCurrency')
      .equals(normBase)
      .filter((entry) => entry.quoteCurrency === normQuote)
      .toArray();

    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by rateDate descending
    candidates.sort((a, b) => b.rateDate.localeCompare(a.rateDate));
    return candidates[0];
  }

  async convertAmount(
    amountMinor: number,
    fromCurrency: string,
    toCurrency: string,
    date?: string
  ): Promise<CurrencyConversionResult> {
    const normFrom = fromCurrency.toUpperCase();
    const normTo = toCurrency.toUpperCase();

    if (normFrom === normTo) {
      return {
        convertedMinor: amountMinor,
        rate: 1.0,
        rateDate: date || new Date().toISOString().slice(0, 10),
        source: 'identity',
      };
    }

    let rateEntry: ExchangeRateCache;
    let source: 'network' | 'cache' = 'network';

    try {
      if (date) {
        // Try historical rate
        rateEntry = await this.getHistoricalRate(normFrom, normTo, date);
      } else {
        rateEntry = await this.getLatestRate(normFrom, normTo);
      }
    } catch {
      // Network failed; attempt cache fallback
      const cached = await this.getCachedRate(normFrom, normTo, date);
      if (!cached) {
        throw new Error(`Exchange rate conversion failed: No rate available from ${normFrom} to ${normTo}`);
      }
      rateEntry = cached;
      source = 'cache';
    }

    // Calculate integer minor units using Math.round to avoid floating precision discrepancies
    const convertedMinor = Math.round(amountMinor * rateEntry.rate);

    return {
      convertedMinor,
      rate: rateEntry.rate,
      rateDate: rateEntry.rateDate,
      source,
    };
  }
}

export const exchangeRateService = new ExchangeRateService();
