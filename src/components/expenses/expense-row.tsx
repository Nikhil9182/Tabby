import React from 'react';
import {
  Utensils,
  ShoppingCart,
  Car,
  Film,
  Home,
  Zap,
  Plane,
  HeartPulse,
  ShoppingBag,
  MoreHorizontal,
  Tag,
  Receipt,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { formatRelativeDate, formatDate } from '@/lib/date';
import type { Expense } from '@/domain/models/types';
import { cn } from '@/lib/utils';

export interface ExpenseRowProps {
  expense: Expense;
  groupName?: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  payerName?: string;
  currentUserId?: string;
  userShareMinor?: number;
  defaultCurrency?: string;
  syncStatus?: 'synced' | 'pending' | 'conflict';
  onClick?: () => void;
  className?: string;
}

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Utensils,
  ShoppingCart,
  Car,
  Film,
  Home,
  Zap,
  Plane,
  HeartPulse,
  ShoppingBag,
  MoreHorizontal,
  Tag,
  Receipt,
};

export function ExpenseRow({
  expense,
  groupName,
  categoryName,
  categoryIcon,
  categoryColor,
  payerName,
  currentUserId,
  userShareMinor,
  defaultCurrency = 'USD',
  syncStatus = 'synced',
  onClick,
  className,
}: ExpenseRowProps) {
  const IconComponent = (categoryIcon && CATEGORY_ICON_MAP[categoryIcon]) || Receipt;

  const isCurrentPayer =
    (currentUserId && expense.paidBy === currentUserId) ||
    expense.paidBy === 'user_self' ||
    expense.paidBy === 'current_user' ||
    payerName === 'user_self' ||
    payerName === 'You';
  const isDifferentCurrency =
    expense.originalCurrency &&
    defaultCurrency &&
    expense.originalCurrency.toUpperCase() !== defaultCurrency.toUpperCase();

  // Date formatting: relative if within last 7 days, absolute otherwise
  const expenseDateObj = new Date(expense.expenseDate);
  const now = new Date();
  const diffDays = Math.abs(now.getTime() - expenseDateObj.getTime()) / (1000 * 3600 * 24);
  const formattedDate =
    diffDays < 7 ? formatRelativeDate(expense.expenseDate) : formatDate(expense.expenseDate, 'MMM d, yyyy');

  // Determine user perspective if available
  // If user paid: other people owe them (total - their share)
  // If user did not pay: user owes their share
  let userPerspectiveText: React.ReactNode = null;
  if (currentUserId) {
    if (isCurrentPayer) {
      const othersOwe =
        userShareMinor !== undefined
          ? expense.originalAmountMinor - userShareMinor
          : expense.originalAmountMinor;
      userPerspectiveText = (
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          you lent <CurrencyDisplay amountMinor={othersOwe} currency={expense.originalCurrency} size="sm" />
        </span>
      );
    } else if (userShareMinor !== undefined && userShareMinor > 0) {
      userPerspectiveText = (
        <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
          you owe <CurrencyDisplay amountMinor={userShareMinor} currency={expense.originalCurrency} size="sm" />
        </span>
      );
    } else {
      userPerspectiveText = (
        <span className="text-xs text-muted-foreground">not involved</span>
      );
    }
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/40 transition-all text-left outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer shadow-xs',
        className
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Category icon avatar */}
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border border-border/40 transition-transform group-hover:scale-105"
          style={{
            backgroundColor: categoryColor ? `${categoryColor}15` : 'rgba(var(--primary), 0.1)',
            color: categoryColor || 'currentColor',
          }}
        >
          <IconComponent className="h-5 w-5" />
        </div>

        {/* Expense info */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm sm:text-base text-foreground tracking-tight truncate max-w-[200px] sm:max-w-xs">
              {expense.description}
            </span>

            {groupName && (
              <Badge
                variant="outline"
                className="text-[11px] h-5 px-1.5 py-0 font-normal gap-1 bg-muted/40 border-border/60 text-muted-foreground"
              >
                <Users className="h-3 w-3" />
                <span className="truncate max-w-[100px]">{groupName}</span>
              </Badge>
            )}

            {categoryName && (
              <Badge
                variant="secondary"
                className="text-[11px] h-5 px-1.5 py-0 font-normal text-muted-foreground"
              >
                {categoryName}
              </Badge>
            )}

            {isDifferentCurrency && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1 py-0 font-mono text-muted-foreground"
              >
                {expense.originalCurrency}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formattedDate}</span>
            <span>&bull;</span>
            <span className="truncate">
              {isCurrentPayer ? 'Paid by you' : `Paid by ${payerName && payerName !== 'user_self' ? payerName : 'someone'}`}
            </span>

            {/* Sync status indicator */}
            {syncStatus === 'pending' && (
              <span className="inline-flex items-center gap-0.5 text-amber-500" title="Sync pending">
                <Clock className="h-3 w-3" />
              </span>
            )}
            {syncStatus === 'conflict' && (
              <span className="inline-flex items-center gap-0.5 text-rose-500" title="Sync conflict">
                <AlertCircle className="h-3 w-3" />
              </span>
            )}
            {syncStatus === 'synced' && (
              <span className="inline-flex items-center gap-0.5 text-emerald-500/70" title="Synced">
                <CheckCircle2 className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Amount and user split preview */}
      <div className="flex flex-col items-end gap-1 shrink-0 ml-3 text-right">
        <CurrencyDisplay
          amountMinor={expense.originalAmountMinor}
          currency={expense.originalCurrency}
          size="md"
          className="text-foreground font-bold"
        />
        {userPerspectiveText}
      </div>
    </div>
  );
}

export default ExpenseRow;
