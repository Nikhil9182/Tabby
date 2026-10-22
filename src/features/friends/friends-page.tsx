import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { useCollaboration } from '@/hooks/use-collaboration';
import { useCurrentUser, useGroups, useExpenses, useSettlements } from '@/hooks';
import { calculateUserBalances } from '@/domain/balances/balance-engine';
import { formatMoney } from '@/domain/money/money';

export function FriendsPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const { groups } = useGroups();
  const { expenses, splits } = useExpenses();
  const { settlements } = useSettlements();
  const { invitations, pendingIncoming, sendRequest, respond, cancelRequest, refresh, isBusy, error } = useCollaboration();

  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const currentUserId = currentUser?.id || '';
  const ownEmail = (currentUser?.email || '').trim().toLowerCase();

  const managedGroups = groups.filter((g) => g.createdBy === currentUserId && !g.isArchived);

  // Compute friends from shared groups
  const allSplitsList = useMemo(() => Object.values(splits).flat(), [splits]);
  const userBalances = useMemo(() => {
    if (!currentUserId || !expenses || !settlements) return [];
    return calculateUserBalances(currentUserId, expenses, allSplitsList, settlements).pairwise;
  }, [currentUserId, expenses, allSplitsList, settlements]);

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

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Friends &amp; Members"
        description="People you share groups and expenses with across Tabby."
        actions={
          <Button variant="outline" disabled={isBusy} onClick={() => void run(refresh, 'Refreshed')}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      {/* Invite to Group Form */}
      {managedGroups.length > 0 && (
        <form className="rounded-3xl border bg-card p-5 space-y-3 shadow-xs" onSubmit={handleSendInvite}>
          <label htmlFor="friend-email" className="font-bold text-base block">
            Invite member to a group
          </label>
          <p className="text-xs text-muted-foreground">
            Enter their email address and select the group ledger to share expenses.
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
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
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
                <p className="font-semibold break-all text-sm">
                  {inv.groupName}
                </p>
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
                        void run(
                          () => respond({ id: inv.id, accept: false }),
                          'Invitation declined.'
                        )
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

      {/* Shared Members / Balances */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Shared Balances ({userBalances.length})</h2>
        {userBalances.length > 0 && (
          <Input
            aria-label="Search friends"
            placeholder="Filter friends..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl max-w-sm"
          />
        )}
        {userBalances.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No pairwise debts"
            description="When you and friends split expenses inside shared groups, balances between members will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {userBalances
              .filter((b) => {
                const other = b.fromUserId === currentUserId ? b.toUserId : b.fromUserId;
                return other.toLowerCase().includes(search.toLowerCase());
              })
              .map((b) => {
                const other = b.fromUserId === currentUserId ? b.toUserId : b.fromUserId;
                const youOwe = b.fromUserId === currentUserId;
                return (
                  <div key={`${b.fromUserId}-${b.toUserId}`} className="rounded-2xl border bg-card p-4 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm truncate">{other}</h3>
                      <span
                        className={`text-xs font-bold ${
                          youOwe
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {youOwe
                          ? `You owe ${formatMoney(b.amountMinor, b.currency)}`
                          : `Owes you ${formatMoney(b.amountMinor, b.currency)}`}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => navigate('/settlements/new')}
                    >
                      Settle Up
                    </Button>
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
