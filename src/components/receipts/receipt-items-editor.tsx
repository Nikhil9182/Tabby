import React, { useMemo } from 'react';
import { Plus, Trash2, ReceiptText, Users, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { generateId } from '@/lib/id';
import { toMajorUnits, formatMoney, parseMoney } from '@/domain/money/money';
import type { ParsedExpenseItem } from '@/domain/receipts/receipt-item-parser';
import { cn } from '@/lib/utils';

export interface ReceiptItemRowState {
  id: string;
  name: string;
  quantity: number;
  lineTotalStr: string;
  assignedUserIds: string[];
}

export interface ReceiptItemsEditorState {
  items: ReceiptItemRowState[];
  taxStr: string;
  discountStr: string;
  tipStr: string;
}

export interface ReceiptItemsEditorProps {
  items: ReceiptItemRowState[];
  taxStr: string;
  discountStr: string;
  tipStr: string;
  currency: string;
  participants: Array<{ id: string; name: string }>;
  currentUserId: string;
  onChange: (updated: ReceiptItemsEditorState) => void;
  onRemoveReceiptSection?: () => void;
}

export const ReceiptItemsEditor: React.FC<ReceiptItemsEditorProps> = ({
  items,
  taxStr,
  discountStr,
  tipStr,
  currency,
  participants,
  currentUserId,
  onChange,
  onRemoveReceiptSection,
}) => {
  // Calculate real-time financial totals
  const summary = useMemo(() => {
    let subtotalMinor = 0;
    items.forEach((item) => {
      subtotalMinor += parseMoney(item.lineTotalStr || '0', currency);
    });

    const taxMinor = parseMoney(taxStr || '0', currency);
    const discountMinor = parseMoney(discountStr || '0', currency);
    const tipMinor = parseMoney(tipStr || '0', currency);
    const totalMinor = Math.max(0, subtotalMinor + taxMinor + tipMinor - discountMinor);

    return {
      subtotalMinor,
      taxMinor,
      discountMinor,
      tipMinor,
      totalMinor,
    };
  }, [items, taxStr, discountStr, tipStr, currency]);

  // Handle row property updates
  const updateRow = (index: number, patch: Partial<ReceiptItemRowState>) => {
    const updated = [...items];
    updated[index] = { ...updated[index], ...patch };
    onChange({
      items: updated,
      taxStr,
      discountStr,
      tipStr,
    });
  };

  // Add new blank item
  const handleAddItem = () => {
    const newItem: ReceiptItemRowState = {
      id: generateId(),
      name: '',
      quantity: 1,
      lineTotalStr: '',
      assignedUserIds: participants.map((p) => p.id), // Default to all participants
    };
    onChange({
      items: [...items, newItem],
      taxStr,
      discountStr,
      tipStr,
    });
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    onChange({
      items: updated,
      taxStr,
      discountStr,
      tipStr,
    });
  };

  // Toggle user assignment for a line item
  const toggleItemParticipant = (itemIndex: number, userId: string) => {
    const currentAssigned = items[itemIndex].assignedUserIds || [];
    let nextAssigned: string[];

    if (currentAssigned.includes(userId)) {
      if (currentAssigned.length === 1) return; // Keep at least one
      nextAssigned = currentAssigned.filter((id) => id !== userId);
    } else {
      nextAssigned = [...currentAssigned, userId];
    }

    updateRow(itemIndex, { assignedUserIds: nextAssigned });
  };

  // Assign item to all participants
  const assignToAll = (itemIndex: number) => {
    updateRow(itemIndex, { assignedUserIds: participants.map((p) => p.id) });
  };

  // Assign item only to current user
  const assignToOnlyMe = (itemIndex: number) => {
    updateRow(itemIndex, { assignedUserIds: [currentUserId] });
  };

  return (
    <Card className="border-border/70 shadow-xs overflow-hidden">
      <CardHeader className="p-4 sm:p-5 pb-3 bg-muted/15 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Receipt Items & Breakdown</CardTitle>
              <CardDescription className="text-xs">
                Edit detected item lines, quantities, prices, taxes, and participant shares.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge variant="outline" className="font-semibold text-xs px-2.5 py-0.5">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </Badge>

            {onRemoveReceiptSection && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onRemoveReceiptSection}
                className="text-xs text-rose-500 hover:text-rose-600 h-7"
              >
                Clear Items
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Items List */}
        <div className="space-y-3">
          {items.map((item, index) => {
            const assigned = item.assignedUserIds || [];
            const isAllAssigned =
              participants.length > 0 &&
              participants.every((p) => assigned.includes(p.id));

            return (
              <div
                key={item.id || index}
                className="p-3 sm:p-3.5 rounded-xl border border-border/60 bg-muted/10 hover:bg-muted/20 transition-colors space-y-2.5"
              >
                {/* Main Item Row: Name, Quantity, Line Total, Trash */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Quantity input */}
                  <div className="w-16 shrink-0">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                      Qty
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        updateRow(index, { quantity: isNaN(val) || val <= 0 ? 1 : val });
                      }}
                      className="h-9 text-center font-mono font-semibold text-sm bg-background"
                    />
                  </div>

                  {/* Name input */}
                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1 truncate">
                      Item Description
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Tandoori Chicken"
                      value={item.name}
                      onChange={(e) => updateRow(index, { name: e.target.value })}
                      className="h-9 text-sm font-medium bg-background"
                    />
                  </div>

                  {/* Price input */}
                  <div className="w-28 sm:w-32 shrink-0">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1 text-right">
                      Price ({currency})
                    </label>
                    <Input
                      type="text"
                      placeholder="0.00"
                      value={item.lineTotalStr}
                      onChange={(e) => updateRow(index, { lineTotalStr: e.target.value })}
                      className="h-9 text-right font-mono font-bold text-sm bg-background"
                    />
                  </div>

                  {/* Delete button */}
                  <div className="pt-5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveItem(index)}
                      className="h-9 w-9 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"
                      title="Remove Item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Participant Assignment Pills (if multiple participants exist) */}
                {participants.length > 1 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-1 border-t border-border/40 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-medium text-muted-foreground mr-1">
                        Split among:
                      </span>
                      {participants.map((p) => {
                        const isSelected = assigned.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleItemParticipant(index, p.id)}
                            className={cn(
                              'px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all border cursor-pointer',
                              isSelected
                                ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                                : 'bg-background text-muted-foreground border-border/60 hover:text-foreground'
                            )}
                          >
                            {p.id === currentUserId ? 'You' : p.name.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>

                    {/* Quick Assignment Shortcuts */}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => assignToAll(index)}
                        className={cn(
                          'hover:underline hover:text-foreground cursor-pointer',
                          isAllAssigned && 'font-bold text-foreground'
                        )}
                      >
                        All
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => assignToOnlyMe(index)}
                        className="hover:underline hover:text-foreground cursor-pointer"
                      >
                        Only Me
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Item Button */}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddItem}
            className="gap-1.5 text-xs font-semibold rounded-xl h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Item</span>
          </Button>
        </div>

        {/* Taxes, Discounts, and Fees */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-muted/15 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Taxes, Discounts & Adjustments
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Tax / GST ({currency})
              </label>
              <Input
                type="text"
                placeholder="0.00"
                value={taxStr}
                onChange={(e) =>
                  onChange({
                    items,
                    taxStr: e.target.value,
                    discountStr,
                    tipStr,
                  })
                }
                className="h-8 text-sm font-mono bg-background"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Discount ({currency})
              </label>
              <Input
                type="text"
                placeholder="0.00"
                value={discountStr}
                onChange={(e) =>
                  onChange({
                    items,
                    taxStr,
                    discountStr: e.target.value,
                    tipStr,
                  })
                }
                className="h-8 text-sm font-mono bg-background"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Tip ({currency})
              </label>
              <Input
                type="text"
                placeholder="0.00"
                value={tipStr}
                onChange={(e) =>
                  onChange({
                    items,
                    taxStr,
                    discountStr,
                    tipStr: e.target.value,
                  })
                }
                className="h-8 text-sm font-mono bg-background"
              />
            </div>
          </div>
        </div>

        {/* Calculated Financial Summary */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-primary/5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Items Subtotal</span>
            <span className="font-medium text-foreground">
              {formatMoney(summary.subtotalMinor, currency)}
            </span>
          </div>

          {summary.taxMinor > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Taxes & GST</span>
              <span className="font-medium text-foreground">
                +{formatMoney(summary.taxMinor, currency)}
              </span>
            </div>
          )}

          {summary.discountMinor > 0 && (
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
              <span>Discount</span>
              <span>-{formatMoney(summary.discountMinor, currency)}</span>
            </div>
          )}

          {summary.tipMinor > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Tip</span>
              <span className="font-medium text-foreground">
                +{formatMoney(summary.tipMinor, currency)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-sm font-black text-foreground">
            <span>Calculated Total</span>
            <span>{formatMoney(summary.totalMinor, currency)}</span>
          </div>

          <p className="text-[11px] text-muted-foreground pt-1">
            ✓ Total amount is synced with the main expense total.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
