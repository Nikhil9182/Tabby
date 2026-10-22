import { describe, it, expect } from 'vitest';
import type { Expense, ExpenseSplit, Settlement } from '../models/types';
import {
  calculateDirectFriendBalance,
  calculateGroupBalances,
  calculateDashboardBalances,
} from '../balances/balance-engine';

describe('Splitwise Architecture: Context Isolation Regression Tests (Section 11)', () => {
  const ALICE_ID = 'user_alice';
  const BOB_ID = 'user_bob';
  const CHARLIE_ID = 'user_charlie';
  const GOA_TRIP_ID = 'group_goa_trip';

  // 1. Alice & Bob record a direct expense of ₹1,000, shared equally (₹500 each)
  const directExpense: Expense = {
    id: 'exp_direct_1',
    sourceType: 'direct',
    sourceId: 'friendship_alice_bob',
    contextType: 'direct',
    friendshipId: 'friendship_alice_bob',
    description: 'Dinner with Bob',
    paidBy: ALICE_ID,
    originalAmountMinor: 100000, // 1,000 in minor units (cents / paise)
    amountMinor: 100000,
    originalCurrency: 'INR',
    currency: 'INR',
    reportingAmountMinor: 100000,
    splitType: 'equal',
    participants: [ALICE_ID, BOB_ID],
    expenseDate: '2026-10-22T10:00:00Z',
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T10:00:00Z',
  };

  const directSplits: ExpenseSplit[] = [
    {
      id: 'split_d_1',
      expenseId: 'exp_direct_1',
      userId: ALICE_ID,
      shareMinor: 50000,
    },
    {
      id: 'split_d_2',
      expenseId: 'exp_direct_1',
      userId: BOB_ID,
      shareMinor: 50000,
    },
  ];

  // 2. Alice creates group "Goa Trip" with Alice, Bob, Charlie and records ₹3,000 group expense
  const groupExpense: Expense = {
    id: 'exp_group_1',
    sourceType: 'group',
    sourceId: GOA_TRIP_ID,
    groupId: GOA_TRIP_ID,
    contextType: 'group',
    description: 'Goa Resort Stay',
    paidBy: ALICE_ID,
    originalAmountMinor: 300000, // 3,000 in minor units
    amountMinor: 300000,
    originalCurrency: 'INR',
    currency: 'INR',
    reportingAmountMinor: 300000,
    splitType: 'equal',
    participants: [ALICE_ID, BOB_ID, CHARLIE_ID],
    expenseDate: '2026-10-22T12:00:00Z',
    createdAt: '2026-10-22T12:00:00Z',
    updatedAt: '2026-10-22T12:00:00Z',
  };

  const groupSplits: ExpenseSplit[] = [
    {
      id: 'split_g_1',
      expenseId: 'exp_group_1',
      userId: ALICE_ID,
      shareMinor: 100000,
    },
    {
      id: 'split_g_2',
      expenseId: 'exp_group_1',
      userId: BOB_ID,
      shareMinor: 100000,
    },
    {
      id: 'split_g_3',
      expenseId: 'exp_group_1',
      userId: CHARLIE_ID,
      shareMinor: 100000,
    },
  ];

  const allExpenses = [directExpense, groupExpense];
  const allSplits = [...directSplits, ...groupSplits];
  const noSettlements: Settlement[] = [];

  it('verifies that Direct Alice-Bob context displays ONLY direct expense and Bob owes ₹500', () => {
    const directBalance = calculateDirectFriendBalance(
      ALICE_ID,
      BOB_ID,
      allExpenses,
      allSplits,
      noSettlements,
      'INR'
    );

    // Bob owes Alice ₹500 (50,000 paise)
    expect(directBalance.fromUserId).toBe(BOB_ID);
    expect(directBalance.toUserId).toBe(ALICE_ID);
    expect(directBalance.amountMinor).toBe(50000);
  });

  it('verifies that Group context displays ONLY group expense and does NOT include direct expense', () => {
    const groupBalances = calculateGroupBalances(
      GOA_TRIP_ID,
      allExpenses,
      allSplits,
      noSettlements,
      'INR'
    );

    // Alice is owed ₹2,000 in the group (Bob owes ₹1,000, Charlie owes ₹1,000)
    const aliceBal = groupBalances.balances.get(ALICE_ID);
    expect(aliceBal?.netBalance).toBe(200000); // +₹2,000
    expect(aliceBal?.totalOwedToYou).toBe(200000);
    expect(aliceBal?.totalOwed).toBe(0);

    const bobBal = groupBalances.balances.get(BOB_ID);
    expect(bobBal?.netBalance).toBe(-100000); // Bob owes ₹1,000 in group (NOT ₹1,500)
    expect(bobBal?.totalOwed).toBe(100000);

    const charlieBal = groupBalances.balances.get(CHARLIE_ID);
    expect(charlieBal?.netBalance).toBe(-100000); // Charlie owes ₹1,000 in group
  });

  it('verifies dashboard aggregation presents both contexts without double-counting', () => {
    const dashboard = calculateDashboardBalances(
      ALICE_ID,
      allExpenses,
      allSplits,
      noSettlements,
      [BOB_ID, CHARLIE_ID],
      [{ id: GOA_TRIP_ID, name: 'Goa Trip', currency: 'INR' }],
      'INR'
    );

    // Direct with friends: Bob owes Alice ₹500
    expect(dashboard.direct.totalOwedToYou).toBe(50000);
    expect(dashboard.direct.totalOwed).toBe(0);
    expect(dashboard.direct.netBalance).toBe(50000);
    expect(dashboard.direct.pairwise).toHaveLength(1);

    // In groups: Alice is owed ₹2,000 (₹1,000 Bob + ₹1,000 Charlie)
    expect(dashboard.groups.totalOwedToYou).toBe(200000);
    expect(dashboard.groups.totalOwed).toBe(0);
    expect(dashboard.groups.netBalance).toBe(200000);

    // Overall aggregate: ₹500 (direct) + ₹2,000 (groups) = ₹2,500
    expect(dashboard.overall.totalOwedToYou).toBe(250000);
    expect(dashboard.overall.totalOwed).toBe(0);
    expect(dashboard.overall.netBalance).toBe(250000);
  });

  it('records ₹200 direct settlement from Bob to Alice: direct balance becomes ₹300, group balance unchanged', () => {
    const directSettlement: Settlement = {
      id: 'settle_direct_1',
      sourceType: 'direct',
      sourceId: 'friendship_alice_bob',
      contextType: 'direct',
      friendshipId: 'friendship_alice_bob',
      fromUserId: BOB_ID,
      toUserId: ALICE_ID,
      amountMinor: 20000, // ₹200 in minor units
      currency: 'INR',
      settlementDate: '2026-10-22T14:00:00Z',
      createdAt: '2026-10-22T14:00:00Z',
      updatedAt: '2026-10-22T14:00:00Z',
    };

    const directBalanceAfterSettlement = calculateDirectFriendBalance(
      ALICE_ID,
      BOB_ID,
      allExpenses,
      allSplits,
      [directSettlement],
      'INR'
    );

    // Direct balance: Bob now owes Alice ₹300 (30,000 paise)
    expect(directBalanceAfterSettlement.fromUserId).toBe(BOB_ID);
    expect(directBalanceAfterSettlement.toUserId).toBe(ALICE_ID);
    expect(directBalanceAfterSettlement.amountMinor).toBe(30000);

    // Group balance MUST remain completely unchanged!
    const groupBalances = calculateGroupBalances(
      GOA_TRIP_ID,
      allExpenses,
      allSplits,
      [directSettlement], // passing direct settlement to group calculation
      'INR'
    );
    const bobGroupBal = groupBalances.balances.get(BOB_ID);
    expect(bobGroupBal?.netBalance).toBe(-100000); // STILL -₹1,000, unaffected by direct settlement!
  });

  it('records group settlement: group balance updated, direct balance unchanged', () => {
    const directSettlement: Settlement = {
      id: 'settle_direct_1',
      sourceType: 'direct',
      sourceId: 'friendship_alice_bob',
      contextType: 'direct',
      friendshipId: 'friendship_alice_bob',
      fromUserId: BOB_ID,
      toUserId: ALICE_ID,
      amountMinor: 20000, // ₹200
      currency: 'INR',
      settlementDate: '2026-10-22T14:00:00Z',
      createdAt: '2026-10-22T14:00:00Z',
      updatedAt: '2026-10-22T14:00:00Z',
    };

    const groupSettlement: Settlement = {
      id: 'settle_group_1',
      sourceType: 'group',
      sourceId: GOA_TRIP_ID,
      groupId: GOA_TRIP_ID,
      contextType: 'group',
      fromUserId: BOB_ID,
      toUserId: ALICE_ID,
      amountMinor: 50000, // ₹500 settlement inside group
      currency: 'INR',
      settlementDate: '2026-10-22T15:00:00Z',
      createdAt: '2026-10-22T15:00:00Z',
      updatedAt: '2026-10-22T15:00:00Z',
    };

    const allSettlements = [directSettlement, groupSettlement];

    // Group balance: Bob previously owed ₹1,000, now owes ₹500
    const groupBalances = calculateGroupBalances(
      GOA_TRIP_ID,
      allExpenses,
      allSplits,
      allSettlements,
      'INR'
    );
    const bobGroupBal = groupBalances.balances.get(BOB_ID);
    expect(bobGroupBal?.netBalance).toBe(-50000); // -₹500

    // Direct balance: MUST remain ₹300, completely unaffected by group settlement!
    const directBalance = calculateDirectFriendBalance(
      ALICE_ID,
      BOB_ID,
      allExpenses,
      allSplits,
      allSettlements,
      'INR'
    );
    expect(directBalance.amountMinor).toBe(30000); // Still exactly ₹300!
  });
});
