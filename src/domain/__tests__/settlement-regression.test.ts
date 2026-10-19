import { describe, it, expect } from 'vitest';
import type { Expense, ExpenseSplit } from '../models/types';
import { calculateEqualSplit } from '../splits/split-calculator';
import {
  calculateGroupBalances,
  calculatePairwiseBalance,
  calculateUserBalances,
  simplifyDebts,
} from '../balances/balance-engine';
import {
  createSettlement,
  applySettlementToBalances,
} from '../settlements/settlement-engine';

describe('Settlement Regression Test (MANDATORY SPEC SCENARIO)', () => {
  it('executes full settlement lifecycle without overwriting history or double counting', () => {
    // -------------------------------------------------------------
    // Step 1: Initial state: Alice owes Bob ₹500
    // (from a ₹1000 expense paid by Bob, split equally between Alice & Bob)
    // In INR, 1 Rupee = 100 paise (minor units), so:
    // ₹1000 = 100000 minor units, ₹500 = 50000 minor units.
    // -------------------------------------------------------------
    const groupId = 'group_reg_1';
    const aliceId = 'user_alice';
    const bobId = 'user_bob';

    const exp1: Expense = {
      id: 'exp_init_1000',
      sourceType: 'group',
      sourceId: groupId,
      groupId,
      description: 'Dinner at Oberoi',
      paidBy: bobId,
      originalAmountMinor: 100000, // ₹1000.00
      originalCurrency: 'INR',
      splitType: 'equal',
      participants: [aliceId, bobId],
      expenseDate: '2026-10-15T19:00:00.000Z',
      createdAt: '2026-10-15T19:00:00.000Z',
      updatedAt: '2026-10-15T19:00:00.000Z',
      createdBy: bobId,
      operationId: 'op_exp_1',
      revision: 1,
    };

    // Deep freeze or snapshot of original expense to prove immutability later
    const originalExp1Snapshot = JSON.parse(JSON.stringify(exp1));

    const splits1: ExpenseSplit[] = calculateEqualSplit(
      exp1.originalAmountMinor,
      exp1.participants,
      exp1.originalCurrency,
      exp1.id
    );

    // Verify splits are 50000 each and sum to 100000
    expect(splits1).toHaveLength(2);
    expect(splits1.find((s) => s.userId === aliceId)?.shareMinor).toBe(50000);
    expect(splits1.find((s) => s.userId === bobId)?.shareMinor).toBe(50000);
    const originalSplits1Snapshot = JSON.parse(JSON.stringify(splits1));

    // Calculate initial balances
    const initialBalances = calculateGroupBalances([exp1], splits1, [], 'INR');
    const initialAlice = initialBalances.balances.get(aliceId);
    const initialBob = initialBalances.balances.get(bobId);

    expect(initialAlice).toBeDefined();
    expect(initialBob).toBeDefined();
    // Alice owes ₹500 (50000 minor units)
    expect(initialAlice?.totalOwed).toBe(50000);
    expect(initialAlice?.totalOwedToYou).toBe(0);
    expect(initialAlice?.netBalance).toBe(-50000);

    // Bob is owed ₹500 (50000 minor units)
    expect(initialBob?.totalOwed).toBe(0);
    expect(initialBob?.totalOwedToYou).toBe(50000);
    expect(initialBob?.netBalance).toBe(50000);

    // Pairwise balance: Alice owes Bob ₹500
    const initialPairwise = calculatePairwiseBalance(aliceId, bobId, [exp1], splits1, [], 'INR');
    expect(initialPairwise.fromUserId).toBe(aliceId);
    expect(initialPairwise.toUserId).toBe(bobId);
    expect(initialPairwise.amountMinor).toBe(50000);

    // Simplified debt: 1 payment Alice -> Bob of 50000
    expect(initialBalances.simplifiedDebts).toHaveLength(1);
    expect(initialBalances.simplifiedDebts[0]).toEqual({
      fromUserId: aliceId,
      toUserId: bobId,
      amountMinor: 50000,
      currency: 'INR',
    });

    // -------------------------------------------------------------
    // Step 2: Alice records a ₹500 settlement to Bob
    // -------------------------------------------------------------
    const { settlement: settlement1, allocations: allocs1 } = createSettlement({
      groupId,
      sourceId: groupId,
      fromUserId: aliceId,
      toUserId: bobId,
      amountMinor: 50000, // ₹500.00
      currency: 'INR',
      settlementDate: '2026-10-16T10:00:00.000Z',
      notes: 'Settling dinner bill',
      createdBy: aliceId,
      allocations: [
        {
          expenseId: exp1.id,
          amountMinor: 50000,
          currency: 'INR',
        },
      ],
    });

    expect(settlement1.id).toBeDefined();
    expect(settlement1.fromUserId).toBe(aliceId);
    expect(settlement1.toUserId).toBe(bobId);
    expect(settlement1.amountMinor).toBe(50000);
    expect(settlement1.currency).toBe('INR');
    expect(allocs1).toHaveLength(1);
    expect(allocs1[0].expenseId).toBe(exp1.id);
    expect(allocs1[0].amountMinor).toBe(50000);

    const originalSettlement1Snapshot = JSON.parse(JSON.stringify(settlement1));

    // -------------------------------------------------------------
    // Step 3: After settlement, Alice's debt to Bob should be ₹0
    // -------------------------------------------------------------
    const afterSettlementBalances = calculateGroupBalances(
      [exp1],
      splits1,
      [settlement1],
      'INR'
    );
    const afterSettleAlice = afterSettlementBalances.balances.get(aliceId);
    const afterSettleBob = afterSettlementBalances.balances.get(bobId);

    expect(afterSettleAlice?.totalOwed).toBe(0);
    expect(afterSettleAlice?.totalOwedToYou).toBe(0);
    expect(afterSettleAlice?.netBalance).toBe(0);

    expect(afterSettleBob?.totalOwed).toBe(0);
    expect(afterSettleBob?.totalOwedToYou).toBe(0);
    expect(afterSettleBob?.netBalance).toBe(0);

    // Debt completely settled, no simplified debts remaining
    expect(afterSettlementBalances.simplifiedDebts).toHaveLength(0);

    // Check pairwise balance is 0
    const afterSettlePairwise = calculatePairwiseBalance(
      aliceId,
      bobId,
      [exp1],
      splits1,
      [settlement1],
      'INR'
    );
    expect(afterSettlePairwise.amountMinor).toBe(0);

    // Direct pairwise balance update test
    const updatedDirect = applySettlementToBalances(settlement1, [initialPairwise]);
    expect(updatedDirect).toHaveLength(0); // Fully cancelled out

    // -------------------------------------------------------------
    // Step 4: Alice creates a NEW ₹200 expense split equally
    // between Alice and Bob, with Alice paying
    // ₹200 = 20000 minor units
    // -------------------------------------------------------------
    const exp2: Expense = {
      id: 'exp_new_200',
      sourceType: 'group',
      sourceId: groupId,
      groupId,
      description: 'Chai and Snacks',
      paidBy: aliceId,
      originalAmountMinor: 20000, // ₹200.00
      originalCurrency: 'INR',
      splitType: 'equal',
      participants: [aliceId, bobId],
      expenseDate: '2026-10-17T16:00:00.000Z',
      createdAt: '2026-10-17T16:00:00.000Z',
      updatedAt: '2026-10-17T16:00:00.000Z',
      createdBy: aliceId,
      operationId: 'op_exp_2',
      revision: 1,
    };

    const splits2: ExpenseSplit[] = calculateEqualSplit(
      exp2.originalAmountMinor,
      exp2.participants,
      exp2.originalCurrency,
      exp2.id
    );

    expect(splits2).toHaveLength(2);
    expect(splits2.find((s) => s.userId === aliceId)?.shareMinor).toBe(10000);
    expect(splits2.find((s) => s.userId === bobId)?.shareMinor).toBe(10000);

    const allExpenses = [exp1, exp2];
    const allSplits = [...splits1, ...splits2];
    const allSettlements = [settlement1];

    // -------------------------------------------------------------
    // Step 5: Now Bob owes Alice ₹100 (half of ₹200)
    // -------------------------------------------------------------
    const finalBalances = calculateGroupBalances(
      allExpenses,
      allSplits,
      allSettlements,
      'INR'
    );

    const finalAlice = finalBalances.balances.get(aliceId);
    const finalBob = finalBalances.balances.get(bobId);

    expect(finalAlice).toBeDefined();
    expect(finalBob).toBeDefined();

    // Alice paid ₹200 for ₹100 share -> Bob owes Alice ₹100 (10000 minor units)
    expect(finalAlice?.totalOwed).toBe(0);
    expect(finalAlice?.totalOwedToYou).toBe(10000);
    expect(finalAlice?.netBalance).toBe(10000);

    // Bob owes ₹100 (10000 minor units)
    expect(finalBob?.totalOwed).toBe(10000);
    expect(finalBob?.totalOwedToYou).toBe(0);
    expect(finalBob?.netBalance).toBe(-10000);

    // Check pairwise calculation specifically
    const finalPairwise = calculatePairwiseBalance(
      bobId,
      aliceId,
      allExpenses,
      allSplits,
      allSettlements,
      'INR'
    );
    expect(finalPairwise.fromUserId).toBe(bobId);
    expect(finalPairwise.toUserId).toBe(aliceId);
    expect(finalPairwise.amountMinor).toBe(10000);

    // Check calculateUserBalances for Bob
    const bobUserBal = calculateUserBalances(
      bobId,
      allExpenses,
      allSplits,
      allSettlements,
      'INR'
    );
    expect(bobUserBal.totalOwed).toBe(10000);
    expect(bobUserBal.totalOwedToYou).toBe(0);
    expect(bobUserBal.netBalance).toBe(-10000);

    // Check calculateUserBalances for Alice
    const aliceUserBal = calculateUserBalances(
      aliceId,
      allExpenses,
      allSplits,
      allSettlements,
      'INR'
    );
    expect(aliceUserBal.totalOwed).toBe(0);
    expect(aliceUserBal.totalOwedToYou).toBe(10000);
    expect(aliceUserBal.netBalance).toBe(10000);

    // -------------------------------------------------------------
    // Step 6: The historical ₹500 settlement remains unchanged in records
    // -------------------------------------------------------------
    expect(allSettlements).toHaveLength(1);
    expect(settlement1).toEqual(originalSettlement1Snapshot);
    expect(settlement1.amountMinor).toBe(50000);
    expect(settlement1.fromUserId).toBe(aliceId);
    expect(settlement1.toUserId).toBe(bobId);

    // -------------------------------------------------------------
    // Step 7: Final net: Bob owes Alice ₹100
    // -------------------------------------------------------------
    expect(finalBalances.simplifiedDebts).toHaveLength(1);
    expect(finalBalances.simplifiedDebts[0]).toEqual({
      fromUserId: bobId,
      toUserId: aliceId,
      amountMinor: 10000,
      currency: 'INR',
    });

    // Invariant: sum of all net balances in group MUST be 0
    const netSum = (finalAlice?.netBalance ?? 0) + (finalBob?.netBalance ?? 0);
    expect(netSum).toBe(0);

    // -------------------------------------------------------------
    // Step 8: No historical transactions were overwritten
    // -------------------------------------------------------------
    expect(allExpenses).toHaveLength(2);
    expect(exp1).toEqual(originalExp1Snapshot);
    expect(splits1).toEqual(originalSplits1Snapshot);

    // Expense 1 is intact
    expect(exp1.id).toBe('exp_init_1000');
    expect(exp1.originalAmountMinor).toBe(100000);
    expect(exp1.paidBy).toBe(bobId);
    expect(exp1.revision).toBe(1);

    // Expense 2 is intact
    expect(exp2.id).toBe('exp_new_200');
    expect(exp2.originalAmountMinor).toBe(20000);
    expect(exp2.paidBy).toBe(aliceId);

    // Total splits = 4 (2 for exp1, 2 for exp2)
    expect(allSplits).toHaveLength(4);
    const exp1Splits = allSplits.filter((s) => s.expenseId === exp1.id);
    const exp2Splits = allSplits.filter((s) => s.expenseId === exp2.id);
    expect(exp1Splits).toHaveLength(2);
    expect(exp2Splits).toHaveLength(2);

    // -------------------------------------------------------------
    // Additional Verification: No double counting on re-computation
    // -------------------------------------------------------------
    for (let iteration = 0; iteration < 5; iteration++) {
      const recomputed = calculateGroupBalances(
        allExpenses,
        allSplits,
        allSettlements,
        'INR'
      );
      expect(recomputed.balances.get(aliceId)?.netBalance).toBe(10000);
      expect(recomputed.balances.get(bobId)?.netBalance).toBe(-10000);
      expect(recomputed.simplifiedDebts).toHaveLength(1);
      expect(recomputed.simplifiedDebts[0].amountMinor).toBe(10000);
      expect(recomputed.simplifiedDebts[0].fromUserId).toBe(bobId);
      expect(recomputed.simplifiedDebts[0].toUserId).toBe(aliceId);
    }
  });

  it('handles partial settlement followed by subsequent expenses correctly', () => {
    // Bob pays ₹1000 (100000 minor) split equally with Alice -> Alice owes Bob ₹500 (50000)
    const exp1: Expense = {
      id: 'e1',
      description: 'Dinner',
      sourceType: 'group',
      sourceId: 'g1',
      paidBy: 'bob',
      originalAmountMinor: 100000,
      originalCurrency: 'INR',
      splitType: 'equal',
      participants: ['alice', 'bob'],
      expenseDate: '2026-10-15T12:00:00.000Z',
      createdAt: '2026-10-15T12:00:00.000Z',
      updatedAt: '2026-10-15T12:00:00.000Z',
    };
    const splits1 = calculateEqualSplit(100000, ['alice', 'bob'], 'INR', 'e1');

    // Alice makes PARTIAL settlement of ₹300 (30000 minor) to Bob
    const { settlement: partialSettle } = createSettlement({
      fromUserId: 'alice',
      toUserId: 'bob',
      amountMinor: 30000,
      currency: 'INR',
      settlementDate: '2026-10-16T12:00:00.000Z',
      createdBy: 'alice',
    });

    // After partial settlement: Alice still owes Bob ₹200 (20000 minor)
    let bal = calculateGroupBalances([exp1], splits1, [partialSettle], 'INR');
    expect(bal.balances.get('alice')?.netBalance).toBe(-20000);
    expect(bal.balances.get('bob')?.netBalance).toBe(20000);
    expect(bal.simplifiedDebts[0]).toEqual({
      fromUserId: 'alice',
      toUserId: 'bob',
      amountMinor: 20000,
      currency: 'INR',
    });

    // Now Alice pays a NEW ₹200 (20000 minor) expense split equally
    // Bob's share is ₹100 (10000 minor)
    const exp2: Expense = {
      id: 'e2',
      description: 'Lunch',
      sourceType: 'group',
      sourceId: 'g1',
      paidBy: 'alice',
      originalAmountMinor: 20000,
      originalCurrency: 'INR',
      splitType: 'equal',
      participants: ['alice', 'bob'],
      expenseDate: '2026-10-17T12:00:00.000Z',
      createdAt: '2026-10-17T12:00:00.000Z',
      updatedAt: '2026-10-17T12:00:00.000Z',
    };
    const splits2 = calculateEqualSplit(20000, ['alice', 'bob'], 'INR', 'e2');

    // Net balance:
    // Alice owed 20000, now Bob owes Alice 10000.
    // Net: Alice owes Bob 10000 (₹100).
    bal = calculateGroupBalances([exp1, exp2], [...splits1, ...splits2], [partialSettle], 'INR');
    expect(bal.balances.get('alice')?.netBalance).toBe(-10000);
    expect(bal.balances.get('bob')?.netBalance).toBe(10000);
    expect(bal.simplifiedDebts[0]).toEqual({
      fromUserId: 'alice',
      toUserId: 'bob',
      amountMinor: 10000,
      currency: 'INR',
    });

    // Alice makes second settlement of remaining ₹100 (10000 minor)
    const { settlement: finalSettle } = createSettlement({
      fromUserId: 'alice',
      toUserId: 'bob',
      amountMinor: 10000,
      currency: 'INR',
      settlementDate: '2026-10-18T12:00:00.000Z',
      createdBy: 'alice',
    });

    bal = calculateGroupBalances(
      [exp1, exp2],
      [...splits1, ...splits2],
      [partialSettle, finalSettle],
      'INR'
    );
    expect(bal.balances.get('alice')?.netBalance).toBe(0);
    expect(bal.balances.get('bob')?.netBalance).toBe(0);
    expect(bal.simplifiedDebts).toHaveLength(0);
  });
});
