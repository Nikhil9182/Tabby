import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit,
  calculateSharesSplit,
  validateSplit,
} from '../splits/split-calculator';
import { isValidId } from '../../lib/id';

describe('Split Calculator (src/domain/splits/split-calculator.ts)', () => {
  describe('calculateEqualSplit', () => {
    it('splits equally among 2 participants', () => {
      const splits = calculateEqualSplit(1000, ['u1', 'u2'], 'USD', 'exp-1');
      expect(splits).toHaveLength(2);
      expect(splits[0].shareMinor).toBe(500);
      expect(splits[1].shareMinor).toBe(500);
      expect(splits[0].expenseId).toBe('exp-1');
      expect(isValidId(splits[0].id)).toBe(true);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('splits equally among 3 participants with indivisible amount (₹100 / 3 = 33.34 + 33.33 + 33.33)', () => {
      // In INR minor units: ₹100.00 = 10000 paise.
      // 10000 / 3 = 3333 with remainder 1.
      // So participant 1 gets 3334, participants 2 & 3 get 3333 each.
      // (Representing ₹33.34, ₹33.33, ₹33.33)
      const splits = calculateEqualSplit(10000, ['alice', 'bob', 'charlie'], 'INR', 'exp-inr');
      expect(splits).toHaveLength(3);
      expect(splits[0].shareMinor).toBe(3334);
      expect(splits[1].shareMinor).toBe(3333);
      expect(splits[2].shareMinor).toBe(3333);

      const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
      expect(sum).toBe(10000);
      expect(validateSplit(splits, 10000).valid).toBe(true);
    });

    it('splits equally among 4 participants', () => {
      const splits = calculateEqualSplit(1000, ['u1', 'u2', 'u3', 'u4']);
      expect(splits).toHaveLength(4);
      for (const s of splits) {
        expect(s.shareMinor).toBe(250);
      }
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);

      // With indivisible remainder: 1001 / 4 = 250 with remainder 1 -> 251, 250, 250, 250
      const indivisible = calculateEqualSplit(1001, ['u1', 'u2', 'u3', 'u4']);
      expect(indivisible[0].shareMinor).toBe(251);
      expect(indivisible[1].shareMinor).toBe(250);
      expect(indivisible[2].shareMinor).toBe(250);
      expect(indivisible[3].shareMinor).toBe(250);
      expect(indivisible.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1001);
      expect(validateSplit(indivisible, 1001).valid).toBe(true);
    });

    it('splits equally among 5 participants', () => {
      // 1003 / 5 = 200 with remainder 3 -> 201, 201, 201, 200, 200
      const splits = calculateEqualSplit(1003, ['u1', 'u2', 'u3', 'u4', 'u5']);
      expect(splits).toHaveLength(5);
      expect(splits[0].shareMinor).toBe(201);
      expect(splits[1].shareMinor).toBe(201);
      expect(splits[2].shareMinor).toBe(201);
      expect(splits[3].shareMinor).toBe(200);
      expect(splits[4].shareMinor).toBe(200);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1003);
      expect(validateSplit(splits, 1003).valid).toBe(true);
    });

    it('splits equally among 7 participants with exact sum guarantee', () => {
      // 100 / 7 = 14 with remainder 2 -> 15, 15, 14, 14, 14, 14, 14
      const users = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];
      const splits = calculateEqualSplit(100, users);
      expect(splits).toHaveLength(7);
      expect(splits[0].shareMinor).toBe(15);
      expect(splits[1].shareMinor).toBe(15);
      for (let i = 2; i < 7; i++) {
        expect(splits[i].shareMinor).toBe(14);
      }
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(100);
      expect(validateSplit(splits, 100).valid).toBe(true);
    });

    it('handles edge case of 1 participant (sole participant gets 100%)', () => {
      const splits = calculateEqualSplit(5432, ['solo_user']);
      expect(splits).toHaveLength(1);
      expect(splits[0].userId).toBe('solo_user');
      expect(splits[0].shareMinor).toBe(5432);
      expect(validateSplit(splits, 5432).valid).toBe(true);
    });

    it('handles tiny amounts smaller than participant count', () => {
      // 2 cents divided among 3 people -> 1, 1, 0
      const splits = calculateEqualSplit(2, ['u1', 'u2', 'u3']);
      expect(splits[0].shareMinor).toBe(1);
      expect(splits[1].shareMinor).toBe(1);
      expect(splits[2].shareMinor).toBe(0);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(2);
      expect(validateSplit(splits, 2).valid).toBe(true);
    });

    it('throws error when participants list is empty', () => {
      expect(() => calculateEqualSplit(1000, [])).toThrow(
        'At least one participant is required for equal split'
      );
    });

    it('throws error when duplicate participants are present', () => {
      expect(() => calculateEqualSplit(1000, ['u1', 'u2', 'u1'])).toThrow(
        'Participant IDs must be unique'
      );
    });
  });

  describe('calculateExactSplit', () => {
    it('creates exact split when shares sum to total', () => {
      const shares = [
        { userId: 'u1', amountMinor: 300 },
        { userId: 'u2', amountMinor: 250 },
        { userId: 'u3', amountMinor: 450 },
      ];
      const splits = calculateExactSplit(1000, shares, 'exp-exact');
      expect(splits).toHaveLength(3);
      expect(splits[0].shareMinor).toBe(300);
      expect(splits[1].shareMinor).toBe(250);
      expect(splits[2].shareMinor).toBe(450);
      expect(splits[0].expenseId).toBe('exp-exact');
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('throws when exact split shares sum to less than total', () => {
      const shares = [
        { userId: 'u1', amountMinor: 300 },
        { userId: 'u2', amountMinor: 400 },
      ];
      expect(() => calculateExactSplit(1000, shares)).toThrow(
        'Exact split shares sum (700) must equal total amount (1000)'
      );
    });

    it('throws when exact split shares sum to more than total', () => {
      const shares = [
        { userId: 'u1', amountMinor: 600 },
        { userId: 'u2', amountMinor: 500 },
      ];
      expect(() => calculateExactSplit(1000, shares)).toThrow(
        'Exact split shares sum (1100) must equal total amount (1000)'
      );
    });

    it('throws when shares array is empty', () => {
      expect(() => calculateExactSplit(1000, [])).toThrow(
        'At least one share is required for exact split'
      );
    });

    it('throws when duplicate user IDs are passed to exact split', () => {
      const shares = [
        { userId: 'u1', amountMinor: 500 },
        { userId: 'u1', amountMinor: 500 },
      ];
      expect(() => calculateExactSplit(1000, shares)).toThrow(
        'Duplicate user ID in exact split: u1'
      );
    });

    it('throws when share amount is not an integer', () => {
      const shares = [
        { userId: 'u1', amountMinor: 500.5 },
        { userId: 'u2', amountMinor: 499.5 },
      ];
      expect(() => calculateExactSplit(1000, shares)).toThrow(
        'Share amount for user u1 must be an integer'
      );
    });
  });

  describe('calculatePercentageSplit', () => {
    it('splits 50/50 correctly', () => {
      const percentages = [
        { userId: 'u1', basisPoints: 5000 },
        { userId: 'u2', basisPoints: 5000 },
      ];
      const splits = calculatePercentageSplit(1000, percentages, 'USD', 'exp-pct');
      expect(splits).toHaveLength(2);
      expect(splits[0].shareMinor).toBe(500);
      expect(splits[1].shareMinor).toBe(500);
      expect(splits[0].percentageBasisPoints).toBe(5000);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('splits 25/25/50 correctly', () => {
      const percentages = [
        { userId: 'u1', basisPoints: 2500 },
        { userId: 'u2', basisPoints: 2500 },
        { userId: 'u3', basisPoints: 5000 },
      ];
      const splits = calculatePercentageSplit(2000, percentages);
      expect(splits).toHaveLength(3);
      expect(splits[0].shareMinor).toBe(500);
      expect(splits[1].shareMinor).toBe(500);
      expect(splits[2].shareMinor).toBe(1000);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(2000);
      expect(validateSplit(splits, 2000).valid).toBe(true);
    });

    it('splits 33.33/33.33/33.34 correctly with penny allocation to highest fraction', () => {
      const percentages = [
        { userId: 'u1', basisPoints: 3333 },
        { userId: 'u2', basisPoints: 3333 },
        { userId: 'u3', basisPoints: 3334 },
      ];
      // $10.00 = 1000 minor units
      // u1 raw: 333 (frac 3000), u2 raw: 333 (frac 3000), u3 raw: 333 (frac 4000)
      // Remainder = 1 -> awarded to u3 because 4000 > 3000
      const splits = calculatePercentageSplit(1000, percentages);
      expect(splits).toHaveLength(3);
      expect(splits[0].shareMinor).toBe(333);
      expect(splits[1].shareMinor).toBe(333);
      expect(splits[2].shareMinor).toBe(334);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('throws when basis points do not sum to 10000', () => {
      // 9999 bp (99.99%)
      const under = [
        { userId: 'u1', basisPoints: 5000 },
        { userId: 'u2', basisPoints: 4999 },
      ];
      expect(() => calculatePercentageSplit(1000, under)).toThrow(
        'Percentage basis points must sum to 10000 (100%). Received 9999'
      );

      // 10001 bp (100.01%)
      const over = [
        { userId: 'u1', basisPoints: 5000 },
        { userId: 'u2', basisPoints: 5001 },
      ];
      expect(() => calculatePercentageSplit(1000, over)).toThrow(
        'Percentage basis points must sum to 10000 (100%). Received 10001'
      );
    });

    it('throws when percentages array is empty', () => {
      expect(() => calculatePercentageSplit(1000, [])).toThrow(
        'At least one participant is required for percentage split'
      );
    });

    it('throws on duplicate user IDs in percentage split', () => {
      const dups = [
        { userId: 'u1', basisPoints: 5000 },
        { userId: 'u1', basisPoints: 5000 },
      ];
      expect(() => calculatePercentageSplit(1000, dups)).toThrow(
        'Duplicate user ID in percentage split: u1'
      );
    });

    it('throws on negative or non-integer basis points', () => {
      expect(() =>
        calculatePercentageSplit(1000, [
          { userId: 'u1', basisPoints: -500 },
          { userId: 'u2', basisPoints: 10500 },
        ])
      ).toThrow('Basis points for user u1 must be a non-negative integer');

      expect(() =>
        calculatePercentageSplit(1000, [
          { userId: 'u1', basisPoints: 5000.5 },
          { userId: 'u2', basisPoints: 4999.5 },
        ])
      ).toThrow('Basis points for user u1 must be a non-negative integer');
    });
  });

  describe('calculateSharesSplit', () => {
    it('handles equal weights (1:1:1) like equal split', () => {
      const weights = [
        { userId: 'u1', weight: 1 },
        { userId: 'u2', weight: 1 },
        { userId: 'u3', weight: 1 },
      ];
      const splits = calculateSharesSplit(1000, weights, 'USD', 'exp-shares');
      expect(splits).toHaveLength(3);
      expect(splits[0].shareMinor).toBe(334);
      expect(splits[1].shareMinor).toBe(333);
      expect(splits[2].shareMinor).toBe(333);
      expect(splits[0].weight).toBe(1);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('handles unequal weights (1:2:3)', () => {
      // Total weight = 6. Total = 1000 minor.
      // u1: 1000 * 1/6 = 166.666... -> 167 (remainder 1 allocated here)
      // u2: 1000 * 2/6 = 333.333... -> 333
      // u3: 1000 * 3/6 = 500.000... -> 500
      const weights = [
        { userId: 'u1', weight: 1 },
        { userId: 'u2', weight: 2 },
        { userId: 'u3', weight: 3 },
      ];
      const splits = calculateSharesSplit(1000, weights);
      expect(splits).toHaveLength(3);
      expect(splits[0].shareMinor).toBe(167);
      expect(splits[1].shareMinor).toBe(333);
      expect(splits[2].shareMinor).toBe(500);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('handles large weights (100:200:300) with identical proportional results', () => {
      const weights = [
        { userId: 'u1', weight: 100 },
        { userId: 'u2', weight: 200 },
        { userId: 'u3', weight: 300 },
      ];
      const splits = calculateSharesSplit(1000, weights);
      expect(splits).toHaveLength(3);
      expect(splits[0].shareMinor).toBe(167);
      expect(splits[1].shareMinor).toBe(333);
      expect(splits[2].shareMinor).toBe(500);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('handles participant with weight 0', () => {
      const weights = [
        { userId: 'u1', weight: 2 },
        { userId: 'u2', weight: 0 },
      ];
      const splits = calculateSharesSplit(1000, weights);
      expect(splits[0].shareMinor).toBe(1000);
      expect(splits[1].shareMinor).toBe(0);
      expect(splits.reduce((acc, s) => acc + s.shareMinor, 0)).toBe(1000);
      expect(validateSplit(splits, 1000).valid).toBe(true);
    });

    it('throws on empty weights', () => {
      expect(() => calculateSharesSplit(1000, [])).toThrow(
        'At least one participant is required for shares split'
      );
    });

    it('throws on duplicate user IDs in shares split', () => {
      const dups = [
        { userId: 'u1', weight: 1 },
        { userId: 'u1', weight: 2 },
      ];
      expect(() => calculateSharesSplit(1000, dups)).toThrow(
        'Duplicate user ID in shares split: u1'
      );
    });

    it('throws on negative weights', () => {
      const neg = [
        { userId: 'u1', weight: -1 },
        { userId: 'u2', weight: 2 },
      ];
      expect(() => calculateSharesSplit(1000, neg)).toThrow(
        'Weight for user u1 must be non-negative'
      );
    });

    it('throws when total weight is zero', () => {
      const zeroWeights = [
        { userId: 'u1', weight: 0 },
        { userId: 'u2', weight: 0 },
      ];
      expect(() => calculateSharesSplit(1000, zeroWeights)).toThrow(
        'Total weight must be greater than zero'
      );
    });
  });

  describe('validateSplit', () => {
    it('validates a correct split', () => {
      const splits = [
        { id: '1', expenseId: 'e', userId: 'u1', shareMinor: 400 },
        { id: '2', expenseId: 'e', userId: 'u2', shareMinor: 600 },
      ];
      const result = validateSplit(splits, 1000);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects empty splits array', () => {
      const result = validateSplit([], 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('At least one split is required');
    });

    it('rejects missing user ID in split item', () => {
      const splits = [
        { id: '1', expenseId: 'e', userId: '', shareMinor: 1000 },
      ];
      const result = validateSplit(splits, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Split user ID cannot be empty');
    });

    it('rejects duplicate user IDs in splits', () => {
      const splits = [
        { id: '1', expenseId: 'e', userId: 'u1', shareMinor: 500 },
        { id: '2', expenseId: 'e', userId: 'u1', shareMinor: 500 },
      ];
      const result = validateSplit(splits, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Duplicate user ID in splits: u1');
    });

    it('rejects non-integer share amounts', () => {
      const splits = [
        { id: '1', expenseId: 'e', userId: 'u1', shareMinor: 500.5 },
        { id: '2', expenseId: 'e', userId: 'u2', shareMinor: 499.5 },
      ];
      const result = validateSplit(splits, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be an integer');
    });

    it('rejects split sum mismatch', () => {
      const splits = [
        { id: '1', expenseId: 'e', userId: 'u1', shareMinor: 500 },
        { id: '2', expenseId: 'e', userId: 'u2', shareMinor: 400 },
      ];
      const result = validateSplit(splits, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Split shares sum (900) must equal total amount (1000)'
      );
    });
  });

  describe('INVARIANT: Sum of shares == expense total', () => {
    it('preserves invariant across a wide variety of prime and indivisible totals', () => {
      const testTotals = [1, 2, 3, 7, 10, 33, 99, 100, 101, 333, 1000, 9999, 100000];
      const participantCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      for (const total of testTotals) {
        for (const count of participantCounts) {
          const participantIds = Array.from({ length: count }, (_, i) => `user_${i}`);
          const splits = calculateEqualSplit(total, participantIds);
          const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);

          expect(sum).toBe(total);
          expect(validateSplit(splits, total).valid).toBe(true);
        }
      }
    });

    it('preserves invariant across various arbitrary percentage combinations', () => {
      const percentageDistributions = [
        [{ userId: 'u1', basisPoints: 10000 }],
        [
          { userId: 'u1', basisPoints: 7000 },
          { userId: 'u2', basisPoints: 3000 },
        ],
        [
          { userId: 'u1', basisPoints: 3333 },
          { userId: 'u2', basisPoints: 3333 },
          { userId: 'u3', basisPoints: 3334 },
        ],
        [
          { userId: 'u1', basisPoints: 1428 },
          { userId: 'u2', basisPoints: 1428 },
          { userId: 'u3', basisPoints: 1428 },
          { userId: 'u4', basisPoints: 1428 },
          { userId: 'u5', basisPoints: 1428 },
          { userId: 'u6', basisPoints: 1428 },
          { userId: 'u7', basisPoints: 1432 }, // sums to 10000
        ],
      ];

      const testAmounts = [1, 7, 100, 1000, 7777, 98765];
      for (const dist of percentageDistributions) {
        for (const total of testAmounts) {
          const splits = calculatePercentageSplit(total, dist);
          const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
          expect(sum).toBe(total);
          expect(validateSplit(splits, total).valid).toBe(true);
        }
      }
    });

    it('preserves invariant across various arbitrary share weights', () => {
      const weightDistributions = [
        [{ userId: 'u1', weight: 5 }],
        [
          { userId: 'u1', weight: 1 },
          { userId: 'u2', weight: 2 },
          { userId: 'u3', weight: 3 },
          { userId: 'u4', weight: 4 },
        ],
        [
          { userId: 'u1', weight: 7 },
          { userId: 'u2', weight: 13 },
          { userId: 'u3', weight: 17 },
        ],
      ];

      const testAmounts = [5, 13, 100, 1000, 89123];
      for (const dist of weightDistributions) {
        for (const total of testAmounts) {
          const splits = calculateSharesSplit(total, dist);
          const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
          expect(sum).toBe(total);
          expect(validateSplit(splits, total).valid).toBe(true);
        }
      }
    });
  });
});
