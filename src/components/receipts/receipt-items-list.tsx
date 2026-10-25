import React, { useState } from 'react';
import {
  ReceiptText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/domain/money/money';
import type { ParsedExpenseItem } from '@/domain/receipts/receipt-item-parser';

interface ReceiptItemsListProps {
  items: ParsedExpenseItem[];
  currency: string;
  subtotalMinor?: number;
  taxMinor?: number;
  discountMinor?: number;
  tipMinor?: number;
  serviceChargeMinor?: number;
  totalMinor?: number;
  users?: Array<{ id: string; name?: string; email?: string; picture?: string }>;
  currentUserId?: string;
  className?: string;
}

export const ReceiptItemsList: React.FC<ReceiptItemsListProps> = ({
  items,
  currency,
  subtotalMinor,
  taxMinor = 0,
  discountMinor = 0,
  tipMinor = 0,
  serviceChargeMinor = 0,
  totalMinor,
  users = [],
  currentUserId,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!items || items.length === 0) return null;

  const calculatedSubtotal =
    subtotalMinor ?? items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const calculatedTotal =
    totalMinor ?? calculatedSubtotal + taxMinor + tipMinor + serviceChargeMinor - discountMinor;

  // Resolve user display name for assigned items
  const resolveUserName = (userId: string) => {
    if (userId === currentUserId || userId === 'current_user' || userId === 'user_self') {
      return 'You';
    }
    const found = users.find((u) => u.id === userId);
    return found?.name?.split(' ')[0] || found?.name || found?.email || 'Participant';
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ReceiptText className="h-3.5 w-3.5 text-primary" />
          <span>Receipt Items ({items.length})</span>
        </span>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs h-6 px-2 gap-1 text-muted-foreground hover:text-foreground"
        >
          <span>{isExpanded ? 'Collapse' : 'Show Items'}</span>
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {isExpanded && (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-2xs divide-y divide-border/40">
          {/* Items Table / List */}
          <div className="divide-y divide-border/30">
            {items.map((item, index) => {
              const hasMultipleQty = item.quantity > 1;
              const unitPrice =
                item.unitPriceMinor ||
                (hasMultipleQty ? Math.round(item.lineTotalMinor / item.quantity) : item.lineTotalMinor);

              return (
                <div
                  key={item.id || `${item.name}-${index}`}
                  className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                >
                  {/* Left: Quantity badge & Item details */}
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <Badge
                      variant={hasMultipleQty ? 'default' : 'secondary'}
                      className="text-[11px] font-mono px-1.5 py-0 shrink-0 h-5 mt-0.5 font-bold"
                    >
                      {item.quantity}×
                    </Badge>

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground leading-tight break-words">
                        {item.name}
                      </p>

                      <div className="flex items-center gap-2 flex-wrap">
                        {hasMultipleQty && (
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {formatMoney(unitPrice, currency)} each
                          </span>
                        )}

                        {/* Assigned Participants Pills */}
                        {item.assignedUserIds && item.assignedUserIds.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              for:
                            </span>
                            {item.assignedUserIds.map((uid) => (
                              <Badge
                                key={uid}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 bg-muted/30 font-medium text-foreground/80 border-border/60"
                              >
                                {resolveUserName(uid)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Line total */}
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-foreground">
                      {formatMoney(item.lineTotalMinor, currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bill Summary Breakdown (Subtotal, Taxes, Discounts, Tip) */}
          {(taxMinor > 0 || discountMinor > 0 || tipMinor > 0 || serviceChargeMinor > 0) && (
            <div className="p-3 sm:px-4 bg-muted/20 border-t border-border/40 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Items Subtotal</span>
                <span className="font-medium text-foreground">
                  {formatMoney(calculatedSubtotal, currency)}
                </span>
              </div>

              {taxMinor > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Taxes & GST</span>
                  <span className="font-medium text-foreground">
                    +{formatMoney(taxMinor, currency)}
                  </span>
                </div>
              )}

              {discountMinor > 0 && (
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Discount</span>
                  <span>-{formatMoney(discountMinor, currency)}</span>
                </div>
              )}

              {tipMinor > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Tip</span>
                  <span className="font-medium">+{formatMoney(tipMinor, currency)}</span>
                </div>
              )}

              {serviceChargeMinor > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Service Charge</span>
                  <span className="font-medium">+{formatMoney(serviceChargeMinor, currency)}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1.5 border-t border-border/30 text-xs font-bold text-foreground">
                <span>Receipt Total</span>
                <span>{formatMoney(calculatedTotal, currency)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
