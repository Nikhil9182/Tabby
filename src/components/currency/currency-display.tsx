import React from 'react';
import { formatMoney } from '@/domain/money/money';
import { cn } from '@/lib/utils';

export interface CurrencyDisplayProps {
  amountMinor: number;
  currency: string;
  showSign?: boolean; // +/- prefix
  colorize?: boolean; // green for positive, red for negative
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCurrency?: boolean; // show currency code
  originalAmountMinor?: number;
  originalCurrency?: string;
  className?: string;
}

export function CurrencyDisplay({
  amountMinor,
  currency,
  showSign = false,
  colorize = false,
  size = 'md',
  showCurrency = false,
  originalAmountMinor,
  originalCurrency,
  className,
}: CurrencyDisplayProps) {
  const isPositive = amountMinor > 0;
  const isNegative = amountMinor < 0;
  const isZero = amountMinor === 0;

  const formattedAbs = formatMoney(Math.abs(amountMinor), currency);

  let sign = '';
  if (showSign) {
    if (isPositive) sign = '+';
    else if (isNegative) sign = '-';
  } else if (isNegative) {
    sign = '-';
  }

  const sizeClasses = {
    sm: 'text-xs sm:text-sm font-medium',
    md: 'text-sm sm:text-base font-semibold',
    lg: 'text-xl sm:text-2xl font-bold tracking-tight',
    xl: 'text-2xl sm:text-3xl font-extrabold tracking-tight',
  }[size];

  const colorClasses = colorize
    ? isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : isNegative
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground'
    : '';

  const hasOriginal =
    originalAmountMinor !== undefined &&
    originalCurrency !== undefined &&
    (originalCurrency.toUpperCase() !== currency.toUpperCase() ||
      originalAmountMinor !== amountMinor);

  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-baseline gap-1.5 font-tabular-nums',
        sizeClasses,
        colorClasses,
        className
      )}
    >
      <span>
        {sign}
        {formattedAbs}
      </span>
      {showCurrency && (
        <span className="text-xs uppercase text-muted-foreground font-normal">
          {currency}
        </span>
      )}
      {hasOriginal && (
        <span className="text-xs text-muted-foreground font-normal opacity-80">
          ({formatMoney(originalAmountMinor, originalCurrency)})
        </span>
      )}
    </span>
  );
}

export default CurrencyDisplay;
