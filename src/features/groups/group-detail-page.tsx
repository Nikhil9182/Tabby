import { useCollaboration } from '@/hooks/use-collaboration';
import { groupService } from '@/services/supabase/group-service';
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Users,
  Plus,
  ArrowRightLeft,
  ArrowLeft,
  Receipt,
  Settings,
  UserPlus,
  Trash2,
  Archive,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Camera,
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
import { BalanceAmount } from '@/components/currency/converted-amount';
import { bagCurrencies, EMPTY_BAG, type MoneyBag } from '@/domain/money/conversion';
import { CurrencySelector } from '@/components/currency/currency-selector';
import { ExpenseRow } from '@/components/expenses/expense-row';
import { SettlementRow } from '@/components/settlements/settlement-row';
import { TripImagePicker } from '@/components/groups/trip-image-picker';
import {
  useGroup,
  useGroups,
  useCurrentUser,
  useUsers,
  useCategories,
  useExpenses,
  useSettlements,
  useAuth,
  useDisplayConversion,
} from '@/hooks';
import { formatDate } from '@/lib/date';
import type { User, MemberRole, PairwiseBalance } from '@/domain/models/types';
import { cn } from '@/lib/utils';

export function GroupDetailPage() {
  const { id, groupId: paramGroupId } = useParams<{ id?: string; groupId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const groupId = paramGroupId || id || '';

  const { user } = useAuth();
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { group, members, expenses, settlements, balances, isLoading, refetch } = useGroup(groupId);
  const { updateGroup, archiveGroup } = useGroups();
  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);
  const { users } = useUsers(memberIds);
  const { friends, invitations, sendRequest, isBusy } = useCollaboration();
  const { categories } = useCategories();
  const { splits } = useExpenses({ groupId });

  // Settle-up links return with ?tab=balances
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return tab && ['expenses', 'balances', 'members', 'settings'].includes(tab) ? tab : 'expenses';
  });
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  // New member inputs
  const [newEmail, setNewEmail] = useState('');

  const [memberError, setMemberError] = useState<string | null>(null);

  // Edit settings form
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  React.useEffect(() => {
    if (group) {
      setEditName(group.name);
      setEditDesc(group.description || '');
      setEditCurrency(group.currency || 'USD');
      setEditImageUrl(group.imageUrl || '');
    }
  }, [group]);

  const groupCurrency = group?.currency || 'USD';

  // Category map
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string; color?: string }>();
    categories.forEach((c) => map.set(c.id, { name: c.name, icon: c.icon, color: c.color }));
    return map;
  }, [categories]);

  // User Map with alias resolution
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => map.set(u.id, u));
    if (currentUser) {
      map.set(currentUser.id, currentUser);
      map.set('user_self', currentUser);
      map.set('current_user', currentUser);
      if (currentUser.googleSub) map.set(currentUser.googleSub, currentUser);
    }
    if (user?.sub && currentUser) {
      map.set(user.sub, currentUser);
    }
    return map;
  }, [users, currentUser, user]);

  const getUserName = useCallback(
    (id?: string): string => {
      if (!id) return 'Unknown';
      if (
        id === currentUserId ||
        id === 'user_self' ||
        id === 'current_user' ||
        id === currentUser?.googleSub ||
        id === user?.sub
      ) {
        return currentUser?.name || 'You';
      }
      const u = userMap.get(id);
      if (u?.name && u.name !== 'user_self' && u.name !== 'current_user') return u.name;
      return u?.email || 'Member profile unavailable';
    },
    [currentUserId, currentUser, user, userMap]
  );

  // Current user net balance in this group
  // Balances stay per currency; shown in the display currency at the latest rate
  const conversion = useDisplayConversion(balances?.currencies ?? []);
  const myNetBag = balances?.balances?.get(currentUserId)?.netByCurrency ?? EMPTY_BAG;
  const signOf = (bag: MoneyBag): number => {
    const { totalMinor } = conversion.convert(bag);
    if (totalMinor !== null) return Math.sign(totalMinor);
    const values = bagCurrencies(bag).map((c) => bag[c]);
    return values.every((v) => v > 0) ? 1 : values.every((v) => v < 0) ? -1 : 0;
  };
  const mySign = signOf(myNetBag);
  const myIsSettled = bagCurrencies(myNetBag).length === 0;

  // Is user owner?
  const myMembership = members.find((m) => m.userId === currentUserId);
  const isOwner = myMembership?.role === 'owner' || group?.createdBy === currentUserId;

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError(null);

    const email = newEmail.trim().toLowerCase();
    try {
      if (members.some(m => (!m.status || m.status === 'active') && userMap.get(m.userId)?.email.toLowerCase() === email)) throw new Error('This person is already a member.');
      await sendRequest({ email, groupId });
      setNewEmail('');
      await refetch();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Could not send invitation.');
    }
  };

  // Remove Member
  const handleRemoveMember = async (userId: string) => {
    if (userId === group?.createdBy) return;
    try {
      await groupService.removeMember(groupId, userId);
      await refetch();
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Could not remove collaborator.');
    }
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
      imageUrl: editImageUrl || undefined,
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
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(group.kind === 'direct' ? '/friends' : '/groups')}
          className="rounded-full -ml-2 text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground break-words">
              {group.name}
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {groupCurrency}
            </Badge>
            {group.isArchived && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                Archived
              </Badge>
            )}
          </div>
          {group.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{group.description}</p>
          )}
        </div>

        <Button
          variant={activeTab === 'settings' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setActiveTab(activeTab === 'settings' ? 'expenses' : 'settings')}
          className="rounded-full shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Group settings"
          title="Group settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* Trip Cover Banner if present */}
      {group.imageUrl && (
        <div className="h-28 sm:h-40 w-full rounded-xl overflow-hidden border border-border/60">
          <img src={group.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      {/* Your balance + primary actions (Splitwise-style summary) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          {myIsSettled ? (
            <p className="flex items-center gap-1.5 text-base font-semibold text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              You are all settled up
            </p>
          ) : (
            <div className="flex items-baseline gap-1.5 text-base font-semibold text-foreground">
              <span>{mySign > 0 ? 'You are owed' : mySign < 0 ? 'You owe' : 'Your balance'}</span>
              <BalanceAmount
                bag={myNetBag}
                conversion={conversion}
                mode={mySign === 0 ? 'signed' : 'abs'}
                amountClassName={cn(
                  'font-black',
                  mySign > 0 ? 'text-emerald-600 dark:text-emerald-400' : mySign < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                )}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(`/settlements/new?groupId=${group.id}`)}
            className="gap-1.5"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>Settle up</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/expenses/new?groupId=${group.id}&scan=true`)}
            className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5 font-semibold"
          >
            <Camera className="h-4 w-4" />
            <span>Scan receipt</span>
          </Button>
          <Button
            onClick={() => navigate(`/expenses/new?groupId=${group.id}`)}
            className="gap-1.5 font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span>Add expense</span>
          </Button>
        </div>
      </div>

      {/* Group Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {activeTab !== 'settings' && (
          <TabsList className="w-full">
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          </TabsList>
        )}

        {/* 1. EXPENSES TAB (expenses, then payments) */}
        <TabsContent value="expenses" className="space-y-6 mt-0">
          {expenses.length === 0 && settlements.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No expenses yet"
              description="Add an expense and it will be split between group members."
              action={
                <Button onClick={() => navigate(`/expenses/new?groupId=${group.id}`)} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add expense
                </Button>
              }
            />
          ) : (
            <>
              {expenses.length > 0 && (
                <div className="space-y-2.5">
                  {expenses.map((exp) => {
                    const cat = exp.categoryId ? categoryMap.get(exp.categoryId) : undefined;
                    const expSplits = splits[exp.id] || [];
                    const userSplit = expSplits.find((s) => s.userId === currentUserId);

                    return (
                      <ExpenseRow
                        key={exp.id}
                        expense={exp}
                        categoryName={cat?.name}
                        categoryIcon={cat?.icon}
                        categoryColor={cat?.color}
                        payerName={getUserName(exp.paidBy)}
                        currentUserId={currentUserId}
                        userShareMinor={userSplit?.shareMinor}
                        defaultCurrency={groupCurrency}
                        onClick={() => navigate(`/expenses/${exp.id}`)}
                      />
                    );
                  })}
                </div>
              )}

              {settlements.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payments
                  </h3>
                  {settlements.map((s) => (
                    <SettlementRow
                      key={s.id}
                      settlement={s}
                      fromUser={userMap.get(s.fromUserId)}
                      toUser={userMap.get(s.toUserId)}
                      groupName={group.name}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              )}
            </>
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
                {members.filter(m => !m.status || m.status === 'active').map((member) => {
                  const u = userMap.get(member.userId);
                  const isYou = member.userId === currentUserId || member.userId === 'user_self' || member.userId === 'current_user';
                  const name = isYou ? 'You' : getUserName(member.userId);
                  const netBag = balances?.balances?.get(member.userId)?.netByCurrency ?? EMPTY_BAG;
                  const net = signOf(netBag);

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

                      <div className="text-right flex flex-col items-end">
                        <BalanceAmount bag={netBag} conversion={conversion} mode="signed" colorize className="items-end" />
                        <p className="text-xs text-muted-foreground">
                          {bagCurrencies(netBag).length === 0
                            ? 'settled up'
                            : net > 0
                              ? 'is owed'
                              : net < 0
                                ? 'owes'
                                : 'mixed currencies'}
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
                  const fromName = debt.fromUserId === currentUserId ? 'You' : getUserName(debt.fromUserId);
                  const toName = debt.toUserId === currentUserId ? 'you' : getUserName(debt.toUserId);

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
                              `/settlements/new?groupId=${group.id}&from=${debt.fromUserId}&to=${debt.toUserId}&amount=${debt.amountMinor}&currency=${debt.currency || groupCurrency}&returnTo=/groups/${group.id}?tab=balances`
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
              {isOwner && group.kind !== 'direct' && (
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
                  <Button type="submit" size="sm" disabled={isBusy} className="h-9 gap-1.5 shrink-0">
                    <UserPlus className="h-4 w-4" />
                    <span>{isBusy ? 'Sending…' : 'Send invitation'}</span>
                  </Button>
                </form>
              )}

              {memberError && (
                <p className="text-xs text-rose-500 font-medium">{memberError}</p>
              )}

              {invitations.filter(i => i.groupId === groupId && i.status === 'pending').map(i => (
                <p key={i.id} className="text-sm text-muted-foreground break-all">
                  {i.invitedEmail} · Invitation pending
                </p>
              ))}
              {/* Members List */}
              {members.filter(m => m.status === 'invited').map(m => <p key={m.userId} className="text-sm text-muted-foreground">{userMap.get(m.userId)?.email || 'Legacy contact'} · Requires a new invitation and acceptance</p>)}
              <div className="divide-y divide-border/40">
                {members.filter(m => !m.status || m.status === 'active').map((member) => {
                  const u = userMap.get(member.userId);
                  const isYou = member.userId === currentUserId || member.userId === 'user_self' || member.userId === 'current_user';
                  const name = isYou ? (currentUser?.name || 'You') : getUserName(member.userId);
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

        {/* 6. SETTINGS TAB */}
        <TabsContent value="settings" className="space-y-6 mt-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('expenses')}
            className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to group</span>
          </Button>
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

                {/* Trip Cover Image Picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cover photo
                  </label>
                  <TripImagePicker
                    value={editImageUrl}
                    onChange={setEditImageUrl}
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
