import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightLeft,
  Plus,
  Filter,
  Calendar,
  Users,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { SettlementRow } from '@/components/settlements/settlement-row';
import {
  useSettlements,
  useCurrentUser,
  useGroups,
  useUsers,
} from '@/hooks';

export function SettlementsPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const currentUserId = user?.id || 'current_user';

  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { settlements, isLoading: isLoadingSettlements } = useSettlements(
    selectedGroup !== 'all' ? selectedGroup : undefined
  );
  const { groups, isLoading: isLoadingGroups } = useGroups();
  const { users } = useUsers();

  const isLoading = isLoadingSettlements || isLoadingGroups;

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const groupMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  // Client filtering
  const filteredSettlements = useMemo(() => {
    let list = settlements.filter((s) => !s.deletedAt);

    if (dateFilter === 'this-month') {
      const now = new Date();
      list = list.filter((s) => {
        const d = new Date(s.settlementDate);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
    } else if (dateFilter === 'last-30-days') {
      const past = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      list = list.filter((s) => new Date(s.settlementDate) >= past);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => {
        const fromU = userMap.get(s.fromUserId);
        const toU = userMap.get(s.toUserId);
        const fromName = fromU?.name || fromU?.email || s.fromUserId;
        const toName = toU?.name || toU?.email || s.toUserId;
        const notes = s.notes || '';
        return (
          fromName.toLowerCase().includes(q) ||
          toName.toLowerCase().includes(q) ||
          notes.toLowerCase().includes(q)
        );
      });
    }

    // Sort newest first
    list.sort(
      (a, b) => new Date(b.settlementDate).getTime() - new Date(a.settlementDate).getTime()
    );

    return list;
  }, [settlements, dateFilter, search, userMap]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Settlements"
        description="History of debt repayments and payments made between members."
        actions={
          <Button
            onClick={() => navigate('/settlements/new')}
            className="shadow-xs font-semibold gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Record Settlement</span>
          </Button>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-card/60 p-4 rounded-xl border border-border/60">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by person name or note..."
            className="pl-9 h-10 bg-background"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger className="w-44 h-10 bg-background text-xs">
              <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-40 h-10 bg-background text-xs">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-30-days">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredSettlements.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft className="h-6 w-6" />}
          title="No settlements recorded"
          description="When someone repays a debt, record the transfer here to balance your group books."
          action={
            <Button onClick={() => navigate('/settlements/new')} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Record First Settlement
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filteredSettlements.map((s) => {
            const fromU = userMap.get(s.fromUserId);
            const toU = userMap.get(s.toUserId);
            const groupName = s.groupId ? groupMap.get(s.groupId) : undefined;

            return (
              <SettlementRow
                key={s.id}
                settlement={s}
                fromUser={fromU}
                toUser={toU}
                groupName={groupName}
                currentUserId={currentUserId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SettlementsPage;
