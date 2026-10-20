import React from 'react';
import { Users, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
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
  const totalMemberCount = memberCount ?? (members.length > 0 ? members.length : (group.memberIds?.length || 1));
  const displayedMembers = members.slice(0, 4);
  const remainingMembers = Math.max(0, totalMemberCount - displayedMembers.length);

  const isOwed = netBalanceMinor > 0;
  const isOwing = netBalanceMinor < 0;
  const isSettled = netBalanceMinor === 0;

  const hasCoverImage = Boolean(group.imageUrl);

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
        'group relative overflow-hidden rounded-3xl transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-col justify-between p-6 min-h-[210px] sm:min-h-[220px]',
        hasCoverImage
          ? 'border border-white/10 text-white shadow-sm'
          : 'bg-card border border-border/80 text-foreground',
        className
      )}
    >
      {/* Background Image with Dark Gradient Scrim if trip cover is present */}
      {hasCoverImage && (
        <>
          <img
            src={group.imageUrl}
            alt={group.name}
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/35 pointer-events-none select-none" />
        </>
      )}

      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="space-y-1 min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                'font-black text-xl sm:text-2xl tracking-tight truncate transition-colors',
                hasCoverImage ? 'text-white group-hover:underline' : 'text-foreground group-hover:text-[#0055FF]'
              )}
            >
              {group.name}
            </h3>
            {group.isArchived && (
              <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                Archived
              </Badge>
            )}
          </div>
          {group.description ? (
            <p
              className={cn(
                'text-xs line-clamp-1 font-medium',
                hasCoverImage ? 'text-white/80' : 'text-muted-foreground'
              )}
            >
              {group.description}
            </p>
          ) : (
            <p
              className={cn(
                'text-xs font-medium',
                hasCoverImage ? 'text-white/80' : 'text-muted-foreground'
              )}
            >
              {totalMemberCount} {totalMemberCount === 1 ? 'member' : 'members'}
            </p>
          )}
        </div>

        <Badge
          variant="outline"
          className={cn(
            'font-mono text-xs uppercase shrink-0 font-bold',
            hasCoverImage
              ? 'bg-black/50 text-white border-white/20 backdrop-blur-xs'
              : 'bg-muted/40 text-foreground'
          )}
        >
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
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium',
                hasCoverImage ? 'text-white/80' : 'text-muted-foreground'
              )}
            >
              <Users className="h-3.5 w-3.5" />
              <span>
                {totalMemberCount} {totalMemberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
          )}
        </div>

        {expenseCount !== undefined && (
          <span
            className={cn(
              'text-xs font-semibold',
              hasCoverImage ? 'text-white/85' : 'text-muted-foreground'
            )}
          >
            {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
          </span>
        )}
      </div>

      {/* Bottom: Dynamic Balance Banner */}
      <div
        className={cn(
          'mt-4 flex items-center justify-between p-3.5 rounded-2xl border text-sm font-bold transition-colors relative z-10',
          hasCoverImage
            ? isOwed
              ? 'bg-emerald-500/25 border-emerald-400/40 text-white backdrop-blur-xs'
              : isOwing
              ? 'bg-rose-500/25 border-rose-400/40 text-white backdrop-blur-xs'
              : 'bg-black/50 border-white/20 text-white/80 backdrop-blur-xs'
            : isOwed
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-950 dark:text-emerald-300'
            : isOwing
            ? 'bg-rose-500/10 border-rose-500/25 text-rose-950 dark:text-rose-300'
            : 'bg-muted/40 border-border/50 text-muted-foreground font-medium'
        )}
      >
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          {isOwed && (
            <ArrowDownLeft
              className={cn(
                'h-4 w-4 stroke-[2.5]',
                hasCoverImage ? 'text-[#D4FF00]' : 'text-emerald-600 dark:text-emerald-400'
              )}
            />
          )}
          {isOwing && (
            <ArrowUpRight
              className={cn(
                'h-4 w-4 stroke-[2.5]',
                hasCoverImage ? 'text-rose-300' : 'text-rose-600 dark:text-rose-400'
              )}
            />
          )}
          {isSettled && (
            <CheckCircle2
              className={cn(
                'h-4 w-4',
                hasCoverImage ? 'text-white/60' : 'text-muted-foreground'
              )}
            />
          )}
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
            colorize={!hasCoverImage}
            size="sm"
            className={hasCoverImage ? 'text-white font-black' : undefined}
          />
        ) : (
          <span
            className={cn(
              'text-xs font-bold',
              hasCoverImage ? 'text-white/80' : 'text-muted-foreground'
            )}
          >
            ₹0.00
          </span>
        )}
      </div>
    </div>
  );
}

export default GroupCard;
