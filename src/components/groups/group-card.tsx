import React from 'react';
import { Users, ChevronRight, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import type { Group, User } from '@/domain/models/types';
import { cn } from '@/lib/utils';

export interface GroupCardProps {
  group: Group;
  members?: User[];
  memberCount?: number;
  netBalanceMinor?: number; // positive = owed to you, negative = you owe, 0 = settled
  expenseCount?: number;
  currency?: string;
  onClick?: () => void;
  className?: string;
}

export function GroupCard({
  group,
  members = [],
  memberCount,
  netBalanceMinor = 0,
  expenseCount,
  currency = 'USD',
  onClick,
  className,
}: GroupCardProps) {
  const displayCurrency = group.currency || currency;
  const totalMemberCount = memberCount ?? (members.length > 0 ? members.length : 1);
  const displayedMembers = members.slice(0, 4);
  const remainingMembers = Math.max(0, totalMemberCount - displayedMembers.length);

  const isOwed = netBalanceMinor > 0;
  const isOwing = netBalanceMinor < 0;
  const isSettled = netBalanceMinor === 0;

  return (
    <Card
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
        'group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/40 cursor-pointer bg-card/70 backdrop-blur-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-ring border-border/60',
        className
      )}
    >
      <CardHeader className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base sm:text-lg tracking-tight text-foreground truncate group-hover:text-primary transition-colors">
                {group.name}
              </h3>
              {group.isArchived && (
                <Badge variant="secondary" className="text-[10px] uppercase">
                  Archived
                </Badge>
              )}
            </div>
            {group.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {group.description}
              </p>
            )}
          </div>

          <Badge variant="outline" className="font-mono text-xs uppercase shrink-0">
            {displayCurrency}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2 space-y-4">
        {/* Members & Activity */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {displayedMembers.length > 0 ? (
              <AvatarGroup>
                {displayedMembers.map((m, idx) => (
                  <Avatar key={m.id || idx} size="sm">
                    {m.picture ? <AvatarImage src={m.picture} alt={m.name || m.email} /> : null}
                    <AvatarFallback className="text-[10px] font-medium uppercase">
                      {(m.name || m.email || 'U').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {remainingMembers > 0 && (
                  <AvatarGroupCount className="size-6 text-[10px]">
                    +{remainingMembers}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{totalMemberCount} {totalMemberCount === 1 ? 'member' : 'members'}</span>
              </div>
            )}
          </div>

          {expenseCount !== undefined && (
            <span className="text-xs text-muted-foreground font-medium">
              {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
            </span>
          )}
        </div>

        {/* Balance Banner */}
        <div
          className={cn(
            'flex items-center justify-between p-3 rounded-lg border text-sm transition-colors',
            isOwed && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200',
            isOwing && 'bg-rose-500/10 border-rose-500/20 text-rose-900 dark:text-rose-200',
            isSettled && 'bg-muted/40 border-border/50 text-muted-foreground'
          )}
        >
          <div className="flex items-center gap-2 font-medium text-xs sm:text-sm">
            {isOwed && <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            {isOwing && <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
            {isSettled && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
            <span>
              {isOwed && 'You are owed'}
              {isOwing && 'You owe'}
              {isSettled && 'Settled up'}
            </span>
          </div>

          {!isSettled ? (
            <CurrencyDisplay
              amountMinor={Math.abs(netBalanceMinor)}
              currency={displayCurrency}
              colorize
              size="sm"
            />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">₹0.00</span>
          )}
        </div>
      </CardContent>

      <div className="px-5 py-2.5 bg-muted/20 border-t border-border/40 flex items-center justify-end text-xs text-muted-foreground group-hover:text-primary transition-colors">
        <span>View details</span>
        <ChevronRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Card>
  );
}

export default GroupCard;
