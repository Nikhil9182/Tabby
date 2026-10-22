import { describe, it, expect } from 'vitest';
import {
  addToBag,
  bagOf,
  convertBag,
  convertMinor,
  crossQuote,
  getDisplayAmount,
  identityQuote,
  invertQuote,
  mergeBags,
  rateKey,
  roundHalfAwayFromZero,
  type RateContext,
  type RateQuote,
} from '../money/conversion';
import { getCurrencyDecimals, getMinorUnitMultiplier } from '../money/money';
import {
  calculateDashboardBalances,
  calculateDirectFriendBalanceBag,
  calculateGroupBalances,
  calculatePairwiseBalanceBag,
  settlementLedgerAmount,
} from '../balances/balance-engine';
import { calculateEqualSplit } from '../splits/split-calculator';
import type { Expense, ExpenseSplit, Settlement } from '../models/types';

// Explicit, mocked rates: never real market data
function quote(from: string, to: string, rate: number, date?: string): RateQuote {
  return {
    from,
    to,
    rate,
    requestedDate: date || 'latest',
    effectiveDate: date || '2026-10-22',
    source: 'network',
    fetchedAt: '2026-10-22T10:00:00.000Z',
  };
}

function rates(...quotes: RateQuote[]): RateContext {
  return new Map(
    quotes.map((q) => [rateKey(q.from, q.to, q.requestedDate === 'latest' ? undefined : q.requestedDate), q])
  );
}

const ALICE = 'alice';
const BOB = 'bob';
const NOW = '2026-10-20T12:00:00.000Z';

function expense(partial: Partial<Expense> & Pick<Expense, 'id' | 'paidBy' | 'originalAmountMinor' | 'originalCurrency'>): Expense {
  return {
    sourceType: 'direct',
    sourceId: 'friendship_ab',
    contextType: 'direct',
    participants: [ALICE, BOB],
    expenseDate: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    description: partial.id,
    ...partial,
  };
}

function equalSplits(e: Expense): ExpenseSplit[] {
  return calculateEqualSplit(e.originalAmountMinor, e.participants, e.originalCurrency, e.id);
}

function settlement(partial: Partial<Settlement> & Pick<Settlement, 'id' | 'fromUserId' | 'toUserId' | 'amountMinor' | 'currency'>): Settlement {
  return { contextType: 'direct', settlementDate: NOW, createdAt: NOW, updatedAt: NOW, ...partial };
}

describe('A: basic conversion', () => {
  it('converts USD to INR with an explicit rate and leaves the expense untouched', () => {
    const original = expense({ id: 'dinner', paidBy: ALICE, originalAmountMinor: 10000, originalCurrency: 'USD' });
    const snapshot = structuredClone(original);

    // $100.00 at 1 USD = 85 INR → ₹8,500.00
    const shown = getDisplayAmount(original.originalAmountMinor, original.originalCurrency, 'INR', rates(quote('USD', 'INR', 85)));

    expect(shown).toMatchObject({ status: 'converted', amountMinor: 850000, currency: 'INR' });
    expect(original).toEqual(snapshot);
  });

  it('uses inverse and cross rates correctly', () => {
    const usdInr = quote('USD', 'INR', 80);
    expect(convertMinor(800000, 'INR', 'USD', invertQuote(usdInr).rate)).toBe(10000);

    // EUR→INR via USD: (USD→INR) / (USD→EUR) = 80 / 0.8 = 100
    const cross = crossQuote(quote('USD', 'EUR', 0.8), usdInr);
    expect(cross).toMatchObject({ from: 'EUR', to: 'INR' });
    expect(cross.rate).toBeCloseTo(100, 10);
    expect(convertMinor(1000, 'EUR', 'INR', cross.rate)).toBe(100000);
  });
});

describe('C: same-currency conversion', () => {
  it('returns the amount unchanged without needing any rate', () => {
    const empty: RateContext = new Map();
    expect(getDisplayAmount(12345, 'INR', 'INR', empty)).toEqual({ status: 'same', amountMinor: 12345, currency: 'INR' });
    expect(convertMinor(12345, 'inr', 'INR', NaN)).toBe(12345);
    expect(convertBag({ INR: 12345 }, 'INR', empty)).toMatchObject({ totalMinor: 12345, isApproximate: false, missing: [] });
    expect(identityQuote('INR').rate).toBe(1);
  });
});

describe('D: cross-currency balances', () => {
  const dinner = expense({ id: 'dinner', paidBy: ALICE, originalAmountMinor: 10000, originalCurrency: 'USD' });
  const splits = equalSplits(dinner);

  it('keeps the obligation in USD and reconciles the shares', () => {
    expect(splits.reduce((sum, s) => sum + s.shareMinor, 0)).toBe(10000);
    expect(splits.map((s) => s.shareMinor)).toEqual([5000, 5000]);

    // Bob owes Alice $50.00, recorded in USD only
    expect(calculatePairwiseBalanceBag(BOB, ALICE, [dinner], splits, [])).toEqual({ USD: 5000 });
    expect(calculateDirectFriendBalanceBag(ALICE, BOB, [dinner], splits, [])).toEqual({ USD: 5000 });
  });

  it('shows the converted balance with the latest-rate policy and does not change the obligation', () => {
    const owedToAlice = calculateDirectFriendBalanceBag(ALICE, BOB, [dinner], splits, []);
    const inInr = convertBag(owedToAlice, 'INR', rates(quote('USD', 'INR', 85)));
    expect(inInr).toMatchObject({ totalMinor: 425000, currency: 'INR', isApproximate: true });

    // A different display currency changes only the displayed value
    const inEur = convertBag(owedToAlice, 'EUR', rates(quote('USD', 'EUR', 0.9)));
    expect(inEur.totalMinor).toBe(4500);
    expect(owedToAlice).toEqual({ USD: 5000 });
  });

  it('nets and simplifies each currency separately inside a group', () => {
    const groupExpense = (id: string, paidBy: string, amount: number, currency: string): Expense =>
      expense({ id, paidBy, originalAmountMinor: amount, originalCurrency: currency, contextType: 'group', sourceType: 'group', groupId: 'trip', sourceId: 'trip' });
    const usd = groupExpense('hotel', ALICE, 10000, 'USD');
    const inr = groupExpense('taxi', BOB, 20000, 'INR');
    const gb = calculateGroupBalances([usd, inr], [...equalSplits(usd), ...equalSplits(inr)], [], 'INR');

    expect(gb.currencies).toEqual(['INR', 'USD']);
    expect(gb.balances.get(ALICE)?.netByCurrency).toEqual({ USD: 5000, INR: -10000 });
    expect(gb.balances.get(BOB)?.netByCurrency).toEqual({ USD: -5000, INR: 10000 });
    // One suggested payment per currency; never a USD payment against an INR debt
    expect(gb.simplifiedDebts).toEqual(
      expect.arrayContaining([
        { fromUserId: BOB, toUserId: ALICE, amountMinor: 5000, currency: 'USD' },
        { fromUserId: ALICE, toUserId: BOB, amountMinor: 10000, currency: 'INR' },
      ])
    );
    expect(gb.simplifiedDebts).toHaveLength(2);
  });
});

describe('E: settlement in a different currency', () => {
  const dinner = expense({ id: 'dinner', paidBy: ALICE, originalAmountMinor: 10000, originalCurrency: 'USD' });
  const splits = equalSplits(dinner);

  it('applies the frozen converted amount and keeps the paid amount on record', () => {
    // Bob pays ₹2,550 for his $50 debt; at 1 INR = 0.0117647 USD it applies $30.00
    const paid = settlement({
      id: 'pay1',
      fromUserId: BOB,
      toUserId: ALICE,
      amountMinor: 255000,
      currency: 'INR',
      appliedCurrency: 'USD',
      appliedAmountMinor: 3000,
      exchangeRate: 1 / 85,
      exchangeRateDate: '2026-10-21',
      exchangeRateSource: 'frankfurter',
    });

    expect(settlementLedgerAmount(paid)).toEqual({ currency: 'USD', amountMinor: 3000 });
    expect(calculatePairwiseBalanceBag(BOB, ALICE, [dinner], splits, [paid])).toEqual({ USD: 2000 });

    // History keeps exactly what was paid
    expect(paid).toMatchObject({ amountMinor: 255000, currency: 'INR' });
  });

  it('never treats a USD settlement as an equal number of rupees', () => {
    const inrDebt = expense({ id: 'groceries', paidBy: ALICE, originalAmountMinor: 20000, originalCurrency: 'INR' });
    const usdPayment = settlement({ id: 'pay2', fromUserId: BOB, toUserId: ALICE, amountMinor: 10000, currency: 'USD' });
    // Without an applied snapshot a USD payment stays a USD payment
    expect(calculatePairwiseBalanceBag(BOB, ALICE, [inrDebt], equalSplits(inrDebt), [usdPayment])).toEqual({
      INR: 10000,
      USD: -10000,
    });
  });

  it('a settlement in the same currency clears the balance exactly', () => {
    const paid = settlement({ id: 'pay3', fromUserId: BOB, toUserId: ALICE, amountMinor: 5000, currency: 'USD' });
    expect(calculatePairwiseBalanceBag(BOB, ALICE, [dinner], splits, [paid])).toEqual({});
  });
});

describe('F: historical rates in the rate context', () => {
  it('looks up the rate for the expense date, not the latest one', () => {
    const context = rates(quote('USD', 'INR', 90), quote('USD', 'INR', 80, '2026-01-15'));
    const historical = getDisplayAmount(10000, 'USD', 'INR', context, '2026-01-15');
    expect(historical).toMatchObject({ status: 'converted', amountMinor: 800000 });
    if (historical.status === 'converted') expect(historical.quote.effectiveDate).toBe('2026-01-15');

    // No rate for another date → unavailable, never the latest rate in disguise
    expect(getDisplayAmount(10000, 'USD', 'INR', context, '2026-02-01').status).toBe('unavailable');
  });
});

describe('G: missing rates', () => {
  it('keeps the original amount and currency instead of relabelling it', () => {
    const shown = getDisplayAmount(10000, 'USD', 'INR', new Map());
    expect(shown).toEqual({ status: 'unavailable', amountMinor: 10000, currency: 'USD', targetCurrency: 'INR' });
  });

  it('refuses to total a balance when any currency lacks a rate', () => {
    const result = convertBag({ USD: 5000, EUR: 2000 }, 'INR', rates(quote('USD', 'INR', 85)));
    expect(result.totalMinor).toBeNull();
    expect(result.missing).toEqual(['EUR']);
  });
});

describe('H: mixed-currency dashboard', () => {
  const friendExpenses = [
    expense({ id: 'usd-dinner', paidBy: ALICE, originalAmountMinor: 10000, originalCurrency: 'USD' }),
    expense({ id: 'inr-cab', paidBy: ALICE, originalAmountMinor: 30000, originalCurrency: 'INR' }),
  ];
  const splits = friendExpenses.flatMap(equalSplits);

  it('never adds raw amounts from different currencies', () => {
    const before = structuredClone(friendExpenses);
    const dash = calculateDashboardBalances(ALICE, friendExpenses, splits, [], [BOB], [], 'INR');

    expect(dash.overall.owedToYouByCurrency).toEqual({ USD: 5000, INR: 15000 });
    // The scalar fields hold one currency only, never 5000 + 15000
    expect(dash.overall.totalOwedToYou).toBe(15000);
    expect(dash.overall.totalOwedToYou).not.toBe(20000);

    const inInr = convertBag(dash.overall.netByCurrency, 'INR', rates(quote('USD', 'INR', 85)));
    expect(inInr.totalMinor).toBe(425000 + 15000);

    const inUsd = convertBag(dash.overall.netByCurrency, 'USD', rates(quote('INR', 'USD', 0.012)));
    expect(inUsd.totalMinor).toBe(5000 + 180);

    expect(friendExpenses).toEqual(before);
  });

  it('merges bags per currency', () => {
    expect(mergeBags(bagOf('USD', 100), bagOf('INR', 50), bagOf('USD', -100))).toEqual({ INR: 50 });
    expect(addToBag({ USD: 5 }, 'usd', -5)).toEqual({});
  });
});

describe('I: rounding and precision', () => {
  it('reads minor-unit precision per currency', () => {
    expect(getCurrencyDecimals('USD')).toBe(2);
    expect(getCurrencyDecimals('JPY')).toBe(0);
    expect(getCurrencyDecimals('BHD')).toBe(3);
    // Not in CURRENCY_INFO: comes from Intl ISO 4217 data
    expect(getCurrencyDecimals('CLP')).toBe(0);
    expect(getMinorUnitMultiplier('KWD')).toBe(1000);
  });

  it('converts between currencies with different precision', () => {
    // $10.00 → ¥1,500 at 150 JPY per USD
    expect(convertMinor(1000, 'USD', 'JPY', 150)).toBe(1500);
    // ¥1,500 → $10.00
    expect(convertMinor(1500, 'JPY', 'USD', 1 / 150)).toBe(1000);
    // 1.000 BHD → $2.65 at 2.65
    expect(convertMinor(1000, 'BHD', 'USD', 2.65)).toBe(265);
  });

  it('rounds half away from zero, symmetrically', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(convertMinor(1, 'USD', 'INR', 0.5)).toBe(1);
    expect(convertMinor(-1, 'USD', 'INR', 0.5)).toBe(-1);
  });

  it('split shares always reconcile to the total, with no value lost or created', () => {
    for (const [amount, currency] of [
      [1000, 'USD'],
      [1001, 'JPY'],
      [10001, 'BHD'],
      [1, 'INR'],
    ] as const) {
      const shares = calculateEqualSplit(amount, ['a', 'b', 'c'], currency, 'x');
      expect(shares.reduce((sum, s) => sum + s.shareMinor, 0)).toBe(amount);
      expect(Math.max(...shares.map((s) => s.shareMinor)) - Math.min(...shares.map((s) => s.shareMinor))).toBeLessThanOrEqual(1);
    }
  });

  it('converts each currency bucket once, so a balance is not drifted by per-item rounding', () => {
    // Three $0.01 shares at 1.5: one rounding on $0.03 → 5, not 2+2+2 = 6
    const bag = mergeBags(bagOf('USD', 1), bagOf('USD', 1), bagOf('USD', 1));
    expect(convertBag(bag, 'EUR', rates(quote('USD', 'EUR', 1.5))).totalMinor).toBe(5);
  });
});
