import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Plus,
  ArrowRightLeft,
  ArrowLeft,
  Receipt,
  Scale,
  Settings,
  UserPlus,
  Trash2,
  Archive,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import { CurrencySelector } from '@/components/currency/currency-selector';
import { ExpenseRow } from '@/components/expenses/expense-row';
import { SettlementRow } from '@/components/settlements/settlement-row';
import {
  useGroup,
  useGroups,
  useCurrentUser,
  useUsers,
  useCategories,
  useExpenses,
  useSettlements,
} from '@/hooks';
import { groupRepository } from '@/storage/repositories/group-repository';
import { userRepository } from '@/storage/repositories/user-repository';
import { generateId } from '@/lib/id';
import { formatDate } from '@/lib/date';
import type { User, MemberRole, PairwiseBalance } from '@/domain/models/types';
import { cn } from '@/lib/utils';

export function GroupDetailPage() {
  const { id, groupId: paramGroupId } = useParams<{ id?: string; groupId?: string }>();
  const navigate = useNavigate();
  const groupId = paramGroupId || id || '';

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { group, members, expenses, settlements, balances, isLoading, refetch } = useGroup(groupId);
  const { updateGroup, archiveGroup } = useGroups();
  const { users } = useUsers();
  const { categories } = useCategories();
  const { splits } = useExpenses({ groupId });

  const [activeTab, setActiveTab] = useState('overview');
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  // New member inputs
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);

  // Edit settings form
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  React.useEffect(() => {
    if (group) {
      setEditName(group.name);
      setEditDesc(group.description || '');
      setEditCurrency(group.currency || 'USD');
    }
  }, [group]);

  const groupCurrency = group?.currency || 'USD';

  // Category map
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string; color?: string }>();
    categories.forEach((c) => map.set(c.id, { name: c.name, icon: c.icon, color: c.color }));
    return map;
  }, [categories]);

  // User Map
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  // Current user net balance in this group
  const myBalance = balances?.balances?.get(currentUserId);
  const myNetMinor = myBalance?.netBalance ?? 0;

  // Is user owner?
  const myMembership = members.find((m) => m.userId === currentUserId);
  const isOwner = myMembership?.role === 'owner' || group?.createdBy === currentUserId;

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError(null);

    const email = newEmail.trim().toLowerCase();
    const name = newName.trim() || email.split('@')[0];

    if (!email) {
      setMemberError('Enter an email address');
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setMemberError('Enter a valid email address');
      return;
    }

    // Check if member already in group
    const existingMember = members.some((m) => {
      const u = userMap.get(m.userId);
      return u?.email.toLowerCase() === email;
    });

    if (existingMember) {
      setMemberError('Member already in group');
      return;
    }

    let userToAdd = users.find((u) => u.email.toLowerCase() === email);
    if (!userToAdd) {
      const now = new Date().toISOString();
      userToAdd = {
        id: generateId(),
        name,
        email,
        createdAt: now,
        updatedAt: now,
      };
      await userRepository.upsertUser(userToAdd);
    }

    await groupRepository.addMember({
      groupId,
      userId: userToAdd.id,
      role: 'member',
      status: 'active',
      joinedAt: new Date().toISOString(),
    });

    setNewEmail('');
    setNewName('');
    void refetch();
  };

  // Remove Member
  const handleRemoveMember = async (userId: string) => {
    if (userId === group?.createdBy) return;
    await groupRepository.removeMember(groupId, userId);
    void refetch();
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    await updateGroup({
      id: groupId,
      name: editName.trim(),
      description: editDesc.trim(),
      currency: editCurrency,
    });

    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
    void refetch();
  };

  // Archive Group
  const handleArchive = async () => {
    await archiveGroup(groupId);
    setArchiveDialogOpen(false);
    navigate('/groups');
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-12">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="py-12 text-center space-y-4">
        <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold">Group not found</h2>
        <Button variant="outline" onClick={() => navigate('/groups')}>
          Back to Groups
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 animate-in fade-in-50 duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/40">
        <div className="flex items-start sm:items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/groups')}
            className="rounded-full -ml-2 text-muted-foreground hover:text-foreground shrink-0 h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                {group.name}
              </h1>
              <Badge variant="outline" className="font-mono text-xs uppercase font-bold">
                {groupCurrency}
              </Badge>
              {group.isArchived && (
                <Badge variant="secondary" className="text-xs uppercase font-bold">
                  Archived
                </Badge>
              )}
            </div>
            {group.description && (
              <p className="text-sm text-muted-foreground max-w-xl font-medium">{group.description}</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
          <Button
            onClick={() => navigate(`/expenses/new?groupId=${group.id}`)}
            className="h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm transition-transform active:scale-98"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Add Expense</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate(`/settlements/new?groupId=${group.id}`)}
            className="h-11 px-4 rounded-2xl font-bold gap-2"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>Settle Up</span>
          </Button>
        </div>
      </div>

      {/* Group Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full h-12 bg-muted/60 p-1 rounded-2xl">
          <TabsTrigger value="overview" className="text-xs sm:text-sm font-bold rounded-xl">
            Overview
          </TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs sm:text-sm font-bold rounded-xl">
            Expenses ({expenses.length})
          </TabsTrigger>
          <TabsTrigger value="balances" className="text-xs sm:text-sm font-bold rounded-xl">
            Balances
          </TabsTrigger>
          <TabsTrigger value="members" className="text-xs sm:text-sm font-bold rounded-xl">
            Members ({members.length})
          </TabsTrigger>
          <TabsTrigger value="settlements" className="text-xs sm:text-sm font-bold rounded-xl">
            Settlements ({settlements.length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs sm:text-sm font-bold rounded-xl">
            Settings
          </TabsTrigger>
        </TabsList>

        {/* 1. OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 mt-0">
          {/* Net Balance Status Card */}
          <div
            className={cn(
              'rounded-3xl border border-border/80 bg-card p-6 sm:p-7 shadow-xs relative overflow-hidden transition-all',
              myNetMinor > 0 && 'border-emerald-500/40 bg-emerald-500/[0.04]',
              myNetMinor < 0 && 'border-rose-500/40 bg-rose-500/[0.04]'
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Your Group Net Balance
                </span>
                <div className="flex items-baseline gap-2">
                  <CurrencyDisplay
                    amountMinor={myNetMinor}
                    currency={groupCurrency}
                    colorize
                    showSign
                    size="xl"
                    className="font-black"
                  />
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {myNetMinor > 0
                    ? 'In this group, other members owe you'
                    : myNetMinor < 0
                      ? 'In this group, you owe money'
                      : 'You are completely settled up in this group'}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  onClick={() => navigate(`/expenses/new?groupId=${group.id}`)}
                  className="rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold h-10 px-4"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Expense
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/settlements/new?groupId=${group.id}`)}
                  className="rounded-2xl font-bold h-10 px-4"
                >
                  <ArrowRightLeft className="h-4 w-4 mr-1.5" />
                  Settle Up
                </Button>
              </div>
            </div>
          </div>

          {/* Simplified Debts Preview */}
          {balances?.simplifiedDebts && balances.simplifiedDebts.length > 0 && (
            <Card className="border-border/60 shadow-xs">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale className="h-4 w-4 text-primary" />
                  <span>Suggested Debt Settlements</span>
                </CardTitle>
                <CardDescription>
                  Minimal transactions to clear all obligations inside this group.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2.5">
                {balances.simplifiedDebts.map((debt, idx) => {
                  const fromU = userMap.get(debt.fromUserId);
                  const toU = userMap.get(debt.toUserId);
                  const fromName = debt.fromUserId === currentUserId ? 'You' : fromU?.name || debt.fromUserId;
                  const toName = debt.toUserId === currentUserId ? 'you' : toU?.name || debt.toUserId;

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20 text-sm"
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <span className="text-foreground">{fromName}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-foreground">{toName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <CurrencyDisplay
                          amountMinor={debt.amountMinor}
                          currency={debt.currency || groupCurrency}
                          size="md"
                          className="font-bold"
                        />
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            navigate(
                              `/settlements/new?groupId=${group.id}&from=${debt.fromUserId}&to=${debt.toUserId}&amount=${debt.amountMinor}`
                            )
                          }
                        >
                          Settle
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Recent Expenses in Group */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Recent Expenses</h3>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setActiveTab('expenses')}
                className="text-xs"
              >
                View all ({expenses.length})
              </Button>
            </div>

            {expenses.length === 0 ? (
              <EmptyState
                icon={<Receipt className="h-6 w-6" />}
                title="No group expenses yet"
                description="Expenses added here will automatically split among group members."
                action={
                  <Button
                    size="sm"
                    onClick={() => navigate(`/expenses/new?groupId=${group.id}`)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add First Expense
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {expenses.slice(0, 5).map((exp) => {
                  const cat = exp.categoryId ? categoryMap.get(exp.categoryId) : undefined;
                  const expSplits = splits[exp.id] || [];
                  const userSplit = expSplits.find((s) => s.userId === currentUserId);
                  const payerUser = userMap.get(exp.paidBy);

                  return (
                    <ExpenseRow
                      key={exp.id}
                      expense={exp}
                      categoryName={cat?.name}
                      categoryIcon={cat?.icon}
                      categoryColor={cat?.color}
                      payerName={payerUser?.name}
                      currentUserId={currentUserId}
                      userShareMinor={userSplit?.shareMinor}
                      defaultCurrency={groupCurrency}
                      onClick={() => navigate(`/expenses/${exp.id}`)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* 2. EXPENSES TAB */}
        <TabsContent value="expenses" className="space-y-4 mt-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Total {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} recorded
            </span>
            <Button
              size="sm"
              onClick={() => navigate(`/expenses/new?groupId=${group.id}`)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Expense</span>
            </Button>
          </div>

          {expenses.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No expenses in this group"
              description="Add expenses to track hotel rooms, groceries, or rental cars."
              action={
                <Button onClick={() => navigate(`/expenses/new?groupId=${group.id}`)} size="sm">
                  Add Expense
                </Button>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {expenses.map((exp) => {
                const cat = exp.categoryId ? categoryMap.get(exp.categoryId) : undefined;
                const expSplits = splits[exp.id] || [];
                const userSplit = expSplits.find((s) => s.userId === currentUserId);
                const payerUser = userMap.get(exp.paidBy);

                return (
                  <ExpenseRow
                    key={exp.id}
                    expense={exp}
                    categoryName={cat?.name}
                    categoryIcon={cat?.icon}
                    categoryColor={cat?.color}
                    payerName={payerUser?.name}
                    currentUserId={currentUserId}
                    userShareMinor={userSplit?.shareMinor}
                    defaultCurrency={groupCurrency}
                    onClick={() => navigate(`/expenses/${exp.id}`)}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 3. BALANCES TAB */}
        <TabsContent value="balances" className="space-y-6 mt-0">
          {/* Pairwise Balances Table */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Group Member Net Positions</CardTitle>
              <CardDescription>
                Summary of what each person has paid and their resulting net position.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {members.map((member) => {
                  const u = userMap.get(member.userId);
                  const isYou = member.userId === currentUserId;
                  const name = isYou ? 'You' : u?.name || u?.email || member.userId;
                  const userBal = balances?.balances?.get(member.userId);
                  const net = userBal?.netBalance ?? 0;

                  return (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          {u?.picture && <AvatarImage src={u.picture} alt={name} />}
                          <AvatarFallback className="text-[10px] font-semibold uppercase">
                            {name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {member.role}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <CurrencyDisplay
                          amountMinor={net}
                          currency={groupCurrency}
                          colorize
                          showSign
                          size="md"
                        />
                        <p className="text-xs text-muted-foreground">
                          {net > 0 ? 'is owed' : net < 0 ? 'owes' : 'settled up'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Simplified Debts & Settle Up Buttons */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Simplified Settlement Plan</CardTitle>
              <CardDescription>
                Greedy cash-flow reduction to settle all group debts in the fewest possible transfers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              {(!balances?.simplifiedDebts || balances.simplifiedDebts.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  All debts inside this group are settled!
                </p>
              ) : (
                balances.simplifiedDebts.map((debt, idx) => {
                  const fromU = userMap.get(debt.fromUserId);
                  const toU = userMap.get(debt.toUserId);
                  const fromName = debt.fromUserId === currentUserId ? 'You' : fromU?.name || debt.fromUserId;
                  const toName = debt.toUserId === currentUserId ? 'you' : toU?.name || debt.toUserId;

                  return (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-xl border border-border/60 bg-card gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback className="text-xs uppercase">
                            {fromName.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-sm">{fromName}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Avatar size="sm">
                          <AvatarFallback className="text-xs uppercase">
                            {toName.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-sm">{toName}</span>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-border/40">
                        <CurrencyDisplay
                          amountMinor={debt.amountMinor}
                          currency={debt.currency || groupCurrency}
                          size="md"
                          className="font-bold"
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/settlements/new?groupId=${group.id}&from=${debt.fromUserId}&to=${debt.toUserId}&amount=${debt.amountMinor}`
                            )
                          }
                          className="gap-1"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          <span>Record Settlement</span>
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. MEMBERS TAB */}
        <TabsContent value="members" className="space-y-6 mt-0">
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Group Members</CardTitle>
              <CardDescription>
                Manage people who can be included in split expenses for this group.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-4">
              {/* Add member form */}
              {isOwner && (
                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2.5 pb-4 border-b border-border/40">
                  <div className="flex-1">
                    <Input
                      type="email"
                      placeholder="friend@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="sm:w-36">
                    <Input
                      type="text"
                      placeholder="Name (optional)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <Button type="submit" size="sm" className="h-9 gap-1.5 shrink-0">
                    <UserPlus className="h-4 w-4" />
                    <span>Add Member</span>
                  </Button>
                </form>
              )}

              {memberError && (
                <p className="text-xs text-rose-500 font-medium">{memberError}</p>
              )}

              {/* Members List */}
              <div className="divide-y divide-border/40">
                {members.map((member) => {
                  const u = userMap.get(member.userId);
                  const isYou = member.userId === currentUserId;
                  const name = isYou ? 'You' : u?.name || u?.email || member.userId;
                  const isGroupCreator = member.userId === group.createdBy;

                  return (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar size="default">
                          {u?.picture && <AvatarImage src={u.picture} alt={name} />}
                          <AvatarFallback className="text-xs font-semibold uppercase">
                            {name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">
                              {name}
                            </span>
                            {isYou && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 font-normal">
                                You
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal capitalize">
                              {member.role}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{u?.email}</p>
                        </div>
                      </div>

                      {isOwner && !isGroupCreator && !isYou && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemoveMember(member.userId)}
                          className="text-muted-foreground hover:text-rose-600 rounded-full"
                          title="Remove member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. SETTLEMENTS TAB */}
        <TabsContent value="settlements" className="space-y-4 mt-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {settlements.length} {settlements.length === 1 ? 'settlement' : 'settlements'} recorded
            </span>
            <Button
              size="sm"
              onClick={() => navigate(`/settlements/new?groupId=${group.id}`)}
              className="gap-1.5"
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>Record Settlement</span>
            </Button>
          </div>

          {settlements.length === 0 ? (
            <EmptyState
              icon={<ArrowRightLeft className="h-6 w-6" />}
              title="No settlements recorded yet"
              description="Record payments between group members to keep your ledgers clear and balanced."
              action={
                <Button onClick={() => navigate(`/settlements/new?groupId=${group.id}`)} size="sm">
                  Record First Settlement
                </Button>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {settlements.map((s) => {
                const fromU = userMap.get(s.fromUserId);
                const toU = userMap.get(s.toUserId);

                return (
                  <SettlementRow
                    key={s.id}
                    settlement={s}
                    fromUser={fromU}
                    toUser={toU}
                    groupName={group.name}
                    currentUserId={currentUserId}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 6. SETTINGS TAB */}
        <TabsContent value="settings" className="space-y-6 mt-0">
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base">Group Settings</CardTitle>
              <CardDescription>
                Update group title, description, or reporting currency.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Group Name
                  </label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 text-base"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
                  </label>
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Currency
                  </label>
                  <CurrencySelector
                    value={editCurrency}
                    onChange={setEditCurrency}
                  />
                </div>

                {settingsSaved && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Settings saved successfully</span>
                  </p>
                )}

                <Button type="submit" size="sm" className="font-semibold">
                  Save Settings
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Danger Zone / Archive */}
          <Card className="border-rose-500/30 bg-rose-500/[0.02]">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base text-rose-600 dark:text-rose-400">
                Archive Group
              </CardTitle>
              <CardDescription>
                Archiving hides this group from active balance lists while preserving historical expenses and settlements.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setArchiveDialogOpen(true)}
                className="gap-1.5"
              >
                <Archive className="h-4 w-4" />
                <span>Archive Group</span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Archive Confirmation Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {group.name}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive this group? It will be moved to archived tabs, and all past transactions will remain accessible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive}>
              Archive Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GroupDetailPage;
