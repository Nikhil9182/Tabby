import React, { useState, useMemo } from 'react';
import {
  Divide,
  PieChart,
  UserCheck,
  Users,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/domain/money/money';
import { calculateReceiptSplit } from '@/domain/receipts/receipt-split-calculator';
import type { ParsedReceipt, ReceiptSplitMode } from '@/domain/receipts/types';
import { cn } from '@/lib/utils';

export interface ParticipantOption {
  id: string;
  name: string;
}

interface ReceiptSplitAssignerProps {
  receipt: ParsedReceipt;
  participants: ParticipantOption[];
  currentUserId: string;
  onConfirm: (splitResult: ReturnType<typeof calculateReceiptSplit>) => void;
  onBack: () => void;
  isSaving?: boolean;
}

export const ReceiptSplitAssigner: React.FC<ReceiptSplitAssignerProps> = ({
  receipt,
  participants,
  currentUserId,
  onConfirm,
  onBack,
  isSaving,
}) => {
  const currency = receipt.currency;

  const [splitMode, setSplitMode] = useState<ReceiptSplitMode>('equal');
  const [selectedEqualParticipants, setSelectedEqualParticipants] = useState<string[]>(
    participants.map((p) => p.id)
  );

  // Item assignment mapping: itemId -> array of participant userIds
  const [assignments, setAssignments] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    // Pre-populate each item with all participants as default, or empty
    receipt.items.forEach((item) => {
      initial[item.id] = [];
    });
    return initial;
  });

  // Calculate the active participant IDs depending on mode
  const activeParticipantIds = useMemo(() => {
    if (splitMode === 'equal') {
      return selectedEqualParticipants;
    }
    return participants.map((p) => p.id);
  }, [splitMode, selectedEqualParticipants, participants]);

  // Compute split calculation
  const splitResult = useMemo(() => {
    return calculateReceiptSplit({
      mode: splitMode,
      totalMinor: receipt.totalMinor,
      items: receipt.items,
      assignments,
      participantIds: activeParticipantIds,
      taxMinor: receipt.taxMinor,
      discountMinor: receipt.discountMinor,
      tipMinor: receipt.tipMinor,
      serviceChargeMinor: receipt.serviceChargeMinor,
      currency,
    });
  }, [
    splitMode,
    receipt.totalMinor,
    receipt.items,
    assignments,
    activeParticipantIds,
    receipt.taxMinor,
    receipt.discountMinor,
    receipt.tipMinor,
    receipt.serviceChargeMinor,
    currency,
  ]);

  // Handlers for Mode A: Equal Split
  const toggleEqualParticipant = (userId: string) => {
    setSelectedEqualParticipants((prev) => {
      if (prev.includes(userId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
  };

  // Handlers for Mode B: Assign Items
  const toggleItemParticipant = (itemId: string, userId: string) => {
    setAssignments((prev) => {
      const current = prev[itemId] || [];
      const updated = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return { ...prev, [itemId]: updated };
    });
  };

  const assignItemToAll = (itemId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [itemId]: participants.map((p) => p.id),
    }));
  };

  const assignItemToOnlyMe = (itemId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [itemId]: [currentUserId],
    }));
  };

  const clearItemAssignments = (itemId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [itemId]: [],
    }));
  };

  const assignAllItemsToEveryone = () => {
    const allIds = participants.map((p) => p.id);
    const updated: Record<string, string[]> = {};
    receipt.items.forEach((item) => {
      updated[item.id] = [...allIds];
    });
    setAssignments(updated);
  };

  const canConfirm = splitResult.isBalanced && splitResult.shares.length > 0;

  return (
    <div className="space-y-6">
      {/* Mode selection tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-muted/40 border border-border/60">
        <button
          type="button"
          onClick={() => setSplitMode('equal')}
          className={cn(
            'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all',
            splitMode === 'equal'
              ? 'bg-card text-foreground shadow-xs border border-border/80'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Divide className="h-4 w-4 text-emerald-500" />
          <span>Split Equally</span>
        </button>

        <button
          type="button"
          onClick={() => setSplitMode('items')}
          className={cn(
            'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all',
            splitMode === 'items'
              ? 'bg-card text-foreground shadow-xs border border-border/80'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <PieChart className="h-4 w-4 text-primary" />
          <span>Assign Items</span>
        </button>
      </div>

      {/* MODE A: Split Equally */}
      {splitMode === 'equal' && (
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="p-4 sm:p-5 pb-3">
            <CardTitle className="text-base">Who is sharing this bill?</CardTitle>
            <CardDescription className="text-xs">
              The total {formatMoney(receipt.totalMinor, currency)} will be divided equally among selected people.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-1 space-y-3">
            <div className="space-y-2">
              {participants.map((p) => {
                const isSelected = selectedEqualParticipants.includes(p.id);
                const share = splitResult.shares.find((s) => s.userId === p.id);

                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer',
                      isSelected
                        ? 'bg-card border-border/80 shadow-2xs'
                        : 'bg-muted/20 border-transparent opacity-60'
                    )}
                    onClick={() => toggleEqualParticipant(p.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleEqualParticipant(p.id)}
                        id={`equal-p-${p.id}`}
                      />
                      <label
                        htmlFor={`equal-p-${p.id}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {p.name} {p.id === currentUserId && '(You)'}
                      </label>
                    </div>

                    {isSelected && share && (
                      <span className="font-semibold text-sm font-mono text-foreground">
                        {formatMoney(share.totalShareMinor, currency)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODE B: Assign Items */}
      {splitMode === 'items' && (
        <div className="space-y-6">
          {/* Quick global action */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assign Items to People
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={assignAllItemsToEveryone}
              className="text-xs"
            >
              Split all items with everyone
            </Button>
          </div>

          {/* Unassigned Warning */}
          {splitResult.unassignedItemIds.length > 0 && (
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                {splitResult.unassignedItemIds.length} item(s) unassigned. Please assign all items to continue.
              </span>
            </div>
          )}

          {/* Items assignment list */}
          <div className="space-y-3">
            {receipt.items.map((item) => {
              const assignedUserIds = assignments[item.id] || [];
              const isUnassigned = assignedUserIds.length === 0;

              return (
                <Card
                  key={item.id}
                  className={cn(
                    'border transition-all shadow-2xs',
                    isUnassigned
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-border/80 bg-card'
                  )}
                >
                  <div className="p-3.5 space-y-3">
                    {/* Item row info */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {item.quantity > 1 && `${item.quantity}x `}
                            {item.name}
                          </span>
                          {isUnassigned && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">
                              Unassigned
                            </Badge>
                          )}
                        </div>
                        {item.quantity > 1 && item.unitPriceMinor && (
                          <span className="text-[11px] text-muted-foreground">
                            {formatMoney(item.unitPriceMinor, currency)} each
                          </span>
                        )}
                      </div>

                      <span className="font-bold font-mono text-sm text-foreground shrink-0">
                        {formatMoney(item.lineTotalMinor, currency)}
                      </span>
                    </div>

                    {/* Participant selector pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {participants.map((p) => {
                        const isAssigned = assignedUserIds.includes(p.id);

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleItemParticipant(item.id, p.id)}
                            className={cn(
                              'px-2.5 py-1 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5',
                              isAssigned
                                ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                                : 'bg-muted/30 text-muted-foreground hover:bg-muted/60 border-border/60'
                            )}
                          >
                            <span>{p.name.split(' ')[0]}</span>
                            {isAssigned && <CheckCircle2 className="h-3 w-3" />}
                          </button>
                        );
                      })}

                      {/* Quick assignment helpers */}
                      <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => assignItemToAll(item.id)}
                          className="hover:underline px-1"
                        >
                          All
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => assignItemToOnlyMe(item.id)}
                          className="hover:underline px-1"
                        >
                          Only Me
                        </button>
                        {assignedUserIds.length > 0 && (
                          <>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => clearItemAssignments(item.id)}
                              className="hover:underline px-1 text-rose-500"
                            >
                              Clear
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Running Per-Participant Totals Summary */}
      <Card className="border-border/60 shadow-xs bg-muted/20">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Per-Person Breakdown</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-1 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {splitResult.shares.map((share) => {
              const p = participants.find((u) => u.id === share.userId);
              const name = p ? p.name : share.userId;

              return (
                <div
                  key={share.userId}
                  className="p-3 rounded-xl border border-border/80 bg-card shadow-2xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {name} {share.userId === currentUserId && '(You)'}
                    </span>
                    <span className="font-bold text-sm font-mono text-primary">
                      {formatMoney(share.totalShareMinor, currency)}
                    </span>
                  </div>

                  {splitMode === 'items' && (
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground pt-0.5">
                      <span>Items: {formatMoney(share.assignedItemsSubtotalMinor, currency)}</span>
                      {share.taxShareMinor > 0 && (
                        <span>+Tax: {formatMoney(share.taxShareMinor, currency)}</span>
                      )}
                      {share.discountShareMinor > 0 && (
                        <span>-Disc: {formatMoney(share.discountShareMinor, currency)}</span>
                      )}
                      {(share.tipShareMinor > 0 || share.serviceChargeShareMinor > 0) && (
                        <span>
                          +Tip: {formatMoney(share.tipShareMinor + share.serviceChargeShareMinor, currency)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sum Reconciliation Bar */}
          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
            <span className="text-muted-foreground">Total Bill Shares Sum:</span>
            <div className="flex items-center gap-1.5 font-bold font-mono text-foreground">
              <span>{formatMoney(receipt.totalMinor, currency)}</span>
              {canConfirm && (
                <span title="Balanced">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation and Confirmation Footer */}
      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={isSaving}>
          Back to Review
        </Button>

        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => onConfirm(splitResult)}
          disabled={!canConfirm || isSaving}
          className="font-semibold min-w-[130px]"
        >
          {isSaving ? 'Saving Expense...' : 'Save Scanned Expense'}
        </Button>
      </div>
    </div>
  );
};
