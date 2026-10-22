import React from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { formatMoney } from '@/domain/money/money';
import { formatRelativeDate, formatDate } from '@/lib/date';
import type { Settlement, User } from '@/domain/models/types';
import { cn } from '@/lib/utils';

export interface SettlementRowProps {
  settlement: Settlement;
  fromUser?: User;
  toUser?: User;
  groupName?: string;
  currentUserId?: string;
  onClick?: () => void;
  className?: string;
}

export function SettlementRow({
  settlement,
  fromUser,
  toUser,
  groupName,
  currentUserId,
  onClick,
  className,
}: SettlementRowProps) {
  const isYouFrom =
    Boolean(currentUserId && settlement.fromUserId === currentUserId) ||
    settlement.fromUserId === 'user_self' ||
    settlement.fromUserId === 'current_user' ||
    fromUser?.id === 'user_self' ||
    fromUser?.id === 'current_user';
  const isYouTo =
    Boolean(currentUserId && settlement.toUserId === currentUserId) ||
    settlement.toUserId === 'user_self' ||
    settlement.toUserId === 'current_user' ||
    toUser?.id === 'user_self' ||
    toUser?.id === 'current_user';

  const fromName = isYouFrom
    ? 'You'
    : fromUser?.name || fromUser?.email || (settlement.fromUserId === 'user_self' ? 'You' : 'Someone');
  const toName = isYouTo
    ? 'You'
    : toUser?.name || toUser?.email || (settlement.toUserId === 'user_self' ? 'You' : 'Someone');

  const settlementDateObj = new Date(settlement.settlementDate);
  const now = new Date();
  const diffDays = Math.abs(now.getTime() - settlementDateObj.getTime()) / (1000 * 3600 * 24);
  const formattedDate =
    diffDays < 7 ? formatRelativeDate(settlement.settlementDate) : formatDate(settlement.settlementDate, 'MMM d, yyyy');

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
        'group flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between p-4 sm:p-5 rounded-3xl border border-border/80 bg-card hover:border-[#0055FF]/40 hover:shadow-xs transition-all text-left outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
        className
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Avatars indicating direction */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Avatar size="sm" className="border-2 border-background">
            {fromUser?.picture && <AvatarImage src={fromUser.picture} alt={fromName} />}
            <AvatarFallback className="text-[10px] font-black uppercase bg-muted text-foreground">
              {fromName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          <Avatar size="sm" className="border-2 border-background">
            {toUser?.picture && <AvatarImage src={toUser.picture} alt={toName} />}
            <AvatarFallback className="text-[10px] font-black uppercase bg-muted text-foreground">
              {toName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Narrative info */}
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm sm:text-base text-foreground tracking-tight group-hover:text-[#0055FF] transition-colors">
              {isYouFrom ? 'You' : fromName} paid {isYouTo ? 'you' : toName}
            </span>

            {groupName && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-1.5 py-0 font-semibold gap-1 bg-muted/40 border-border/60 text-muted-foreground"
              >
                <Users className="h-3 w-3" />
                <span className="truncate max-w-[120px]">{groupName}</span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium">{formattedDate}</span>
            {settlement.notes && (
              <>
                <span>&bull;</span>
                <span className="italic truncate max-w-[180px] sm:max-w-xs font-normal">
                  "{settlement.notes}"
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Amount Display */}
      <div className="shrink-0 pl-3 text-right">
        <CurrencyDisplay
          amountMinor={settlement.amountMinor}
          currency={settlement.currency}
          size="md"
          className="font-black text-foreground"
        />
        {/* Cross-currency payment: what it took off the debt, at the rate saved with it */}
        {settlement.appliedCurrency &&
          settlement.appliedAmountMinor &&
          settlement.appliedCurrency !== settlement.currency && (
            <p
              className="text-[11px] text-muted-foreground"
              title={settlement.exchangeRateDate ? `Rate for ${settlement.exchangeRateDate}, saved with the payment` : undefined}
            >
              {formatMoney(settlement.appliedAmountMinor, settlement.appliedCurrency)} off the {settlement.appliedCurrency}{' '}
              balance
            </p>
          )}
      </div>
    </div>
  );
}

export default SettlementRow;
