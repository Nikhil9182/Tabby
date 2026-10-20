import React from 'react';
import { Users, ChevronRight, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
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

function VectorBackdrop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("pointer-events-none select-none transition-colors", className)}
    >
      <circle cx="80" cy="25" r="12" strokeDasharray="2 2" />
      <path d="M15 85 L 50 25 L 85 85" strokeWidth="2.5" />
      <path d="M40 45 L 50 55 L 60 45" />
      <path d="M10 85 H 90" />
    </svg>
  );
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
  const totalMemberCount = memberCount ?? (members.length > 0 ? members.length : (group.memberIds?.length || 1));
  const displayedMembers = members.slice(0, 4);
  const remainingMembers = Math.max(0, totalMemberCount - displayedMembers.length);

  const isOwed = netBalanceMinor > 0;
  const isOwing = netBalanceMinor < 0;
  const isSettled = netBalanceMinor === 0;

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
        'group relative overflow-hidden rounded-3xl transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer bg-card border border-border/80 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-col justify-between p-6 min-h-[200px]',
        className
      )}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-xl tracking-tight text-foreground truncate group-hover:text-[#0055FF] transition-colors">
              {group.name}
            </h3>
            {group.isArchived && (
              <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                Archived
              </Badge>
            )}
          </div>
          {group.description ? (
            <p className="text-xs text-muted-foreground line-clamp-1 font-medium">
              {group.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground font-medium">
              {totalMemberCount} {totalMemberCount === 1 ? 'member' : 'members'}
            </p>
          )}
        </div>

        <Badge variant="outline" className="font-mono text-xs uppercase shrink-0 font-bold">
          {displayCurrency}
        </Badge>
      </div>

      {/* Middle: Members & Expenses */}
      <div className="flex items-center justify-between gap-2 pt-4 relative z-10">
        <div className="flex items-center gap-2">
          {displayedMembers.length > 0 ? (
            <AvatarGroup>
              {displayedMembers.map((m, idx) => (
                <Avatar key={m.id || idx} size="sm" className="border-2 border-background">
                  {m.picture ? <AvatarImage src={m.picture} alt={m.name || m.email} /> : null}
                  <AvatarFallback className="text-[10px] font-black uppercase bg-muted text-foreground">
                    {(m.name || m.email || 'U').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {remainingMembers > 0 && (
                <AvatarGroupCount className="size-6 text-[10px] font-bold">
                  +{remainingMembers}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Users className="h-3.5 w-3.5" />
              <span>{totalMemberCount} {totalMemberCount === 1 ? 'member' : 'members'}</span>
            </div>
          )}
        </div>

        {expenseCount !== undefined && (
          <span className="text-xs text-muted-foreground font-semibold">
            {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
          </span>
        )}
      </div>

      {/* Bottom: Dynamic Balance Banner */}
      <div
        className={cn(
          'mt-4 flex items-center justify-between p-3.5 rounded-2xl border text-sm font-bold transition-colors relative z-10',
          isOwed && 'bg-emerald-500/10 border-emerald-500/25 text-emerald-950 dark:text-emerald-300',
          isOwing && 'bg-rose-500/10 border-rose-500/25 text-rose-950 dark:text-rose-300',
          isSettled && 'bg-muted/40 border-border/50 text-muted-foreground font-medium'
        )}
      >
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          {isOwed && <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />}
          {isOwing && <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400 stroke-[2.5]" />}
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
          <span className="text-xs font-bold text-muted-foreground">₹0.00</span>
        )}
      </div>

      {/* Vector backdrop outline (adapts to light/dark mode) */}
      <VectorBackdrop className="absolute right-[-10px] bottom-[-10px] w-32 h-32 text-foreground/8 dark:text-foreground/12 pointer-events-none" />
    </div>
  );
}

export default GroupCard;
