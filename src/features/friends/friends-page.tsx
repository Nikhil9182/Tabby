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
import { Card, CardContent } from '@/components/ui/card';
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

      // pb.fromUserId owes pb.toUserId pb.amountMinor
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
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Friends & Contacts"
        description="View your net balances with individuals across all shared tabs."
        actions={
          <Button
            onClick={() => navigate('/groups/new')}
            className="shadow-xs font-semibold gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Create Group</span>
          </Button>
        }
      />

      {/* Search Bar */}
      {friendsData.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends by name or email..."
            className="pl-9 h-10 bg-card/60"
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : friendsData.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No friends or contacts yet"
          description="Add people by creating a group and inviting them with their email."
          action={
            <Button onClick={() => navigate('/groups/new')} size="sm">
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
            <Button variant="outline" size="sm" onClick={() => setSearch('')}>
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
              <Card
                key={friend.id}
                className="p-4 border-border/60 hover:border-primary/40 hover:shadow-xs transition-all bg-card/70"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Left: Avatar & Identity */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar size="default" className="ring-1 ring-border">
                      {friend.picture && <AvatarImage src={friend.picture} alt={name} />}
                      <AvatarFallback className="font-semibold text-xs uppercase">
                        {name.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm sm:text-base text-foreground truncate">
                          {name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {friend.email}
                      </p>

                      {/* Shared groups badges */}
                      {sharedGroups.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-[11px] text-muted-foreground font-medium">
                            Groups:
                          </span>
                          {sharedGroups.map((g) => (
                            <Badge
                              key={g.id}
                              variant="secondary"
                              className="text-[10px] h-4 px-1.5 py-0 font-normal cursor-pointer hover:bg-muted"
                              onClick={() => navigate(`/groups/${g.id}`)}
                            >
                              {g.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Net Balance & Settle Up Button */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-0 border-border/40 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isOwed && <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                        {isOwing && <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                        {isSettled && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground font-medium">
                          {isOwed && 'owes you'}
                          {isOwing && 'you owe'}
                          {isSettled && 'settled up'}
                        </span>
                      </div>
                      {!isSettled ? (
                        <CurrencyDisplay
                          amountMinor={Math.abs(netMinor)}
                          currency={defaultCurrency}
                          colorize
                          size="md"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">₹0.00</span>
                      )}
                    </div>

                    {!isSettled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            `/settlements/new?from=${isOwing ? currentUserId : friend.id}&to=${isOwing ? friend.id : currentUserId}&amount=${Math.abs(netMinor)}`
                          )
                        }
                        className="gap-1.5"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        <span>Settle</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FriendsPage;
