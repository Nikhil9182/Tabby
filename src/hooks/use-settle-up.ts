import { useMemo, useState } from 'react';
import { bagCurrencies, bagSide, convertMinor, normalizeCurrency, type MoneyBag } from '@/domain/money/conversion';
import { parseMoney, toMajorUnits } from '@/domain/money/money';
import type { SettlementConversionSnapshot } from '@/services/supabase/settlement-service';
import { useSettlementConversion, type SettlementConversion } from './use-settlement-conversion';

export interface UseSettleUpOptions {
  /** What the payer owes the recipient, per currency. Positive = payer owes. */
  debtBag: MoneyBag;
  /** YYYY-MM-DD settlement date (drives the conversion rate). */
  settlementDate: string;
  /** Currency to start in when nothing is owed (e.g. the display currency). */
  fallbackCurrency: string;
  initialCurrency?: string;
  initialAmountMinor?: number;
}

export interface UseSettleUpResult {
  debtBag: MoneyBag;
  /** Currencies the payer owes in. */
  owedCurrencies: string[];
  paidCurrency: string;
  setPaidCurrency: (code: string) => void;
  amountStr: string;
  setAmountStr: (value: string) => void;
  /** The debt currency this payment reduces. */
  debtCurrency: string;
  setDebtCurrency: (code: string) => void;
  /** Outstanding amount in debtCurrency (positive = payer owes). */
  outstandingMinor: number;
  paidMinor: number;
  conversion: SettlementConversion & { retry: () => void };
  /** Amount that will come off the debt, in debtCurrency (null while unknown). */
  appliedMinor: number | null;
  /** Fill the amount that clears the selected debt exactly. */
  payInFull: () => void;
  /** Present when the inputs can't be submitted yet. */
  error: string | null;
  /** What to pass to recordSettlement. */
  submission: { amountMinor: number; currency: string; conversion?: SettlementConversionSnapshot } | null;
}

/**
 * State for recording a settlement against a multi-currency debt. The paid
 * amount and currency are kept exactly as entered; when they differ from the
 * debt's currency the applied amount is converted once and frozen.
 */
export function useSettleUp({
  debtBag,
  settlementDate,
  fallbackCurrency,
  initialCurrency,
  initialAmountMinor,
}: UseSettleUpOptions): UseSettleUpResult {
  const owedCurrencies = bagCurrencies(bagSide(debtBag, 'positive'));
  const firstOwed = owedCurrencies[0];

  const [paidChoice, setPaidChoice] = useState<string | null>(initialCurrency ? normalizeCurrency(initialCurrency) : null);
  const paidCurrency = paidChoice ?? firstOwed ?? normalizeCurrency(fallbackCurrency);

  const [amountChoice, setAmountChoice] = useState<string | null>(
    initialAmountMinor && initialAmountMinor > 0 ? String(toMajorUnits(initialAmountMinor, paidCurrency)) : null
  );
  const [debtChoice, setDebtChoice] = useState<string | null>(null);
  const [fullSettle, setFullSettle] = useState(false);

  // Paying in an owed currency always reduces that currency's debt
  const debtCurrency = owedCurrencies.includes(paidCurrency)
    ? paidCurrency
    : debtChoice && owedCurrencies.includes(debtChoice)
      ? debtChoice
      : firstOwed ?? paidCurrency;
  const outstandingMinor = debtBag[debtCurrency] ?? 0;

  // Untouched amount defaults to the full outstanding debt in the paid currency
  const defaultAmount =
    outstandingMinor > 0 && paidCurrency === debtCurrency ? String(toMajorUnits(outstandingMinor, paidCurrency)) : '';
  const amountStr = amountChoice ?? defaultAmount;
  const paidMinor = amountStr ? parseMoney(amountStr, paidCurrency) : 0;

  const conversion = useSettlementConversion(paidMinor, paidCurrency, debtCurrency, settlementDate);

  // "Pay in full" snaps a ±1 minor-unit rounding gap to the exact outstanding amount
  let appliedMinor = conversion.appliedMinor;
  let snapshot = conversion.snapshot;
  if (
    fullSettle &&
    conversion.status === 'ready' &&
    appliedMinor !== null &&
    Math.abs(appliedMinor - outstandingMinor) <= 1
  ) {
    appliedMinor = outstandingMinor;
    snapshot = { ...conversion.snapshot, appliedAmountMinor: outstandingMinor };
  }

  const payInFull = () => {
    if (outstandingMinor <= 0) return;
    if (paidCurrency === debtCurrency) {
      setAmountChoice(String(toMajorUnits(outstandingMinor, paidCurrency)));
    } else if (conversion.status === 'ready') {
      const inPaid = convertMinor(outstandingMinor, debtCurrency, paidCurrency, 1 / conversion.quote.rate);
      setAmountChoice(String(toMajorUnits(inPaid, paidCurrency)));
    } else {
      return;
    }
    setFullSettle(true);
  };

  const error = useMemo(() => {
    if (paidMinor <= 0) return 'Enter an amount greater than 0.';
    if (conversion.status === 'loading') return 'Getting the exchange rate…';
    if (conversion.status === 'unavailable') {
      return `No ${paidCurrency}→${debtCurrency} exchange rate is available right now, so this payment can't be applied to the ${debtCurrency} balance. Pay in ${debtCurrency} or try again.`;
    }
    if (outstandingMinor > 0 && appliedMinor !== null && appliedMinor > outstandingMinor) {
      return `That's more than the ${debtCurrency} balance owed.`;
    }
    return null;
  }, [paidMinor, conversion.status, paidCurrency, debtCurrency, outstandingMinor, appliedMinor]);

  return {
    debtBag,
    owedCurrencies,
    paidCurrency,
    setPaidCurrency: (code) => {
      // The number stays as typed; only its currency changes (no silent conversion)
      setPaidChoice(normalizeCurrency(code));
      setFullSettle(false);
      if (amountChoice === null && defaultAmount) setAmountChoice(defaultAmount);
    },
    amountStr,
    setAmountStr: (value) => {
      setAmountChoice(value);
      setFullSettle(false);
    },
    debtCurrency,
    setDebtCurrency: (code) => {
      setDebtChoice(normalizeCurrency(code));
      setFullSettle(false);
    },
    outstandingMinor,
    paidMinor,
    conversion,
    appliedMinor,
    payInFull,
    error,
    submission: error
      ? null
      : { amountMinor: paidMinor, currency: paidCurrency, conversion: paidCurrency === debtCurrency ? undefined : snapshot },
  };
}
