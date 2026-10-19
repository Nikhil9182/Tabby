import React from 'react';
import { ArrowRight, CheckCircle2, Clock, Users, ArrowRightLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CurrencyDisplay } from '@/components/currency/currency-display';
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
  const fromName = fromUser?.name || fromUser?.email || settlement.fromUserId;
  const toName = toUser?.name || toUser?.email || settlement.toUserId;

  const isYouFrom = currentUserId && settlement.fromUserId === currentUserId;
  const isYouTo = currentUserId && settlement.toUserId === currentUserId;

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
        'group flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/40 transition-all text-left outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer shadow-xs',
        className
      )}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Avatars indicating direction */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Avatar size="sm" className="ring-1 ring-border">
            {fromUser?.picture && <AvatarImage src={fromUser.picture} alt={fromName} />}
            <AvatarFallback className="text-[10px] font-semibold">
              {fromName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          <Avatar size="sm" className="ring-1 ring-border">
            {toUser?.picture && <AvatarImage src={toUser.picture} alt={toName} />}
            <AvatarFallback className="text-[10px] font-semibold">
              {toName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Narrative info */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm sm:text-base text-foreground tracking-tight">
              {isYouFrom ? 'You' : fromName} paid {isYouTo ? 'you' : toName}
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
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{formattedDate}</span>
            {settlement.notes && (
              <>
                <span>&bull;</span>
                <span className="italic truncate max-w-[180px] sm:max-w-xs">
                  &ldquo;{settlement.notes}&rdquo;
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Amount and check indicator */}
      <div className="flex flex-col items-end gap-1 shrink-0 ml-3 text-right">
        <CurrencyDisplay
          amountMinor={settlement.amountMinor}
          currency={settlement.currency}
          size="md"
          className="text-foreground font-bold"
        />
        <div className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="h-3 w-3" />
          <span>Settled</span>
        </div>
      </div>
    </div>
  );
}

export default SettlementRow;
