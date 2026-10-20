import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  UserPlus,
  ArrowRightLeft,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Trash2,
  Receipt,
  Mail,
  AlertCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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

  const { users, addFriend, removeFriend, isAddingFriend, isLoading: isLoadingUsers } = useUsers();
  const { groups, isLoading: isLoadingGroups } = useGroups();
  const { expenses, splits, isLoading: isLoadingExpenses } = useExpenses();
  const { settlements, isLoading: isLoadingSettlements } = useSettlements();
  const { defaultCurrency } = useCurrency();

  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isLoading = isLoadingUsers || isLoadingGroups || isLoadingExpenses || isLoadingSettlements;

  const allSplitsList = useMemo(() => {
    return Object.values(splits).flat() as ExpenseSplit[];
  }, [splits]);

  // Compute friends list: all users other than current user and placeholder aliases
  const friendsData = useMemo(() => {
    const isCurrent = (u: any) =>
      u.id === currentUserId ||
      u.id === 'user_self' ||
      u.id === 'current_user' ||
      (currentUser?.id && u.id === currentUser.id) ||
      (currentUser?.googleSub && u.googleSub === currentUser.googleSub) ||
      Boolean(u.isCurrentUser);

    const activeFriends = users.filter((u) => !isCurrent(u));

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
  }, [users, currentUserId, currentUser, groups, expenses, allSplitsList, settlements, defaultCurrency]);

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friendsData;
    const q = search.toLowerCase();
    return friendsData.filter(
      ({ friend }) =>
        friend.name?.toLowerCase().includes(q) || friend.email.toLowerCase().includes(q)
    );
  }, [friendsData, search]);

  const handleOpenAddDialog = () => {
    setEmailInput('');
    setNameInput('');
    setFormError(null);
    setAddDialogOpen(true);
  };

  const handleAddFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setFormError('Please enter an email address.');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      setFormError('Please enter a valid email address.');
      return;
    }

    if (currentUser?.email && currentUser.email.trim().toLowerCase() === email) {
      setFormError('You cannot add your own account email as a friend.');
      return;
    }

    try {
      await addFriend({
        email,
        name: nameInput.trim() || undefined,
      });
      setAddDialogOpen(false);
      setEmailInput('');
      setNameInput('');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add friend.');
    }
  };

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    if (window.confirm(`Are you sure you want to remove ${friendName} from your friends?`)) {
      try {
        await removeFriend(friendId);
      } catch (err: unknown) {
        console.error('Failed to remove friend:', err);
      }
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-16 animate-in fade-in-50 duration-300">
      <PageHeader
        title="Friends & Contacts"
        description="Connect with friends using the email they use to log into Tabby to split expenses directly."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              onClick={handleOpenAddDialog}
              className="h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm transition-transform active:scale-98"
            >
              <UserPlus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Friend</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/groups/new')}
              className="h-11 px-4 rounded-2xl font-bold gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>New Group</span>
            </Button>
          </div>
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
          title="No friends added yet"
          description="Add friends by entering the email address they use to sign into Tabby."
          action={
            <div className="flex items-center gap-3">
              <Button
                onClick={handleOpenAddDialog}
                className="rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 h-11 px-5"
              >
                <UserPlus className="h-4 w-4 stroke-[2.5]" />
                <span>Add Your First Friend</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/groups/new')}
                className="rounded-2xl font-bold h-11 px-4"
              >
                Create a Group
              </Button>
            </div>
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
                className="p-4 sm:p-5 rounded-3xl border border-border/80 hover:border-[#0055FF]/40 hover:shadow-xs transition-all bg-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                {/* Left: Avatar & Identity */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar size="default" className="border-2 border-background shrink-0">
                    {friend.picture && <AvatarImage src={friend.picture} alt={name} />}
                    <AvatarFallback className="font-black text-xs uppercase bg-[#0055FF]/10 text-[#0055FF]">
                      {name.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 space-y-0.5">
                    <p className="font-bold text-base text-foreground truncate">{name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="truncate max-w-[200px] font-medium">{friend.email}</span>
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

                {/* Right: Net Balance & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 shrink-0">
                  <div className="text-left sm:text-right">
                    <div className="flex items-center sm:justify-end gap-1.5 text-xs font-semibold">
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

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Add Expense with this friend */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/expenses/new?friendId=${friend.id}`)}
                      className="h-9 px-3 rounded-xl font-bold text-xs gap-1.5 border-border/80 hover:border-[#0055FF]/40"
                    >
                      <Receipt className="h-3.5 w-3.5" />
                      <span>Add Expense</span>
                    </Button>

                    {/* Settle Up */}
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
                        className="h-9 px-3.5 rounded-xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold text-xs shadow-2xs gap-1.5"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        <span>Settle</span>
                      </Button>
                    )}

                    {/* Remove friend option if balance is settled */}
                    {isSettled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFriend(friend.id, name)}
                        className="h-9 w-9 rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Remove friend"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Friend Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#0055FF]" />
              <span>Add Friend by Email</span>
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground">
              Add someone you want to split expenses with using their Tabby login email.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddFriendSubmit} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="friendEmail" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email Address <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="friendEmail"
                  type="email"
                  required
                  placeholder="e.g. friend@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="pl-10 h-11 rounded-2xl bg-muted/40 border-border text-sm font-medium focus-visible:ring-1 focus-visible:ring-[#0055FF]"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter the exact Gmail or email address your friend uses to sign into Tabby.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="friendName" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Friend's Name <span className="text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="friendName"
                type="text"
                placeholder="e.g. Sarah"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="h-11 rounded-2xl bg-muted/40 border-border text-sm font-medium focus-visible:ring-1 focus-visible:ring-[#0055FF]"
              />
              <p className="text-[11px] text-muted-foreground">
                If omitted, their name will default to their email username until synced.
              </p>
            </div>

            <DialogFooter className="pt-3 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                className="rounded-2xl font-bold h-11 px-5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isAddingFriend}
                className="h-11 px-6 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2 shadow-sm"
              >
                <UserPlus className="h-4 w-4 stroke-[2.5]" />
                <span>{isAddingFriend ? 'Adding...' : 'Add Friend'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FriendsPage;
