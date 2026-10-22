import { AlertTriangle, ArrowRight, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencySelector } from '@/components/currency/currency-selector';
import { formatMoney } from '@/domain/money/money';
import { formatDate } from '@/lib/date';
import type { UseSettleUpResult } from '@/hooks/use-settle-up';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

/** Amount + currency inputs for a settlement, with the cross-currency preview. */
export function SettleUpFields({ state, idPrefix = 'settle' }: { state: UseSettleUpResult; idPrefix?: string }) {
  const {
    owedCurrencies,
    paidCurrency,
    setPaidCurrency,
    amountStr,
    setAmountStr,
    debtCurrency,
    setDebtCurrency,
    outstandingMinor,
    conversion,
    appliedMinor,
    payInFull,
  } = state;
  const crossCurrency = paidCurrency !== debtCurrency;

  return (
    <div className="space-y-4">
      {owedCurrencies.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Outstanding:{' '}
          <span className="font-semibold text-foreground">
            {owedCurrencies.map((c) => formatMoney(state.debtBag[c], c)).join(' + ')}
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${idPrefix}-amount`} className={labelClass}>
              Amount paid
            </Label>
            {outstandingMinor > 0 && (
              <button
                type="button"
                onClick={payInFull}
                disabled={crossCurrency && conversion.status !== 'ready'}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Pay in full
              </button>
            )}
          </div>
          <Input
            id={`${idPrefix}-amount`}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="h-10 text-lg font-semibold"
            required
          />
        </div>
        <div className="space-y-1.5">
          <span className={labelClass}>Paid in</span>
          <CurrencySelector value={paidCurrency} onChange={setPaidCurrency} />
        </div>
      </div>

      {crossCurrency && owedCurrencies.length > 1 && (
        <div className="space-y-1.5">
          <span className={labelClass}>Apply to</span>
          <div className="flex flex-wrap gap-2">
            {owedCurrencies.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={c === debtCurrency ? 'secondary' : 'outline'}
                onClick={() => setDebtCurrency(c)}
              >
                {c} balance
              </Button>
            ))}
          </div>
        </div>
      )}

      {crossCurrency && outstandingMinor > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
          {conversion.status === 'ready' && appliedMinor !== null ? (
            <>
              <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                <span>{formatMoney(state.paidMinor, paidCurrency)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatMoney(appliedMinor, debtCurrency)} off the {debtCurrency} balance</span>
              </p>
              <p className="text-xs text-muted-foreground">
                1 {paidCurrency} = {conversion.quote.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
                {debtCurrency}, rate for {formatDate(conversion.quote.effectiveDate, 'd MMM yyyy')}
                {conversion.quote.source === 'cache' ? ' (saved rate, offline)' : ''}. This rate is saved with the
                payment.
              </p>
            </>
          ) : conversion.status === 'loading' ? (
            <p className="text-xs text-muted-foreground">Getting the {paidCurrency}→{debtCurrency} rate…</p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No {paidCurrency}→{debtCurrency} rate available.
              <button type="button" onClick={conversion.retry} className="inline-flex items-center gap-1 underline">
                Retry <RotateCw className="h-3 w-3" />
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SettleUpFields;
