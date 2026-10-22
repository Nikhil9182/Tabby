import type { Expense, ExpenseSplit, Settlement } from '../models/types';
import { calculateEqualSplit } from '../splits/split-calculator';
import {
  addToBag,
  bagCurrencies,
  bagSide,
  EMPTY_BAG,
  mergeBags,
  negateBag,
  normalizeCurrency,
  type MoneyBag,
} from '../money/conversion';

/*
 * Currency policy (ARCHITECTURE.md §8.1): the ledger is kept per transaction
 * currency. Amounts in different currencies are never added together here;
 * conversion for display happens later, in the UI layer, from MoneyBags.
 */

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
  /** Total amount this user owes to other users, in the result's primary currency. */
  totalOwed: number;
  /** Total amount other users owe to this user, in the result's primary currency. */
  totalOwedToYou: number;
  /** Net position in the primary currency: totalOwedToYou - totalOwed. */
  netBalance: number;
  /** Pairwise balances involving this user (every currency; each carries its own). */
  pairwise: PairwiseBalance[];
  /** Net position per currency. Positive = owed to this user. */
  netByCurrency: MoneyBag;
}

/**
 * Comprehensive balance state for an entire group.
 */
export interface GroupBalances {
  /** The group ID. */
  groupId: string;
  /** Group currency (primary currency for the scalar fields). */
  currency: string;
  /** Map of user ID to their detailed UserBalance. */
  balances: Map<string, UserBalance>;
  /** Minimal settlements, computed separately within each currency. */
  simplifiedDebts: PairwiseBalance[];
  /** Every currency with non-zero activity in this group. */
  currencies: string[];
}

/** The amount and currency a settlement reduces in the ledger. */
export function settlementLedgerAmount(settlement: Settlement): { currency: string; amountMinor: number } {
  if (settlement.appliedCurrency && settlement.appliedAmountMinor && settlement.appliedAmountMinor > 0) {
    return { currency: normalizeCurrency(settlement.appliedCurrency), amountMinor: settlement.appliedAmountMinor };
  }
  return { currency: normalizeCurrency(settlement.currency), amountMinor: settlement.amountMinor };
}

function expenseCurrency(expense: Expense): string {
  return normalizeCurrency(expense.originalCurrency || expense.currency || 'USD');
}

function indexSplits(splits: ExpenseSplit[]): Map<string, ExpenseSplit[]> {
  const byExpense = new Map<string, ExpenseSplit[]>();
  for (const split of splits) {
    const list = byExpense.get(split.expenseId);
    if (list) {
      list.push(split);
    } else {
      byExpense.set(split.expenseId, [split]);
    }
  }
  return byExpense;
}

function splitsFor(expense: Expense, byExpense: Map<string, ExpenseSplit[]>): ExpenseSplit[] {
  const found = byExpense.get(expense.id);
  if (found && found.length > 0) return found;
  // Fallback: equal split among participants
  return calculateEqualSplit(expense.originalAmountMinor, expense.participants, expense.originalCurrency, expense.id);
}

/** Sums the positive pairwise entries for a user in one currency. */
function scalarTotals(userId: string, pairwise: PairwiseBalance[], currency: string) {
  let totalOwed = 0;
  let totalOwedToYou = 0;
  for (const pb of pairwise) {
    if (pb.currency !== currency) continue;
    if (pb.fromUserId === userId) totalOwed += pb.amountMinor;
    else if (pb.toUserId === userId) totalOwedToYou += pb.amountMinor;
  }
  return { totalOwed, totalOwedToYou, netBalance: totalOwedToYou - totalOwed };
}

/**
 * Nets all debts inside ONE currency. Every expense and settlement passed in
 * must already be in `currency`.
 */
function nettedPairwiseInCurrency(
  expenses: Expense[],
  splitsByExpense: Map<string, ExpenseSplit[]>,
  settlements: Settlement[],
  currency: string
): { pairwise: PairwiseBalance[]; userIds: Set<string> } {
  const userIds = new Set<string>();
  // debtMatrix[debtor][creditor] = gross amount owed
  const debtMatrix = new Map<string, Map<string, number>>();

  function addDebt(debtor: string, creditor: string, amount: number) {
    if (debtor === creditor || amount === 0) return;
    userIds.add(debtor);
    userIds.add(creditor);
    let creditorMap = debtMatrix.get(debtor);
    if (!creditorMap) {
      creditorMap = new Map<string, number>();
      debtMatrix.set(debtor, creditorMap);
    }
    creditorMap.set(creditor, (creditorMap.get(creditor) ?? 0) + amount);
  }

  for (const expense of expenses) {
    userIds.add(expense.paidBy);
    for (const participantId of expense.participants) userIds.add(participantId);
    for (const split of splitsFor(expense, splitsByExpense)) {
      // Participant owes payer their split share
      if (split.userId !== expense.paidBy) addDebt(split.userId, expense.paidBy, split.shareMinor);
    }
  }

  for (const settlement of settlements) {
    userIds.add(settlement.fromUserId);
    userIds.add(settlement.toUserId);
    // Payer (fromUserId) paid recipient (toUserId), which offsets debt from payer to recipient
    addDebt(settlement.fromUserId, settlement.toUserId, -settlementLedgerAmount(settlement).amountMinor);
  }

  const users = Array.from(userIds);
  const pairwise: PairwiseBalance[] = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const u1 = users[i];
      const u2 = users[j];
      const net = (debtMatrix.get(u1)?.get(u2) ?? 0) - (debtMatrix.get(u2)?.get(u1) ?? 0);
      if (net > 0) {
        pairwise.push({ fromUserId: u1, toUserId: u2, amountMinor: net, currency });
      } else if (net < 0) {
        pairwise.push({ fromUserId: u2, toUserId: u1, amountMinor: -net, currency });
      }
    }
  }
  return { pairwise, userIds };
}

/**
 * Calculates comprehensive group balances, netting pairwise debts and computing
 * simplified settlements. Each currency is netted and simplified on its own.
 *
 * @param expenses Array of group expenses.
 * @param splits Array of expense splits.
 * @param settlements Array of group settlements.
 * @param groupCurrency The group's primary currency (used for the scalar fields).
 */
export function calculateGroupBalances(
  expensesOrGroupId: Expense[] | string,
  splitsOrExpenses: ExpenseSplit[] | Expense[],
  settlementsOrSplits: Settlement[] | ExpenseSplit[],
  currencyOrSettlements: string | Settlement[],
  maybeCurrency?: string
): GroupBalances {
  let targetGroupId: string | undefined;
  let expenses: Expense[];
  let splits: ExpenseSplit[];
  let settlements: Settlement[];
  let groupCurrency: string;

  if (typeof expensesOrGroupId === 'string') {
    targetGroupId = expensesOrGroupId;
    expenses = (splitsOrExpenses as Expense[]) || [];
    splits = (settlementsOrSplits as ExpenseSplit[]) || [];
    settlements = (currencyOrSettlements as Settlement[]) || [];
    groupCurrency = maybeCurrency || 'USD';
  } else {
    expenses = expensesOrGroupId || [];
    splits = (splitsOrExpenses as ExpenseSplit[]) || [];
    settlements = (settlementsOrSplits as Settlement[]) || [];
    groupCurrency = (currencyOrSettlements as string) || 'USD';
    targetGroupId = expenses.find((e) => e.groupId)?.groupId;
  }
  groupCurrency = normalizeCurrency(groupCurrency);

  // Strictly filter to the target group if specified, excluding any direct expenses
  const activeExpenses = expenses.filter(
    (e) => !e.deletedAt && (!targetGroupId || e.groupId === targetGroupId) && e.contextType !== 'direct'
  );
  const activeSettlements = settlements.filter(
    (s) => !s.deletedAt && (!targetGroupId || s.groupId === targetGroupId) && s.contextType !== 'direct'
  );

  const splitsByExpense = indexSplits(splits);

  // Partition by ledger currency
  const currencySet = new Set<string>();
  activeExpenses.forEach((e) => currencySet.add(expenseCurrency(e)));
  activeSettlements.forEach((s) => currencySet.add(settlementLedgerAmount(s).currency));

  const allUserIds = new Set<string>();
  const allPairwise: PairwiseBalance[] = [];
  const simplifiedDebts: PairwiseBalance[] = [];

  for (const currency of Array.from(currencySet).sort()) {
    const { pairwise, userIds } = nettedPairwiseInCurrency(
      activeExpenses.filter((e) => expenseCurrency(e) === currency),
      splitsByExpense,
      activeSettlements.filter((s) => settlementLedgerAmount(s).currency === currency),
      currency
    );
    userIds.forEach((id) => allUserIds.add(id));
    allPairwise.push(...pairwise);
    simplifiedDebts.push(...simplifyDebts(pairwise, currency));
  }

  // Construct UserBalance for each user
  const balancesMap = new Map<string, UserBalance>();
  for (const userId of allUserIds) {
    const userPairwise = allPairwise.filter((pb) => pb.fromUserId === userId || pb.toUserId === userId);
    let netByCurrency: MoneyBag = EMPTY_BAG;
    for (const pb of userPairwise) {
      netByCurrency = addToBag(netByCurrency, pb.currency, pb.toUserId === userId ? pb.amountMinor : -pb.amountMinor);
    }
    balancesMap.set(userId, {
      userId,
      ...scalarTotals(userId, userPairwise, groupCurrency),
      pairwise: userPairwise,
      netByCurrency,
    });
  }

  // Verification invariant: within every currency, net positions sum to 0
  for (const currency of currencySet) {
    let sum = 0;
    balancesMap.forEach((b) => (sum += b.netByCurrency[currency] ?? 0));
    if (sum !== 0) {
      console.warn(`Net balance invariant violated in ${currency}: sum is ${sum}, expected 0`);
    }
  }

  const groupId = expenses[0]?.groupId ?? expenses[0]?.sourceId ?? '';

  return {
    groupId,
    currency: groupCurrency,
    balances: balancesMap,
    simplifiedDebts,
    currencies: Array.from(currencySet).sort(),
  };
}

/**
 * What userId1 owes userId2, per currency. Positive = userId1 owes userId2.
 */
export function calculatePairwiseBalanceBag(
  userId1: string,
  userId2: string,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[]
): MoneyBag {
  const splitsByExpense = indexSplits(splits);
  let bag: MoneyBag = EMPTY_BAG;

  for (const expense of expenses) {
    if (expense.deletedAt) continue;
    const currency = expenseCurrency(expense);
    const expenseSplits = splitsFor(expense, splitsByExpense);
    if (expense.paidBy === userId2) {
      const share = expenseSplits.find((s) => s.userId === userId1)?.shareMinor ?? 0;
      bag = addToBag(bag, currency, share);
    } else if (expense.paidBy === userId1) {
      const share = expenseSplits.find((s) => s.userId === userId2)?.shareMinor ?? 0;
      bag = addToBag(bag, currency, -share);
    }
  }

  for (const s of settlements) {
    if (s.deletedAt) continue;
    const { currency, amountMinor } = settlementLedgerAmount(s);
    if (s.fromUserId === userId1 && s.toUserId === userId2) {
      // userId1 paid userId2, reducing what userId1 owes
      bag = addToBag(bag, currency, -amountMinor);
    } else if (s.fromUserId === userId2 && s.toUserId === userId1) {
      bag = addToBag(bag, currency, amountMinor);
    }
  }

  return bag;
}

/** Turns a signed bag (positive = u1 owes u2) into one PairwiseBalance per currency. */
function bagToPairwise(userId1: string, userId2: string, bag: MoneyBag): PairwiseBalance[] {
  return bagCurrencies(bag).map((currency) => {
    const amount = bag[currency];
    return amount > 0
      ? { fromUserId: userId1, toUserId: userId2, amountMinor: amount, currency }
      : { fromUserId: userId2, toUserId: userId1, amountMinor: -amount, currency };
  });
}

/**
 * Calculates net pairwise balance between two specific users in ONE currency.
 * When the activity is all in one currency that currency is used (and labelled
 * correctly); otherwise only the `currency` bucket is returned. Use
 * calculatePairwiseBalanceBag for the full multi-currency picture.
 */
export function calculatePairwiseBalance(
  userId1: string,
  userId2: string,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  currency = 'USD'
): PairwiseBalance {
  const relevantExpenses = expenses.filter(
    (e) =>
      e.paidBy === userId1 ||
      e.paidBy === userId2 ||
      e.participants.includes(userId1) ||
      e.participants.includes(userId2)
  );
  const relevantSettlements = settlements.filter(
    (s) =>
      (s.fromUserId === userId1 && s.toUserId === userId2) ||
      (s.fromUserId === userId2 && s.toUserId === userId1)
  );
  const bag = calculatePairwiseBalanceBag(userId1, userId2, relevantExpenses, splits, relevantSettlements);
  const present = bagCurrencies(bag);
  const target = present.length === 1 ? present[0] : normalizeCurrency(currency);
  const net = bag[target] ?? 0;

  return net >= 0
    ? { fromUserId: userId1, toUserId: userId2, amountMinor: net, currency: target }
    : { fromUserId: userId2, toUserId: userId1, amountMinor: -net, currency: target };
}

/**
 * Calculates aggregated balance information for a single user across all expenses and settlements.
 *
 * @param currency Primary currency for the scalar fields; netByCurrency holds every currency.
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
    if (s.fromUserId === userId) counterparties.add(s.toUserId);
    else if (s.toUserId === userId) counterparties.add(s.fromUserId);
  }

  const pairwise: PairwiseBalance[] = [];
  let netByCurrency: MoneyBag = EMPTY_BAG;

  for (const counterparty of counterparties) {
    const owedByUser = calculatePairwiseBalanceBag(userId, counterparty, activeExpenses, allSplits, activeSettlements);
    pairwise.push(...bagToPairwise(userId, counterparty, owedByUser));
    netByCurrency = mergeBags(netByCurrency, negateBag(owedByUser));
  }

  // Single-currency activity reports in that currency; otherwise the requested one
  const present = bagCurrencies(netByCurrency);
  const primary = present.length === 1 ? present[0] : normalizeCurrency(currency);

  return {
    userId,
    ...scalarTotals(userId, pairwise, primary),
    pairwise,
    netByCurrency,
  };
}

/**
 * Simplifies a set of pairwise balances using a greedy minimum cash-flow algorithm.
 * All balances must be in the same currency; pass one currency at a time.
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
  if (balances.some((b) => b.currency !== currency)) {
    // Never net across currencies: simplify each one separately
    const byCurrency = new Map<string, PairwiseBalance[]>();
    for (const b of balances) byCurrency.set(b.currency, [...(byCurrency.get(b.currency) ?? []), b]);
    return Array.from(byCurrency.entries()).flatMap(([cur, list]) => simplifyDebts(list, cur));
  }

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

function directBetween(userAId: string, userBId: string, expenses: Expense[], settlements: Settlement[]) {
  // Only include active DIRECT expenses between userA and userB
  const directExpenses = expenses.filter(
    (e) =>
      !e.deletedAt &&
      (e.contextType === 'direct' || (!e.groupId && e.sourceType !== 'group')) &&
      ((e.paidBy === userAId && e.participants.includes(userBId)) ||
        (e.paidBy === userBId && e.participants.includes(userAId)) ||
        (e.participants.includes(userAId) && e.participants.includes(userBId)))
  );

  // Only include active DIRECT settlements between userA and userB
  const directSettlements = settlements.filter(
    (s) =>
      !s.deletedAt &&
      (s.contextType === 'direct' || !s.groupId) &&
      ((s.fromUserId === userAId && s.toUserId === userBId) ||
        (s.fromUserId === userBId && s.toUserId === userAId))
  );

  return { directExpenses, directSettlements };
}

/**
 * Direct (non-group) balance between two friends, per currency, from userA's
 * side: positive = userB owes userA, negative = userA owes userB.
 */
export function calculateDirectFriendBalanceBag(
  userAId: string,
  userBId: string,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[]
): MoneyBag {
  const { directExpenses, directSettlements } = directBetween(userAId, userBId, expenses, settlements);
  return negateBag(calculatePairwiseBalanceBag(userAId, userBId, directExpenses, splits, directSettlements));
}

/**
 * Calculates the net direct balance strictly between two friends, in one currency.
 * Group expenses and group settlements are explicitly excluded.
 * Prefer calculateDirectFriendBalanceBag when currencies may be mixed.
 */
export function calculateDirectFriendBalance(
  userAId: string,
  userBId: string,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  currency = 'USD'
): PairwiseBalance {
  const { directExpenses, directSettlements } = directBetween(userAId, userBId, expenses, settlements);
  return calculatePairwiseBalance(userAId, userBId, directExpenses, splits, directSettlements, currency);
}

export interface DashboardBalances {
  direct: {
    totalOwed: number;
    totalOwedToYou: number;
    netBalance: number;
    pairwise: PairwiseBalance[];
    /** Net per currency; positive = owed to you. */
    netByCurrency: MoneyBag;
    owedByCurrency: MoneyBag;
    owedToYouByCurrency: MoneyBag;
    /** Per friend, per currency; positive = the friend owes you. */
    byFriend: Array<{ friendId: string; netByCurrency: MoneyBag }>;
  };
  groups: {
    totalOwed: number;
    totalOwedToYou: number;
    netBalance: number;
    netByCurrency: MoneyBag;
    owedByCurrency: MoneyBag;
    owedToYouByCurrency: MoneyBag;
    byGroup: Array<{
      groupId: string;
      groupName: string;
      netBalance: number;
      totalOwed: number;
      totalOwedToYou: number;
      currency: string;
      netByCurrency: MoneyBag;
    }>;
  };
  overall: {
    totalOwed: number;
    totalOwedToYou: number;
    netBalance: number;
    currency: string;
    netByCurrency: MoneyBag;
    owedByCurrency: MoneyBag;
    owedToYouByCurrency: MoneyBag;
  };
}

/**
 * Aggregates user balances across independent direct friend tracking and group tracking.
 * Guarantees zero double-counting because direct and group contexts are disjoint.
 * Totals are kept per currency (the *ByCurrency bags); the scalar fields hold only
 * the `defaultCurrency` bucket and exist for single-currency callers.
 */
export function calculateDashboardBalances(
  currentUserId: string,
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  friendIds: string[],
  groups: Array<{ id: string; name: string; currency?: string }>,
  defaultCurrency = 'USD'
): DashboardBalances {
  const primary = normalizeCurrency(defaultCurrency);
  const owedSide = (bag: MoneyBag) => negateBag(bagSide(bag, 'negative'));

  // 1. Direct Balances with Friends
  const directPairwise: PairwiseBalance[] = [];
  const byFriend: DashboardBalances['direct']['byFriend'] = [];
  let directOwed: MoneyBag = EMPTY_BAG;
  let directOwedToYou: MoneyBag = EMPTY_BAG;

  for (const friendId of friendIds) {
    if (friendId === currentUserId) continue;
    const net = calculateDirectFriendBalanceBag(currentUserId, friendId, expenses, splits, settlements);
    if (bagCurrencies(net).length === 0) continue;
    byFriend.push({ friendId, netByCurrency: net });
    directPairwise.push(...bagToPairwise(friendId, currentUserId, net));
    // Per friend, owed and owed-to-you are kept apart (not netted across friends)
    directOwed = mergeBags(directOwed, owedSide(net));
    directOwedToYou = mergeBags(directOwedToYou, bagSide(net, 'positive'));
  }

  // 2. Group Balances
  let groupsOwed: MoneyBag = EMPTY_BAG;
  let groupsOwedToYou: MoneyBag = EMPTY_BAG;
  const byGroup: DashboardBalances['groups']['byGroup'] = [];

  for (const group of groups) {
    const groupCurr = normalizeCurrency(group.currency || primary);
    const groupExpenses = expenses.filter((e) => !e.deletedAt && e.groupId === group.id && e.contextType !== 'direct');
    const groupSettlements = settlements.filter((s) => !s.deletedAt && s.groupId === group.id && s.contextType !== 'direct');

    const gb = calculateGroupBalances(group.id, groupExpenses, splits, groupSettlements, groupCurr);
    const userBal = gb.balances.get(currentUserId);
    const net = userBal?.netByCurrency ?? EMPTY_BAG;

    // Within a group a user is net creditor or debtor per currency
    groupsOwed = mergeBags(groupsOwed, owedSide(net));
    groupsOwedToYou = mergeBags(groupsOwedToYou, bagSide(net, 'positive'));

    byGroup.push({
      groupId: group.id,
      groupName: group.name,
      netBalance: userBal?.netBalance ?? 0,
      totalOwed: userBal?.totalOwed ?? 0,
      totalOwedToYou: userBal?.totalOwedToYou ?? 0,
      currency: groupCurr,
      netByCurrency: net,
    });
  }

  const directNet = mergeBags(directOwedToYou, negateBag(directOwed));
  const groupsNet = mergeBags(groupsOwedToYou, negateBag(groupsOwed));
  const overallOwed = mergeBags(directOwed, groupsOwed);
  const overallOwedToYou = mergeBags(directOwedToYou, groupsOwedToYou);
  const at = (bag: MoneyBag) => bag[primary] ?? 0;

  return {
    direct: {
      totalOwed: at(directOwed),
      totalOwedToYou: at(directOwedToYou),
      netBalance: at(directNet),
      pairwise: directPairwise,
      netByCurrency: directNet,
      owedByCurrency: directOwed,
      owedToYouByCurrency: directOwedToYou,
      byFriend,
    },
    groups: {
      totalOwed: at(groupsOwed),
      totalOwedToYou: at(groupsOwedToYou),
      netBalance: at(groupsNet),
      netByCurrency: groupsNet,
      owedByCurrency: groupsOwed,
      owedToYouByCurrency: groupsOwedToYou,
      byGroup,
    },
    overall: {
      totalOwed: at(overallOwed),
      totalOwedToYou: at(overallOwedToYou),
      netBalance: at(overallOwedToYou) - at(overallOwed),
      currency: primary,
      netByCurrency: mergeBags(overallOwedToYou, negateBag(overallOwed)),
      owedByCurrency: overallOwed,
      owedToYouByCurrency: overallOwedToYou,
    },
  };
}
