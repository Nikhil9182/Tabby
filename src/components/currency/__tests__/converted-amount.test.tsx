import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
  checkSupabaseConfig: () => ({ isConfigured: false, missingKeys: [] }),
}));

import { exchangeRateService, ExchangeRateError } from '@/services/exchange-rates/exchange-rate-service';
import { ConvertedAmount, BalanceAmount } from '../converted-amount';
import { useDisplayConversion } from '@/hooks/use-currency';
import { useSettleUp } from '@/hooks/use-settle-up';
import type { RateQuote } from '@/domain/money/conversion';

const usdInr = (rate: number): RateQuote => ({
  from: 'USD',
  to: 'INR',
  rate,
  requestedDate: 'latest',
  effectiveDate: '2026-10-22',
  source: 'network',
  fetchedAt: '2026-10-22T10:00:00.000Z',
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.setItem('tabby_default_currency', 'INR');
});

describe('B: display preference', () => {
  it('shows the INR equivalent of a USD expense and keeps the original', async () => {
    vi.spyOn(exchangeRateService, 'getRate').mockResolvedValue(usdInr(85));
    const expense = { originalAmountMinor: 10000, originalCurrency: 'USD' };

    render(<ConvertedAmount amountMinor={expense.originalAmountMinor} currency={expense.originalCurrency} />, { wrapper });

    expect(screen.getByText('$100.00')).toBeTruthy();
    expect(await screen.findByText(/≈\s*₹8,500\.00/)).toBeTruthy();
    expect(expense).toEqual({ originalAmountMinor: 10000, originalCurrency: 'USD' });
  });
});

describe('G: rate service unavailable', () => {
  it('never relabels the original amount with the target currency', async () => {
    vi.spyOn(exchangeRateService, 'getRate').mockRejectedValue(
      new ExchangeRateError('network', 'USD', 'INR', undefined, 'offline')
    );

    render(<ConvertedAmount amountMinor={10000} currency="USD" />, { wrapper });

    expect(await screen.findByText(/INR rate unavailable/, undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('$100.00')).toBeTruthy();
    expect(screen.queryByText(/₹100\.00/)).toBeNull();
  });

  it('a balance with a missing rate shows its real amounts and a retry, not a fake total', async () => {
    vi.spyOn(exchangeRateService, 'getRate').mockRejectedValue(
      new ExchangeRateError('network', 'USD', 'INR', undefined, 'offline')
    );
    function Balance() {
      const conversion = useDisplayConversion(['USD', 'INR']);
      return <BalanceAmount bag={{ USD: 5000, INR: 15000 }} conversion={conversion} />;
    }

    render(<Balance />, { wrapper });

    expect(await screen.findByText(/Can.t convert USD to INR right now/, undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('₹150.00 + $50.00')).toBeTruthy();
  });
});

describe('H: mixed balance in the display currency', () => {
  it('converts each currency once and marks the total as approximate', async () => {
    vi.spyOn(exchangeRateService, 'getRate').mockResolvedValue(usdInr(85));
    function Balance() {
      const conversion = useDisplayConversion(['USD', 'INR']);
      return <BalanceAmount bag={{ USD: 5000, INR: 15000 }} conversion={conversion} />;
    }

    render(<Balance />, { wrapper });

    // $50 → ₹4,250 + ₹150 = ₹4,400, with the originals listed underneath
    expect(await screen.findByText('₹4,400.00')).toBeTruthy();
    expect(screen.getByText('≈')).toBeTruthy();
    expect(screen.getByText('₹150.00 + $50.00')).toBeTruthy();
  });
});

describe('E: settling a USD debt in INR', () => {
  it('previews the applied USD amount and submits the frozen rate snapshot', async () => {
    vi.spyOn(exchangeRateService, 'getRate').mockResolvedValue({ ...usdInr(1 / 85), from: 'INR', to: 'USD' });

    const { result } = renderHook(
      () => useSettleUp({ debtBag: { USD: 5000 }, settlementDate: new Date().toISOString().slice(0, 10), fallbackCurrency: 'INR' }),
      { wrapper }
    );

    // Starts on the debt currency with the full amount
    expect(result.current.paidCurrency).toBe('USD');
    expect(result.current.amountStr).toBe('50');

    // Switch to paying in INR: the number is kept, not silently converted
    act(() => result.current.setPaidCurrency('INR'));
    await waitFor(() => expect(result.current.paidCurrency).toBe('INR'));
    expect(result.current.amountStr).toBe('50');

    act(() => result.current.setAmountStr('2550'));
    await waitFor(() => expect(result.current.appliedMinor).toBe(3000));

    expect(result.current.appliedMinor).toBe(3000);
    expect(result.current.submission).toEqual({
      amountMinor: 255000,
      currency: 'INR',
      conversion: expect.objectContaining({
        appliedCurrency: 'USD',
        appliedAmountMinor: 3000,
        exchangeRateDate: '2026-10-22',
      }),
    });
  });

  it('blocks a cross-currency settlement when no rate is available', async () => {
    vi.spyOn(exchangeRateService, 'getRate').mockRejectedValue(
      new ExchangeRateError('network', 'INR', 'USD', undefined, 'offline')
    );
    const { result } = renderHook(
      () =>
        useSettleUp({
          debtBag: { USD: 5000 },
          settlementDate: new Date().toISOString().slice(0, 10),
          fallbackCurrency: 'INR',
          initialCurrency: 'INR',
          initialAmountMinor: 100000,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.conversion.status).toBe('unavailable'), { timeout: 4000 });
    expect(result.current.submission).toBeNull();
    expect(result.current.error).toMatch(/No INR→USD exchange rate/);
  });
});
