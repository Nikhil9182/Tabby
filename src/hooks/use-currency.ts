import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  exchangeRateService,
  type CurrencyConversionResult,
} from '@/services/exchange-rates/exchange-rate-service';

const DEFAULT_CURRENCY_STORAGE_KEY = 'tabby_default_currency';

export interface CurrencyInfo {
  code: string;
  name: string;
}

export interface UseCurrencyResult {
  availableCurrencies: Record<string, string>;
  defaultCurrency: string;
  setDefaultCurrency: (currency: string) => void;
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
  const [defaultCurrency, setLocalDefaultCurrency] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DEFAULT_CURRENCY_STORAGE_KEY);
      if (stored) return stored.toUpperCase();
    }
    return 'USD';
  });

  const setDefaultCurrency = useCallback((currency: string) => {
    const norm = currency.trim().toUpperCase();
    setLocalDefaultCurrency(norm);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEFAULT_CURRENCY_STORAGE_KEY, norm);
    }
  }, []);

  const { data: availableCurrencies = {}, isLoading } = useQuery<Record<string, string>>({
    queryKey: ['available-currencies'],
    queryFn: () => exchangeRateService.getAvailableCurrencies(),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  const convertAmount = useCallback(
    async (
      amountMinor: number,
      fromCurrency: string,
      toCurrency: string,
      rate?: number
    ): Promise<number> => {
      const normFrom = fromCurrency.trim().toUpperCase();
      const normTo = toCurrency.trim().toUpperCase();

      if (normFrom === normTo || amountMinor === 0) {
        return amountMinor;
      }

      if (rate !== undefined && rate > 0) {
        return Math.round(amountMinor * rate);
      }

      const result = await exchangeRateService.convert(amountMinor, normFrom, normTo);
      return result.convertedMinor;
    },
    []
  );

  const getRate = useCallback(
    async (fromCurrency: string, toCurrency: string, date?: string): Promise<number> => {
      const normFrom = fromCurrency.trim().toUpperCase();
      const normTo = toCurrency.trim().toUpperCase();

      if (normFrom === normTo) {
        return 1;
      }

      if (date) {
        const hist = await exchangeRateService.getHistoricalRate(normFrom, normTo, date);
        return hist.rate;
      }

      const latest = await exchangeRateService.getLatestRate(normFrom, normTo);
      return latest.rate;
    },
    []
  );

  return {
    availableCurrencies,
    defaultCurrency,
    setDefaultCurrency,
    convertAmount,
    getRate,
    isLoading,
  };
}

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
  const normFrom = (from || 'USD').trim().toUpperCase();
  const normTo = (to || 'USD').trim().toUpperCase();

  const isIdentity = normFrom === normTo;

  const { data, isLoading, error, refetch } = useQuery<CurrencyConversionResult, Error>({
    queryKey: ['exchange-rate', normFrom, normTo, date],
    queryFn: async () => {
      if (isIdentity) {
        return {
          convertedMinor: 100,
          rate: 1.0,
          rateDate: date || new Date().toISOString().slice(0, 10),
          source: 'identity',
        };
      }
      return await exchangeRateService.convert(100, normFrom, normTo, date);
    },
    enabled: !!normFrom && !!normTo,
    staleTime: 1000 * 60 * 60 * 12, // 12 hours
  });

  return {
    rate: isIdentity ? 1.0 : data?.rate ?? null,
    rateDate: isIdentity ? date || new Date().toISOString().slice(0, 10) : data?.rateDate ?? null,
    source: isIdentity ? 'identity' : data?.source ?? null,
    isLoading: isIdentity ? false : isLoading,
    isCached: isIdentity ? true : data?.source === 'cache',
    error: isIdentity ? null : error,
    refetch,
  };
}
