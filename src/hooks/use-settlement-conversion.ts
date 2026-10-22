import { useMemo } from 'react';
import { convertMinor, normalizeCurrency, type RateQuote } from '@/domain/money/conversion';
import type { SettlementConversionSnapshot } from '@/services/supabase/settlement-service';
import { useRates, type RateFailure } from './use-currency';

export type SettlementConversion =
  | { status: 'same'; appliedMinor: number; snapshot: undefined }
  | { status: 'loading'; appliedMinor: null; snapshot: undefined }
  | { status: 'ready'; appliedMinor: number; quote: RateQuote; snapshot: SettlementConversionSnapshot }
  | { status: 'unavailable'; appliedMinor: null; snapshot: undefined; failure?: RateFailure };

/**
 * How much a payment in `paidCurrency` reduces a debt in `debtCurrency`.
 * Uses the settlement date's rate (latest when settling today), and returns
 * the snapshot that must be stored with the settlement so the effect on the
 * balance never changes later. No rate → 'unavailable', never 1:1.
 */
export function useSettlementConversion(
  paidMinor: number,
  paidCurrency: string,
  debtCurrency: string,
  settlementDate?: string
): SettlementConversion & { retry: () => void } {
  const from = normalizeCurrency(paidCurrency || debtCurrency);
  const to = normalizeCurrency(debtCurrency || paidCurrency);
  const today = new Date().toISOString().slice(0, 10);
  const day = settlementDate?.slice(0, 10);
  const rateDate = day && day < today ? day : undefined;

  const pairs = useMemo(() => (from === to ? [] : [{ from, to, date: rateDate }]), [from, to, rateDate]);
  const { rates, isLoading, failures, retry } = useRates(pairs);

  if (from === to) {
    return { status: 'same', appliedMinor: paidMinor, snapshot: undefined, retry };
  }

  const quote = rates.values().next().value as RateQuote | undefined;
  if (quote) {
    const appliedMinor = convertMinor(paidMinor, from, to, quote.rate);
    return {
      status: 'ready',
      appliedMinor,
      quote,
      snapshot: {
        appliedCurrency: to,
        appliedAmountMinor: appliedMinor,
        exchangeRate: quote.rate,
        exchangeRateDate: quote.effectiveDate,
        exchangeRateSource: quote.source === 'cache' ? 'cache' : 'frankfurter',
      },
      retry,
    };
  }

  if (isLoading) return { status: 'loading', appliedMinor: null, snapshot: undefined, retry };
  return { status: 'unavailable', appliedMinor: null, snapshot: undefined, failure: failures[0], retry };
}
