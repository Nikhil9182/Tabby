import { generateId } from '../../lib/id';
import type { ExpenseSplit } from '../models/types';

/**
 * Calculates equal splits for a total expense among participants.
 * Deterministically distributes any rounding remainder penny-by-penny to the first participants
 * so the sum of shares is guaranteed to exactly equal totalMinor.
 *
 * @param totalMinor Total expense amount in minor units.
 * @param participantIds List of participant user IDs.
 * @param _currency Currency code (unused in arithmetic, provided for context/interface consistency).
 * @param expenseId Optional expense ID to associate with the splits.
 * @returns Array of ExpenseSplit records.
 * @throws Error if participantIds is empty or contains duplicate IDs.
 */
export function calculateEqualSplit(
  totalMinor: number,
  participantIds: string[],
  _currency?: string,
  expenseId?: string
): ExpenseSplit[] {
  if (!participantIds || participantIds.length === 0) {
    throw new Error('At least one participant is required for equal split');
  }

  const unique = new Set(participantIds);
  if (unique.size !== participantIds.length) {
    throw new Error('Participant IDs must be unique');
  }

  const count = participantIds.length;
  const baseShare = Math.trunc(totalMinor / count);
  let remainder = totalMinor - baseShare * count;
  const step = remainder >= 0 ? 1 : -1;
  const absRemainder = Math.abs(remainder);

  const now = new Date().toISOString();
  return participantIds.map((userId, index) => {
    const extra = index < absRemainder ? step : 0;
    const shareMinor = baseShare + extra;
    return {
      id: generateId(),
      expenseId: expenseId ?? '',
      userId,
      shareMinor,
      createdAt: now,
    };
  });
}

/**
 * Calculates an exact split from explicit user-provided amounts.
 * Validates that the sum of exact amounts equals totalMinor.
 *
 * @param totalMinor Total expense amount in minor units.
 * @param shares Array of participant user IDs and exact minor amounts.
 * @param expenseId Optional expense ID to associate with the splits.
 * @returns Array of ExpenseSplit records.
 * @throws Error if shares do not sum to totalMinor or contain duplicate users.
 */
export function calculateExactSplit(
  totalMinor: number,
  shares: { userId: string; amountMinor: number }[],
  expenseId?: string
): ExpenseSplit[] {
  if (!shares || shares.length === 0) {
    throw new Error('At least one share is required for exact split');
  }

  const userIds = new Set<string>();
  let sum = 0;

  for (const s of shares) {
    if (userIds.has(s.userId)) {
      throw new Error(`Duplicate user ID in exact split: ${s.userId}`);
    }
    userIds.add(s.userId);
    if (!Number.isInteger(s.amountMinor)) {
      throw new Error(`Share amount for user ${s.userId} must be an integer`);
    }
    sum += s.amountMinor;
  }

  if (sum !== totalMinor) {
    throw new Error(
      `Exact split shares sum (${sum}) must equal total amount (${totalMinor})`
    );
  }

  const now = new Date().toISOString();
  return shares.map((s) => ({
    id: generateId(),
    expenseId: expenseId ?? '',
    userId: s.userId,
    shareMinor: s.amountMinor,
    createdAt: now,
  }));
}

/**
 * Calculates percentage-based splits specified in basis points (10000 basis points = 100.00%).
 * Validates that basis points sum to 10000, and distributes rounding remainders
 * deterministically to participants with the largest rounding fractions.
 *
 * @param totalMinor Total expense amount in minor units.
 * @param percentages Array of participant user IDs and percentage basis points.
 * @param _currency Currency code.
 * @param expenseId Optional expense ID to associate with the splits.
 * @returns Array of ExpenseSplit records.
 * @throws Error if basis points do not sum to 10000 or duplicate users are present.
 */
export function calculatePercentageSplit(
  totalMinor: number,
  percentages: { userId: string; basisPoints: number }[],
  _currency?: string,
  expenseId?: string
): ExpenseSplit[] {
  if (!percentages || percentages.length === 0) {
    throw new Error('At least one participant is required for percentage split');
  }

  const userIds = new Set<string>();
  let totalBp = 0;

  for (const p of percentages) {
    if (userIds.has(p.userId)) {
      throw new Error(`Duplicate user ID in percentage split: ${p.userId}`);
    }
    userIds.add(p.userId);
    if (!Number.isInteger(p.basisPoints) || p.basisPoints < 0) {
      throw new Error(`Basis points for user ${p.userId} must be a non-negative integer`);
    }
    totalBp += p.basisPoints;
  }

  if (totalBp !== 10000) {
    throw new Error(
      `Percentage basis points must sum to 10000 (100%). Received ${totalBp}`
    );
  }

  interface AllocationItem {
    index: number;
    userId: string;
    basisPoints: number;
    rawShare: number;
    fraction: number;
  }

  const items: AllocationItem[] = percentages.map((p, index) => {
    const rawShare = Math.trunc((totalMinor * p.basisPoints) / 10000);
    const fraction = Math.abs((totalMinor * p.basisPoints) % 10000);
    return {
      index,
      userId: p.userId,
      basisPoints: p.basisPoints,
      rawShare,
      fraction,
    };
  });

  const sumRaw = items.reduce((acc, item) => acc + item.rawShare, 0);
  let remainder = totalMinor - sumRaw;
  const step = remainder >= 0 ? 1 : -1;
  const absRemainder = Math.abs(remainder);

  // Sort by fractional part descending, break ties by original index
  const sorted = [...items].sort((a, b) => {
    if (b.fraction !== a.fraction) {
      return b.fraction - a.fraction;
    }
    return a.index - b.index;
  });

  const extraMap = new Map<number, number>();
  for (let i = 0; i < absRemainder; i++) {
    const targetItem = sorted[i % sorted.length];
    extraMap.set(targetItem.index, (extraMap.get(targetItem.index) ?? 0) + step);
  }

  const now = new Date().toISOString();
  return items.map((item) => ({
    id: generateId(),
    expenseId: expenseId ?? '',
    userId: item.userId,
    shareMinor: item.rawShare + (extraMap.get(item.index) ?? 0),
    percentageBasisPoints: item.basisPoints,
    createdAt: now,
  }));
}

/**
 * Calculates weighted shares splits from arbitrary proportional weights.
 * Distributes rounding remainders deterministically penny-by-penny so that
 * the sum of shares matches totalMinor exactly.
 *
 * @param totalMinor Total expense amount in minor units.
 * @param weights Array of participant user IDs and positive weights.
 * @param _currency Currency code.
 * @param expenseId Optional expense ID to associate with the splits.
 * @returns Array of ExpenseSplit records.
 * @throws Error if total weight is non-positive or duplicate users are present.
 */
export function calculateSharesSplit(
  totalMinor: number,
  weights: { userId: string; weight: number }[],
  _currency?: string,
  expenseId?: string
): ExpenseSplit[] {
  if (!weights || weights.length === 0) {
    throw new Error('At least one participant is required for shares split');
  }

  const userIds = new Set<string>();
  let totalWeight = 0;

  for (const w of weights) {
    if (userIds.has(w.userId)) {
      throw new Error(`Duplicate user ID in shares split: ${w.userId}`);
    }
    userIds.add(w.userId);
    if (w.weight < 0) {
      throw new Error(`Weight for user ${w.userId} must be non-negative`);
    }
    totalWeight += w.weight;
  }

  if (totalWeight <= 0) {
    throw new Error('Total weight must be greater than zero');
  }

  interface WeightAllocationItem {
    index: number;
    userId: string;
    weight: number;
    rawShare: number;
    fraction: number;
  }

  const items: WeightAllocationItem[] = weights.map((w, index) => {
    const rawShare = Math.trunc((totalMinor * w.weight) / totalWeight);
    const fraction = Math.abs((totalMinor * w.weight) % totalWeight);
    return {
      index,
      userId: w.userId,
      weight: w.weight,
      rawShare,
      fraction,
    };
  });

  const sumRaw = items.reduce((acc, item) => acc + item.rawShare, 0);
  let remainder = totalMinor - sumRaw;
  const step = remainder >= 0 ? 1 : -1;
  const absRemainder = Math.abs(remainder);

  // Sort by fraction descending, break ties by original index
  const sorted = [...items].sort((a, b) => {
    if (b.fraction !== a.fraction) {
      return b.fraction - a.fraction;
    }
    return a.index - b.index;
  });

  const extraMap = new Map<number, number>();
  for (let i = 0; i < absRemainder; i++) {
    const targetItem = sorted[i % sorted.length];
    extraMap.set(targetItem.index, (extraMap.get(targetItem.index) ?? 0) + step);
  }

  const now = new Date().toISOString();
  return items.map((item) => ({
    id: generateId(),
    expenseId: expenseId ?? '',
    userId: item.userId,
    shareMinor: item.rawShare + (extraMap.get(item.index) ?? 0),
    weight: item.weight,
    createdAt: now,
  }));
}

/**
 * Validates an array of expense splits against the expense total.
 * Checks for duplicate user IDs, valid integer share values, and exact total sum.
 *
 * @param splits Array of ExpenseSplit objects to validate.
 * @param totalMinor Expected total amount in minor units.
 * @returns Object with valid flag and optional error message.
 */
export function validateSplit(
  splits: ExpenseSplit[],
  totalMinor: number
): { valid: boolean; error?: string } {
  if (!splits || splits.length === 0) {
    return { valid: false, error: 'At least one split is required' };
  }

  const userIds = new Set<string>();
  let sum = 0;

  for (const split of splits) {
    if (!split.userId) {
      return { valid: false, error: 'Split user ID cannot be empty' };
    }
    if (userIds.has(split.userId)) {
      return { valid: false, error: `Duplicate user ID in splits: ${split.userId}` };
    }
    userIds.add(split.userId);

    if (!Number.isInteger(split.shareMinor)) {
      return {
        valid: false,
        error: `Split share for user ${split.userId} must be an integer`,
      };
    }
    sum += split.shareMinor;
  }

  if (sum !== totalMinor) {
    return {
      valid: false,
      error: `Split shares sum (${sum}) must equal total amount (${totalMinor})`,
    };
  }

  return { valid: true };
}
