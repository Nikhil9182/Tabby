import { describe, it, expect } from 'vitest';
import type { Expense, ExpenseSplit, Settlement } from '../models/types';
import {
  calculateGroupBalances,
  calculatePairwiseBalance,
  calculateUserBalances,
  simplifyDebts,
  type PairwiseBalance,
} from '../balances/balance-engine';
import { calculateEqualSplit } from '../splits/split-calculator';
import { createSettlement } from '../settlements/settlement-engine';

describe('Balance Engine (src/domain/balances/balance-engine.ts)', () => {
  describe('Simple 2-person balance', () => {
    it('computes balance where one person pays for both', () => {
      const exp: Expense = {
        id: 'e1',
        description: 'Lunch',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'alice',
        originalAmountMinor: 10000, // $100.00
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const splits = calculateEqualSplit(10000, ['alice', 'bob'], 'USD', 'e1');

      const balances = calculateGroupBalances([exp], splits, [], 'USD');

      const alice = balances.balances.get('alice');
      const bob = balances.balances.get('bob');

      expect(alice?.netBalance).toBe(5000);
      expect(alice?.totalOwed).toBe(0);
      expect(alice?.totalOwedToYou).toBe(5000);

      expect(bob?.netBalance).toBe(-5000);
      expect(bob?.totalOwed).toBe(5000);
      expect(bob?.totalOwedToYou).toBe(0);

      expect(balances.simplifiedDebts).toHaveLength(1);
      expect(balances.simplifiedDebts[0]).toEqual({
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 5000,
        currency: 'USD',
      });
    });
  });

  describe('3-person group with multiple expenses', () => {
    it('computes group balances correctly across multiple expenses', () => {
      // Exp 1: Alice pays $60 (6000 minor) for Alice, Bob, Charlie ($20 each)
      const exp1: Expense = {
        id: 'e1',
        sourceType: 'group',
        sourceId: 'g1',
        groupId: 'g1',
        description: 'Groceries',
        paidBy: 'alice',
        originalAmountMinor: 6000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob', 'charlie'],
        expenseDate: '2026-10-18T10:00:00.000Z',
        createdAt: '2026-10-18T10:00:00.000Z',
        updatedAt: '2026-10-18T10:00:00.000Z',
      };
      const splits1 = calculateEqualSplit(6000, ['alice', 'bob', 'charlie'], 'USD', 'e1');

      // Exp 2: Bob pays $90 (9000 minor) for Alice, Bob, Charlie ($30 each)
      const exp2: Expense = {
        id: 'e2',
        sourceType: 'group',
        sourceId: 'g1',
        groupId: 'g1',
        description: 'Dinner',
        paidBy: 'bob',
        originalAmountMinor: 9000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob', 'charlie'],
        expenseDate: '2026-10-19T20:00:00.000Z',
        createdAt: '2026-10-19T20:00:00.000Z',
        updatedAt: '2026-10-19T20:00:00.000Z',
      };
      const splits2 = calculateEqualSplit(9000, ['alice', 'bob', 'charlie'], 'USD', 'e2');

      const allExpenses = [exp1, exp2];
      const allSplits = [...splits1, ...splits2];

      const balances = calculateGroupBalances(allExpenses, allSplits, [], 'USD');

      // After exp1: Alice +4000, Bob -2000, Charlie -2000
      // After exp2:
      //   Alice owes Bob 3000 -> Alice net = 4000 - 3000 = +1000
      //   Bob is owed 6000 - 2000 = +4000
      //   Charlie owes Alice 2000 + Bob 3000 = -5000
      expect(balances.balances.get('alice')?.netBalance).toBe(1000);
      expect(balances.balances.get('bob')?.netBalance).toBe(4000);
      expect(balances.balances.get('charlie')?.netBalance).toBe(-5000);

      // Invariant: sum of net balances is 0
      const sumNet =
        (balances.balances.get('alice')?.netBalance ?? 0) +
        (balances.balances.get('bob')?.netBalance ?? 0) +
        (balances.balances.get('charlie')?.netBalance ?? 0);
      expect(sumNet).toBe(0);

      // Charlie pays Bob 4000 and Alice 1000
      expect(balances.simplifiedDebts).toHaveLength(2);
      expect(balances.simplifiedDebts).toContainEqual({
        fromUserId: 'charlie',
        toUserId: 'bob',
        amountMinor: 4000,
        currency: 'USD',
      });
      expect(balances.simplifiedDebts).toContainEqual({
        fromUserId: 'charlie',
        toUserId: 'alice',
        amountMinor: 1000,
        currency: 'USD',
      });
    });
  });

  describe('Multiple payers in same group', () => {
    it('accurately resolves debts when all members pay for various subsets', () => {
      // Alice pays 3000 for Alice and Bob (1500 each)
      const e1: Expense = {
        id: 'e1',
        description: 'Breakfast',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'alice',
        originalAmountMinor: 3000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'],
        expenseDate: '2026-10-18T10:00:00.000Z',
        createdAt: '2026-10-18T10:00:00.000Z',
        updatedAt: '2026-10-18T10:00:00.000Z',
      };
      const s1 = calculateEqualSplit(3000, ['alice', 'bob'], 'USD', 'e1');

      // Bob pays 6000 for Bob and Charlie (3000 each)
      const e2: Expense = {
        id: 'e2',
        description: 'Groceries',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'bob',
        originalAmountMinor: 6000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['bob', 'charlie'],
        expenseDate: '2026-10-19T10:00:00.000Z',
        createdAt: '2026-10-19T10:00:00.000Z',
        updatedAt: '2026-10-19T10:00:00.000Z',
      };
      const s2 = calculateEqualSplit(6000, ['bob', 'charlie'], 'USD', 'e2');

      // Charlie pays 9000 for Alice, Bob, Charlie (3000 each)
      const e3: Expense = {
        id: 'e3',
        description: 'Dinner',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'charlie',
        originalAmountMinor: 9000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob', 'charlie'],
        expenseDate: '2026-10-20T10:00:00.000Z',
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-20T10:00:00.000Z',
      };
      const s3 = calculateEqualSplit(9000, ['alice', 'bob', 'charlie'], 'USD', 'e3');

      const balances = calculateGroupBalances(
        [e1, e2, e3],
        [...s1, ...s2, ...s3],
        [],
        'USD'
      );

      // Alice: +1500 (from e1) - 3000 (from e3) = -1500
      // Bob: -1500 (from e1) + 3000 (from e2) - 3000 (from e3) = -1500
      // Charlie: -3000 (from e2) + 6000 (from e3) = +3000
      expect(balances.balances.get('alice')?.netBalance).toBe(-1500);
      expect(balances.balances.get('bob')?.netBalance).toBe(-1500);
      expect(balances.balances.get('charlie')?.netBalance).toBe(3000);

      // Invariant
      const netSum =
        (balances.balances.get('alice')?.netBalance ?? 0) +
        (balances.balances.get('bob')?.netBalance ?? 0) +
        (balances.balances.get('charlie')?.netBalance ?? 0);
      expect(netSum).toBe(0);

      expect(balances.simplifiedDebts).toHaveLength(2);
      expect(balances.simplifiedDebts).toContainEqual({
        fromUserId: 'alice',
        toUserId: 'charlie',
        amountMinor: 1500,
        currency: 'USD',
      });
      expect(balances.simplifiedDebts).toContainEqual({
        fromUserId: 'bob',
        toUserId: 'charlie',
        amountMinor: 1500,
        currency: 'USD',
      });
    });
  });

  describe('Expense where payer is NOT a participant', () => {
    it('properly attributes debt when payer is outside the participants list', () => {
      // David pays $100 (10000 minor) for Alice and Bob ($50 each). David did not participate!
      const exp: Expense = {
        id: 'e1',
        sourceType: 'group',
        sourceId: 'g1',
        description: 'Concert tickets purchased by David',
        paidBy: 'david',
        originalAmountMinor: 10000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'], // David not in participants!
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const splits = calculateEqualSplit(10000, ['alice', 'bob'], 'USD', 'e1');

      const balances = calculateGroupBalances([exp], splits, [], 'USD');

      const david = balances.balances.get('david');
      const alice = balances.balances.get('alice');
      const bob = balances.balances.get('bob');

      expect(david).toBeDefined();
      expect(david?.totalOwed).toBe(0);
      expect(david?.totalOwedToYou).toBe(10000);
      expect(david?.netBalance).toBe(10000);

      expect(alice?.totalOwed).toBe(5000);
      expect(alice?.netBalance).toBe(-5000);

      expect(bob?.totalOwed).toBe(5000);
      expect(bob?.netBalance).toBe(-5000);

      expect(david!.netBalance + alice!.netBalance + bob!.netBalance).toBe(0);

      expect(balances.simplifiedDebts).toHaveLength(2);
      expect(balances.simplifiedDebts).toContainEqual({
        fromUserId: 'alice',
        toUserId: 'david',
        amountMinor: 5000,
        currency: 'USD',
      });
      expect(balances.simplifiedDebts).toContainEqual({
        fromUserId: 'bob',
        toUserId: 'david',
        amountMinor: 5000,
        currency: 'USD',
      });
    });
  });

  describe('Settlement reduces balance correctly', () => {
    it('fully cancels out debt upon settlement', () => {
      const exp: Expense = {
        id: 'e1',
        description: 'Dinner',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'alice',
        originalAmountMinor: 4000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const splits = calculateEqualSplit(4000, ['alice', 'bob'], 'USD', 'e1');

      const { settlement } = createSettlement({
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 2000,
        currency: 'USD',
        settlementDate: '2026-10-20T13:00:00.000Z',
        createdBy: 'bob',
      });

      const balances = calculateGroupBalances([exp], splits, [settlement], 'USD');
      expect(balances.balances.get('alice')?.netBalance).toBe(0);
      expect(balances.balances.get('bob')?.netBalance).toBe(0);
      expect(balances.simplifiedDebts).toHaveLength(0);
    });
  });

  describe('Multiple settlements & Partial settlements', () => {
    it('applies partial settlement leaving correct remaining balance', () => {
      const exp: Expense = {
        id: 'e1',
        description: 'Dinner',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'alice',
        originalAmountMinor: 10000, // Bob owes 5000
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const splits = calculateEqualSplit(10000, ['alice', 'bob'], 'USD', 'e1');

      // Partial settlement of $35.00 (3500 minor)
      const { settlement: partialSettle } = createSettlement({
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 3500,
        currency: 'USD',
        settlementDate: '2026-10-20T13:00:00.000Z',
        createdBy: 'bob',
      });

      const balances = calculateGroupBalances([exp], splits, [partialSettle], 'USD');
      // Bob originally owed 5000, paid 3500 -> owes 1500
      expect(balances.balances.get('bob')?.netBalance).toBe(-1500);
      expect(balances.balances.get('alice')?.netBalance).toBe(1500);
      expect(balances.simplifiedDebts[0]).toEqual({
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 1500,
        currency: 'USD',
      });
    });

    it('applies multiple settlements sequentially to clear debt', () => {
      const exp: Expense = {
        id: 'e1',
        description: 'Dinner',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'alice',
        originalAmountMinor: 10000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const splits = calculateEqualSplit(10000, ['alice', 'bob'], 'USD', 'e1');

      const { settlement: s1 } = createSettlement({
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 2000,
        currency: 'USD',
        settlementDate: '2026-10-20T13:00:00.000Z',
        createdBy: 'bob',
      });

      const { settlement: s2 } = createSettlement({
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 3000,
        currency: 'USD',
        settlementDate: '2026-10-20T14:00:00.000Z',
        createdBy: 'bob',
      });

      const balances = calculateGroupBalances([exp], splits, [s1, s2], 'USD');
      expect(balances.balances.get('alice')?.netBalance).toBe(0);
      expect(balances.balances.get('bob')?.netBalance).toBe(0);
      expect(balances.simplifiedDebts).toHaveLength(0);
    });
  });

  describe('Balance after all debts settled is zero', () => {
    it('results in zero net balances and empty simplified debts across all members', () => {
      const exp1: Expense = {
        id: 'e1',
        sourceType: 'group',
        sourceId: 'g1',
        description: 'Trip expenses',
        paidBy: 'u1',
        originalAmountMinor: 3000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['u1', 'u2', 'u3'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const splits1 = calculateEqualSplit(3000, ['u1', 'u2', 'u3'], 'USD', 'e1');

      // Before settlement: u2 owes u1 1000, u3 owes u1 1000
      const initial = calculateGroupBalances([exp1], splits1, [], 'USD');
      const suggested = initial.simplifiedDebts;
      expect(suggested).toHaveLength(2);

      // Create settlement for every suggested transaction
      const settlements: Settlement[] = suggested.map((debt) =>
        createSettlement({
          fromUserId: debt.fromUserId,
          toUserId: debt.toUserId,
          amountMinor: debt.amountMinor,
          currency: debt.currency,
          settlementDate: '2026-10-20T13:00:00.000Z',
          createdBy: debt.fromUserId,
        }).settlement
      );

      const final = calculateGroupBalances([exp1], splits1, settlements, 'USD');
      for (const [, userBal] of final.balances.entries()) {
        expect(userBal.netBalance).toBe(0);
        expect(userBal.totalOwed).toBe(0);
        expect(userBal.totalOwedToYou).toBe(0);
      }
      expect(final.simplifiedDebts).toHaveLength(0);
    });
  });

  describe('simplifyDebts', () => {
    it('simplifies 3-person circular debt completely (A -> B -> C -> A)', () => {
      // A owes B $50, B owes C $50, C owes A $50
      const circular: PairwiseBalance[] = [
        { fromUserId: 'A', toUserId: 'B', amountMinor: 5000, currency: 'USD' },
        { fromUserId: 'B', toUserId: 'C', amountMinor: 5000, currency: 'USD' },
        { fromUserId: 'C', toUserId: 'A', amountMinor: 5000, currency: 'USD' },
      ];

      const simplified = simplifyDebts(circular, 'USD');
      expect(simplified).toHaveLength(0); // Perfect cancellation!
    });

    it('simplifies 4-person debt chain to a single transaction (A -> B -> C -> D)', () => {
      // A owes B 100, B owes C 100, C owes D 100
      // Net: A is -100, B is 0, C is 0, D is +100
      const chain: PairwiseBalance[] = [
        { fromUserId: 'A', toUserId: 'B', amountMinor: 10000, currency: 'USD' },
        { fromUserId: 'B', toUserId: 'C', amountMinor: 10000, currency: 'USD' },
        { fromUserId: 'C', toUserId: 'D', amountMinor: 10000, currency: 'USD' },
      ];

      const simplified = simplifyDebts(chain, 'USD');
      // Instead of 3 transactions, only 1 transaction is needed: A pays D 100
      expect(simplified).toHaveLength(1);
      expect(simplified[0]).toEqual({
        fromUserId: 'A',
        toUserId: 'D',
        amountMinor: 10000,
        currency: 'USD',
      });
    });

    it('simplifies complex 4-person branching debts efficiently', () => {
      // A owes B 30, A owes C 20, B owes D 40, C owes D 10
      // Net positions:
      // A: -50
      // B: +30 - 40 = -10
      // C: +20 - 10 = +10
      // D: +40 + 10 = +50
      const debts: PairwiseBalance[] = [
        { fromUserId: 'A', toUserId: 'B', amountMinor: 3000, currency: 'USD' },
        { fromUserId: 'A', toUserId: 'C', amountMinor: 2000, currency: 'USD' },
        { fromUserId: 'B', toUserId: 'D', amountMinor: 4000, currency: 'USD' },
        { fromUserId: 'C', toUserId: 'D', amountMinor: 1000, currency: 'USD' },
      ];

      const simplified = simplifyDebts(debts, 'USD');
      // Total transactions reduced from 4 to 2:
      // A (-50) -> D (+50) settles 50
      // B (-10) -> C (+10) settles 10
      expect(simplified).toHaveLength(2);
      expect(simplified).toContainEqual({
        fromUserId: 'A',
        toUserId: 'D',
        amountMinor: 5000,
        currency: 'USD',
      });
      expect(simplified).toContainEqual({
        fromUserId: 'B',
        toUserId: 'C',
        amountMinor: 1000,
        currency: 'USD',
      });
    });

    it('returns empty array when passed empty or zero-amount debts', () => {
      expect(simplifyDebts([])).toEqual([]);
      expect(
        simplifyDebts([
          { fromUserId: 'A', toUserId: 'B', amountMinor: 0, currency: 'USD' },
        ])
      ).toEqual([]);
    });
  });

  describe('INVARIANT: Net positions always sum to zero', () => {
    it('holds for arbitrary topologies with multiple expenses and settlements', () => {
      const users = ['user_1', 'user_2', 'user_3', 'user_4', 'user_5'];
      const expenses: Expense[] = [
        {
          id: 'e1',
          description: 'Team Lunch',
          sourceType: 'group',
          sourceId: 'g1',
          paidBy: 'user_1',
          originalAmountMinor: 12500,
          originalCurrency: 'USD',
          splitType: 'equal',
          participants: ['user_1', 'user_2', 'user_3'],
          expenseDate: '2026-10-20T10:00:00.000Z',
          createdAt: '2026-10-20T10:00:00.000Z',
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
        {
          id: 'e2',
          description: 'Team Dinner',
          sourceType: 'group',
          sourceId: 'g1',
          paidBy: 'user_4',
          originalAmountMinor: 8900,
          originalCurrency: 'USD',
          splitType: 'equal',
          participants: ['user_2', 'user_4', 'user_5'],
          expenseDate: '2026-10-20T11:00:00.000Z',
          createdAt: '2026-10-20T11:00:00.000Z',
          updatedAt: '2026-10-20T11:00:00.000Z',
        },
        {
          id: 'e3',
          description: 'Coffee',
          sourceType: 'group',
          sourceId: 'g1',
          paidBy: 'user_2',
          originalAmountMinor: 3333,
          originalCurrency: 'USD',
          splitType: 'equal',
          participants: users,
          expenseDate: '2026-10-20T12:00:00.000Z',
          createdAt: '2026-10-20T12:00:00.000Z',
          updatedAt: '2026-10-20T12:00:00.000Z',
        },
      ];

      const splits: ExpenseSplit[] = [
        ...calculateEqualSplit(12500, ['user_1', 'user_2', 'user_3'], 'USD', 'e1'),
        ...calculateEqualSplit(8900, ['user_2', 'user_4', 'user_5'], 'USD', 'e2'),
        ...calculateEqualSplit(3333, users, 'USD', 'e3'),
      ];

      const settlements: Settlement[] = [
        createSettlement({
          fromUserId: 'user_2',
          toUserId: 'user_1',
          amountMinor: 2500,
          currency: 'USD',
          settlementDate: '2026-10-20T13:00:00.000Z',
          createdBy: 'user_2',
        }).settlement,
      ];

      const result = calculateGroupBalances(expenses, splits, settlements, 'USD');

      let totalNet = 0;
      for (const [, userBal] of result.balances.entries()) {
        totalNet += userBal.netBalance;
      }
      expect(totalNet).toBe(0);
    });
  });

  describe('Cross-test: Settlement does not modify expense records', () => {
    it('leaves expense entities strictly unmodified', () => {
      const originalExpense: Expense = Object.freeze({
        id: 'e1',
        sourceType: 'group' as const,
        sourceId: 'g1',
        groupId: 'g1',
        description: 'Frozen expense',
        paidBy: 'alice',
        originalAmountMinor: 5000,
        originalCurrency: 'USD',
        splitType: 'equal' as const,
        participants: Object.freeze(['alice', 'bob']) as unknown as string[],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      });

      const splits = calculateEqualSplit(5000, ['alice', 'bob'], 'USD', 'e1');
      const { settlement } = createSettlement({
        fromUserId: 'bob',
        toUserId: 'alice',
        amountMinor: 2500,
        currency: 'USD',
        settlementDate: '2026-10-20T13:00:00.000Z',
        createdBy: 'bob',
      });

      // Calculate balances multiple times
      calculateGroupBalances([originalExpense], splits, [settlement], 'USD');

      expect(originalExpense.originalAmountMinor).toBe(5000);
      expect(originalExpense.paidBy).toBe('alice');
      expect(originalExpense.description).toBe('Frozen expense');
    });
  });

  describe('Edge cases', () => {
    it('returns empty balance structure when there are no expenses or settlements', () => {
      const balances = calculateGroupBalances([], [], [], 'USD');
      expect(balances.balances.size).toBe(0);
      expect(balances.simplifiedDebts).toEqual([]);
    });

    it('handles single expense where payer is sole participant (no balances owed)', () => {
      const exp: Expense = {
        id: 'e1',
        description: 'Dinner',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'alice',
        originalAmountMinor: 5000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const splits = calculateEqualSplit(5000, ['alice'], 'USD', 'e1');

      const balances = calculateGroupBalances([exp], splits, [], 'USD');
      const alice = balances.balances.get('alice');

      expect(alice?.netBalance).toBe(0);
      expect(alice?.totalOwed).toBe(0);
      expect(alice?.totalOwedToYou).toBe(0);
      expect(balances.simplifiedDebts).toHaveLength(0);
    });

    it('ignores soft-deleted expenses and settlements', () => {
      const activeExp: Expense = {
        id: 'e1',
        description: 'Active expense',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'alice',
        originalAmountMinor: 4000,
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
      };
      const deletedExp: Expense = {
        id: 'e2',
        description: 'Deleted expense',
        sourceType: 'group',
        sourceId: 'g1',
        paidBy: 'bob',
        originalAmountMinor: 100000, // Should be ignored!
        originalCurrency: 'USD',
        splitType: 'equal',
        participants: ['alice', 'bob'],
        expenseDate: '2026-10-20T12:00:00.000Z',
        createdAt: '2026-10-20T12:00:00.000Z',
        updatedAt: '2026-10-20T12:00:00.000Z',
        deletedAt: '2026-10-20T12:30:00.000Z',
      };

      const splits = [
        ...calculateEqualSplit(4000, ['alice', 'bob'], 'USD', 'e1'),
        ...calculateEqualSplit(100000, ['alice', 'bob'], 'USD', 'e2'),
      ];

      const balances = calculateGroupBalances([activeExp, deletedExp], splits, [], 'USD');
      // Only activeExp applies: Bob owes Alice 2000
      expect(balances.balances.get('alice')?.netBalance).toBe(2000);
      expect(balances.balances.get('bob')?.netBalance).toBe(-2000);
    });
  });
});
