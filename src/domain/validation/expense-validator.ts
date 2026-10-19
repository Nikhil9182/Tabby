import type { Expense, ExpenseSplit, SplitType } from '../models/types';
import { isValidCurrencyCode } from '../money/money';
import { isValidISODate } from '../../lib/date';

const VALID_SPLIT_TYPES: readonly SplitType[] = ['equal', 'exact', 'percentage', 'shares'] as const;

/**
 * Validates an expense and its associated splits against all business domain rules.
 *
 * Rules verified:
 * - Non-empty description
 * - Positive integer amount in minor units
 * - Valid 3-letter currency code
 * - Valid ISO 8601 date
 * - Payer is specified
 * - Valid split type
 * - At least one participant
 * - No duplicate participants
 * - No negative split shares
 * - Integer minor units for all shares
 * - Exact match between sum of shares and expense amount
 * - Full alignment between participants list and split records
 *
 * @param expense Partial or full Expense entity.
 * @param splits Array of partial or full ExpenseSplit entities.
 * @returns Object with valid flag and field-specific error messages.
 */
export function validateExpense(
  expense: Partial<Expense>,
  splits: Partial<ExpenseSplit>[]
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  // 1. Description
  if (!expense.description || expense.description.trim().length === 0) {
    errors.description = 'Description cannot be empty';
  }

  // 2. Amount
  if (
    expense.originalAmountMinor === undefined ||
    !Number.isInteger(expense.originalAmountMinor) ||
    expense.originalAmountMinor <= 0
  ) {
    errors.originalAmountMinor = 'Amount must be a positive integer in minor units';
  }

  // 3. Currency
  if (!expense.originalCurrency || !isValidCurrencyCode(expense.originalCurrency)) {
    errors.originalCurrency = 'Valid 3-letter currency code is required';
  }

  // 4. Date
  if (!expense.expenseDate || !isValidISODate(expense.expenseDate)) {
    errors.expenseDate = 'Valid ISO 8601 expense date is required';
  }

  // 5. Payer
  if (!expense.paidBy || expense.paidBy.trim().length === 0) {
    errors.paidBy = 'Payer must be specified';
  }

  // 6. Split Type
  if (!expense.splitType || !VALID_SPLIT_TYPES.includes(expense.splitType)) {
    errors.splitType = `Split type must be one of: ${VALID_SPLIT_TYPES.join(', ')}`;
  }

  // 7. Participants
  if (!expense.participants || expense.participants.length === 0) {
    errors.participants = 'At least one participant is required';
  } else {
    const participantSet = new Set(expense.participants);
    if (participantSet.size !== expense.participants.length) {
      errors.participants = 'Duplicate participants are not allowed';
    }
  }

  // 8. Splits validation
  if (!splits || splits.length === 0) {
    errors.splits = 'Splits cannot be empty';
  } else {
    let splitsSum = 0;
    const splitUserIds = new Set<string>();
    let hasNegativeShares = false;
    let hasNonIntegerShares = false;

    for (const split of splits) {
      if (!split.userId) {
        errors.splits = 'Each split must specify a user ID';
      } else if (splitUserIds.has(split.userId)) {
        errors.splits = `Duplicate participant in splits: ${split.userId}`;
      } else {
        splitUserIds.add(split.userId);
      }

      if (split.shareMinor === undefined || !Number.isInteger(split.shareMinor)) {
        hasNonIntegerShares = true;
      } else if (split.shareMinor < 0) {
        hasNegativeShares = true;
      } else {
        splitsSum += split.shareMinor;
      }
    }

    if (hasNonIntegerShares) {
      errors.shareMinor = 'Split shares must be integer minor units';
    }

    if (hasNegativeShares) {
      errors.shareMinor = 'Split shares cannot be negative';
    }

    // Check sum of shares equals expense amount
    if (
      expense.originalAmountMinor !== undefined &&
      Number.isInteger(expense.originalAmountMinor) &&
      !hasNonIntegerShares &&
      !hasNegativeShares &&
      splitsSum !== expense.originalAmountMinor
    ) {
      errors.splitsSum = `Shares sum (${splitsSum}) must equal expense amount (${expense.originalAmountMinor})`;
    }

    // Check participants match splits
    if (expense.participants && expense.participants.length > 0) {
      const participantSet = new Set(expense.participants);
      for (const userId of splitUserIds) {
        if (!participantSet.has(userId)) {
          errors.participantMismatch = `Split user ${userId} is not in expense participants`;
          break;
        }
      }
      if (!errors.participantMismatch) {
        for (const userId of expense.participants) {
          if (!splitUserIds.has(userId)) {
            errors.participantMismatch = `Participant ${userId} is missing from splits`;
            break;
          }
        }
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
