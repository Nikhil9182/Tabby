import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settlementService } from '../settlement-service';
import { supabase } from '@/lib/supabase';
import { calculateGroupBalances } from '@/domain/balances/balance-engine';
import type { Expense, ExpenseSplit, Settlement } from '@/domain/models/types';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
    },
  };
});

describe('SettlementService & Balance Engine Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects self-settlement when fromUser equals toUser', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'usr_alice' } as any },
      error: null,
    });

    await expect(
      settlementService.createSettlement({
        groupId: 'grp_1',
        fromUserId: 'usr_alice',
        toUserId: 'usr_alice',
        amountMinor: 5000,
        currency: 'INR',
      })
    ).rejects.toThrow('Self-settlement is not permitted.');
  });

  it('rejects settlement with non-positive amount', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'usr_alice' } as any },
      error: null,
    });

    await expect(
      settlementService.createSettlement({
        groupId: 'grp_1',
        fromUserId: 'usr_alice',
        toUserId: 'usr_bob',
        amountMinor: 0,
        currency: 'INR',
      })
    ).rejects.toThrow('Settlement amount must be positive.');
  });

  it('preserves settlement history and correctly recalculates net balances in regression scenario', () => {
    // SCENARIO (Section 11 & Section 18):
    // 1. Initial Expense: Bob paid ₹500 for Alice (Alice owes Bob ₹500)
    // 2. Settlement: Alice pays Bob ₹500 (debts clear to 0)
    // 3. New Expense: Alice pays ₹200, split equally between Alice and Bob
    // 4. Verifications:
    //    - Settlement remains intact in history
    //    - Alice paid ₹200, Alice share is ₹100, Bob share is ₹100
    //    - Bob now owes Alice ₹100
    //    - Group balances sum to 0

    const exp1: Expense = {
      id: 'exp_initial',
      sourceType: 'group',
      sourceId: 'grp_test',
      groupId: 'grp_test',
      description: 'Bob paid lunch for Alice',
      paidBy: 'bob',
      originalAmountMinor: 50000, // ₹500.00
      originalCurrency: 'INR',
      reportingCurrency: 'INR',
      reportingAmountMinor: 50000,
      splitType: 'exact',
      participants: ['alice'],
      expenseDate: '2026-10-01T12:00:00Z',
      createdAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-01T12:00:00Z',
    };

    const exp1Splits: ExpenseSplit[] = [
      {
        id: 'split_1',
        expenseId: 'exp_initial',
        userId: 'alice',
        shareMinor: 50000,
      },
    ];

    // Step 1: Alice owes Bob ₹500
    const step1Balances = calculateGroupBalances([exp1], exp1Splits, [], 'INR');
    expect(step1Balances.simplifiedDebts).toHaveLength(1);
    expect(step1Balances.simplifiedDebts[0]).toEqual({
      fromUserId: 'alice',
      toUserId: 'bob',
      amountMinor: 50000,
      currency: 'INR',
    });

    // Step 2: Alice records ₹500 settlement to Bob
    const settlement: Settlement = {
      id: 'settlement_1',
      sourceId: 'grp_test',
      groupId: 'grp_test',
      fromUserId: 'alice',
      toUserId: 'bob',
      amountMinor: 50000, // ₹500.00
      currency: 'INR',
      settlementDate: '2026-10-02T12:00:00Z',
      createdAt: '2026-10-02T12:00:00Z',
      updatedAt: '2026-10-02T12:00:00Z',
    };

    const step2Balances = calculateGroupBalances([exp1], exp1Splits, [settlement], 'INR');
    expect(step2Balances.simplifiedDebts).toHaveLength(0); // Balanced!
    expect(step2Balances.balances.get('alice')?.netBalance).toBe(0);
    expect(step2Balances.balances.get('bob')?.netBalance).toBe(0);

    // Step 3: Alice adds a new ₹200 expense split equally with Bob
    const exp2: Expense = {
      id: 'exp_new',
      sourceType: 'group',
      sourceId: 'grp_test',
      groupId: 'grp_test',
      description: 'Alice paid taxi',
      paidBy: 'alice',
      originalAmountMinor: 20000, // ₹200.00
      originalCurrency: 'INR',
      reportingCurrency: 'INR',
      reportingAmountMinor: 20000,
      splitType: 'equal',
      participants: ['alice', 'bob'],
      expenseDate: '2026-10-03T12:00:00Z',
      createdAt: '2026-10-03T12:00:00Z',
      updatedAt: '2026-10-03T12:00:00Z',
    };

    const exp2Splits: ExpenseSplit[] = [
      { id: 'split_2a', expenseId: 'exp_new', userId: 'alice', shareMinor: 10000 },
      { id: 'split_2b', expenseId: 'exp_new', userId: 'bob', shareMinor: 10000 },
    ];

    const allExpenses = [exp1, exp2];
    const allSplits = [...exp1Splits, ...exp2Splits];
    const allSettlements = [settlement]; // Remains in history!

    const finalBalances = calculateGroupBalances(allExpenses, allSplits, allSettlements, 'INR');

    // Step 4: Verify results
    // Bob owes Alice ₹100 (10,000 minor units)
    expect(finalBalances.simplifiedDebts).toHaveLength(1);
    expect(finalBalances.simplifiedDebts[0]).toEqual({
      fromUserId: 'bob',
      toUserId: 'alice',
      amountMinor: 10000, // ₹100
      currency: 'INR',
    });

    // Check net positions
    expect(finalBalances.balances.get('alice')?.netBalance).toBe(10000); // Alice is owed ₹100
    expect(finalBalances.balances.get('bob')?.netBalance).toBe(-10000); // Bob owes ₹100

    // Net sum balances exactly to 0
    const totalNet = Array.from(finalBalances.balances.values()).reduce(
      (sum, u) => sum + u.netBalance,
      0
    );
    expect(totalNet).toBe(0);
  });
});
