import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowRight,
  Utensils,
  ShoppingCart,
  Car,
  Home,
  Users,
  UserPlus,
  Receipt,
  CheckCircle2,
  Calendar,
  Plane,
  Coffee,
  FolderPlus,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useExpenses } from "@/hooks/use-expenses";
import { useGroups } from "@/hooks/use-groups";
import { useSettlements } from "@/hooks/use-settlements";
import { useFriends } from "@/hooks/use-friends";
import { useCurrentUser, useUsers } from "@/hooks/use-users";
import { useDisplayConversion } from "@/hooks/use-currency";
import { formatMoney } from "@/domain/money/money";
import { bagCurrencies, type MoneyBag } from "@/domain/money/conversion";
import { BalanceAmount } from "@/components/currency/converted-amount";
import {
  calculateDashboardBalances,
  type PairwiseBalance,
} from "@/domain/balances/balance-engine";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || "current_user";

  const { expenses, splits, isLoading: expensesLoading } = useExpenses();
  const { groups, isLoading: groupsLoading } = useGroups();
  const { settlements, isLoading: settlementsLoading } = useSettlements();
  const { friends, isLoading: friendsLoading } = useFriends();
  const { users } = useUsers();

  const isCurrentUserEntity = (userId: string | undefined): boolean => {
    if (!userId) return false;
    return (
      userId === currentUserId ||
      userId === "user_self" ||
      userId === "current_user" ||
      userId === currentUser?.googleSub
    );
  };

  const getUserName = (userId: string | undefined, fallbackObj?: any): string => {
    if (!userId) return "Someone";
    if (isCurrentUserEntity(userId)) {
      return currentUser?.name || "You";
    }
    const friend = friends.find((f) => f.id === userId);
    if (friend?.name) return friend.name;
    const found = users.find((u) => u.id === userId || u.googleSub === userId);
    return found?.name || found?.email || fallbackObj?.name || fallbackObj?.email || "Friend";
  };

  // Flatten all splits for calculations
  const allSplitsList = useMemo(() => {
    return Object.values(splits).flat();
  }, [splits]);

  // Friend IDs
  const friendIds = useMemo(() => friends.map((f) => f.id), [friends]);

  // Calculate isolated dashboard balances (zero double-counting)
  const dashboardBalances = useMemo(() => {
    return calculateDashboardBalances(
      currentUserId,
      expenses,
      allSplitsList,
      settlements,
      friendIds,
      groups
    );
  }, [currentUserId, expenses, allSplitsList, settlements, friendIds, groups]);

  // Balances stay per currency; convert once for display at the latest rate
  const conversion = useDisplayConversion([
    ...bagCurrencies(dashboardBalances.overall.owedByCurrency),
    ...bagCurrencies(dashboardBalances.overall.owedToYouByCurrency),
  ]);

  /** Overall sign of a bag in the display currency (by signs when a rate is missing). */
  const bagSign = (bag: MoneyBag): number => {
    const { totalMinor } = conversion.convert(bag);
    if (totalMinor !== null) return Math.sign(totalMinor);
    const values = bagCurrencies(bag).map((c) => bag[c]);
    return values.every((v) => v > 0) ? 1 : values.every((v) => v < 0) ? -1 : 0;
  };

  // Determine active data
  const activeExpenses = useMemo(() => {
    return (expenses || []).filter((e) => !e.deletedAt);
  }, [expenses]);

  const activeGroups = useMemo(() => {
    return (groups || []).filter((g) => !g.isArchived);
  }, [groups]);

  const hasExpenses = activeExpenses.length > 0;
  const hasGroups = activeGroups.length > 0;

  // Net balance across everything, per currency
  const netBag = dashboardBalances.overall.netByCurrency;
  const netSignValue = bagSign(netBag);
  const netSubtitle =
    netSignValue > 0
      ? "Total amount owed to you across direct friends and groups"
      : netSignValue < 0
      ? "Total amount you owe across direct friends and groups"
      : bagCurrencies(netBag).length > 0
      ? "You owe and are owed in different currencies"
      : hasExpenses
      ? "All tabs are clear! You are fully settled up."
      : "Start by adding a friend, recording an expense, or creating a group.";

  // Direct friends with active balances (each friend's balance kept per currency)
  const directFriendsWithBalance = dashboardBalances.direct.byFriend.map(({ friendId, netByCurrency }) => {
    const isUserDebtor = bagSign(netByCurrency) < 0;
    const name = getUserName(friendId);
    const inits = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "FR";
    return {
      id: friendId,
      name,
      initials: inits,
      net: netByCurrency,
      type: isUserDebtor ? ("owe" as const) : ("owed" as const),
      avatarBg: isUserDebtor
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-700/50"
        : "bg-[#D4FF00] text-black",
    };
  });

  // Groups with active balances
  const groupsWithBalance = useMemo(() => {
    return dashboardBalances.groups.byGroup.filter((g) => bagCurrencies(g.netByCurrency).length > 0);
  }, [dashboardBalances.groups.byGroup]);

  // Display recent activity items with clear contextual labels
  const recentActivityList = useMemo(() => {
    return activeExpenses.slice(0, 6).map((exp) => {
      const isDirect = exp.contextType === "direct" || (!exp.groupId && exp.sourceType !== "group");
      const grp = !isDirect && exp.groupId ? activeGroups.find((g) => g.id === exp.groupId) : null;
      const isCurrentPayer = isCurrentUserEntity(exp.paidBy);
      const payerName = isCurrentPayer ? (currentUser?.name || "You") : getUserName(exp.paidBy);
      const payerInits = isCurrentPayer
        ? (currentUser?.name ? currentUser.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "YOU")
        : payerName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "FR";

      // Context label: "with Bob" or "Goa Trip"
      let contextLabel = "Personal";
      if (isDirect) {
        const otherParticipantId = exp.friendId || exp.participants?.find((p) => !isCurrentUserEntity(p));
        const otherName = otherParticipantId ? getUserName(otherParticipantId) : "Friend";
        contextLabel = `with ${otherName}`;
      } else if (grp) {
        contextLabel = grp.name;
      }

      // Icon and color badge
      let Icon = Utensils;
      let iconBg =
        "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border dark:border-amber-800/40";
      const descLower = exp.description.toLowerCase();

      if (
        descLower.includes("grocer") ||
        descLower.includes("suppl") ||
        descLower.includes("market")
      ) {
        Icon = ShoppingCart;
        iconBg =
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border dark:border-emerald-800/40";
      } else if (
        descLower.includes("taxi") ||
        descLower.includes("uber") ||
        descLower.includes("cab") ||
        descLower.includes("car")
      ) {
        Icon = Car;
        iconBg =
          "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border dark:border-blue-800/40";
      } else if (
        descLower.includes("hotel") ||
        descLower.includes("rent") ||
        descLower.includes("stay")
      ) {
        Icon = Home;
        iconBg =
          "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border dark:border-indigo-800/40";
      } else if (descLower.includes("flight") || descLower.includes("plane")) {
        Icon = Plane;
        iconBg =
          "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border dark:border-cyan-800/40";
      } else if (descLower.includes("coffee") || descLower.includes("cafe")) {
        Icon = Coffee;
        iconBg =
          "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border dark:border-amber-800/40";
      } else if (!descLower.includes("dinner") && !descLower.includes("lunch") && !descLower.includes("food")) {
        Icon = Receipt;
        iconBg =
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:border dark:border-slate-700/40";
      }

      return {
        id: exp.id,
        date: new Date(exp.expenseDate).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        description: exp.description,
        contextLabel,
        isDirect,
        paidBy: payerName,
        paidByInitials: payerInits,
        paidByBg: isCurrentPayer
          ? "bg-[#0055FF] text-white"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/50",
        amount: formatMoney(exp.originalAmountMinor, exp.originalCurrency),
        icon: Icon,
        iconBg,
      };
    });
  }, [activeExpenses, activeGroups, users, friends, currentUserId, currentUser]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in-50 duration-300 pb-16">
      {/* 1. HERO HEADER WITH QUICK ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1 sm:pt-2">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground">
            Good times. <span className="text-[#0055FF]">Clear tabs.</span>
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base font-medium mt-1">
            Independent tracking for direct friends and group expenses.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={() => navigate("/expenses/new")}
            className="h-10 sm:h-11 px-4 sm:px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold text-sm gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Add expense</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate("/friends")}
            className="h-10 sm:h-11 px-4 rounded-2xl font-bold text-sm gap-1.5 border-border/80 shadow-2xs"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add friend</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate("/groups/new")}
            className="h-10 sm:h-11 px-4 rounded-2xl font-bold text-sm gap-1.5 border-border/80 shadow-2xs"
          >
            <FolderPlus className="h-4 w-4" />
            <span>Create group</span>
          </Button>
        </div>
      </div>

      {/* 2. OVERALL BALANCE SUMMARY CARD */}
      <div className="rounded-3xl bg-[#D4FF00] text-black p-6 sm:p-8 shadow-sm relative overflow-hidden transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Main Net Amount */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap">
            <BalanceAmount
              bag={netBag}
              conversion={conversion}
              mode="signed"
              className="min-w-0 max-w-full text-black select-none"
              amountClassName="break-all text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-black"
              detailClassName="text-black/70 font-semibold"
            />

            <div className="space-y-0.5">
              <p className="text-sm sm:text-base font-extrabold text-black leading-tight">
                Overall Net Balance
              </p>
              <p className="text-xs sm:text-sm text-black/75 font-semibold">
                {netSubtitle}
              </p>
            </div>
          </div>

          {/* Sub Metrics: Total Owed To You & Total You Owe */}
          <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
            <div className="hidden lg:block h-12 w-[1.5px] bg-black/15" />

            {/* Total Owed To You */}
            <div className="space-y-0.5">
              <BalanceAmount
                bag={dashboardBalances.overall.owedToYouByCurrency}
                conversion={conversion}
                amountClassName="text-xl sm:text-2xl font-black text-black"
                detailClassName="text-black/70"
              />
              <p className="text-xs sm:text-sm text-black/75 font-semibold flex items-center gap-1">
                <span>Total owed to you</span>
              </p>
            </div>

            <div className="hidden sm:block h-12 w-[1.5px] bg-black/15" />

            {/* Total You Owe */}
            <div className="space-y-0.5">
              <BalanceAmount
                bag={dashboardBalances.overall.owedByCurrency}
                conversion={conversion}
                amountClassName="text-xl sm:text-2xl font-black text-black"
                detailClassName="text-black/70"
              />
              <p className="text-xs sm:text-sm text-black/75 font-semibold flex items-center gap-1">
                <span>Total you owe</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CONTEXT BALANCES ROW: WITH FRIENDS & IN GROUPS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* With Friends Direct Balances Card */}
        <div className="rounded-3xl bg-card border border-border/80 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight text-foreground">With Friends</h2>
                <p className="text-[11px] text-muted-foreground font-medium">Direct one-to-one balances</p>
              </div>
            </div>
            <Link
              to="/friends"
              className="text-xs font-bold text-[#0055FF] hover:underline flex items-center gap-1"
            >
              <span>All friends</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {directFriendsWithBalance.length > 0 ? (
            <div className="space-y-2.5">
              {directFriendsWithBalance.map((person) => {
                return (
                  <Link
                    key={person.id}
                    to={`/friends?friendId=${person.id}`}
                    className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/40 hover:bg-muted/50 hover:border-border/80 transition-all gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-full font-black text-xs flex items-center justify-center shrink-0 shadow-2xs",
                          person.avatarBg
                        )}
                      >
                        {person.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground leading-tight truncate group-hover:text-[#0055FF] transition-colors">
                          {person.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium">
                          {person.type === "owe" ? "You owe" : "Owes you"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <BalanceAmount
                        bag={person.net}
                        conversion={conversion}
                        size="sm"
                        className="items-end text-right"
                        amountClassName={cn(
                          "font-black",
                          person.type === "owe"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        )}
                      />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-[#0055FF] transition-all" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center space-y-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
              <p className="text-xs font-bold text-foreground">All direct friend balances settled</p>
              <p className="text-[11px] text-muted-foreground">
                No outstanding 1-to-1 friend balances.
              </p>
            </div>
          )}
        </div>

        {/* In Groups Balances Card */}
        <div className="rounded-3xl bg-card border border-border/80 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight text-foreground">In Groups</h2>
                <p className="text-[11px] text-muted-foreground font-medium">Your balance in each group</p>
              </div>
            </div>
            <Link
              to="/groups"
              className="text-xs font-bold text-[#0055FF] hover:underline flex items-center gap-1"
            >
              <span>All groups</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {groupsWithBalance.length > 0 ? (
            <div className="space-y-2.5">
              {groupsWithBalance.map((grp) => {
                const sign = bagSign(grp.netByCurrency);
                const isUserDebtor = sign < 0;
                const isUserCreditor = sign > 0;

                return (
                  <Link
                    key={grp.groupId}
                    to={`/groups/${grp.groupId}`}
                    className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/40 hover:bg-muted/50 hover:border-border/80 transition-all gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {grp.groupName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground leading-tight truncate group-hover:text-[#0055FF] transition-colors">
                          {grp.groupName}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium">
                          {isUserDebtor ? "You owe in group" : isUserCreditor ? "You are owed in group" : "Settled"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <BalanceAmount
                        bag={grp.netByCurrency}
                        conversion={conversion}
                        size="sm"
                        className="items-end text-right"
                        amountClassName={cn(
                          "font-black",
                          isUserDebtor
                            ? "text-rose-600 dark:text-rose-400"
                            : isUserCreditor
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        )}
                      />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-[#0055FF] transition-all" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center space-y-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
              <p className="text-xs font-bold text-foreground">All group balances settled</p>
              <p className="text-[11px] text-muted-foreground">
                No outstanding balances across your groups.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. RECENT ACTIVITY LIST WITH CONTEXT BADGES */}
      <div className="rounded-3xl bg-card border border-border/80 p-5 sm:p-7 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              Recent Activity
            </h2>
            <p className="text-xs text-muted-foreground">Every expense displays its direct friend or group context</p>
          </div>
          <Link
            to="/expenses"
            className="text-xs sm:text-sm font-bold text-[#0055FF] hover:underline"
          >
            See all expenses
          </Link>
        </div>

        {/* Activity Table Headers */}
        {recentActivityList.length > 0 && (
          <div className="hidden sm:grid grid-cols-12 text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 border-b border-border/40">
            <div className="col-span-2">Date</div>
            <div className="col-span-4">Description &amp; Context</div>
            <div className="col-span-3">Context Type</div>
            <div className="col-span-2">Paid by</div>
            <div className="col-span-1 text-right">Amount</div>
          </div>
        )}

        {/* Rows List */}
        {recentActivityList.length > 0 ? (
          <div className="divide-y divide-border/40">
            {recentActivityList.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.id}
                  to={`/expenses/${item.id}`}
                  className="group flex flex-col sm:grid sm:grid-cols-12 items-start sm:items-center py-3.5 hover:bg-muted/40 rounded-xl px-2 -mx-2 transition-colors gap-2 sm:gap-0"
                >
                  {/* Date */}
                  <div className="col-span-2 text-xs text-muted-foreground font-medium">
                    {item.date}
                  </div>

                  {/* Description & Icon */}
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0 shadow-2xs transition-colors",
                        item.iconBg
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate group-hover:text-[#0055FF] transition-colors">
                        {item.description}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description} — {item.contextLabel}
                      </p>
                    </div>
                  </div>

                  {/* Context Type Badge */}
                  <div className="col-span-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                        item.isDirect
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-primary/10 text-primary border-primary/20"
                      )}
                    >
                      {item.isDirect ? "Direct · " : "Group · "}
                      {item.contextLabel}
                    </span>
                  </div>

                  {/* Paid By Avatar & Name */}
                  <div className="col-span-2 flex items-center gap-2">
                    <div
                      className={cn(
                        "h-6 w-6 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0",
                        item.paidByBg
                      )}
                    >
                      {item.paidByInitials}
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-foreground truncate">
                      {item.paidBy}
                    </span>
                  </div>

                  {/* Amount + Arrow */}
                  <div className="col-span-1 flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto font-bold text-sm text-foreground">
                    <span>{item.amount}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <Receipt className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-base text-foreground">No expenses recorded yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Record a direct expense with a friend or in a group to start tracking balances.
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => navigate("/expenses/new")}
                className="bg-[#0055FF] hover:bg-[#0055FF]/90 text-white rounded-xl font-bold h-9 px-4 shadow-xs"
              >
                <Plus className="h-4 w-4 mr-1.5 stroke-[2.5]" />
                Add expense
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
