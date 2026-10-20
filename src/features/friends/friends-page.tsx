import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  ArrowRightLeft,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useCurrentUser,
  useUsers,
  useGroups,
  useExpenses,
  useSettlements,
  useCurrency,
} from '@/hooks';
import { calculatePairwiseBalance } from '@/domain/balances/balance-engine';
import type { ExpenseSplit } from '@/domain/models/types';
import { cn } from '@/lib/utils';

export function FriendsPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { users, isLoading: isLoadingUsers } = useUsers();
  const { groups, isLoading: isLoadingGroups } = useGroups();
  const { expenses, splits, isLoading: isLoadingExpenses } = useExpenses();
  const { settlements, isLoading: isLoadingSettlements } = useSettlements();
  const { defaultCurrency } = useCurrency();

  const [search, setSearch] = React.useState('');

  const isLoading = isLoadingUsers || isLoadingGroups || isLoadingExpenses || isLoadingSettlements;

  const allSplitsList = useMemo(() => {
    return Object.values(splits).flat() as ExpenseSplit[];
  }, [splits]);

  // Compute friends list: all users other than current user
  const friendsData = useMemo(() => {
    const activeFriends = users.filter((u) => u.id !== currentUserId);

    return activeFriends.map((friend) => {
      // Find shared groups
      const sharedGroups = groups.filter((g) => {
        const hasMember = g.memberIds?.includes(friend.id) || g.createdBy === friend.id;
        return hasMember;
      });

      // Calculate pairwise balance between current user and this friend
      const pb = calculatePairwiseBalance(
        currentUserId,
        friend.id,
        expenses,
        allSplitsList,
        settlements,
        defaultCurrency
      );

      let netMinor = 0;
      if (pb.amountMinor > 0) {
        if (pb.fromUserId === currentUserId) {
          // You owe friend
          netMinor = -pb.amountMinor;
        } else {
          // Friend owes you
          netMinor = pb.amountMinor;
        }
      }

      return {
        friend,
        sharedGroups,
        netMinor,
      };
    });
  }, [users, currentUserId, groups, expenses, allSplitsList, settlements, defaultCurrency]);

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friendsData;
    const q = search.toLowerCase();
    return friendsData.filter(
      ({ friend }) =>
        friend.name?.toLowerCase().includes(q) || friend.email.toLowerCase().includes(q)
    );
  }, [friendsData, search]);

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Friends & Contacts"
        description="People you share expenses with across groups and personal splits."
        actions={
          <Button
            onClick={() => navigate('/groups/new')}
            className="h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm transition-transform active:scale-98"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Create Group</span>
          </Button>
        }
      />

      {/* Search Bar */}
      {friendsData.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends by name or email..."
            className="pl-10 h-11 rounded-2xl bg-card border-border/80 focus-visible:ring-1 focus-visible:ring-primary shadow-2xs text-sm font-medium"
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-3xl" />
          ))}
        </div>
      ) : friendsData.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No friends or contacts yet"
          description="Add people by creating a group and inviting them with their email."
          action={
            <Button
              onClick={() => navigate('/groups/new')}
              className="rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create a Group to Add Friends
            </Button>
          }
        />
      ) : filteredFriends.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No contacts found"
          description={`No contacts match "${search}".`}
          action={
            <Button variant="outline" size="sm" onClick={() => setSearch('')} className="rounded-xl font-bold">
              Clear Search
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredFriends.map(({ friend, sharedGroups, netMinor }) => {
            const name = friend.name || friend.email;
            const isOwed = netMinor > 0;
            const isOwing = netMinor < 0;
            const isSettled = netMinor === 0;

            return (
              <div
                key={friend.id}
                className="p-5 rounded-3xl border border-border/80 hover:border-[#0055FF]/40 hover:shadow-xs transition-all bg-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                {/* Left: Avatar & Identity */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar size="default" className="border-2 border-background">
                    {friend.picture && <AvatarImage src={friend.picture} alt={name} />}
                    <AvatarFallback className="font-black text-xs uppercase bg-muted text-foreground">
                      {name.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 space-y-1">
                    <p className="font-bold text-base text-foreground truncate">{name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="truncate max-w-[200px]">{friend.email}</span>
                      {sharedGroups.length > 0 && (
                        <>
                          <span>&bull;</span>
                          <span className="font-medium text-foreground/80">
                            {sharedGroups.length} shared group{sharedGroups.length === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Net Balance & Settle CTA */}
                <div className="flex items-center gap-3.5 self-end sm:self-auto shrink-0">
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5 text-xs font-semibold">
                      {isOwed && (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <ArrowDownLeft className="h-3.5 w-3.5 stroke-[2.5]" />
                          Owes you
                        </span>
                      )}
                      {isOwing && (
                        <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
                          You owe
                        </span>
                      )}
                      {isSettled && (
                        <span className="text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Settled up
                        </span>
                      )}
                    </div>

                    {!isSettled ? (
                      <CurrencyDisplay
                        amountMinor={Math.abs(netMinor)}
                        currency={defaultCurrency}
                        size="md"
                        colorize
                        className="font-black"
                      />
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">₹0.00</span>
                    )}
                  </div>

                  {!isSettled && (
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/settlements/new?${
                            isOwing
                              ? `fromUserId=${currentUserId}&toUserId=${friend.id}&amountMinor=${Math.abs(netMinor)}`
                              : `fromUserId=${friend.id}&toUserId=${currentUserId}&amountMinor=${Math.abs(netMinor)}`
                          }`
                        )
                      }
                      className="h-9 px-4 rounded-xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold text-xs shadow-2xs"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                      Settle
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FriendsPage;
