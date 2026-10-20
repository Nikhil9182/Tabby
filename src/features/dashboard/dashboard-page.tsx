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
  Receipt,
  CheckCircle2,
  Calendar,
  Plane,
  Coffee,
  FolderPlus,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useExpenses } from "@/hooks/use-expenses";
import { useGroups } from "@/hooks/use-groups";
import { useSettlements } from "@/hooks/use-settlements";
import { useCurrentUser, useUsers } from "@/hooks/use-users";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/domain/money/money";
import { calculateUserBalances, type PairwiseBalance } from "@/domain/balances/balance-engine";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || "current_user";

  const { expenses, splits, isLoading: expensesLoading } = useExpenses();
  const { groups, isLoading: groupsLoading } = useGroups();
  const { settlements, isLoading: settlementsLoading } = useSettlements();
  const { users } = useUsers();
  const { defaultCurrency } = useCurrency();

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
    const found = users.find((u) => u.id === userId || u.googleSub === userId);
    return found?.name || found?.email || fallbackObj?.name || fallbackObj?.email || "Friend";
  };

  // Flatten all splits for calculations
  const allSplitsList = useMemo(() => {
    return Object.values(splits).flat();
  }, [splits]);

  // Compute live user balance totals
  const userBalance = useMemo(() => {
    if (!expenses || !settlements) {
      return { totalOwed: 0, totalOwedToYou: 0, netBalance: 0, pairwise: [] as PairwiseBalance[] };
    }
    return calculateUserBalances(currentUserId, expenses, allSplitsList, settlements);
  }, [currentUserId, expenses, allSplitsList, settlements]);

  // Determine active data
  const activeExpenses = useMemo(() => {
    return (expenses || []).filter((e) => !e.deletedAt);
  }, [expenses]);

  const activeGroups = useMemo(() => {
    return (groups || []).filter((g) => !g.isArchived);
  }, [groups]);

  const hasExpenses = activeExpenses.length > 0;
  const hasGroups = activeGroups.length > 0;

  // Formatting currency
  const curr = defaultCurrency || "INR";
  const formattedNet = formatMoney(Math.abs(userBalance.netBalance), curr);
  const netSign = userBalance.netBalance > 0 ? "+" : userBalance.netBalance < 0 ? "−" : "";
  const netSubtitle =
    userBalance.netBalance > 0
      ? `Coming back to you across ${activeGroups.length > 0 ? activeGroups.length : 1} group${activeGroups.length === 1 ? "" : "s"}`
      : userBalance.netBalance < 0
      ? `You owe in total across ${activeGroups.length > 0 ? activeGroups.length : 1} group${activeGroups.length === 1 ? "" : "s"}`
      : hasExpenses
      ? "All tabs are clear! You are fully settled up."
      : "Start by recording your first expense or creating a group.";

  // Sort groups by recency of expenses added
  const sortedGroups = useMemo(() => {
    return [...activeGroups].sort((a, b) => {
      const getLatestTime = (grpId: string, createdAt?: string) => {
        const grpExpenses = activeExpenses.filter((e) => e.groupId === grpId);
        if (grpExpenses.length === 0) return new Date(createdAt || 0).getTime();
        return Math.max(
          ...grpExpenses.map((e) => new Date(e.createdAt || e.expenseDate).getTime())
        );
      };
      return getLatestTime(b.id, b.createdAt) - getLatestTime(a.id, a.createdAt);
    });
  }, [activeGroups, activeExpenses]);

  // Group balances calculation
  const groupCardsData = useMemo(() => {
    return sortedGroups.map((g, idx) => {
      const groupExpenses = activeExpenses.filter((e) => e.groupId === g.id);
      const groupSettlements = (settlements || []).filter((s) => s.groupId === g.id && !s.deletedAt);
      const grpBalance = calculateUserBalances(currentUserId, groupExpenses, allSplitsList, groupSettlements);

      const isPositive = grpBalance.netBalance > 0;
      const isNegative = grpBalance.netBalance < 0;
      const displayAmount =
        isPositive
          ? `+${formatMoney(grpBalance.netBalance, g.currency || curr)}`
          : isNegative
          ? `−${formatMoney(Math.abs(grpBalance.netBalance), g.currency || curr)}`
          : formatMoney(0, g.currency || curr);

      const statusText =
        isPositive
          ? "Coming back to you"
          : isNegative
          ? "You owe"
          : "All settled up";

      return {
        group: g,
        displayAmount,
        statusText,
        isPositive,
        isNegative,
        memberCount: g.memberIds?.length ?? 1,
      };
    });
  }, [sortedGroups, activeExpenses, settlements, currentUserId, allSplitsList, curr]);

  // People to settle with (filtered from pairwise debt)
  const settleList = useMemo(() => {
    return userBalance.pairwise
      .filter((p) => p.amountMinor > 0)
      .map((p) => {
        const isUserDebtor = isCurrentUserEntity(p.fromUserId);
        const otherUserId = isUserDebtor ? p.toUserId : p.fromUserId;
        const name = getUserName(otherUserId);
        const inits = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "FR";
        return {
          id: otherUserId,
          name,
          initials: inits,
          amountMinor: p.amountMinor,
          type: isUserDebtor ? ("owe" as const) : ("owed" as const),
          avatarBg: isUserDebtor
            ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-700/50"
            : "bg-[#D4FF00] text-black",
          fromUserId: p.fromUserId,
          toUserId: p.toUserId,
          currency: p.currency || curr,
        };
      });
  }, [userBalance.pairwise, currentUserId, users, curr, currentUser]);

  // Display recent activity items derived from real expenses
  const recentActivityList = useMemo(() => {
    return activeExpenses.slice(0, 6).map((exp) => {
      const grp = activeGroups.find((g) => g.id === exp.groupId);
      const isCurrentPayer = isCurrentUserEntity(exp.paidBy);
      const payerName = isCurrentPayer ? (currentUser?.name || "You") : getUserName(exp.paidBy);
      const payerInits = isCurrentPayer
        ? (currentUser?.name ? currentUser.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "YOU")
        : payerName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "FR";

      // Icon and color badge that reacts properly to dark & light modes
      let Icon = Utensils;
      let iconBg =
        "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border dark:border-amber-800/40";
      const descLower = exp.description.toLowerCase();

      if (
        descLower.includes("grocer") ||
        descLower.includes("suppl") ||
        descLower.includes("market") ||
        descLower.includes("supermarket")
      ) {
        Icon = ShoppingCart;
        iconBg =
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border dark:border-emerald-800/40";
      } else if (
        descLower.includes("taxi") ||
        descLower.includes("airport") ||
        descLower.includes("cab") ||
        descLower.includes("uber") ||
        descLower.includes("toll") ||
        descLower.includes("car")
      ) {
        Icon = Car;
        iconBg =
          "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border dark:border-blue-800/40";
      } else if (
        descLower.includes("rent") ||
        descLower.includes("hotel") ||
        descLower.includes("stay") ||
        descLower.includes("house")
      ) {
        Icon = Home;
        iconBg =
          "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border dark:border-indigo-800/40";
      } else if (
        descLower.includes("flight") ||
        descLower.includes("plane") ||
        descLower.includes("trip")
      ) {
        Icon = Plane;
        iconBg =
          "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border dark:border-cyan-800/40";
      } else if (
        descLower.includes("coffee") ||
        descLower.includes("tea") ||
        descLower.includes("cafe")
      ) {
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
        subtext: exp.notes || (grp ? grp.name : "Personal expense"),
        groupName: grp?.name || "General",
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
  }, [activeExpenses, activeGroups, users, currentUserId, currentUser]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in-50 duration-300 pb-16">
      {/* 1. HERO HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1 sm:pt-2">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground">
            Good times. <span className="text-[#0055FF]">Clear tabs.</span>
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base font-medium mt-1">
            Shared expenses for real life together.
          </p>
        </div>

        {/* Add Expense Action Button */}
        <div className="shrink-0">
          <Button
            onClick={() => navigate("/expenses/new")}
            className="w-full sm:w-auto h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold text-sm sm:text-base gap-2 shadow-sm transition-transform active:scale-98"
          >
            <Plus className="h-5 w-5 stroke-[2.5]" />
            <span>Add expense</span>
          </Button>
        </div>
      </div>

      {/* 2. THE GIANT NEON LIME NET BALANCE CARD */}
      <div className="rounded-3xl bg-[#D4FF00] text-black p-6 sm:p-8 shadow-sm relative overflow-hidden transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Main Net Amount */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap">
            <span className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-black select-none">
              {hasExpenses ? `${netSign}${formattedNet}` : formatMoney(0, curr)}
            </span>

            <div className="space-y-0.5">
              <p className="text-sm sm:text-base font-extrabold text-black leading-tight">
                Your net balance
              </p>
              <p className="text-xs sm:text-sm text-black/75 font-semibold">
                {netSubtitle}
              </p>
            </div>
          </div>

          {/* Sub Metrics: People Owe You & You Owe */}
          <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
            <div className="hidden lg:block h-12 w-[1.5px] bg-black/15" />

            {/* People Owe You */}
            <div className="space-y-0.5">
              <p className="text-xl sm:text-2xl font-black text-black">
                {formatMoney(userBalance.totalOwedToYou, curr)}
              </p>
              <p className="text-xs sm:text-sm text-black/75 font-semibold">People owe you</p>
            </div>

            <div className="hidden sm:block h-12 w-[1.5px] bg-black/15" />

            {/* You Owe */}
            <div className="space-y-0.5">
              <p className="text-xl sm:text-2xl font-black text-black">
                {formatMoney(userBalance.totalOwed, curr)}
              </p>
              <p className="text-xs sm:text-sm text-black/75 font-semibold">You owe</p>
            </div>

            {/* Record Settlement Action Pill Button */}
            <button
              onClick={() => navigate("/settlements/new")}
              className="mt-2 sm:mt-0 w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-black text-white hover:bg-black/85 font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98"
            >
              <span>Record settlement</span>
              <ArrowRight className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. MIDDLE ROW: RECENT GROUPS */}
      {hasGroups ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              Recent groups
            </h2>
            <Link
              to="/groups"
              className="text-xs sm:text-sm font-bold text-[#0055FF] hover:underline flex items-center gap-1"
            >
              <span>See all groups</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* On Mobile: Only show 1 group (the most recent one) */}
          <div className="block sm:hidden">
            {groupCardsData[0] && (() => {
              const item = groupCardsData[0];
              const hasCover = Boolean(item.group.imageUrl);

              return (
                <Link
                  to={`/groups/${item.group.id}`}
                  className={cn(
                    "group rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[200px] shadow-sm",
                    hasCover
                      ? "text-white border border-white/10"
                      : "bg-[#0052FF] text-white"
                  )}
                >
                  {hasCover && (
                    <>
                      <img
                        src={item.group.imageUrl}
                        alt={item.group.name}
                        className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/35 pointer-events-none select-none" />
                    </>
                  )}

                  <div className="flex items-start justify-between relative z-10">
                    <div className="min-w-0 pr-2">
                      <h3 className="text-2xl font-black tracking-tight truncate text-white group-hover:underline">
                        {item.group.name}
                      </h3>
                      <p className="text-xs font-medium mt-0.5 text-white/80">
                        {item.memberCount} member{item.memberCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="h-8 w-8 rounded-full flex items-center justify-center bg-white/15 shrink-0">
                      <ArrowRight className="h-4 w-4 text-white" />
                    </div>
                  </div>

                  <div className="relative z-10 pt-6">
                    <p className="text-3xl font-black tracking-tight text-white">
                      {item.displayAmount}
                    </p>
                    <p className="text-xs font-medium mt-0.5 text-white/80">
                      {item.statusText}
                    </p>
                  </div>
                </Link>
              );
            })()}
          </div>

          {/* On Tablet & PC: Show up to 3 groups */}
          <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
            {groupCardsData.slice(0, 3).map((item, idx) => {
              const isFeatured = idx === 0;
              const hasCover = Boolean(item.group.imageUrl);

              return (
                <Link
                  key={item.group.id}
                  to={`/groups/${item.group.id}`}
                  className={cn(
                    "group rounded-3xl p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between min-h-[200px] sm:min-h-[220px] transition-all hover:-translate-y-1 shadow-xs",
                    hasCover
                      ? "text-white border border-white/10"
                      : isFeatured
                      ? "bg-[#0052FF] text-white shadow-sm"
                      : "bg-card border border-border/80 text-foreground"
                  )}
                >
                  {hasCover && (
                    <>
                      <img
                        src={item.group.imageUrl}
                        alt={item.group.name}
                        className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none select-none"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/35 pointer-events-none select-none" />
                    </>
                  )}

                  {/* Top Info */}
                  <div className="flex items-start justify-between relative z-10">
                    <div className="min-w-0 pr-2">
                      <h3
                        className={cn(
                          "text-xl sm:text-2xl font-black tracking-tight truncate",
                          hasCover || isFeatured
                            ? "text-white group-hover:underline"
                            : "text-foreground group-hover:text-[#0055FF] transition-colors"
                        )}
                      >
                        {item.group.name}
                      </h3>
                      <p
                        className={cn(
                          "text-xs font-medium mt-0.5",
                          hasCover || isFeatured ? "text-white/80" : "text-muted-foreground"
                        )}
                      >
                        {item.memberCount} member{item.memberCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center transition-colors shrink-0",
                        hasCover || isFeatured
                          ? "bg-white/15 group-hover:bg-white/25"
                          : "bg-muted group-hover:bg-primary/10"
                      )}
                    >
                      <ArrowRight
                        className={cn(
                          "h-4 w-4",
                          hasCover || isFeatured
                            ? "text-white"
                            : "text-muted-foreground group-hover:text-primary"
                        )}
                      />
                    </div>
                  </div>

                  {/* Bottom Info */}
                  <div className="relative z-10 pt-6">
                    <p
                      className={cn(
                        "text-3xl sm:text-4xl font-black tracking-tight",
                        hasCover || isFeatured ? "text-white" : "text-foreground"
                      )}
                    >
                      {item.displayAmount}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-medium mt-0.5",
                        hasCover || isFeatured ? "text-white/80" : "text-muted-foreground"
                      )}
                    >
                      {item.statusText}
                    </p>
                  </div>
                </Link>
              );
            })}

            {/* Add Group card if fewer than 3 */}
            {groupCardsData.length < 3 && (
              <Link
                to="/groups/new"
                className="rounded-3xl border-2 border-dashed border-border hover:border-primary/50 bg-card/40 hover:bg-card/80 p-6 sm:p-7 flex flex-col items-center justify-center text-center min-h-[200px] sm:min-h-[220px] transition-all hover:-translate-y-1 group"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <FolderPlus className="h-6 w-6 stroke-[2.2]" />
                </div>
                <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                  Create new group
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  Organize trips, apartments, and friend circles with split balances.
                </p>
              </Link>
            )}
          </div>
        </div>
      ) : (
        /* Empty Groups: hidden on mobile per user request, visible on PC/tablets */
        <div className="hidden sm:flex rounded-3xl bg-card border border-border/80 p-6 sm:p-8 flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-2 text-center sm:text-left relative z-10">
            <Badge className="bg-[#0055FF] text-white hover:bg-[#0055FF] font-semibold text-xs">
              Getting started
            </Badge>
            <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Create your first shared group
            </h3>
            <p className="text-sm text-muted-foreground max-w-lg">
              Tabby helps you split dinners, trips, and household bills with friends and family without awkward spreadsheets.
            </p>
          </div>

          <div className="flex items-center gap-3 relative z-10 shrink-0">
            <Button
              onClick={() => navigate("/groups/new")}
              className="h-11 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Create Group</span>
            </Button>
          </div>
        </div>
      )}

      {/* 4. TWO-COLUMN SECTION: RECENT ACTIVITY & SETTLE UP */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Recent Activity (lg:col-span-8) */}
        <div className="lg:col-span-8 rounded-3xl bg-card border border-border/80 p-5 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              Recent activity
            </h2>
            <Link
              to="/expenses"
              className="text-xs sm:text-sm font-bold text-[#0055FF] hover:underline"
            >
              See all
            </Link>
          </div>

          {/* Activity Table Headers */}
          {recentActivityList.length > 0 && (
            <div className="hidden sm:grid grid-cols-12 text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 border-b border-border/40">
              <div className="col-span-2">Date</div>
              <div className="col-span-4">Description</div>
              <div className="col-span-3">Group</div>
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
                        <p className="text-xs text-muted-foreground truncate">{item.subtext}</p>
                      </div>
                    </div>

                    {/* Group Name */}
                    <div className="col-span-3 text-xs sm:text-sm text-foreground/85 font-medium truncate">
                      {item.groupName}
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
            /* Real Empty State for Expenses */
            <div className="py-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Receipt className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-base text-foreground">No expenses recorded yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Once you record personal or shared expenses, they will appear here with dynamic balances and settlement recommendations.
              </p>
              <Button
                size="sm"
                onClick={() => navigate("/expenses/new")}
                className="mt-2 bg-[#0055FF] hover:bg-[#0055FF]/90 text-white rounded-xl font-bold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add your first expense
              </Button>
            </div>
          )}
        </div>

        {/* Right Column: Settle up (lg:col-span-4) */}
        <div className="lg:col-span-4 rounded-3xl bg-card border border-border/80 p-5 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              Settle up
            </h2>
            <Link
              to="/settlements"
              className="text-xs sm:text-sm font-bold text-[#0055FF] hover:underline"
            >
              See all
            </Link>
          </div>

          {/* Settle Up People List or Clean Settled State */}
          {settleList.length > 0 ? (
            <div className="space-y-3">
              {settleList.map((person) => {
                const formattedAmt = formatMoney(person.amountMinor, person.currency);

                return (
                  <div
                    key={person.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full font-black text-xs flex items-center justify-center shrink-0 shadow-2xs transition-colors",
                          person.avatarBg
                        )}
                      >
                        {person.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground leading-tight truncate">
                          {person.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-medium">
                          {person.type === "owe" ? "You owe" : "Owes you"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm sm:text-base font-black text-foreground">
                        {formattedAmt}
                      </span>
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/settlements/new?fromUserId=${person.fromUserId}&toUserId=${person.toUserId}&amountMinor=${person.amountMinor}&currency=${person.currency}`
                          )
                        }
                        className="h-8 px-3.5 rounded-xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold text-xs shadow-2xs transition-transform active:scale-95"
                      >
                        Settle
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Real Zero Debt State */
            <div className="py-8 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6 stroke-[2.2]" />
              </div>
              <h3 className="font-bold text-base text-foreground">All tabs clear!</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                You have no outstanding debts or pending settlements.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/settlements/new")}
                className="mt-1 rounded-xl text-xs font-semibold"
              >
                Record manual settlement
              </Button>
            </div>
          )}

          {/* Settle Up Bottom Helper Box */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/50 flex items-center gap-3.5">
            <div className="h-9 w-9 rounded-xl bg-background border border-border flex items-center justify-center shrink-0 text-muted-foreground">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground leading-snug">
                {settleList.length} pending settlement{settleList.length === 1 ? "" : "s"}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Settle up to keep your group balances even.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
