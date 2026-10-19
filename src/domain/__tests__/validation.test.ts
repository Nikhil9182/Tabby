import { describe, it, expect } from 'vitest';
import { validateExpense } from '../validation/expense-validator';
import type { Expense, ExpenseSplit, SplitType } from '../models/types';

describe('Expense Validator (src/domain/validation/expense-validator.ts)', () => {
  const createValidBase = () => {
    const expense: Partial<Expense> = {
      description: 'Grocery shopping',
      originalAmountMinor: 4000,
      originalCurrency: 'USD',
      expenseDate: '2026-10-20T12:00:00.000Z',
      paidBy: 'user_alice',
      splitType: 'equal',
      participants: ['user_alice', 'user_bob'],
    };

    const splits: Partial<ExpenseSplit>[] = [
      { userId: 'user_alice', shareMinor: 2000 },
      { userId: 'user_bob', shareMinor: 2000 },
    ];

    return { expense, splits };
  };

  it('validates a correct expense with matching splits', () => {
    const { expense, splits } = createValidBase();
    const result = validateExpense(expense, splits);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  describe('Description validation', () => {
    it('fails when description is empty string', () => {
      const { expense, splits } = createValidBase();
      expense.description = '';

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.description).toBe('Description cannot be empty');
    });

    it('fails when description is whitespace only', () => {
      const { expense, splits } = createValidBase();
      expense.description = '    ';

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.description).toBe('Description cannot be empty');
    });
  });

  describe('Amount validation', () => {
    it('fails when amount is zero', () => {
      const { expense, splits } = createValidBase();
      expense.originalAmountMinor = 0;
      splits[0].shareMinor = 0;
      splits[1].shareMinor = 0;

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.originalAmountMinor).toBe(
        'Amount must be a positive integer in minor units'
      );
    });

    it('fails when amount is negative', () => {
      const { expense, splits } = createValidBase();
      expense.originalAmountMinor = -500;

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.originalAmountMinor).toBe(
        'Amount must be a positive integer in minor units'
      );
    });

    it('fails when amount is a floating point number', () => {
      const { expense, splits } = createValidBase();
      expense.originalAmountMinor = 40.5;

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.originalAmountMinor).toBe(
        'Amount must be a positive integer in minor units'
      );
    });
  });

  describe('Currency validation', () => {
    it('fails when currency is missing or invalid', () => {
      const { expense, splits } = createValidBase();

      expense.originalCurrency = '';
      let result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.originalCurrency).toBe('Valid 3-letter currency code is required');

      expense.originalCurrency = 'US';
      result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.originalCurrency).toBe('Valid 3-letter currency code is required');

      expense.originalCurrency = 'USDD';
      result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.originalCurrency).toBe('Valid 3-letter currency code is required');

      expense.originalCurrency = '123';
      result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.originalCurrency).toBe('Valid 3-letter currency code is required');
    });

    it('passes for valid 3-letter currency codes', () => {
      const { expense, splits } = createValidBase();
      for (const curr of ['USD', 'EUR', 'GBP', 'INR', 'JPY']) {
        expense.originalCurrency = curr;
        expect(validateExpense(expense, splits).valid).toBe(true);
      }
    });
  });

  describe('Payer and Date validation', () => {
    it('fails when payer is missing or empty', () => {
      const { expense, splits } = createValidBase();
      expense.paidBy = '';

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.paidBy).toBe('Payer must be specified');
    });

    it('fails when expenseDate is invalid or missing', () => {
      const { expense, splits } = createValidBase();

      expense.expenseDate = '';
      let result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.expenseDate).toBe('Valid ISO 8601 expense date is required');

      expense.expenseDate = 'not-a-date';
      result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.expenseDate).toBe('Valid ISO 8601 expense date is required');

      expense.expenseDate = '2026-99-99';
      result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.expenseDate).toBe('Valid ISO 8601 expense date is required');
    });

    it('accepts both date-only and full ISO UTC datetimes', () => {
      const { expense, splits } = createValidBase();

      expense.expenseDate = '2026-10-20';
      expect(validateExpense(expense, splits).valid).toBe(true);

      expense.expenseDate = '2026-10-20T15:30:00.000Z';
      expect(validateExpense(expense, splits).valid).toBe(true);
    });
  });

  describe('Split Type validation', () => {
    it('passes for all four valid split types', () => {
      const validTypes: SplitType[] = ['equal', 'exact', 'percentage', 'shares'];
      const { expense, splits } = createValidBase();

      for (const st of validTypes) {
        expense.splitType = st;
        expect(validateExpense(expense, splits).valid).toBe(true);
      }
    });

    it('fails for invalid split types', () => {
      const { expense, splits } = createValidBase();
      expense.splitType = 'custom_unknown' as SplitType;

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.splitType).toContain('Split type must be one of: equal, exact, percentage, shares');
    });
  });

  describe('Participants validation', () => {
    it('fails when participants array is empty', () => {
      const { expense, splits } = createValidBase();
      expense.participants = [];

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.participants).toBe('At least one participant is required');
    });

    it('fails when duplicate participants exist in the expense', () => {
      const { expense, splits } = createValidBase();
      expense.participants = ['user_alice', 'user_alice'];

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.participants).toBe('Duplicate participants are not allowed');
    });
  });

  describe('Splits array and sum validation', () => {
    it('fails when splits array is empty', () => {
      const { expense } = createValidBase();
      const result = validateExpense(expense, []);

      expect(result.valid).toBe(false);
      expect(result.errors.splits).toBe('Splits cannot be empty');
    });

    it('fails when splits sum does not match originalAmountMinor', () => {
      const { expense, splits } = createValidBase();
      expense.originalAmountMinor = 4000;
      splits[0].shareMinor = 2000;
      splits[1].shareMinor = 1500; // sum = 3500 != 4000

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.splitsSum).toBe(
        'Shares sum (3500) must equal expense amount (4000)'
      );
    });

    it('fails when split share is negative', () => {
      const { expense, splits } = createValidBase();
      expense.originalAmountMinor = 4000;
      splits[0].shareMinor = 5000;
      splits[1].shareMinor = -1000;

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.shareMinor).toBe('Split shares cannot be negative');
    });

    it('fails when split share is a non-integer float', () => {
      const { expense, splits } = createValidBase();
      splits[0].shareMinor = 2000.5;
      splits[1].shareMinor = 1999.5;

      const result = validateExpense(expense, splits);
      expect(result.valid).toBe(false);
      expect(result.errors.shareMinor).toBe('Split shares must be integer minor units');
    });

    it('fails when duplicate participant exists in splits array', () => {
      const { expense } = createValidBase();
      const duplicateSplits: Partial<ExpenseSplit>[] = [
        { userId: 'user_alice', shareMinor: 2000 },
        { userId: 'user_alice', shareMinor: 2000 },
      ];

      const result = validateExpense(expense, duplicateSplits);
      expect(result.valid).toBe(false);
      expect(result.errors.splits).toContain('Duplicate participant in splits: user_alice');
    });

    it('fails when a split has a user not listed in participants', () => {
      const { expense } = createValidBase();
      expense.participants = ['user_alice', 'user_bob'];
      const mismatchedSplits: Partial<ExpenseSplit>[] = [
        { userId: 'user_alice', shareMinor: 2000 },
        { userId: 'user_charlie', shareMinor: 2000 }, // Charlie is not in participants!
      ];

      const result = validateExpense(expense, mismatchedSplits);
      expect(result.valid).toBe(false);
      expect(result.errors.participantMismatch).toBe(
        'Split user user_charlie is not in expense participants'
      );
    });

    it('fails when a participant is missing from splits', () => {
      const { expense } = createValidBase();
      expense.participants = ['user_alice', 'user_bob', 'user_charlie'];
      const incompleteSplits: Partial<ExpenseSplit>[] = [
        { userId: 'user_alice', shareMinor: 2000 },
        { userId: 'user_bob', shareMinor: 2000 },
        // Charlie missing!
      ];

      const result = validateExpense(expense, incompleteSplits);
      expect(result.valid).toBe(false);
      expect(result.errors.participantMismatch).toBe(
        'Participant user_charlie is missing from splits'
      );
    });
  });
});
