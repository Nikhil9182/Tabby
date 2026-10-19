import { generateId, generateOperationId } from '../../lib/id';
import { isValidISODate } from '../../lib/date';
import type { Settlement, SettlementAllocation } from '../models/types';
import type { PairwiseBalance } from '../balances/balance-engine';
import { isValidCurrencyCode } from '../money/money';

/**
 * Parameters for creating a new settlement.
 */
export interface CreateSettlementParams {
  /** The debtor making the payment. */
  fromUserId: string;
  /** The creditor receiving the payment. */
  toUserId: string;
  /** Amount paid in integer minor units. */
  amountMinor: number;
  /** Currency code (e.g., 'USD'). */
  currency: string;
  /** ISO 8601 date string of the settlement. */
  settlementDate: string;
  /** Optional user notes. */
  notes?: string;
  /** Optional group ID. */
  groupId?: string;
  /** Logical source ID (defaults to groupId or fromUserId). */
  sourceId?: string;
  /** ID of user recording the settlement. */
  createdBy: string;
  /** Optional exchange rate applied. */
  exchangeRate?: number;
  /** Optional exchange rate date. */
  exchangeRateDate?: string;
  /** Optional allocations to specific expense items. */
  allocations?: {
    expenseId: string;
    amountMinor: number;
    currency: string;
  }[];
}

/**
 * Validates settlement properties.
 *
 * @param settlement Partial settlement object to validate.
 * @returns Object with valid flag and list of error messages.
 */
export function validateSettlement(
  settlement: Partial<Settlement>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!settlement.fromUserId || settlement.fromUserId.trim().length === 0) {
    errors.push('Payer (fromUserId) is required');
  }

  if (!settlement.toUserId || settlement.toUserId.trim().length === 0) {
    errors.push('Recipient (toUserId) is required');
  }

  if (
    settlement.fromUserId &&
    settlement.toUserId &&
    settlement.fromUserId === settlement.toUserId
  ) {
    errors.push('Payer and recipient cannot be the same user');
  }

  if (
    settlement.amountMinor === undefined ||
    !Number.isInteger(settlement.amountMinor) ||
    settlement.amountMinor <= 0
  ) {
    errors.push('Settlement amount must be a positive integer in minor units');
  }

  if (
    !settlement.currency ||
    typeof settlement.currency !== 'string' ||
    !isValidCurrencyCode(settlement.currency)
  ) {
    errors.push('Valid 3-letter currency code is required');
  }

  if (!settlement.settlementDate || !isValidISODate(settlement.settlementDate)) {
    errors.push('Valid ISO 8601 settlement date is required');
  }

  if (!settlement.createdBy || settlement.createdBy.trim().length === 0) {
    errors.push('CreatedBy user ID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a Settlement record and optional associated SettlementAllocations.
 *
 * @param params Creation parameters.
 * @returns Object containing the created Settlement and SettlementAllocation array.
 * @throws Error if validation fails.
 */
export function createSettlement(params: CreateSettlementParams): {
  settlement: Settlement;
  allocations: SettlementAllocation[];
} {
  const validation = validateSettlement(params);
  if (!validation.valid) {
    throw new Error(`Invalid settlement: ${validation.errors.join(', ')}`);
  }

  const now = new Date().toISOString();
  const settlementId = generateId();
  const operationId = generateOperationId();

  const sourceId = params.sourceId ?? params.groupId ?? params.fromUserId;

  const settlement: Settlement = {
    id: settlementId,
    sourceId,
    groupId: params.groupId,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    amountMinor: params.amountMinor,
    currency: params.currency.toUpperCase(),
    settlementDate: params.settlementDate,
    notes: params.notes,
    exchangeRate: params.exchangeRate,
    exchangeRateDate: params.exchangeRateDate,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
    operationId,
    revision: 1,
  };

  const allocations: SettlementAllocation[] = [];
  if (params.allocations && params.allocations.length > 0) {
    let totalAllocated = 0;
    for (const alloc of params.allocations) {
      if (!alloc.expenseId) {
        throw new Error('Allocation requires a valid expenseId');
      }
      if (!Number.isInteger(alloc.amountMinor) || alloc.amountMinor <= 0) {
        throw new Error('Allocation amount must be a positive integer in minor units');
      }
      totalAllocated += alloc.amountMinor;
      allocations.push({
        id: generateId(),
        settlementId,
        expenseId: alloc.expenseId,
        amountMinor: alloc.amountMinor,
        currency: (alloc.currency || params.currency).toUpperCase(),
      });
    }

    if (totalAllocated > params.amountMinor) {
      throw new Error(
        `Allocated amount (${totalAllocated}) cannot exceed settlement amount (${params.amountMinor})`
      );
    }
  }

  return { settlement, allocations };
}

/**
 * Applies a settlement transaction to an existing set of pairwise balances.
 * Reduces or reverses debt between the paying user and the receiving user.
 *
 * @param settlement The settlement to apply.
 * @param currentBalances The existing list of pairwise balances.
 * @returns Updated array of PairwiseBalance items.
 */
export function applySettlementToBalances(
  settlement: Settlement,
  currentBalances: PairwiseBalance[]
): PairwiseBalance[] {
  const fromUser = settlement.fromUserId;
  const toUser = settlement.toUserId;
  const amount = settlement.amountMinor;
  const currency = settlement.currency;

  let netFromTo = 0;
  const otherBalances: PairwiseBalance[] = [];

  for (const b of currentBalances) {
    if (b.fromUserId === fromUser && b.toUserId === toUser) {
      netFromTo += b.amountMinor;
    } else if (b.fromUserId === toUser && b.toUserId === fromUser) {
      netFromTo -= b.amountMinor;
    } else {
      otherBalances.push(b);
    }
  }

  // The settlement means fromUser pays toUser `amount`
  // This reduces what fromUser owes toUser
  netFromTo -= amount;

  if (netFromTo > 0) {
    otherBalances.push({
      fromUserId: fromUser,
      toUserId: toUser,
      amountMinor: netFromTo,
      currency,
    });
  } else if (netFromTo < 0) {
    otherBalances.push({
      fromUserId: toUser,
      toUserId: fromUser,
      amountMinor: Math.abs(netFromTo),
      currency,
    });
  }

  return otherBalances;
}
