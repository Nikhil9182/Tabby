import React, { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  Search,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { useCollaboration } from '@/hooks/use-collaboration';
import {
  useCurrentUser,
  useExpenses,
  useSettlements,
  useCurrency,
  useFriends,
} from '@/hooks';
import { calculateDirectFriendBalance } from '@/domain/balances/balance-engine';
import { formatMoney } from '@/domain/money/money';
import { cn } from '@/lib/utils';

export function FriendsPage() {
  const navigate = useNavigate();
  const routeParams = useParams<{ friendId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFriendId = routeParams.friendId || searchParams.get('friendId');

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || '';
  const ownEmail = (currentUser?.email || '').trim().toLowerCase();

  const { friends, isLoading: isLoadingFriends, addFriend, isAdding, refetch: refetchFriends } = useFriends();
  const { expenses, splits } = useExpenses();
  const { settlements, recordSettlement, isRecording } = useSettlements();
  const { defaultCurrency } = useCurrency();
  const curr = defaultCurrency || 'USD';

  // Group invitations from collaboration hook
  const { invitations, respond, cancelRequest, isBusy } = useCollaboration();

  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');

  // Add Friend Modal State
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false);
  const [friendEmailInput, setFriendEmailInput] = useState('');
  const [addFriendError, setAddFriendError] = useState<string | null>(null);

  // Settlement Dialog State inside Friend Details
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settleNotes, setSettleNotes] = useState('');
  const [settleError, setSettleError] = useState<string | null>(null);

  const allSplitsList = useMemo(() => Object.values(splits).flat(), [splits]);

  // Map each friend to their net direct balance
  const friendSummaries = useMemo(() => {
    return friends.map((friend) => {
      const balance = calculateDirectFriendBalance(
        currentUserId,
        friend.id,
        expenses,
        allSplitsList,
        settlements,
        curr
      );

      // balance.amountMinor >= 0
      // If fromUserId === currentUserId, current user owes friend
      // If fromUserId === friend.id, friend owes current user
      const isUserDebtor = balance.amountMinor > 0 && balance.fromUserId === currentUserId;
      const isFriendDebtor = balance.amountMinor > 0 && balance.fromUserId === friend.id;
      const isSettled = balance.amountMinor === 0;

      return {
        id: friend.id,
        name: friend.name || friend.email || 'Friend',
        email: friend.email,
        avatarUrl: friend.picture || friend.avatarUrl,
        balance,
        isUserDebtor,
        isFriendDebtor,
        isSettled,
        amountMinor: balance.amountMinor,
      };
    });
  }, [friends, currentUserId, expenses, allSplitsList, settlements, curr]);

  // Selected friend details
  const selectedFriend = useMemo(() => {
    if (!selectedFriendId) return null;
    return friendSummaries.find((f) => f.id === selectedFriendId) || null;
  }, [selectedFriendId, friendSummaries]);

  // Filter direct expenses strictly between current user and selected friend
  const directExpenses = useMemo(() => {
    if (!selectedFriendId || !currentUserId) return [];
    return expenses
      .filter((exp) => {
        if (exp.deletedAt) return false;
        // Strictly direct context (no group_id)
        const isDirect = exp.contextType === 'direct' || (!exp.groupId && exp.sourceType !== 'group');
        if (!isDirect) return false;

        const expSplits = splits[exp.id] || [];
        const involvesUser = exp.paidBy === currentUserId || expSplits.some((s) => s.userId === currentUserId);
        const involvesFriend =
          exp.paidBy === selectedFriendId ||
          exp.friendId === selectedFriendId ||
          expSplits.some((s) => s.userId === selectedFriendId);

        return involvesUser && involvesFriend;
      })
      .sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());
  }, [selectedFriendId, currentUserId, expenses, splits]);

  // Filter direct settlements strictly between current user and selected friend
  const directSettlements = useMemo(() => {
    if (!selectedFriendId || !currentUserId) return [];
    return settlements
      .filter((s) => {
        if (s.deletedAt) return false;
        // Strictly direct settlements (no group_id)
        const isDirect = s.contextType === 'direct' || !s.groupId;
        if (!isDirect) return false;

        return (
          (s.fromUserId === currentUserId && s.toUserId === selectedFriendId) ||
          (s.fromUserId === selectedFriendId && s.toUserId === currentUserId)
        );
      })
      .sort((a, b) => new Date(b.settlementDate).getTime() - new Date(a.settlementDate).getTime());
  }, [selectedFriendId, currentUserId, settlements]);

  // Add friend handler
  const handleAddFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFriendError(null);
    const clean = friendEmailInput.trim().toLowerCase();

    if (!clean) {
      setAddFriendError('Please enter an email address.');
      return;
    }

    if (clean === ownEmail) {
      setAddFriendError('You cannot add yourself as a friend.');
      return;
    }

    try {
      const res = await addFriend(clean);
      setFriendEmailInput('');
      setIsAddFriendModalOpen(false);
      setMessage(`Added ${res.friendProfile.display_name || res.friendProfile.email || 'friend'} as a friend!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add friend.';
      setAddFriendError(msg);
    }
  };

  // Open Settle Modal initialized with exact direct balance
  const handleOpenSettleModal = () => {
    if (!selectedFriend || selectedFriend.isSettled) return;
    setSettleError(null);
    const absDollars = selectedFriend.amountMinor / 100;
    setSettleAmount(absDollars.toFixed(2));
    setSettleDate(new Date().toISOString().slice(0, 10));
    setSettleNotes('');
    setIsSettleModalOpen(true);
  };

  // Confirm settlement handler
  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFriend || selectedFriend.isSettled) return;
    setSettleError(null);

    const amountFloat = parseFloat(settleAmount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setSettleError('Please enter a valid amount greater than 0.');
      return;
    }

    const maxAmount = selectedFriend.amountMinor / 100;
    if (amountFloat > maxAmount) {
      setSettleError(`Settlement amount cannot exceed the outstanding balance of ${formatMoney(selectedFriend.amountMinor, curr)}.`);
      return;
    }

    // Direction:
    // If isUserDebtor: You owe friend -> You are payer, Friend is payee
    // If isFriendDebtor: Friend owes you -> Friend is payer, You are payee
    const payerId = selectedFriend.isUserDebtor ? currentUserId : selectedFriend.id;
    const payeeId = selectedFriend.isUserDebtor ? selectedFriend.id : currentUserId;

    try {
      await recordSettlement({
        friendId: selectedFriend.id,
        contextType: 'direct',
        fromUserId: payerId,
        toUserId: payeeId,
        amountMinor: Math.round(amountFloat * 100),
        currency: curr,
        settlementDate: new Date(settleDate).toISOString(),
        notes: settleNotes.trim() || undefined,
        createdBy: currentUserId,
      });

      setIsSettleModalOpen(false);
      setMessage(`Settlement recorded! Direct balance with ${selectedFriend.name} has been updated.`);
    } catch (err: unknown) {
      setSettleError(err instanceof Error ? err.message : 'Failed to record settlement.');
    }
  };

  // -------------------------------------------------------------
  // VIEW 1: FRIEND DETAILS VIEW (1-to-1 Direct Expenses & Settle Up)
  // -------------------------------------------------------------
  if (selectedFriend) {
    const formattedAmount = formatMoney(selectedFriend.amountMinor, curr);

    return (
      <div className="space-y-6 pb-16 animate-in fade-in-50 duration-300">
        {/* Back Button */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (routeParams.friendId) {
                navigate('/friends');
              } else {
                setSearchParams({});
              }
            }}
            className="rounded-xl text-muted-foreground hover:text-foreground gap-1.5 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>All Friends</span>
          </Button>
        </div>

        {/* Friend Profile Header Card */}
        <div className="rounded-3xl border bg-card p-6 sm:p-8 shadow-xs relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <Avatar className="h-16 w-16 text-lg font-black border-2 border-border shadow-xs">
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
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                Direct friend tracking
              </span>
            </div>
          </div>

          {/* Contextual Actions: Add Expense & Settle Up */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => navigate(`/expenses/new?friendId=${selectedFriend.id}`)}
              className="h-11 px-5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm gap-2 shadow-xs"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add expense</span>
            </Button>

            {!selectedFriend.isSettled ? (
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

        {/* Net Direct Balance Status Card */}
        <div
          className={cn(
            'rounded-3xl border p-6 sm:p-7 shadow-xs relative overflow-hidden transition-all',
            selectedFriend.isSettled && 'bg-emerald-500/[0.04] border-emerald-500/30',
            !selectedFriend.isSettled && selectedFriend.isUserDebtor && 'bg-rose-500/[0.05] border-rose-500/30',
            !selectedFriend.isSettled && selectedFriend.isFriendDebtor && 'bg-emerald-500/[0.05] border-emerald-500/30'
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Direct Net Balance
              </span>
              <p
                className={cn(
                  'text-2xl sm:text-3xl font-black tracking-tight',
                  selectedFriend.isSettled && 'text-emerald-600 dark:text-emerald-400',
                  !selectedFriend.isSettled && selectedFriend.isUserDebtor && 'text-rose-600 dark:text-rose-400',
                  !selectedFriend.isSettled && selectedFriend.isFriendDebtor && 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {selectedFriend.isSettled
                  ? `You're all settled up with ${selectedFriend.name}`
                  : selectedFriend.isUserDebtor
                  ? `You owe ${selectedFriend.name} ${formattedAmount}`
                  : `${selectedFriend.name} owes you ${formattedAmount}`}
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                {selectedFriend.isSettled
                  ? 'All direct expenses between the two of you are settled. Group expenses remain tracked in their groups.'
                  : selectedFriend.isUserDebtor
                  ? `You can settle this ₹ amount directly with ${selectedFriend.name}.`
                  : `${selectedFriend.name} can pay you back and you can record the settlement here.`}
              </p>
            </div>

            {!selectedFriend.isSettled && (
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

        {/* Direct Expenses History */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black tracking-tight text-foreground">
              Direct Expenses ({directExpenses.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/expenses/new?friendId=${selectedFriend.id}`)}
              className="text-xs font-bold text-[#0055FF]"
            >
              + Add direct expense
            </Button>
          </div>

          {directExpenses.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No direct expenses yet"
              description={`Expenses shared directly with ${selectedFriend.name} will appear here.`}
            />
          ) : (
            <div className="divide-y divide-border/40 rounded-3xl border bg-card overflow-hidden shadow-xs">
              {directExpenses.map((exp) => {
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

        {/* Direct Settlements History */}
        <section className="space-y-3">
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Direct Settlement History ({directSettlements.length})
          </h2>

          {directSettlements.length === 0 ? (
            <div className="p-6 rounded-3xl border bg-card text-center text-xs text-muted-foreground">
              No direct settlements recorded yet between you and {selectedFriend.name}.
            </div>
          ) : (
            <div className="divide-y divide-border/40 rounded-3xl border bg-card overflow-hidden shadow-xs">
              {directSettlements.map((s) => {
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

        {/* Settle Up Modal */}
        {isSettleModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
            <div className="bg-card border border-border rounded-3xl max-w-md w-full p-6 shadow-xl space-y-5 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b pb-3 border-border/60">
                <div>
                  <h3 className="font-black text-lg text-foreground">Settle Up</h3>
                  <p className="text-xs text-muted-foreground">Direct settlement with {selectedFriend.name}</p>
                </div>
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

              {/* Clear Direction Banner: Who is paying whom */}
              <div className="p-4 rounded-2xl bg-muted/50 border border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-8 w-8 text-xs font-bold">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {selectedFriend.isUserDebtor ? 'YOU' : selectedFriend.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">Payer</p>
                    <p className="text-xs font-bold text-foreground truncate">
                      {selectedFriend.isUserDebtor ? 'You' : selectedFriend.name}
                    </p>
                  </div>
                </div>

                <ArrowRight className="h-4 w-4 text-primary shrink-0" />

                <div className="flex items-center gap-2 min-w-0 text-right justify-end">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase">Recipient</p>
                    <p className="text-xs font-bold text-foreground truncate">
                      {selectedFriend.isUserDebtor ? selectedFriend.name : 'You'}
                    </p>
                  </div>
                  <Avatar className="h-8 w-8 text-xs font-bold">
                    <AvatarFallback className="bg-emerald-500/10 text-emerald-600">
                      {selectedFriend.isUserDebtor ? selectedFriend.name.slice(0, 2).toUpperCase() : 'YOU'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>

              <form onSubmit={handleConfirmSettlement} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="settle-amount" className="text-xs font-semibold">
                      Settlement Amount ({curr})
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      Max: {formatMoney(selectedFriend.amountMinor, curr)}
                    </span>
                  </div>
                  <Input
                    id="settle-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(selectedFriend.amountMinor / 100).toFixed(2)}
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    required
                    className="rounded-xl font-bold text-base"
                  />
                </div>

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
  // VIEW 2: ALL FRIENDS LIST VIEW (Independent 1-to-1 Tracking)
  // -------------------------------------------------------------
  return (
    <div className="space-y-6 pb-16 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Friends"
        description="Track one-to-one shared expenses and settlements directly with friends without needing a group."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={isLoadingFriends}
              onClick={() => void refetchFriends()}
              className="rounded-xl"
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isLoadingFriends && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              onClick={() => {
                setAddFriendError(null);
                setFriendEmailInput('');
                setIsAddFriendModalOpen(true);
              }}
              className="rounded-xl font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add friend
            </Button>
          </div>
        }
      />

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

      {/* Friends Search & List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search friends"
              placeholder="Search friends by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl pl-9"
            />
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {friendSummaries.length} {friendSummaries.length === 1 ? 'friend' : 'friends'}
          </span>
        </div>

        {friendSummaries.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No friends added yet"
            description="Add friends by email to track direct one-to-one expenses and settlements without creating groups."
            action={
              <Button
                onClick={() => {
                  setAddFriendError(null);
                  setFriendEmailInput('');
                  setIsAddFriendModalOpen(true);
                }}
                className="rounded-xl font-bold bg-[#0055FF] text-white"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add your first friend
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {friendSummaries
              .filter(
                (f) =>
                  f.name.toLowerCase().includes(search.toLowerCase()) ||
                  (f.email || '').toLowerCase().includes(search.toLowerCase())
              )
              .map((friend) => {
                const formattedAmount = formatMoney(friend.amountMinor, curr);

                return (
                  <div
                    key={friend.id}
                    onClick={() => setSearchParams({ friendId: friend.id })}
                    className="rounded-3xl border bg-card p-5 space-y-4 shadow-xs hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-11 w-11 text-xs font-bold shrink-0">
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
                      <span className="text-xs text-muted-foreground font-medium">Direct Balance</span>
                      <span
                        className={cn(
                          'text-xs font-bold',
                          friend.isSettled && 'text-emerald-600 dark:text-emerald-400',
                          !friend.isSettled && friend.isUserDebtor && 'text-rose-600 dark:text-rose-400',
                          !friend.isSettled && friend.isFriendDebtor && 'text-emerald-600 dark:text-emerald-400'
                        )}
                      >
                        {friend.isSettled
                          ? 'Settled up'
                          : friend.isUserDebtor
                          ? `You owe ${formattedAmount}`
                          : `${friend.name} owes you ${formattedAmount}`}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Secondary Section: Group Invitations */}
      {invitations.length > 0 && (
        <section className="space-y-3 pt-6 border-t border-border/60" aria-label="Group invitations">
          <h2 className="text-base font-bold text-foreground">Pending Group Invitations ({invitations.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {invitations.map((inv) => {
              const isIncoming = inv.invitedEmail.toLowerCase() === ownEmail;
              return (
                <div
                  key={inv.id}
                  className="rounded-2xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{inv.groupName}</p>
                    <p className="text-xs text-muted-foreground">
                      {isIncoming ? `Invited by ${inv.inviterName}` : `Sent to ${inv.invitedEmail}`}
                    </p>
                  </div>

                  {isIncoming && inv.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="xs"
                        disabled={isBusy}
                        onClick={() => void respond({ id: inv.id, accept: true, token: inv.token })}
                        className="rounded-lg font-bold"
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={isBusy}
                        onClick={() => void respond({ id: inv.id, accept: false })}
                        className="rounded-lg"
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Add Friend Modal Dialog */}
      {isAddFriendModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50">
          <div className="bg-card border border-border rounded-3xl max-w-md w-full p-6 shadow-xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3 border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-foreground">Add a Friend</h3>
                  <p className="text-xs text-muted-foreground">Connect directly with another Tabby user</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAddFriendModalOpen(false)}
                className="rounded-full h-8 w-8 p-0"
              >
                &times;
              </Button>
            </div>

            {addFriendError && (
              <div className="p-3.5 rounded-2xl bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{addFriendError}</span>
              </div>
            )}

            <form onSubmit={handleAddFriendSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="friend-email" className="text-xs font-semibold">
                  Friend&apos;s Tabby Email Address
                </Label>
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="friend-email"
                    type="email"
                    placeholder="alex@gmail.com"
                    value={friendEmailInput}
                    onChange={(e) => setFriendEmailInput(e.target.value)}
                    required
                    className="rounded-xl pl-9"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Adding a friend connects you directly. You can split bills 1-to-1 without creating a group.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddFriendModalOpen(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isAdding || !friendEmailInput.trim()}
                  className="rounded-xl font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90 gap-1.5"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{isAdding ? 'Adding friend...' : 'Add friend'}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendsPage;
