import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Plus,
  ArrowRight,
  ArrowRightLeft,
  Receipt,
  Calendar,
  AlertCircle,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { useCollaboration } from '@/hooks/use-collaboration';
import { useCurrentUser, useUsers, useGroups, useExpenses, useSettlements, useCurrency } from '@/hooks';
import { calculateUserBalances } from '@/domain/balances/balance-engine';
import { formatMoney } from '@/domain/money/money';
import { cn } from '@/lib/utils';

export function FriendsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFriendId = searchParams.get('friendId');

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || '';
  const ownEmail = (currentUser?.email || '').trim().toLowerCase();

  const { groups } = useGroups();
  const { expenses, splits } = useExpenses();
  const { settlements, recordSettlement, isRecording } = useSettlements();
  const { defaultCurrency } = useCurrency();
  const curr = defaultCurrency || 'USD';

  const { invitations, sendRequest, respond, cancelRequest, refresh, isBusy, error } = useCollaboration();

  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');

  // Settlement dialog state inside Friend Details
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleGroupId, setSettleGroupId] = useState('');
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleNotes, setSettleNotes] = useState('');
  const [settleError, setSettleError] = useState<string | null>(null);

  const managedGroups = useMemo(
    () => groups.filter((g) => g.createdBy === currentUserId && !g.isArchived),
    [groups, currentUserId]
  );

  // Compute all unique user IDs for profile fetching
  const allSplitsList = useMemo(() => Object.values(splits).flat(), [splits]);

  const allRelevantUserIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((g) => (g.memberIds || []).forEach((m) => ids.add(m)));
    expenses.forEach((e) => {
      ids.add(e.paidBy);
      (splits[e.id] || []).forEach((s) => ids.add(s.userId));
    });
    settlements.forEach((s) => {
      ids.add(s.fromUserId);
      ids.add(s.toUserId);
    });
    if (currentUserId) ids.add(currentUserId);
    if (selectedFriendId) ids.add(selectedFriendId);
    return Array.from(ids);
  }, [groups, expenses, splits, settlements, currentUserId, selectedFriendId]);

  const { users } = useUsers(allRelevantUserIds);

  const userMap = useMemo(() => {
    const map = new Map<string, (typeof users)[0]>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const getUserName = (id: string): string => {
    if (id === currentUserId || id === 'user_self' || id === 'current_user') {
      return currentUser?.name || 'You';
    }
    const found = userMap.get(id);
    return found?.name || found?.email || id;
  };

  // Pairwise balances between current user and all friends
  const userBalances = useMemo(() => {
    if (!currentUserId || !expenses || !settlements) return [];
    return calculateUserBalances(currentUserId, expenses, allSplitsList, settlements).pairwise;
  }, [currentUserId, expenses, allSplitsList, settlements]);

  // All known friends list (combines pairwise balances with group members)
  const friendsList = useMemo(() => {
    const friendMap = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        avatarUrl?: string;
        netBalance: number; // positive: friend owes you, negative: you owe friend
        currency: string;
        sharedGroups: string[];
      }
    >();

    // 1. Add from group members
    groups.forEach((g) => {
      (g.memberIds || []).forEach((memberId) => {
        if (memberId === currentUserId) return;
        const u = userMap.get(memberId);
        const name = u?.name || u?.email || memberId;
        const email = u?.email || '';
        const existing = friendMap.get(memberId);
        if (existing) {
          if (!existing.sharedGroups.includes(g.name)) existing.sharedGroups.push(g.name);
        } else {
          friendMap.set(memberId, {
            id: memberId,
            name,
            email,
            avatarUrl: u?.picture || u?.avatarUrl,
            netBalance: 0,
            currency: g.currency || curr,
            sharedGroups: [g.name],
          });
        }
      });
    });

    // 2. Overlay pairwise balances
    userBalances.forEach((b) => {
      const otherId = b.fromUserId === currentUserId ? b.toUserId : b.fromUserId;
      if (!otherId || otherId === currentUserId) return;

      const youOwe = b.fromUserId === currentUserId;
      const net = youOwe ? -b.amountMinor : b.amountMinor;
      const u = userMap.get(otherId);
      const name = u?.name || u?.email || otherId;

      const existing = friendMap.get(otherId);
      if (existing) {
        existing.netBalance = net;
        existing.currency = b.currency || curr;
      } else {
        friendMap.set(otherId, {
          id: otherId,
          name,
          email: u?.email || '',
          avatarUrl: u?.picture || u?.avatarUrl,
          netBalance: net,
          currency: b.currency || curr,
          sharedGroups: [],
        });
      }
    });

    return Array.from(friendMap.values());
  }, [groups, currentUserId, userMap, userBalances, curr]);

  // Selected friend data
  const selectedFriend = useMemo(() => {
    if (!selectedFriendId) return null;
    return (
      friendsList.find((f) => f.id === selectedFriendId) || {
        id: selectedFriendId,
        name: getUserName(selectedFriendId),
        email: userMap.get(selectedFriendId)?.email || '',
        avatarUrl: userMap.get(selectedFriendId)?.picture || userMap.get(selectedFriendId)?.avatarUrl,
        netBalance: 0,
        currency: curr,
        sharedGroups: [],
      }
    );
  }, [selectedFriendId, friendsList, userMap, curr]);

  // Shared expenses between current user and selected friend
  const sharedExpenses = useMemo(() => {
    if (!selectedFriendId || !currentUserId) return [];
    return expenses
      .filter((exp) => {
        if (exp.deletedAt) return false;
        const expSplits = splits[exp.id] || [];
        const involvesUser = exp.paidBy === currentUserId || expSplits.some((s) => s.userId === currentUserId);
        const involvesFriend =
          exp.paidBy === selectedFriendId || expSplits.some((s) => s.userId === selectedFriendId);
        return involvesUser && involvesFriend;
      })
      .sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());
  }, [selectedFriendId, currentUserId, expenses, splits]);

  // Shared settlements between current user and selected friend
  const sharedSettlements = useMemo(() => {
    if (!selectedFriendId || !currentUserId) return [];
    return settlements
      .filter((s) => {
        if (s.deletedAt) return false;
        return (
          (s.fromUserId === currentUserId && s.toUserId === selectedFriendId) ||
          (s.fromUserId === selectedFriendId && s.toUserId === currentUserId)
        );
      })
      .sort((a, b) => new Date(b.settlementDate).getTime() - new Date(a.settlementDate).getTime());
  }, [selectedFriendId, currentUserId, settlements]);

  const run = async (action: () => Promise<unknown>, success = '') => {
    setMessage('');
    setLocalError('');
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Request failed. Please retry.');
    }
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedGroupId) return;

    void run(async () => {
      await sendRequest({ email: inviteEmail.trim(), groupId: selectedGroupId });
      setInviteEmail('');
    }, 'Group invitation sent successfully!');
  };

  // Open Settle Modal initialized with exact net balance
  const handleOpenSettleModal = () => {
    if (!selectedFriend) return;
    setSettleError(null);
    const absCents = Math.abs(selectedFriend.netBalance);
    setSettleAmount((absCents / 100).toFixed(2));
    // Pick first shared group or first available group
    const firstGroup = groups.find((g) => g.memberIds?.includes(selectedFriend.id)) || groups[0];
    setSettleGroupId(firstGroup?.id || '');
    setSettleDate(new Date().toISOString().slice(0, 10));
    setSettleNotes('');
    setIsSettleModalOpen(true);
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFriend) return;
    setSettleError(null);

    const amountFloat = parseFloat(settleAmount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setSettleError('Please enter a valid amount greater than 0');
      return;
    }

    const ledgerId = settleGroupId || groups[0]?.id;
    if (!ledgerId) {
      setSettleError('Select or create an active group to record this settlement.');
      return;
    }

    // Determine direction based on net balance
    // If netBalance < 0: current user owes friend (current user is payer)
    // If netBalance > 0: friend owes current user (friend is payer)
    const isUserDebtor = selectedFriend.netBalance < 0;
    const payerId = isUserDebtor ? currentUserId : selectedFriend.id;
    const payeeId = isUserDebtor ? selectedFriend.id : currentUserId;

    try {
      await recordSettlement({
        groupId: ledgerId,
        fromUserId: payerId,
        toUserId: payeeId,
        amountMinor: Math.round(amountFloat * 100),
        currency: (selectedFriend.currency || curr).toUpperCase(),
        settlementDate: new Date(settleDate).toISOString(),
        notes: settleNotes.trim() || undefined,
        createdBy: currentUserId,
      });

      setIsSettleModalOpen(false);
      setMessage(`Settlement recorded! Balances between you and ${selectedFriend.name} have been updated.`);
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : 'Failed to record settlement');
    }
  };

  // -------------------------------------------------------------
  // VIEW 1: FRIEND DETAILS VIEW (Contextual Settle Up)
  // -------------------------------------------------------------
  if (selectedFriend) {
    const isUserDebtor = selectedFriend.netBalance < 0;
    const isSettled = selectedFriend.netBalance === 0;
    const absAmount = Math.abs(selectedFriend.netBalance);
    const formattedAmount = formatMoney(absAmount, selectedFriend.currency || curr);

    return (
      <div className="space-y-6 pb-16 animate-in fade-in-50 duration-300">
        {/* Back Button */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchParams({})}
            className="rounded-xl text-muted-foreground hover:text-foreground gap-1.5 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>All Friends</span>
          </Button>
        </div>

        {/* Friend Profile Header Card */}
        <div className="rounded-3xl border bg-card p-6 sm:p-8 shadow-xs relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <Avatar size="lg" className="h-16 w-16 text-lg font-black border-2 border-border shadow-xs">
              {selectedFriend.avatarUrl && <AvatarImage src={selectedFriend.avatarUrl} alt={selectedFriend.name} />}
              <AvatarFallback className="bg-primary/10 text-primary uppercase">
                {selectedFriend.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate">
                {selectedFriend.name}
              </h1>
              {selectedFriend.email && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{selectedFriend.email}</p>
              )}
              {selectedFriend.sharedGroups.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Shared groups: {selectedFriend.sharedGroups.join(', ')}
                </p>
              )}
            </div>
          </div>

          {/* Contextual Actions: Add Expense & Settle Up */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => navigate(`/expenses/new?queryFriendId=${selectedFriend.id}`)}
              className="h-11 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm gap-2 shadow-xs"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add expense</span>
            </Button>

            {!isSettled ? (
              <Button
                variant="outline"
                onClick={handleOpenSettleModal}
                className="h-11 px-5 rounded-2xl font-bold text-sm gap-2 border-border/80 shadow-xs hover:bg-muted"
              >
                <ArrowRightLeft className="h-4 w-4 stroke-[2.2]" />
                <span>Settle up</span>
              </Button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4" />
                <span>All settled up</span>
              </div>
            )}
          </div>
        </div>

        {/* Net Balance Status Card */}
        <div
          className={cn(
            'rounded-3xl border p-6 sm:p-7 shadow-xs relative overflow-hidden transition-all',
            isSettled && 'bg-emerald-500/[0.04] border-emerald-500/30',
            !isSettled && isUserDebtor && 'bg-rose-500/[0.05] border-rose-500/30',
            !isSettled && !isUserDebtor && 'bg-emerald-500/[0.05] border-emerald-500/30'
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pairwise Balance
              </span>
              <p
                className={cn(
                  'text-2xl sm:text-3xl font-black tracking-tight',
                  isSettled && 'text-emerald-600 dark:text-emerald-400',
                  !isSettled && isUserDebtor && 'text-rose-600 dark:text-rose-400',
                  !isSettled && !isUserDebtor && 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {isSettled
                  ? `You're all settled up with ${selectedFriend.name}`
                  : isUserDebtor
                  ? `You owe ${selectedFriend.name} ${formattedAmount}`
                  : `${selectedFriend.name} owes you ${formattedAmount}`}
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                {isSettled
                  ? 'All shared expenses and debts between the two of you are cleared.'
                  : isUserDebtor
                  ? 'You can settle up using any payment method and record it here.'
                  : `${selectedFriend.name} can pay you back and you can record the settlement.`}
              </p>
            </div>

            {!isSettled && (
              <Button
                onClick={handleOpenSettleModal}
                className="rounded-2xl font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90 h-10 px-5 shrink-0"
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Settle up now
              </Button>
            )}
          </div>
        </div>

        {/* Status Alerts */}
        {message && (
          <p
            role="status"
            className="text-sm text-emerald-600 dark:text-emerald-400 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </p>
        )}

        {/* Shared Expenses Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black tracking-tight text-foreground">
              Shared Expenses ({sharedExpenses.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/expenses/new?queryFriendId=${selectedFriend.id}`)}
              className="text-xs font-bold text-[#0055FF]"
            >
              + Add shared expense
            </Button>
          </div>

          {sharedExpenses.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No shared expenses yet"
              description={`Expenses that involve both you and ${selectedFriend.name} will appear here.`}
            />
          ) : (
            <div className="divide-y divide-border/40 rounded-3xl border bg-card overflow-hidden shadow-xs">
              {sharedExpenses.map((exp) => {
                const isPayerYou = exp.paidBy === currentUserId;
                const payerName = isPayerYou ? 'You' : selectedFriend.name;
                const expSplits = splits[exp.id] || [];
                const userShare = expSplits.find((s) => s.userId === currentUserId)?.shareMinor;

                return (
                  <div
                    key={exp.id}
                    onClick={() => navigate(`/expenses/${exp.id}`)}
                    className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{exp.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(exp.expenseDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          &bull; Paid by {payerName}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-foreground">
                        {formatMoney(exp.originalAmountMinor, exp.originalCurrency)}
                      </p>
                      {userShare !== undefined && (
                        <p className="text-xs text-muted-foreground font-medium">
                          Your share: {formatMoney(userShare, exp.originalCurrency)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Previous Settlements Section */}
        <section className="space-y-3">
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Settlement History ({sharedSettlements.length})
          </h2>

          {sharedSettlements.length === 0 ? (
            <div className="p-6 rounded-3xl border bg-card text-center text-xs text-muted-foreground">
              No previous settlements recorded between you and {selectedFriend.name}.
            </div>
          ) : (
            <div className="divide-y divide-border/40 rounded-3xl border bg-card overflow-hidden shadow-xs">
              {sharedSettlements.map((s) => {
                const youPaid = s.fromUserId === currentUserId;
                return (
                  <div key={s.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                        <Check className="h-4 w-4 stroke-[2.5]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {youPaid ? `You paid ${selectedFriend.name}` : `${selectedFriend.name} paid you`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.settlementDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {s.notes && ` &bull; ${s.notes}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                      {formatMoney(s.amountMinor, s.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Inline Settle Up Confirmation Modal */}
        {isSettleModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
            <div className="bg-card border border-border rounded-3xl max-w-md w-full p-6 shadow-xl space-y-5 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b pb-3 border-border/60">
                <h3 className="font-black text-lg text-foreground">Settle Up</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSettleModalOpen(false)}
                  className="rounded-full h-8 w-8 p-0"
                >
                  &times;
                </Button>
              </div>

              {settleError && (
                <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{settleError}</span>
                </div>
              )}

              {/* Visual Direction Banner */}
              <div className="p-4 rounded-2xl bg-muted/50 border border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar size="sm" className="h-8 w-8 text-xs font-bold">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {isUserDebtor ? 'YOU' : selectedFriend.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">Payer</p>
                    <p className="text-xs font-bold text-foreground truncate">
                      {isUserDebtor ? 'You' : selectedFriend.name}
                    </p>
                  </div>
                </div>

                <ArrowRight className="h-4 w-4 text-primary shrink-0" />

                <div className="flex items-center gap-2 min-w-0 text-right justify-end">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">Recipient</p>
                    <p className="text-xs font-bold text-foreground truncate">
                      {isUserDebtor ? selectedFriend.name : 'You'}
                    </p>
                  </div>
                  <Avatar size="sm" className="h-8 w-8 text-xs font-bold">
                    <AvatarFallback className="bg-emerald-500/10 text-emerald-600">
                      {isUserDebtor ? selectedFriend.name.slice(0, 2).toUpperCase() : 'YOU'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>

              <form onSubmit={handleConfirmSettlement} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="settle-amount" className="text-xs font-semibold">
                    Amount ({selectedFriend.currency || curr})
                  </Label>
                  <Input
                    id="settle-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    required
                    className="rounded-xl font-bold"
                  />
                </div>

                {groups.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="settle-group" className="text-xs font-semibold">
                      Associated Group Ledger
                    </Label>
                    <select
                      id="settle-group"
                      value={settleGroupId}
                      onChange={(e) => setSettleGroupId(e.target.value)}
                      className="w-full rounded-xl border bg-background p-2 text-sm"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="settle-date" className="text-xs font-semibold">
                    Settlement Date
                  </Label>
                  <Input
                    id="settle-date"
                    type="date"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    required
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settle-notes" className="text-xs font-semibold">
                    Payment Method / Notes
                  </Label>
                  <Input
                    id="settle-notes"
                    placeholder="e.g. Paid via UPI, Cash, Venmo"
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-border/60">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsSettleModalOpen(false)}
                    className="rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isRecording}
                    className="rounded-xl font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90 gap-1.5"
                  >
                    <Check className="h-4 w-4" />
                    <span>{isRecording ? 'Recording...' : 'Confirm Settlement'}</span>
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: FRIENDS LIST & COLLABORATION VIEW
  // -------------------------------------------------------------
  return (
    <div className="space-y-6 pb-16 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Friends &amp; Members"
        description="View your shared balances, review expense histories, and settle up with friends."
        actions={
          <Button variant="outline" disabled={isBusy} onClick={() => void run(refresh, 'Refreshed')}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* Invite to Group Form */}
      {managedGroups.length > 0 && (
        <form className="rounded-3xl border bg-card p-5 sm:p-6 space-y-3 shadow-xs" onSubmit={handleSendInvite}>
          <label htmlFor="friend-email" className="font-bold text-base block">
            Invite member to a group
          </label>
          <p className="text-xs text-muted-foreground">
            Enter their email address to share group expenses, split bills, and track balances.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              aria-label="Select Group"
              className="rounded-xl border bg-background px-3 py-2 text-sm font-medium"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              required
            >
              <option value="">Select a group you manage</option>
              {managedGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <Input
              id="friend-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@gmail.com"
              className="rounded-xl"
            />
            <Button disabled={isBusy || !inviteEmail.trim() || !selectedGroupId} className="rounded-xl shrink-0">
              <UserPlus className="h-4 w-4 mr-2" />
              Send Invitation
            </Button>
          </div>
        </form>
      )}

      {(localError || error) && (
        <p role="alert" className="text-sm text-destructive p-3 rounded-xl bg-destructive/10 border border-destructive/20">
          {localError || error?.message}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="text-sm text-emerald-600 dark:text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </p>
      )}

      {/* Invitations Section */}
      <section className="space-y-3" aria-label="Group invitations">
        <h2 className="text-lg font-bold">Invitations ({invitations.length})</h2>
        {invitations.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        )}
        {invitations.map((inv) => {
          const isIncoming = inv.invitedEmail.toLowerCase() === ownEmail;
          return (
            <div
              key={inv.id}
              className="rounded-2xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs"
            >
              <div className="min-w-0">
                <p className="font-semibold break-all text-sm">{inv.groupName}</p>
                <p className="text-xs text-muted-foreground">
                  {isIncoming
                    ? `Invited by ${inv.inviterName} (${inv.role})`
                    : `Sent to ${inv.invitedEmail}`}
                </p>
                <p className="text-[11px] mt-1 text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Status: {inv.status}
                </p>
              </div>

              <div className="flex gap-2">
                {isIncoming && inv.status === 'pending' ? (
                  <>
                    <Button
                      size="sm"
                      disabled={isBusy}
                      onClick={() =>
                        void run(
                          () => respond({ id: inv.id, accept: true, token: inv.token }),
                          'Invitation accepted! You have joined the group.'
                        )
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() =>
                        void run(() => respond({ id: inv.id, accept: false }), 'Invitation declined.')
                      }
                    >
                      Decline
                    </Button>
                  </>
                ) : (
                  !isIncoming &&
                  inv.status === 'pending' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void run(() => cancelRequest(inv.id), 'Invitation cancelled.')}
                    >
                      Cancel
                    </Button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Friends & Shared Balances List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Friends &amp; Balances ({friendsList.length})
          </h2>
          {friendsList.length > 0 && (
            <Input
              aria-label="Search friends"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl max-w-xs"
            />
          )}
        </div>

        {friendsList.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No friends or group members yet"
            description="When you create groups and invite friends, they will appear here with dynamic shared balances."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {friendsList
              .filter(
                (f) =>
                  f.name.toLowerCase().includes(search.toLowerCase()) ||
                  f.email.toLowerCase().includes(search.toLowerCase())
              )
              .map((friend) => {
                const isUserDebtor = friend.netBalance < 0;
                const isSettled = friend.netBalance === 0;
                const absAmount = Math.abs(friend.netBalance);
                const formattedAmount = formatMoney(absAmount, friend.currency);

                return (
                  <div
                    key={friend.id}
                    onClick={() => setSearchParams({ friendId: friend.id })}
                    className="rounded-3xl border bg-card p-5 space-y-4 shadow-xs hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar size="default" className="h-11 w-11 text-xs font-bold shrink-0">
                          {friend.avatarUrl && <AvatarImage src={friend.avatarUrl} alt={friend.name} />}
                          <AvatarFallback className="bg-primary/10 text-primary uppercase">
                            {friend.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <h3 className="font-bold text-base text-foreground truncate group-hover:text-[#0055FF] transition-colors">
                            {friend.name}
                          </h3>
                          {friend.email && (
                            <p className="text-xs text-muted-foreground truncate">{friend.email}</p>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-[#0055FF] transition-all shrink-0 mt-1" />
                    </div>

                    <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">Balance</span>
                      <span
                        className={cn(
                          'text-xs font-bold',
                          isSettled && 'text-emerald-600 dark:text-emerald-400',
                          !isSettled && isUserDebtor && 'text-rose-600 dark:text-rose-400',
                          !isSettled && !isUserDebtor && 'text-emerald-600 dark:text-emerald-400'
                        )}
                      >
                        {isSettled
                          ? 'All settled up'
                          : isUserDebtor
                          ? `You owe ${formattedAmount}`
                          : `Owes you ${formattedAmount}`}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}

export default FriendsPage;
