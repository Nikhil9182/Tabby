import { calculateEqualSplit } from '@/domain/splits/split-calculator';
import type {
  ParticipantShareBreakdown,
  ReceiptItem,
  ReceiptSplitResult,
  ReceiptSplitMode,
} from './types';

export interface CalculateReceiptSplitInput {
  mode: ReceiptSplitMode;
  totalMinor: number;
  items: ReceiptItem[];
  assignments: Record<string, string[]>; // itemId -> participantIds
  participantIds: string[];
  taxMinor?: number;
  discountMinor?: number;
  tipMinor?: number;
  serviceChargeMinor?: number;
  currency?: string;
}

/**
 * Distributes an integer amount proportionally across participants based on their weights,
 * using deterministic largest-remainder distribution to guarantee exact reconciliation.
 */
export function distributeProportionallyMinor(
  totalToDistribute: number,
  participants: Array<{ userId: string; weight: number }>
): Record<string, number> {
  const result: Record<string, number> = {};
  participants.forEach((p) => {
    result[p.userId] = 0;
  });

  if (totalToDistribute === 0 || participants.length === 0) {
    return result;
  }

  const totalWeight = participants.reduce((acc, p) => acc + Math.max(0, p.weight), 0);

  // If total weight is 0, distribute equally
  if (totalWeight <= 0) {
    const count = participants.length;
    const base = Math.trunc(totalToDistribute / count);
    let rem = totalToDistribute - base * count;
    const step = rem >= 0 ? 1 : -1;
    const absRem = Math.abs(rem);

    participants.forEach((p, idx) => {
      result[p.userId] = base + (idx < absRem ? step : 0);
    });
    return result;
  }

  // Calculate raw shares and fractional remainders
  const allocations = participants.map((p, index) => {
    const raw = Math.trunc((totalToDistribute * p.weight) / totalWeight);
    const fraction = Math.abs((totalToDistribute * p.weight) % totalWeight);
    return {
      index,
      userId: p.userId,
      raw,
      fraction,
    };
  });

  const sumRaw = allocations.reduce((acc, a) => acc + a.raw, 0);
  let remainder = totalToDistribute - sumRaw;
  const step = remainder >= 0 ? 1 : -1;
  const absRemainder = Math.abs(remainder);

  // Sort by fractional remainder descending, break ties by index
  const sorted = [...allocations].sort((a, b) => {
    if (b.fraction !== a.fraction) {
      return b.fraction - a.fraction;
    }
    return a.index - b.index;
  });

  const extraMap = new Map<string, number>();
  for (let i = 0; i < absRemainder; i++) {
    const target = sorted[i % sorted.length];
    extraMap.set(target.userId, (extraMap.get(target.userId) ?? 0) + step);
  }

  allocations.forEach((a) => {
    result[a.userId] = a.raw + (extraMap.get(a.userId) ?? 0);
  });

  return result;
}

/**
 * Calculates equal bill splitting or individual item assignment bill splitting.
 * Guarantees that the sum of participant shares equals totalMinor to the exact minor unit.
 */
export function calculateReceiptSplit(input: CalculateReceiptSplitInput): ReceiptSplitResult {
  const {
    mode,
    totalMinor,
    items,
    assignments,
    participantIds,
    taxMinor = 0,
    discountMinor = 0,
    tipMinor = 0,
    serviceChargeMinor = 0,
    currency = 'INR',
  } = input;

  if (!participantIds || participantIds.length === 0) {
    return {
      mode,
      totalMinor,
      shares: [],
      unassignedItemIds: items.map((it) => it.id),
      isBalanced: false,
      discrepancyMinor: totalMinor,
      error: 'Please select at least one participant to split this bill.',
    };
  }

  // MODE A: Split Equally
  if (mode === 'equal') {
    const equalSplits = calculateEqualSplit(totalMinor, participantIds, currency);
    const shares: ParticipantShareBreakdown[] = equalSplits.map((s) => ({
      userId: s.userId,
      assignedItemsSubtotalMinor: s.shareMinor,
      taxShareMinor: 0,
      discountShareMinor: 0,
      tipShareMinor: 0,
      serviceChargeShareMinor: 0,
      discrepancyAdjustmentMinor: 0,
      totalShareMinor: s.shareMinor,
      assignedItemIds: items.map((i) => i.id),
    }));

    return {
      mode: 'equal',
      totalMinor,
      shares,
      unassignedItemIds: [],
      isBalanced: true,
      discrepancyMinor: 0,
    };
  }

  // MODE B: Assign Items
  const unassignedItemIds: string[] = [];
  const assignedItemsSubtotal: Record<string, number> = {};
  const assignedItemIdsMap: Record<string, string[]> = {};

  participantIds.forEach((uid) => {
    assignedItemsSubtotal[uid] = 0;
    assignedItemIdsMap[uid] = [];
  });

  // Check item assignments
  for (const item of items) {
    const assignedUsers = assignments[item.id] || [];
    if (assignedUsers.length === 0) {
      unassignedItemIds.push(item.id);
      continue;
    }

    // Filter to valid participants
    const validUsers = assignedUsers.filter((uid) => participantIds.includes(uid));
    if (validUsers.length === 0) {
      unassignedItemIds.push(item.id);
      continue;
    }

    // Sort user IDs deterministically for fair remainder allocation
    const sortedUsers = [...validUsers].sort();
    const count = sortedUsers.length;
    const baseShare = Math.trunc(item.lineTotalMinor / count);
    let remainder = item.lineTotalMinor - baseShare * count;
    const step = remainder >= 0 ? 1 : -1;
    const absRemainder = Math.abs(remainder);

    sortedUsers.forEach((uid, index) => {
      const extra = index < absRemainder ? step : 0;
      assignedItemsSubtotal[uid] += baseShare + extra;
      assignedItemIdsMap[uid].push(item.id);
    });
  }

  // If there are unassigned items, the split cannot be confirmed yet
  if (unassignedItemIds.length > 0) {
    return {
      mode: 'items',
      totalMinor,
      shares: participantIds.map((uid) => ({
        userId: uid,
        assignedItemsSubtotalMinor: assignedItemsSubtotal[uid] || 0,
        taxShareMinor: 0,
        discountShareMinor: 0,
        tipShareMinor: 0,
        serviceChargeShareMinor: 0,
        discrepancyAdjustmentMinor: 0,
        totalShareMinor: assignedItemsSubtotal[uid] || 0,
        assignedItemIds: assignedItemIdsMap[uid] || [],
      })),
      unassignedItemIds,
      isBalanced: false,
      discrepancyMinor: 0,
      error: `Please assign all ${items.length} items to participants.`,
    };
  }

  // Proportional weight per participant based on assigned items subtotal
  const weights = participantIds.map((uid) => ({
    userId: uid,
    weight: assignedItemsSubtotal[uid] || 0,
  }));

  // Distribute additional charges and discounts proportionally
  const taxShares = distributeProportionallyMinor(taxMinor, weights);
  const discountShares = distributeProportionallyMinor(discountMinor, weights);
  const tipShares = distributeProportionallyMinor(tipMinor, weights);
  const serviceChargeShares = distributeProportionallyMinor(serviceChargeMinor, weights);

  // Calculate each participant's preliminary total
  const shares: ParticipantShareBreakdown[] = participantIds.map((uid) => {
    const itemSub = assignedItemsSubtotal[uid] || 0;
    const tax = taxShares[uid] || 0;
    const disc = discountShares[uid] || 0;
    const tip = tipShares[uid] || 0;
    const sc = serviceChargeShares[uid] || 0;

    const preliminary = itemSub + tax + tip + sc - disc;

    return {
      userId: uid,
      assignedItemsSubtotalMinor: itemSub,
      taxShareMinor: tax,
      discountShareMinor: disc,
      tipShareMinor: tip,
      serviceChargeShareMinor: sc,
      discrepancyAdjustmentMinor: 0,
      totalShareMinor: preliminary,
      assignedItemIds: assignedItemIdsMap[uid] || [],
    };
  });

  // Reconcile exact sum to totalMinor
  const currentSum = shares.reduce((acc, s) => acc + s.totalShareMinor, 0);
  const discrepancy = totalMinor - currentSum;

  if (discrepancy !== 0 && shares.length > 0) {
    // Distribute discrepancy penny-by-penny to participants with highest totals
    const sorted = [...shares].sort((a, b) => b.totalShareMinor - a.totalShareMinor);
    const step = discrepancy > 0 ? 1 : -1;
    const absDiscrepancy = Math.abs(discrepancy);

    for (let i = 0; i < absDiscrepancy; i++) {
      const target = sorted[i % sorted.length];
      target.discrepancyAdjustmentMinor += step;
      target.totalShareMinor += step;
    }
  }

  // Verify final sum
  const finalSum = shares.reduce((acc, s) => acc + s.totalShareMinor, 0);
  const isBalanced = finalSum === totalMinor;

  return {
    mode: 'items',
    totalMinor,
    shares,
    unassignedItemIds: [],
    isBalanced,
    discrepancyMinor: totalMinor - finalSum,
  };
}
