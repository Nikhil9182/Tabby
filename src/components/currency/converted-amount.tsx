import { useMemo } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { CurrencyDisplay, type CurrencyDisplayProps } from './currency-display';
import { formatMoney } from '@/domain/money/money';
import { bagCurrencies, getDisplayAmount, type MoneyBag } from '@/domain/money/conversion';
import { useCurrency, useRates, type UseDisplayConversionResult } from '@/hooks/use-currency';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/utils';

function rateNote(effectiveDates: string[], cached: boolean): string {
  const unique = Array.from(new Set(effectiveDates)).sort();
  const when = unique.length === 1 ? formatDate(unique[0], 'd MMM yyyy') : 'the latest available dates';
  return `Converted using the rate for ${when}${cached ? ' (saved rate, offline)' : ''}.`;
}

export interface ConvertedAmountProps extends Omit<CurrencyDisplayProps, 'originalAmountMinor' | 'originalCurrency'> {
  /** YYYY-MM-DD: convert at that day's rate (history). Omit for the latest rate. */
  date?: string;
  /** Override the user's display currency. */
  displayCurrency?: string;
  /** Put the converted line beside the amount instead of under it. */
  inline?: boolean;
}

/**
 * An amount in its own transaction currency, plus "≈ X" in the display
 * currency when they differ. Without a rate the original is shown alone,
 * never relabelled.
 */
export function ConvertedAmount({ amountMinor, currency, date, displayCurrency, inline, className, ...rest }: ConvertedAmountProps) {
  const { defaultCurrency } = useCurrency();
  const target = (displayCurrency || defaultCurrency).toUpperCase();
  const source = currency.toUpperCase();
  const pairs = useMemo(() => [{ from: source, to: target, date }], [source, target, date]);
  const { rates, isLoading, failures, retry } = useRates(pairs);
  const shown = getDisplayAmount(amountMinor, source, target, rates, date);

  return (
    <span className={cn(inline ? 'inline-flex items-baseline gap-1.5' : 'inline-flex flex-col', className)}>
      <CurrencyDisplay amountMinor={amountMinor} currency={source} {...rest} />
      {shown.status === 'converted' && (
        <span
          className="text-xs font-normal text-muted-foreground"
          title={rateNote([shown.quote.effectiveDate], shown.quote.source === 'cache')}
        >
          ≈ {formatMoney(shown.amountMinor, shown.currency)}
        </span>
      )}
      {shown.status === 'unavailable' && (
        isLoading ? (
          <span className="text-xs font-normal text-muted-foreground">Converting to {target}…</span>
        ) : failures.length > 0 ? (
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 text-xs font-normal text-amber-600 dark:text-amber-400 hover:underline"
            title={failures[0].message}
          >
            <AlertTriangle className="h-3 w-3" />
            {target} rate unavailable
          </button>
        ) : null
      )}
    </span>
  );
}

export interface BalanceAmountProps {
  /** Per-currency balance. */
  bag: MoneyBag;
  /** From useDisplayConversion(), shared by everything on the page. */
  conversion: Pick<UseDisplayConversionResult, 'convert' | 'displayCurrency' | 'isLoading' | 'failures' | 'retry'>;
  /** 'abs' shows magnitudes (sign carried by surrounding copy); 'signed' keeps +/−. */
  mode?: 'abs' | 'signed';
  colorize?: boolean;
  size?: CurrencyDisplayProps['size'];
  className?: string;
  /** Classes for the main amount (e.g. hero-sized type). */
  amountClassName?: string;
  /** Classes for the breakdown / status line under it. */
  detailClassName?: string;
  /** Hide the original-currency breakdown line. */
  hideBreakdown?: boolean;
}

/**
 * A balance kept per transaction currency, shown as one total in the user's
 * display currency at the latest rate. Original currencies stay visible.
 */
export function BalanceAmount({
  bag,
  conversion,
  mode = 'abs',
  colorize = false,
  size = 'md',
  className,
  amountClassName,
  detailClassName,
  hideBreakdown = false,
}: BalanceAmountProps) {
  const { convert, displayCurrency, isLoading, failures, retry } = conversion;
  const currencies = bagCurrencies(bag);
  const result = convert(bag);
  const magnitude = (v: number) => (mode === 'abs' ? Math.abs(v) : v);

  const breakdown = currencies
    .map((c) => {
      const v = magnitude(bag[c]);
      return `${mode === 'signed' && v > 0 ? '+' : ''}${formatMoney(v, c)}`;
    })
    .join(' + ');
  const needsBreakdown = currencies.length > 1 || (currencies.length === 1 && currencies[0] !== displayCurrency);

  if (currencies.length === 0) {
    return (
      <CurrencyDisplay
        amountMinor={0}
        currency={displayCurrency}
        size={size}
        colorize={colorize}
        className={cn(className, amountClassName)}
      />
    );
  }

  // Every bucket converted: one honest total
  if (result.totalMinor !== null) {
    const total = magnitude(result.totalMinor);
    return (
      <span className={cn('inline-flex flex-col', className)}>
        <span className="inline-flex items-baseline gap-0.5">
          {result.isApproximate && <span className="opacity-60 font-normal">≈</span>}
          <CurrencyDisplay
            amountMinor={total}
            currency={displayCurrency}
            size={size}
            colorize={colorize}
            showSign={mode === 'signed'}
            className={amountClassName}
          />
        </span>
        {needsBreakdown && !hideBreakdown && (
          <span
            className={cn('text-xs font-normal text-muted-foreground', detailClassName)}
            title={rateNote(result.quotes.map((q) => q.effectiveDate), result.quotes.some((q) => q.source === 'cache'))}
          >
            {breakdown}
          </span>
        )}
      </span>
    );
  }

  // Some rate is missing: show the real amounts, never a relabelled total
  return (
    <span className={cn('inline-flex flex-col', className)}>
      <span
        className={cn(
          'font-semibold',
          size === 'xl' || size === 'lg' ? 'text-xl sm:text-2xl' : 'text-sm sm:text-base',
          amountClassName
        )}
      >
        {breakdown}
      </span>
      {isLoading ? (
        <span className={cn('text-xs font-normal text-muted-foreground', detailClassName)}>
          Converting to {displayCurrency}…
        </span>
      ) : failures.length > 0 ? (
        <button
          type="button"
          onClick={retry}
          className={cn(
            'inline-flex items-center gap-1 text-xs font-normal text-amber-600 dark:text-amber-400 hover:underline',
            detailClassName
          )}
          title={failures.map((f) => f.message).join('\n')}
        >
          <AlertTriangle className="h-3 w-3" />
          Can&apos;t convert {result.missing.join(', ')} to {displayCurrency} right now
          <RotateCw className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

/** Formats a bag as plain text, e.g. "≈ ₹4,778.00" or "$50.00 + ₹100.00" when a rate is missing. */
export function formatBagText(bag: MoneyBag, conversion: Pick<UseDisplayConversionResult, 'convert' | 'displayCurrency'>): string {
  const currencies = bagCurrencies(bag);
  if (currencies.length === 0) return formatMoney(0, conversion.displayCurrency);
  const result = conversion.convert(bag);
  if (result.totalMinor !== null) {
    return `${result.isApproximate ? '≈ ' : ''}${formatMoney(Math.abs(result.totalMinor), conversion.displayCurrency)}`;
  }
  return currencies.map((c) => formatMoney(Math.abs(bag[c]), c)).join(' + ');
}
