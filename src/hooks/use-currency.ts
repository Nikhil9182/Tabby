import { useCallback, useContext, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { exchangeRateService } from '@/services/exchange-rates/exchange-rate-service';
import { currencyService, ExchangeRateError } from '@/services/currency/currency-service';
import { profileService } from '@/services/supabase/profile-service';
import {
  convertBag,
  convertMinor,
  getDisplayAmount,
  normalizeCurrency,
  rateKey,
  type ConvertedBag,
  type DisplayAmount,
  type MoneyBag,
  type RateContext,
  type RateQuote,
} from '@/domain/money/conversion';
import { AuthContext } from './use-auth';

/** Local mirror of the preference, only for the first paint before the profile loads. */
const DISPLAY_CURRENCY_MIRROR_KEY = 'tabby_default_currency';

const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR', US: 'USD', GB: 'GBP', JP: 'JPY', CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD',
  CH: 'CHF', CN: 'CNY', HK: 'HKD', KR: 'KRW', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', SE: 'SEK',
  NO: 'NOK', DK: 'DKK', TH: 'THB', AE: 'AED',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR', BE: 'EUR',
  AT: 'EUR', FI: 'EUR', GR: 'EUR',
};

/** Sensible default for a new user: their browser region's currency, else USD. */
function guessDefaultCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  } catch {
    // Older runtimes without Intl.Locale
  }
  return 'USD';
}

function readMirror(): string | null {
  try {
    return localStorage.getItem(DISPLAY_CURRENCY_MIRROR_KEY)?.toUpperCase() || null;
  } catch {
    return null;
  }
}

function writeMirror(code: string) {
  try {
    localStorage.setItem(DISPLAY_CURRENCY_MIRROR_KEY, code);
  } catch {
    // Private mode / quota: the profile is the source of truth anyway
  }
}

export interface CurrencyInfo {
  code: string;
  name: string;
}

export interface UseCurrencyResult {
  availableCurrencies: Record<string, string>;
  /** The user's display currency (profiles.preferred_currency). */
  defaultCurrency: string;
  /** Saves the display currency to the user's profile. Never changes stored expenses. */
  setDefaultCurrency: (currency: string) => void;
  isSavingDefaultCurrency: boolean;
  convertAmount: (
    amountMinor: number,
    fromCurrency: string,
    toCurrency: string,
    rate?: number
  ) => Promise<number>;
  getRate: (fromCurrency: string, toCurrency: string, date?: string) => Promise<number>;
  isLoading: boolean;
}

export function useCurrency(): UseCurrencyResult {
  const auth = useContext(AuthContext);
  const userId = auth?.user?.id;
  const queryClient = useQueryClient();

  const [fallback] = useState(() => readMirror() || guessDefaultCurrency());

  const { data: storedPreference } = useQuery({
    queryKey: ['display-currency', userId],
    queryFn: () => profileService.getPreferredCurrency(),
    enabled: !!userId,
    staleTime: Infinity,
  });

  const defaultCurrency = normalizeCurrency(storedPreference || fallback);

  const saveMutation = useMutation({
    mutationFn: (code: string) => profileService.setPreferredCurrency(code),
    onMutate: (code: string) => {
      const previous = queryClient.getQueryData(['display-currency', userId]);
      queryClient.setQueryData(['display-currency', userId], code);
      writeMirror(code);
      return { previous };
    },
    onError: (err, _code, context) => {
      console.warn('Could not save display currency:', (err as Error).message);
      queryClient.setQueryData(['display-currency', userId], context?.previous ?? null);
    },
  });

  const setDefaultCurrency = useCallback(
    (currency: string) => {
      const code = normalizeCurrency(currency);
      if (userId) {
        saveMutation.mutate(code);
      } else {
        queryClient.setQueryData(['display-currency', userId], code);
        writeMirror(code);
      }
    },
    [userId, saveMutation, queryClient]
  );

  const { data: availableCurrencies = {}, isLoading } = useQuery<Record<string, string>>({
    queryKey: ['available-currencies'],
    queryFn: () => currencyService.getSupportedCurrencies(),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  const convertAmount = useCallback(
    async (amountMinor: number, fromCurrency: string, toCurrency: string, rate?: number): Promise<number> => {
      if (normalizeCurrency(fromCurrency) === normalizeCurrency(toCurrency) || amountMinor === 0) {
        return amountMinor;
      }
      if (rate !== undefined && rate > 0) {
        return convertMinor(amountMinor, fromCurrency, toCurrency, rate);
      }
      return (await currencyService.convertAmount(amountMinor, fromCurrency, toCurrency)).amountMinor;
    },
    []
  );

  const getRate = useCallback(
    async (fromCurrency: string, toCurrency: string, date?: string): Promise<number> =>
      (await currencyService.getExchangeRate(fromCurrency, toCurrency, date)).rate,
    []
  );

  return {
    availableCurrencies,
    defaultCurrency,
    setDefaultCurrency,
    isSavingDefaultCurrency: saveMutation.isPending,
    convertAmount,
    getRate,
    isLoading,
  };
}

// ---------------------------------------------------------------------------
// Rate loading
// ---------------------------------------------------------------------------

export interface RatePair {
  from: string;
  to: string;
  /** YYYY-MM-DD for that day's rate; omit for latest. */
  date?: string;
}

export interface RateFailure extends RatePair {
  message: string;
  kind: 'unsupported' | 'network' | 'unavailable';
}

export interface UseRatesResult {
  rates: RateContext;
  isLoading: boolean;
  failures: RateFailure[];
  retry: () => void;
}

/**
 * Loads every needed rate once (deduped by pair + date across the whole app)
 * and exposes them as a RateContext. Same-currency pairs never hit the network.
 */
export function useRates(pairs: RatePair[]): UseRatesResult {
  const unique = useMemo(() => {
    const seen = new Map<string, RatePair>();
    for (const p of pairs) {
      const from = normalizeCurrency(p.from);
      const to = normalizeCurrency(p.to);
      if (from === to) continue;
      seen.set(rateKey(from, to, p.date), { from, to, date: p.date });
    }
    return Array.from(seen.values()).sort((a, b) =>
      rateKey(a.from, a.to, a.date).localeCompare(rateKey(b.from, b.to, b.date))
    );
  }, [pairs]);

  const results = useQueries({
    queries: unique.map((p) => ({
      queryKey: ['fx-rate', p.from, p.to, p.date ?? 'latest'],
      queryFn: () => exchangeRateService.getRate(p.from, p.to, p.date),
      // Historical rates never change; latest refreshes hourly
      staleTime: p.date ? Infinity : 1000 * 60 * 60,
      retry: (count: number, err: unknown) =>
        !(err instanceof ExchangeRateError && err.kind === 'unsupported') && count < 1,
    })),
  });

  // results is a new array every render; rebuild the context only when a rate changes
  const ratesSignature = results.map((r) => (r.data ? `${r.data.rate}@${r.data.effectiveDate}` : '-')).join('|');
  const rates = useMemo(() => {
    const map = new Map<string, RateQuote>();
    results.forEach((r, i) => {
      if (r.data) map.set(rateKey(unique[i].from, unique[i].to, unique[i].date), r.data);
    });
    return map as RateContext;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unique, ratesSignature]);

  const failures: RateFailure[] = [];
  results.forEach((r, i) => {
    if (r.isError) {
      const err = r.error;
      failures.push({
        ...unique[i],
        message: err instanceof Error ? err.message : 'Exchange rate unavailable',
        kind: err instanceof ExchangeRateError ? err.kind : 'network',
      });
    }
  });

  const retry = useCallback(() => {
    results.forEach((r) => {
      if (r.isError) void r.refetch();
    });
  }, [results]);

  return { rates, isLoading: results.some((r) => r.isLoading), failures, retry };
}

// ---------------------------------------------------------------------------
// Display conversion (latest-rate policy for balances)
// ---------------------------------------------------------------------------

export interface UseDisplayConversionResult extends UseRatesResult {
  displayCurrency: string;
  /** A single amount in the display currency (or 'unavailable' with the original kept). */
  display: (amountMinor: number, currency: string) => DisplayAmount;
  /** A per-currency balance converted and summed in the display currency. */
  convert: (bag: MoneyBag) => ConvertedBag;
}

/**
 * Converts balances and amounts into the user's display currency at the
 * latest rate. Pass every currency that will be shown so rates load together.
 */
export function useDisplayConversion(currencies: Iterable<string>, displayCurrencyOverride?: string): UseDisplayConversionResult {
  const { defaultCurrency } = useCurrency();
  const displayCurrency = normalizeCurrency(displayCurrencyOverride || defaultCurrency);

  const codes = Array.from(new Set(Array.from(currencies, normalizeCurrency))).sort().join(',');
  const pairs = useMemo(
    () => (codes ? codes.split(',').map((from) => ({ from, to: displayCurrency })) : []),
    [codes, displayCurrency]
  );
  const rateState = useRates(pairs);

  const display = useCallback(
    (amountMinor: number, currency: string) => getDisplayAmount(amountMinor, currency, displayCurrency, rateState.rates),
    [displayCurrency, rateState.rates]
  );
  const convert = useCallback(
    (bag: MoneyBag) => convertBag(bag, displayCurrency, rateState.rates),
    [displayCurrency, rateState.rates]
  );

  return { ...rateState, displayCurrency, display, convert };
}

// ---------------------------------------------------------------------------
// Single-rate helper (kept for existing callers)
// ---------------------------------------------------------------------------

export interface UseExchangeRateResult {
  rate: number | null;
  rateDate: string | null;
  source: string | null;
  isLoading: boolean;
  isCached: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useExchangeRate(from: string, to: string, date?: string): UseExchangeRateResult {
  const normFrom = normalizeCurrency(from || 'USD');
  const normTo = normalizeCurrency(to || 'USD');
  const isIdentity = normFrom === normTo;

  const { data, isLoading, error, refetch } = useQuery<RateQuote, Error>({
    queryKey: ['fx-rate', normFrom, normTo, date ?? 'latest'],
    queryFn: () => exchangeRateService.getRate(normFrom, normTo, date),
    enabled: !isIdentity,
    staleTime: date ? Infinity : 1000 * 60 * 60,
  });

  return {
    rate: isIdentity ? 1.0 : data?.rate ?? null,
    rateDate: isIdentity ? date || new Date().toISOString().slice(0, 10) : data?.effectiveDate ?? null,
    source: isIdentity ? 'identity' : data?.source ?? null,
    isLoading: isIdentity ? false : isLoading,
    isCached: isIdentity ? true : data?.source === 'cache',
    error: isIdentity ? null : error,
    refetch,
  };
}
