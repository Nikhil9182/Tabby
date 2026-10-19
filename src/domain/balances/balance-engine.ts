import type { Expense, ExpenseSplit, Settlement } from '../models/types';
import { calculateEqualSplit } from '../splits/split-calculator';

/**
 * Directed pairwise debt representing an amount owed from one user to another.
 */
export interface PairwiseBalance {
  /** The debtor who owes money. */
  fromUserId: string;
  /** The creditor who is owed money. */
  toUserId: string;
  /** Positive amount in integer minor units. */
  amountMinor: number;
  /** Currency code for the balance. */
  currency: string;
}

/**
 * Aggregated balance summary for an individual user.
 */
export interface UserBalance {
  /** The user ID. */
  userId: string;
  /** Total amount this user owes to other users (positive integer minor units). */
  totalOwed: number;
  /** Total amount other users owe to this user (positive integer minor units). */
  totalOwedToYou: number;
  /** Net position: totalOwedToYou - totalOwed. Positive if owed, negative if owing. */
  netBalance: number;
  /** Pairwise balances involving this user. */
  pairwise: PairwiseBalance[];
}

/**
 * Comprehensive balance state for an entire group.
 */
export interface GroupBalances {
  /** The group ID. */
  groupId: string;
  /** Group currency. */
  currency: string;
  /** Map of user ID to their detailed UserBalance. */
  balances: Map<string, UserBalance>;
  /** Optimized minimal transaction list to settle all debts. */
  simplifiedDebts: PairwiseBalance[];
}

/**
 * Calculates comprehensive group balances, netting all pairwise debts and
 * computing simplified settlements.
 *
 * @param expenses Array of group expenses.
 * @param splits Array of expense splits.
 * @param settlements Array of group settlements.
 * @param groupCurrency The primary currency of the group.
 * @returns GroupBalances object containing individual balances and simplified debts.
 */
export function calculateGroupBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  groupCurrency: string
): GroupBalances {
  const activeExpenses = expenses.filter((e) => !e.deletedAt);
  const activeSettlements = settlements.filter((s) => !s.deletedAt);

  // Index splits by expenseId
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();
  for (const split of splits) {
    const list = splitsByExpenseId.get(split.expenseId);
    if (list) {
      list.push(split);
    } else {
      splitsByExpenseId.set(split.expenseId, [split]);
    }
  }

  // Collect all known user IDs in the group context
  const allUserIds = new Set<string>();

  // Map tracking directed gross debt: debtMatrix[debtor][creditor] = amountMinor
  const debtMatrix = new Map<string, Map<string, number>>();

  function addDebt(debtor: string, creditor: string, amount: number) {
    if (debtor === creditor || amount === 0) return;
    allUserIds.add(debtor);
    allUserIds.add(creditor);

    let creditorMap = debtMatrix.get(debtor);
    if (!creditorMap) {
      creditorMap = new Map<string, number>();
      debtMatrix.set(debtor, creditorMap);
    }
    const current = creditorMap.get(creditor) ?? 0;
    creditorMap.set(creditor, current + amount);
  }

  // 1. Process active expenses
  for (const expense of activeExpenses) {
    const payer = expense.paidBy;
    allUserIds.add(payer);
    for (const participantId of expense.participants) {
      allUserIds.add(participantId);
    }

    let expenseSplits = splitsByExpenseId.get(expense.id);
    if (!expenseSplits || expenseSplits.length === 0) {
      // Fallback: equal split among participants
      expenseSplits = calculateEqualSplit(
        expense.originalAmountMinor,
        expense.participants,
        expense.originalCurrency,
        expense.id
      );
    }

    for (const split of expenseSplits) {
      if (split.userId !== payer) {
        // Participant owes payer their split share
        addDebt(split.userId, payer, split.shareMinor);
      }
    }
  }

  // 2. Process active settlements
  for (const settlement of activeSettlements) {
    allUserIds.add(settlement.fromUserId);
    allUserIds.add(settlement.toUserId);
    // Payer (fromUserId) paid recipient (toUserId), which offsets debt from payer to recipient
    addDebt(settlement.fromUserId, settlement.toUserId, -settlement.amountMinor);
  }

  // 3. Compute netted pairwise balances
  const userList = Array.from(allUserIds);
  const nettedPairwiseBalances: PairwiseBalance[] = [];

  for (let i = 0; i < userList.length; i++) {
    for (let j = i + 1; j < userList.length; j++) {
      const u1 = userList[i];
      const u2 = userList[j];

      const gross1to2 = debtMatrix.get(u1)?.get(u2) ?? 0;
      const gross2to1 = debtMatrix.get(u2)?.get(u1) ?? 0;
      const net = gross1to2 - gross2to1;

      if (net > 0) {
        nettedPairwiseBalances.push({
          fromUserId: u1,
          toUserId: u2,
          amountMinor: net,
          currency: groupCurrency,
        });
      } else if (net < 0) {
        nettedPairwiseBalances.push({
          fromUserId: u2,
          toUserId: u1,
          amountMinor: Math.abs(net),
          currency: groupCurrency,
        });
      }
    }
  }

  // 4. Construct UserBalance for each user
  const balancesMap = new Map<string, UserBalance>();
  let totalNetCheck = 0;

  for (const userId of userList) {
    const userPairwise: PairwiseBalance[] = [];
    let totalOwed = 0;
    let totalOwedToYou = 0;

    for (const pb of nettedPairwiseBalances) {
      if (pb.fromUserId === userId) {
        totalOwed += pb.amountMinor;
        userPairwise.push(pb);
      } else if (pb.toUserId === userId) {
        totalOwedToYou += pb.amountMinor;
        userPairwise.push(pb);
      }
    }

    const netBalance = totalOwedToYou - totalOwed;
    totalNetCheck += netBalance;

    balancesMap.set(userId, {
      userId,
      totalOwed,
      totalOwedToYou,
      netBalance,
      pairwise: userPairwise,
    });
  }

  // Verification invariant: sum of all users' net positions must be 0
  if (Math.abs(totalNetCheck) !== 0) {
    console.warn(`Net balance sum invariant violated: sum is ${totalNetCheck}, expected 0`);
  }

  // 5. Compute simplified debts
  const simplifiedDebts = simplifyDebts(nettedPairwiseBalances, groupCurrency);

  const groupId = expenses[0]?.groupId ?? expenses[0]?.sourceId ?? '';

  return {
    groupId,
    currency: groupCurrency,
    balances: balancesMap,
    simplifiedDebts,
  };
}

/**
 * Calculates net pairwise balance between two specific users.
 *
 * @param userId1 First user ID.
 * @param userId2 Second user ID.
 * @param expenses List of expenses.
 * @param splits List of splits.
 * @param settlements List of settlements.
 * @param currency Currency code for the result (defaults to 'USD').
 * @returns PairwiseBalance indicating who owes whom and the net amount.
 */
export function calculatePairwiseBalance(
  userId1: string,
  userId2: string,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  currency = 'USD'
): PairwiseBalance {
  const activeExpenses = expenses.filter(
    (e) =>
      !e.deletedAt &&
      (e.paidBy === userId1 ||
        e.paidBy === userId2 ||
        e.participants.includes(userId1) ||
        e.participants.includes(userId2))
  );

  const activeSettlements = settlements.filter(
    (s) =>
      !s.deletedAt &&
      ((s.fromUserId === userId1 && s.toUserId === userId2) ||
        (s.fromUserId === userId2 && s.toUserId === userId1))
  );

  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();
  for (const split of splits) {
    const list = splitsByExpenseId.get(split.expenseId);
    if (list) {
      list.push(split);
    } else {
      splitsByExpenseId.set(split.expenseId, [split]);
    }
  }

  let debt1to2 = 0; // what userId1 owes userId2
  let debt2to1 = 0; // what userId2 owes userId1

  for (const expense of activeExpenses) {
    let expenseSplits = splitsByExpenseId.get(expense.id);
    if (!expenseSplits || expenseSplits.length === 0) {
      expenseSplits = calculateEqualSplit(
        expense.originalAmountMinor,
        expense.participants,
        expense.originalCurrency,
        expense.id
      );
    }

    if (expense.paidBy === userId2) {
      const split1 = expenseSplits.find((s) => s.userId === userId1);
      if (split1) {
        debt1to2 += split1.shareMinor;
      }
    } else if (expense.paidBy === userId1) {
      const split2 = expenseSplits.find((s) => s.userId === userId2);
      if (split2) {
        debt2to1 += split2.shareMinor;
      }
    }
  }

  for (const s of activeSettlements) {
    if (s.fromUserId === userId1 && s.toUserId === userId2) {
      // userId1 paid userId2, reducing debt1to2
      debt1to2 -= s.amountMinor;
    } else if (s.fromUserId === userId2 && s.toUserId === userId1) {
      // userId2 paid userId1, reducing debt2to1
      debt2to1 -= s.amountMinor;
    }
  }

  const net = debt1to2 - debt2to1;
  if (net >= 0) {
    return {
      fromUserId: userId1,
      toUserId: userId2,
      amountMinor: net,
      currency,
    };
  } else {
    return {
      fromUserId: userId2,
      toUserId: userId1,
      amountMinor: Math.abs(net),
      currency,
    };
  }
}

/**
 * Calculates aggregated balance information for a single user across all expenses and settlements.
 *
 * @param userId Target user ID.
 * @param allExpenses Array of all relevant expenses.
 * @param allSplits Array of all relevant splits.
 * @param allSettlements Array of all relevant settlements.
 * @param currency Currency code for reporting.
 * @returns UserBalance object.
 */
export function calculateUserBalances(
  userId: string,
  allExpenses: Expense[],
  allSplits: ExpenseSplit[],
  allSettlements: Settlement[],
  currency = 'USD'
): UserBalance {
  const activeExpenses = allExpenses.filter((e) => !e.deletedAt);
  const activeSettlements = allSettlements.filter((s) => !s.deletedAt);

  // Identify all counterparties
  const counterparties = new Set<string>();
  for (const e of activeExpenses) {
    if (e.paidBy === userId) {
      for (const p of e.participants) {
        if (p !== userId) counterparties.add(p);
      }
    } else if (e.participants.includes(userId)) {
      counterparties.add(e.paidBy);
    }
  }
  for (const s of activeSettlements) {
    if (s.fromUserId === userId) {
      counterparties.add(s.toUserId);
    } else if (s.toUserId === userId) {
      counterparties.add(s.fromUserId);
    }
  }

  const pairwise: PairwiseBalance[] = [];
  let totalOwed = 0;
  let totalOwedToYou = 0;

  for (const counterparty of counterparties) {
    const pb = calculatePairwiseBalance(
      userId,
      counterparty,
      activeExpenses,
      allSplits,
      activeSettlements,
      currency
    );
    if (pb.amountMinor > 0) {
      pairwise.push(pb);
      if (pb.fromUserId === userId) {
        totalOwed += pb.amountMinor;
      } else {
        totalOwedToYou += pb.amountMinor;
      }
    }
  }

  const netBalance = totalOwedToYou - totalOwed;

  return {
    userId,
    totalOwed,
    totalOwedToYou,
    netBalance,
    pairwise,
  };
}

/**
 * Simplifies a set of pairwise balances using a greedy minimum cash-flow algorithm.
 * Nets each participant's position, then repeatedly matches the largest debtor
 * with the largest creditor to minimize the total number of payments required.
 *
 * @param balances List of pairwise balances.
 * @param defaultCurrency Currency code to use if not specified on items.
 * @returns Reduced list of PairwiseBalance transactions.
 */
export function simplifyDebts(
  balances: PairwiseBalance[],
  defaultCurrency = 'USD'
): PairwiseBalance[] {
  if (!balances || balances.length === 0) {
    return [];
  }

  const currency = balances[0]?.currency ?? defaultCurrency;
  const netMap = new Map<string, number>();

  for (const b of balances) {
    if (b.amountMinor <= 0) continue;
    netMap.set(b.fromUserId, (netMap.get(b.fromUserId) ?? 0) - b.amountMinor);
    netMap.set(b.toUserId, (netMap.get(b.toUserId) ?? 0) + b.amountMinor);
  }

  interface UserNet {
    userId: string;
    amount: number;
  }

  const debtors: UserNet[] = [];
  const creditors: UserNet[] = [];

  for (const [userId, net] of netMap.entries()) {
    if (net < 0) {
      debtors.push({ userId, amount: -net });
    } else if (net > 0) {
      creditors.push({ userId, amount: net });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const simplified: PairwiseBalance[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];

    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0) {
      simplified.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountMinor: settleAmount,
        currency,
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;
    }

    if (debtor.amount === 0) {
      debtors.shift();
    } else {
      debtors.sort((a, b) => b.amount - a.amount);
    }

    if (creditor.amount === 0) {
      creditors.shift();
    } else {
      creditors.sort((a, b) => b.amount - a.amount);
    }
  }

  return simplified;
}

/**
 * Returns suggested settlements for a group by returning its simplified debts.
 *
 * @param groupBalances The calculated group balances.
 * @returns Array of PairwiseBalance representing the most efficient settlements.
 */
export function getSuggestedSettlements(groupBalances: GroupBalances): PairwiseBalance[] {
  return groupBalances.simplifiedDebts;
}
