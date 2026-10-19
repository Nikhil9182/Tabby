import { describe, it, expect } from 'vitest';
import { generateId, generateOperationId, isValidId, isValidOperationId } from '../../lib/id';
import {
  formatDate,
  formatRelativeDate,
  toISOString,
  toLocalDate,
  isValidISODate,
  startOfMonth,
  endOfMonth,
  getMonthRange,
} from '../../lib/date';
import {
  formatMoney,
  parseMoney,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  convertCurrency,
  getMinorUnitMultiplier,
  toMajorUnits,
  toMinorUnits,
  getCurrencySymbol,
  isValidCurrencyCode,
  CURRENCY_INFO,
} from '../money/money';
import {
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit,
  calculateSharesSplit,
  validateSplit,
} from '../splits/split-calculator';
import {
  calculateGroupBalances,
  calculatePairwiseBalance,
  calculateUserBalances,
  simplifyDebts,
  getSuggestedSettlements,
} from '../balances/balance-engine';
import {
  createSettlement,
  applySettlementToBalances,
  validateSettlement,
} from '../settlements/settlement-engine';
import { validateExpense } from '../validation/expense-validator';
import {
  userSchema,
  groupSchema,
  expenseSchema,
  settlementSchema,
  syncOperationSchema,
  type Expense,
  type ExpenseSplit,
  type Settlement,
} from '../models/types';

describe('1. ID Utilities (src/lib/id.ts)', () => {
  it('generates a valid UUID v4', () => {
    const id = generateId();
    expect(isValidId(id)).toBe(true);
  });

  it('generates a valid operation ID prefixed with op_', () => {
    const opId = generateOperationId();
    expect(isValidOperationId(opId)).toBe(true);
    expect(opId.startsWith('op_')).toBe(true);
  });

  it('rejects malformed IDs', () => {
    expect(isValidId('')).toBe(false);
    expect(isValidId('invalid-uuid')).toBe(false);
    expect(isValidId('12345678-1234-1234-1234-123456789abc')).toBe(false); // v1, not v4
    expect(isValidOperationId('not_an_op')).toBe(false);
    expect(isValidOperationId('op_invalid')).toBe(false);
  });
});

describe('2. Date Utilities (src/lib/date.ts)', () => {
  it('formats dates correctly', () => {
    const iso = '2026-10-20T12:00:00.000Z';
    expect(formatDate(iso, 'yyyy-MM-dd')).toBe('2026-10-20');
  });

  it('formats relative dates', () => {
    const now = new Date();
    expect(formatRelativeDate(now)).toContain('ago');
  });

  it('converts to ISO string and local date', () => {
    const date = new Date('2026-10-20T10:00:00.000Z');
    const iso = toISOString(date);
    expect(iso).toBe('2026-10-20T10:00:00.000Z');
    const parsed = toLocalDate(iso);
    expect(parsed.toISOString()).toBe('2026-10-20T10:00:00.000Z');
  });

  it('validates ISO dates correctly', () => {
    expect(isValidISODate('2026-10-20T10:00:00.000Z')).toBe(true);
    expect(isValidISODate('2026-10-20')).toBe(true);
    expect(isValidISODate('invalid')).toBe(false);
    expect(isValidISODate('2026-99-99')).toBe(false);
  });

  it('computes month range for 1-based months', () => {
    const range = getMonthRange(2026, 2); // February 2026 (non-leap year, 28 days)
    expect(range.start.getUTCFullYear()).toBe(2026);
    expect(range.end.getUTCDate()).toBe(28);
  });
});

describe('3. Zod Model Schemas (src/domain/models/types.ts)', () => {
  it('validates a valid User', () => {
    const validUser = {
      id: generateId(),
      displayName: 'Alice Johnson',
      email: 'alice@example.com',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    };
    expect(userSchema.safeParse(validUser).success).toBe(true);
  });

  it('rejects an invalid email in User', () => {
    const invalidUser = {
      id: generateId(),
      displayName: 'Bob',
      email: 'not-an-email',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    };
    expect(userSchema.safeParse(invalidUser).success).toBe(false);
  });

  it('validates a valid Group', () => {
    const validGroup = {
      id: generateId(),
      name: 'Trip to Tokyo',
      createdBy: generateId(),
      memberIds: [generateId(), generateId()],
      defaultCurrency: 'JPY',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      schemaVersion: 1,
    };
    expect(groupSchema.safeParse(validGroup).success).toBe(true);
  });

  it('validates a valid Expense', () => {
    const validExpense = {
      id: generateId(),
      sourceType: 'group' as const,
      sourceId: generateId(),
      description: 'Dinner',
      paidBy: generateId(),
      originalAmountMinor: 4500,
      originalCurrency: 'USD',
      splitType: 'equal' as const,
      participants: [generateId()],
      expenseDate: '2026-10-20T19:00:00.000Z',
      createdAt: '2026-10-20T19:00:00.000Z',
      updatedAt: '2026-10-20T19:00:00.000Z',
      createdBy: generateId(),
      operationId: generateOperationId(),
      revision: 1,
    };
    expect(expenseSchema.safeParse(validExpense).success).toBe(true);
  });

  it('rejects negative or floating point amounts in Expense schema', () => {
    const invalidExpense = {
      id: generateId(),
      sourceType: 'group' as const,
      sourceId: generateId(),
      description: 'Dinner',
      paidBy: generateId(),
      originalAmountMinor: -100, // Negative amount
      originalCurrency: 'USD',
      splitType: 'equal' as const,
      participants: [generateId()],
      expenseDate: '2026-10-20T19:00:00.000Z',
      createdAt: '2026-10-20T19:00:00.000Z',
      updatedAt: '2026-10-20T19:00:00.000Z',
      createdBy: generateId(),
      operationId: generateOperationId(),
      revision: 1,
    };
    expect(expenseSchema.safeParse(invalidExpense).success).toBe(false);
  });
});

describe('4. Money Utilities (src/domain/money/money.ts)', () => {
  it('formats money with proper currency symbol and decimals', () => {
    expect(formatMoney(1234, 'USD')).toBe('$12.34');
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
    expect(formatMoney(1250, 'BHD')).toContain('1.250');
    expect(formatMoney(-500, 'USD')).toBe('-$5.00');
  });

  it('parses user input strings to integer minor units', () => {
    expect(parseMoney('$12.34', 'USD')).toBe(1234);
    expect(parseMoney('12', 'USD')).toBe(1200);
    expect(parseMoney('12.3', 'USD')).toBe(1230);
    expect(parseMoney('1,234.56', 'USD')).toBe(123456);
    expect(parseMoney('1500', 'JPY')).toBe(1500);
    expect(parseMoney('1.250', 'BHD')).toBe(1250);
    expect(parseMoney('-45.50', 'USD')).toBe(-4550);
  });

  it('performs safe integer arithmetic', () => {
    expect(addMoney(100, 250)).toBe(350);
    expect(subtractMoney(500, 150)).toBe(350);
    expect(multiplyMoney(100, 1.5)).toBe(150);
    expect(divideMoney(100, 3)).toBe(33);
  });

  it('converts currencies correctly accounting for decimal precisions', () => {
    // 1 USD (100 minor) = 150 JPY (1 minor). Rate = 150.
    // 10.00 USD (1000 minor) -> 10 * 150 = 1500 JPY (1500 minor)
    expect(convertCurrency(1000, 150, 'USD', 'JPY')).toBe(1500);

    // 1 USD (100 minor) = 0.38 BHD (1000 minor). Rate = 0.38.
    // 10.00 USD (1000 minor) -> 10 * 0.38 = 3.800 BHD (3800 minor)
    expect(convertCurrency(1000, 0.38, 'USD', 'BHD')).toBe(3800);
  });

  it('validates currency codes and multipliers', () => {
    expect(isValidCurrencyCode('USD')).toBe(true);
    expect(isValidCurrencyCode('EUR')).toBe(true);
    expect(isValidCurrencyCode('XYZ')).toBe(true);
    expect(isValidCurrencyCode('US')).toBe(false);
    expect(isValidCurrencyCode('USDD')).toBe(false);

    expect(getMinorUnitMultiplier('USD')).toBe(100);
    expect(getMinorUnitMultiplier('JPY')).toBe(1);
    expect(getMinorUnitMultiplier('BHD')).toBe(1000);
  });

  it('has all required currencies in CURRENCY_INFO', () => {
    const required = [
      'USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD',
      'SGD', 'NZD', 'KRW', 'BRL', 'MXN', 'ZAR', 'SEK', 'NOK', 'DKK', 'THB',
      'BHD', 'KWD', 'OMR'
    ];
    for (const code of required) {
      expect(CURRENCY_INFO[code]).toBeDefined();
    }
  });
});

describe('5. Split Calculator (src/domain/splits/split-calculator.ts)', () => {
  it('calculates equal split with exact totalMinor sum and penny allocation', () => {
    // $10.00 among 3 participants -> 334, 333, 333
    const splits = calculateEqualSplit(1000, ['u1', 'u2', 'u3'], 'USD', 'exp1');
    expect(splits).toHaveLength(3);
    const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
    expect(sum).toBe(1000);
    expect(splits[0].shareMinor).toBe(334);
    expect(splits[1].shareMinor).toBe(333);
    expect(splits[2].shareMinor).toBe(333);
    expect(validateSplit(splits, 1000).valid).toBe(true);
  });

  it('calculates exact split and validates total sum', () => {
    const shares = [
      { userId: 'u1', amountMinor: 400 },
      { userId: 'u2', amountMinor: 600 },
    ];
    const splits = calculateExactSplit(1000, shares, 'exp1');
    expect(splits).toHaveLength(2);
    expect(validateSplit(splits, 1000).valid).toBe(true);

    // Mismatched sum should throw
    expect(() =>
      calculateExactSplit(1000, [{ userId: 'u1', amountMinor: 500 }])
    ).toThrow();
  });

  it('calculates percentage split with exact totalMinor sum', () => {
    // 33.33%, 33.33%, 33.34% -> basis points: 3333, 3333, 3334 (sum = 10000)
    const percentages = [
      { userId: 'u1', basisPoints: 3333 },
      { userId: 'u2', basisPoints: 3333 },
      { userId: 'u3', basisPoints: 3334 },
    ];
    const splits = calculatePercentageSplit(1000, percentages, 'USD', 'exp1');
    expect(splits).toHaveLength(3);
    const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
    expect(sum).toBe(1000);
    expect(validateSplit(splits, 1000).valid).toBe(true);

    // Basis points not summing to 10000 should throw
    expect(() =>
      calculatePercentageSplit(1000, [{ userId: 'u1', basisPoints: 5000 }], 'USD')
    ).toThrow();
  });

  it('calculates shares split with proportional weights and exact sum', () => {
    // Alice 2 shares, Bob 1 share of $10.00 (1000 minor)
    // 2/3 = 666.666..., 1/3 = 333.333... -> 667 and 333
    const weights = [
      { userId: 'u1', weight: 2 },
      { userId: 'u2', weight: 1 },
    ];
    const splits = calculateSharesSplit(1000, weights, 'USD', 'exp1');
    expect(splits).toHaveLength(2);
    const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
    expect(sum).toBe(1000);
    expect(splits[0].shareMinor).toBe(667);
    expect(splits[1].shareMinor).toBe(333);
    expect(validateSplit(splits, 1000).valid).toBe(true);
  });
});

describe('6. Balance Engine (src/domain/balances/balance-engine.ts)', () => {
  it('calculates group balances where net positions sum to zero', () => {
    // Alice pays $30 for Alice, Bob, Charlie ($10 each)
    const expense: Expense = {
      id: 'e1',
      sourceType: 'group',
      sourceId: 'g1',
      groupId: 'g1',
      description: 'Lunch',
      paidBy: 'alice',
      originalAmountMinor: 3000,
      originalCurrency: 'USD',
      splitType: 'equal',
      participants: ['alice', 'bob', 'charlie'],
      expenseDate: '2026-10-20T12:00:00.000Z',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      createdBy: 'alice',
      operationId: 'op_1',
      revision: 1,
    };

    const splits: ExpenseSplit[] = [
      { id: 's1', expenseId: 'e1', userId: 'alice', shareMinor: 1000, createdAt: '' },
      { id: 's2', expenseId: 'e1', userId: 'bob', shareMinor: 1000, createdAt: '' },
      { id: 's3', expenseId: 'e1', userId: 'charlie', shareMinor: 1000, createdAt: '' },
    ];

    const balances = calculateGroupBalances([expense], splits, [], 'USD');

    const aliceBal = balances.balances.get('alice');
    const bobBal = balances.balances.get('bob');
    const charlieBal = balances.balances.get('charlie');

    expect(aliceBal?.netBalance).toBe(2000); // Alice is owed $20
    expect(bobBal?.netBalance).toBe(-1000);  // Bob owes $10
    expect(charlieBal?.netBalance).toBe(-1000); // Charlie owes $10

    // Sum of net balances must be 0
    const netSum =
      (aliceBal?.netBalance ?? 0) +
      (bobBal?.netBalance ?? 0) +
      (charlieBal?.netBalance ?? 0);
    expect(netSum).toBe(0);

    // Simplified debts
    expect(balances.simplifiedDebts).toHaveLength(2);
  });

  it('applies settlements to cancel out debt', () => {
    const expense: Expense = {
      id: 'e1',
      sourceType: 'group',
      sourceId: 'g1',
      groupId: 'g1',
      description: 'Dinner',
      paidBy: 'alice',
      originalAmountMinor: 2000,
      originalCurrency: 'USD',
      splitType: 'equal',
      participants: ['alice', 'bob'],
      expenseDate: '2026-10-20T12:00:00.000Z',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      createdBy: 'alice',
      operationId: 'op_1',
      revision: 1,
    };

    const splits: ExpenseSplit[] = [
      { id: 's1', expenseId: 'e1', userId: 'alice', shareMinor: 1000, createdAt: '' },
      { id: 's2', expenseId: 'e1', userId: 'bob', shareMinor: 1000, createdAt: '' },
    ];

    // Bob settles $10 with Alice
    const settlement: Settlement = {
      id: 'set1',
      sourceId: 'g1',
      groupId: 'g1',
      fromUserId: 'bob',
      toUserId: 'alice',
      amountMinor: 1000,
      currency: 'USD',
      settlementDate: '2026-10-20T13:00:00.000Z',
      createdAt: '2026-10-20T13:00:00.000Z',
      updatedAt: '2026-10-20T13:00:00.000Z',
      createdBy: 'bob',
      operationId: 'op_2',
      revision: 1,
    };

    const balances = calculateGroupBalances([expense], splits, [settlement], 'USD');
    expect(balances.balances.get('alice')?.netBalance).toBe(0);
    expect(balances.balances.get('bob')?.netBalance).toBe(0);
    expect(balances.simplifiedDebts).toHaveLength(0);
  });

  it('simplifies circular debts efficiently', () => {
    // A owes B $10, B owes C $10, C owes A $10
    const circularDebts = [
      { fromUserId: 'A', toUserId: 'B', amountMinor: 1000, currency: 'USD' },
      { fromUserId: 'B', toUserId: 'C', amountMinor: 1000, currency: 'USD' },
      { fromUserId: 'C', toUserId: 'A', amountMinor: 1000, currency: 'USD' },
    ];
    const simplified = simplifyDebts(circularDebts, 'USD');
    expect(simplified).toHaveLength(0); // All cancel out!
  });

  it('calculates individual pairwise and user balances', () => {
    const expense: Expense = {
      id: 'e1',
      sourceType: 'group',
      sourceId: 'g1',
      groupId: 'g1',
      description: 'Coffee',
      paidBy: 'u1',
      originalAmountMinor: 1200,
      originalCurrency: 'USD',
      splitType: 'equal',
      participants: ['u1', 'u2'],
      expenseDate: '2026-10-20T12:00:00.000Z',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      createdBy: 'u1',
      operationId: 'op_1',
      revision: 1,
    };
    const splits: ExpenseSplit[] = [
      { id: 's1', expenseId: 'e1', userId: 'u1', shareMinor: 600, createdAt: '' },
      { id: 's2', expenseId: 'e1', userId: 'u2', shareMinor: 600, createdAt: '' },
    ];

    const pb = calculatePairwiseBalance('u2', 'u1', [expense], splits, [], 'USD');
    expect(pb.fromUserId).toBe('u2');
    expect(pb.toUserId).toBe('u1');
    expect(pb.amountMinor).toBe(600);

    const userBal = calculateUserBalances('u2', [expense], splits, [], 'USD');
    expect(userBal.totalOwed).toBe(600);
    expect(userBal.totalOwedToYou).toBe(0);
    expect(userBal.netBalance).toBe(-600);
  });
});

describe('7. Settlement Engine (src/domain/settlements/settlement-engine.ts)', () => {
  it('creates a valid settlement with generated IDs and allocations', () => {
    const { settlement, allocations } = createSettlement({
      fromUserId: 'u1',
      toUserId: 'u2',
      amountMinor: 2500,
      currency: 'USD',
      settlementDate: '2026-10-20T12:00:00.000Z',
      createdBy: 'u1',
      allocations: [
        { expenseId: 'exp1', amountMinor: 2500, currency: 'USD' },
      ],
    });

    expect(isValidId(settlement.id)).toBe(true);
    expect(isValidOperationId(settlement.operationId ?? '')).toBe(true);
    expect(settlement.amountMinor).toBe(2500);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].settlementId).toBe(settlement.id);
  });

  it('validates settlement inputs', () => {
    const valid = validateSettlement({
      fromUserId: 'u1',
      toUserId: 'u2',
      amountMinor: 1000,
      currency: 'USD',
      settlementDate: '2026-10-20T12:00:00.000Z',
      createdBy: 'u1',
    });
    expect(valid.valid).toBe(true);

    const selfSettle = validateSettlement({
      fromUserId: 'u1',
      toUserId: 'u1', // same user
      amountMinor: 1000,
      currency: 'USD',
      settlementDate: '2026-10-20T12:00:00.000Z',
      createdBy: 'u1',
    });
    expect(selfSettle.valid).toBe(false);
  });

  it('applies settlement to pairwise balances directly', () => {
    const current = [
      { fromUserId: 'u1', toUserId: 'u2', amountMinor: 1000, currency: 'USD' },
    ];
    const { settlement } = createSettlement({
      fromUserId: 'u1',
      toUserId: 'u2',
      amountMinor: 600,
      currency: 'USD',
      settlementDate: '2026-10-20T12:00:00.000Z',
      createdBy: 'u1',
    });

    const updated = applySettlementToBalances(settlement, current);
    expect(updated).toHaveLength(1);
    expect(updated[0].amountMinor).toBe(400); // 1000 - 600 = 400 remaining
  });
});

describe('8. Expense Validator (src/domain/validation/expense-validator.ts)', () => {
  it('validates a correct expense with matching splits', () => {
    const expense: Partial<Expense> = {
      description: 'Groceries',
      originalAmountMinor: 3000,
      originalCurrency: 'USD',
      expenseDate: '2026-10-20T12:00:00.000Z',
      paidBy: 'u1',
      splitType: 'equal',
      participants: ['u1', 'u2'],
    };
    const splits: Partial<ExpenseSplit>[] = [
      { userId: 'u1', shareMinor: 1500 },
      { userId: 'u2', shareMinor: 1500 },
    ];

    const result = validateExpense(expense, splits);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('detects split sum mismatch and missing fields', () => {
    const expense: Partial<Expense> = {
      description: '',
      originalAmountMinor: 3000,
      originalCurrency: 'INVALID',
      expenseDate: 'invalid-date',
      paidBy: '',
      splitType: 'equal',
      participants: ['u1'],
    };
    const splits: Partial<ExpenseSplit>[] = [
      { userId: 'u1', shareMinor: 2000 }, // Does not equal 3000
    ];

    const result = validateExpense(expense, splits);
    expect(result.valid).toBe(false);
    expect(result.errors.description).toBeDefined();
    expect(result.errors.originalCurrency).toBeDefined();
    expect(result.errors.expenseDate).toBeDefined();
    expect(result.errors.paidBy).toBeDefined();
    expect(result.errors.splitsSum).toBeDefined();
  });
});
