import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { GroupCard } from '@/components/groups/group-card';
import {
  useGroups,
  useCurrentUser,
  useExpenses,
  useSettlements,
  useCurrency,
  useUsers,
} from '@/hooks';
import { calculateGroupBalances } from '@/domain/balances/balance-engine';
import type { ExpenseSplit } from '@/domain/models/types';

export function GroupsPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const currentUserId = user?.id || 'current_user';

  const { groups, isLoading: isLoadingGroups } = useGroups();
  const { expenses, splits, isLoading: isLoadingExpenses } = useExpenses();
  const { settlements, isLoading: isLoadingSettlements } = useSettlements();
  const { defaultCurrency } = useCurrency();
  const { users } = useUsers();

  const [search, setSearch] = React.useState('');

  const isLoading = isLoadingGroups || isLoadingExpenses || isLoadingSettlements;

  // Flatten all splits
  const allSplitsList = useMemo(() => {
    return Object.values(splits).flat() as ExpenseSplit[];
  }, [splits]);

  const filteredGroups = useMemo(() => {
    let list = groups.filter((g) => !g.isArchived);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) => g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [groups, search]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Groups"
        description="Manage shared expenses across trips, apartments, and friend circles."
        actions={
          <Button
            onClick={() => navigate('/groups/new')}
            className="shadow-xs font-semibold gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>New Group</span>
          </Button>
        }
      />

      {/* Search Bar */}
      {groups.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups..."
            className="pl-9 h-10 bg-card/60"
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        search.trim() ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No groups found"
            description={`No groups matching "${search}".`}
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                Clear Search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No groups yet"
            description="Create a group to easily split dinner bills, shared rent, or vacation expenses with multiple people."
            action={
              <Button onClick={() => navigate('/groups/new')} size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Create Your First Group
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGroups.map((group) => {
            const groupExpenses = expenses.filter((e) => e.groupId === group.id || e.sourceId === group.id);
            const groupSplits = allSplitsList.filter((s) => groupExpenses.some((e) => e.id === s.expenseId));
            const groupSettlements = settlements.filter(
              (s) => s.groupId === group.id || s.sourceId === group.id
            );

            const computed = calculateGroupBalances(
              groupExpenses,
              groupSplits,
              groupSettlements,
              group.currency || defaultCurrency
            );

            const myBalance = computed.balances.get(currentUserId);
            const netBalanceMinor = myBalance?.netBalance ?? 0;

            // Members
            const groupMembers = group.memberIds
              ? users.filter((u) => group.memberIds!.includes(u.id))
              : [];

            return (
              <GroupCard
                key={group.id}
                group={group}
                members={groupMembers}
                memberCount={group.memberIds?.length || (groupMembers.length > 0 ? groupMembers.length : 1)}
                netBalanceMinor={netBalanceMinor}
                expenseCount={groupExpenses.length}
                currency={group.currency || defaultCurrency}
                onClick={() => navigate(`/groups/${group.id}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GroupsPage;
