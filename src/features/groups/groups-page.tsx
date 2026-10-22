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
  useDisplayConversion,
} from '@/hooks';
import { calculateGroupBalances } from '@/domain/balances/balance-engine';
import { bagCurrencies, EMPTY_BAG, type MoneyBag } from '@/domain/money/conversion';
import { BalanceAmount } from '@/components/currency/converted-amount';
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

  // Your balance in each group, per currency (positive = owed to you)
  const groupBags = useMemo(() => {
    const map = new Map<string, MoneyBag>();
    for (const group of groups) {
      const groupExpenses = expenses.filter((e) => e.groupId === group.id || e.sourceId === group.id);
      const groupSettlements = settlements.filter((s) => s.groupId === group.id || s.sourceId === group.id);
      const computed = calculateGroupBalances(groupExpenses, allSplitsList, groupSettlements, group.currency || 'USD');
      map.set(group.id, computed.balances.get(currentUserId)?.netByCurrency ?? EMPTY_BAG);
    }
    return map;
  }, [groups, expenses, settlements, allSplitsList, currentUserId]);

  const conversion = useDisplayConversion(Array.from(groupBags.values()).flatMap(bagCurrencies));

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
    <div className="space-y-6 sm:space-y-8 pb-16 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Groups"
        description="Manage shared expenses across trips, apartments, and friend circles."
        actions={
          <Button
            onClick={() => navigate('/groups/new')}
            className="h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm transition-transform active:scale-98"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>New Group</span>
          </Button>
        }
      />

      {/* Search Bar */}
      {groups.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups by name..."
            className="pl-10 h-11 rounded-2xl bg-card border-border/80 focus-visible:ring-1 focus-visible:ring-primary shadow-2xs text-sm font-medium"
          />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-3xl" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        search.trim() ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No groups found"
            description={`No groups matching "${search}".`}
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch('')} className="rounded-xl font-bold">
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
              <Button
                onClick={() => navigate('/groups/new')}
                className="rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Your First Group
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGroups.map((group) => {
            const groupExpenses = expenses.filter((e) => e.groupId === group.id || e.sourceId === group.id);
            const net = groupBags.get(group.id) ?? EMPTY_BAG;
            const converted = conversion.convert(net);
            const values = bagCurrencies(net).map((c) => net[c]);
            const netSign =
              converted.totalMinor !== null
                ? Math.sign(converted.totalMinor)
                : values.every((v) => v > 0)
                  ? 1
                  : values.every((v) => v < 0)
                    ? -1
                    : 0;

            const groupMembers = (group.memberIds || [])
              .map((id) => users.find((u) => u.id === id))
              .filter(Boolean);

            return (
              <GroupCard
                key={group.id}
                group={group}
                members={groupMembers as any}
                memberCount={group.memberIds?.length || 1}
                netSign={netSign}
                balance={
                  bagCurrencies(net).length > 0 ? (
                    <BalanceAmount bag={net} conversion={conversion} size="sm" className="items-end" />
                  ) : undefined
                }
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
