import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
  checkSupabaseConfig: () => ({ isConfigured: false, missingKeys: [] }),
}));

import { supabase } from '@/lib/supabase';
import { expenseService } from '../expense-service';
import { settlementService, toSettlement } from '../settlement-service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'alice' } as any }, error: null } as any);
});

describe('B: the database keeps the transaction currency', () => {
  it('records a USD expense as 100 USD whatever the display currency is', async () => {
    vi.mocked(supabase.rpc as any).mockResolvedValue({ data: { expense: { id: 'e1', description: 'Dinner' } }, error: null });

    await expenseService.createExpense({
      description: 'Dinner',
      amountMinor: 10000,
      currency: 'USD',
      paidBy: 'alice',
      contextType: 'direct',
      friendId: 'bob',
      splits: [
        { userId: 'alice', shareMinor: 5000 },
        { userId: 'bob', shareMinor: 5000 },
      ],
      // Snapshot into the user's display currency (INR), stored alongside
      reportingCurrency: 'INR',
      exchangeRate: 85,
      exchangeRateDate: '2026-10-22',
      exchangeRateSource: 'frankfurter',
      reportingAmountMinor: 850000,
    } as any);

    const [, args] = vi.mocked(supabase.rpc as any).mock.calls[0];
    expect(args).toMatchObject({
      p_amount_minor: 10000,
      p_currency: 'USD',
      p_reporting_currency: 'INR',
      p_exchange_rate: 85,
      p_exchange_rate_date: '2026-10-22',
      p_reporting_amount_minor: 850000,
    });
  });

  it('never stores a different reporting currency with a fake 1.0 rate', async () => {
    vi.mocked(supabase.rpc as any).mockResolvedValue({ data: { expense: { id: 'e2', description: 'Cab' } }, error: null });

    await expenseService.createExpense({
      description: 'Cab',
      amountMinor: 10000,
      currency: 'USD',
      paidBy: 'alice',
      contextType: 'direct',
      friendId: 'bob',
      splits: [{ userId: 'bob', shareMinor: 10000 }],
      reportingCurrency: 'INR', // no rate supplied
    } as any);

    const [, args] = vi.mocked(supabase.rpc as any).mock.calls[0];
    expect(args).toMatchObject({
      p_currency: 'USD',
      p_reporting_currency: 'USD',
      p_exchange_rate: 1,
      p_reporting_amount_minor: 10000,
    });
  });
});

describe('E: settlement history keeps what was actually paid', () => {
  it('sends the paid amount plus the frozen applied amount for a cross-currency payment', async () => {
    vi.mocked(supabase.rpc as any).mockResolvedValue({ data: { id: 's1' }, error: null });

    await settlementService.createSettlement({
      contextType: 'direct',
      friendId: 'alice',
      fromUserId: 'bob',
      toUserId: 'alice',
      amountMinor: 255000,
      currency: 'INR',
      conversion: {
        appliedCurrency: 'USD',
        appliedAmountMinor: 3000,
        exchangeRate: 0.0117647,
        exchangeRateDate: '2026-10-21',
        exchangeRateSource: 'frankfurter',
      },
    });

    const [fn, args] = vi.mocked(supabase.rpc as any).mock.calls[0];
    expect(fn).toBe('record_direct_settlement');
    expect(args).toMatchObject({
      p_amount_minor: 255000,
      p_currency: 'INR',
      p_applied_currency: 'USD',
      p_applied_amount_minor: 3000,
      p_exchange_rate: 0.0117647,
      p_exchange_rate_date: '2026-10-21',
    });
  });

  it('does not silently fall back to an unconverted insert when the RPC rejects a conversion', async () => {
    vi.mocked(supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'function not found' } });

    await expect(
      settlementService.createSettlement({
        contextType: 'direct',
        friendId: 'alice',
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 255000,
        currency: 'INR',
        conversion: {
          appliedCurrency: 'USD',
          appliedAmountMinor: 3000,
          exchangeRate: 0.0117647,
          exchangeRateDate: '2026-10-21',
          exchangeRateSource: 'frankfurter',
        },
      })
    ).rejects.toThrow('function not found');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('maps stored rows back with the paid and applied amounts intact', () => {
    const s = toSettlement({
      id: 's1',
      group_id: null,
      from_user_id: 'bob',
      to_user_id: 'alice',
      amount_minor: 255000,
      currency: 'INR',
      applied_currency: 'USD',
      applied_amount_minor: 3000,
      exchange_rate: 0.0117647,
      exchange_rate_date: '2026-10-21',
      exchange_rate_source: 'frankfurter',
      settlement_date: '2026-10-21T00:00:00Z',
      notes: null,
      created_at: '2026-10-21T00:00:00Z',
      updated_at: '2026-10-21T00:00:00Z',
      created_by: 'bob',
      deleted_at: null,
    } as any);

    expect(s).toMatchObject({
      amountMinor: 255000,
      currency: 'INR',
      appliedCurrency: 'USD',
      appliedAmountMinor: 3000,
      exchangeRateDate: '2026-10-21',
    });
  });
});
