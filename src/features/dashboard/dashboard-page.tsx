import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowRight,
  Utensils,
  ShoppingCart,
  Car,
  Home,
  Sparkles,
  Users,
  Receipt,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useExpenses } from "@/hooks/use-expenses";
import { useGroups } from "@/hooks/use-groups";
import { useSettlements } from "@/hooks/use-settlements";
import { useCurrentUser, useUsers } from "@/hooks/use-users";
import { useCurrency } from "@/hooks/use-currency";
import { formatMoney } from "@/domain/money/money";
import { calculateUserBalances, type PairwiseBalance } from "@/domain/balances/balance-engine";
import { cn } from "@/lib/utils";

// --- Vector Graphic Illustrations for Group Cards ---

function PalmTreesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("pointer-events-none select-none", className)}
    >
      {/* Sun */}
      <circle cx="88" cy="28" r="14" strokeWidth="2.2" strokeDasharray="3 3" />
      {/* Island base */}
      <path d="M10 92 C 40 86, 80 86, 110 92" />
      {/* Left Palm Tree */}
      <path d="M42 90 Q 48 55 36 28" strokeWidth="2.8" />
      <path d="M36 28 Q 18 20 8 32" />
      <path d="M36 28 Q 25 10 32 4" />
      <path d="M36 28 Q 48 12 56 24" />
      <path d="M36 28 Q 50 36 46 48" />
      <path d="M36 28 Q 24 38 18 50" />
      {/* Right Palm Tree */}
      <path d="M68 90 Q 64 60 74 36" strokeWidth="2.8" />
      <path d="M74 36 Q 58 28 50 40" />
      <path d="M74 36 Q 66 18 76 12" />
      <path d="M74 36 Q 90 22 96 34" />
      <path d="M74 36 Q 88 44 82 56" />
    </svg>
  );
}

function HouseOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("pointer-events-none select-none", className)}
    >
      {/* Roof */}
      <path d="M15 48 L 50 18 L 85 48" strokeWidth="2.8" />
      {/* Chimney */}
      <path d="M68 33 V 22 H 78 V 42" />
      {/* House Body */}
      <path d="M22 46 V 84 H 78 V 46" />
      {/* Door */}
      <path d="M42 84 V 58 H 58 V 84" />
    </svg>
  );
}

function SparklesOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("pointer-events-none select-none", className)}
    >
      {/* Large Sparkle */}
      <path d="M45 10 C 45 32, 62 48, 85 48 C 62 48, 45 65, 45 88 C 45 65, 28 48, 5 48 C 28 48, 45 32, 45 10 Z" />
      {/* Small Top Sparkle */}
      <path d="M78 8 C 78 16, 85 22, 94 22 C 85 22, 78 29, 78 37 C 78 29, 71 22, 62 22 C 71 22, 78 16, 78 8 Z" />
      {/* Small Bottom Sparkle */}
      <path d="M22 65 C 22 72, 28 78, 36 78 C 28 78, 22 84, 22 92 C 22 84, 16 78, 8 78 C 16 78, 22 72, 22 65 Z" />
    </svg>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || "current_user";

  const { expenses, splits, isLoading: expensesLoading } = useExpenses();
  const { groups, isLoading: groupsLoading } = useGroups();
  const { settlements, isLoading: settlementsLoading } = useSettlements();
  const { users } = useUsers();
  const { defaultCurrency } = useCurrency();

  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; initials: string; color: string }>();
    users.forEach((u) => {
      const parts = (u.name || u.email || "User").split(" ");
      const inits = parts.map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";
      map.set(u.id, {
        name: u.name || u.email || "User",
        initials: inits,
        color: u.id === currentUserId ? "bg-[#0055FF] text-white" : "bg-muted text-foreground",
      });
    });
    return map;
  }, [users, currentUserId]);

  // Compute live user balance totals
  const userBalance = useMemo(() => {
    if (!expenses || !settlements) {
      return { totalOwed: 0, totalOwedToYou: 0, netBalance: 0, pairwise: [] as PairwiseBalance[] };
    }

    // Flatten all splits
    const allSplitsList = Object.values(splits).flat();
    return calculateUserBalances(currentUserId, expenses, allSplitsList, settlements);
  }, [currentUserId, expenses, splits, settlements]);

  // Determine if user has recorded live data yet
  const hasExpenses = expenses && expenses.length > 0;
  const hasGroups = groups && groups.length > 0;

  // Formatting currency
  const curr = defaultCurrency || "INR";
  const formattedNet = formatMoney(Math.abs(userBalance.netBalance), curr);
  const netSign = userBalance.netBalance > 0 ? "+" : userBalance.netBalance < 0 ? "−" : "";
  const netSubtitle =
    userBalance.netBalance > 0
      ? "Coming back to you"
      : userBalance.netBalance < 0
      ? "You owe in total"
      : "All tabs clear";

  // People to settle with (filtered from pairwise debt)
  const settleList = useMemo(() => {
    if (userBalance.pairwise.length > 0) {
      return userBalance.pairwise
        .filter((p) => p.amountMinor > 0)
        .map((p) => {
          const isUserDebtor = p.fromUserId === currentUserId;
          const otherUserId = isUserDebtor ? p.toUserId : p.fromUserId;
          const otherUser = users.find((u) => u.id === otherUserId);
          const name = otherUser?.name || "Friend";
          const inits = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
          return {
            id: otherUserId,
            name,
            initials: inits,
            amountMinor: p.amountMinor,
            type: isUserDebtor ? ("owe" as const) : ("owed" as const),
            avatarBg: isUserDebtor ? "bg-[#FFD6A5] text-[#7A3E00]" : "bg-[#D4FF00] text-black",
          };
        });
    }

    // Default sample settle items if no debts yet (mirroring screenshot design)
    return [
      {
        id: "maya",
        name: "Maya",
        initials: "MA",
        amountMinor: 120000,
        type: "owe" as const,
        avatarBg: "bg-[#FFD6A5] text-[#7A3E00]",
      },
      {
        id: "sam",
        name: "Sam",
        initials: "SK",
        amountMinor: 95000,
        type: "owe" as const,
        avatarBg: "bg-[#D4FF00] text-black",
      },
    ];
  }, [userBalance.pairwise, currentUserId, users]);

  // Display recent activity items
  const recentActivityList = useMemo(() => {
    if (hasExpenses) {
      return expenses.slice(0, 5).map((exp) => {
        const grp = groups?.find((g) => g.id === exp.groupId);
        const payer = users.find((u) => u.id === exp.paidBy);
        const isCurrentPayer = exp.paidBy === currentUserId;
        const payerName = isCurrentPayer ? "You" : payer?.name || "Friend";
        const payerInits = isCurrentPayer
          ? "AK"
          : payerName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

        // Icon based on category or keyword
        let Icon = Utensils;
        let iconBg = "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400";
        const descLower = exp.description.toLowerCase();

        if (descLower.includes("grocer") || descLower.includes("suppl")) {
          Icon = ShoppingCart;
          iconBg = "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
        } else if (descLower.includes("taxi") || descLower.includes("airport") || descLower.includes("cab")) {
          Icon = Car;
          iconBg = "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400";
        }

        return {
          id: exp.id,
          date: new Date(exp.expenseDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          description: exp.description,
          subtext: exp.notes || (grp ? "Shared split" : "Personal expense"),
          groupName: grp?.name || "General",
          paidBy: payerName,
          paidByInitials: payerInits,
          paidByBg: isCurrentPayer
            ? "bg-[#0055FF] text-white"
            : "bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100",
          amount: formatMoney(exp.originalAmountMinor, exp.originalCurrency),
          icon: Icon,
          iconBg,
          isReal: true,
        };
      });
    }

    // Default sample activity matching the screenshot exactly
    return [
      {
        id: "sample-1",
        date: "12 Oct 2026",
        description: "Dinner at Olive",
        subtext: "Team dinner",
        groupName: "Goa Getaway",
        paidBy: "You",
        paidByInitials: "AK",
        paidByBg: "bg-[#0055FF] text-white",
        amount: "₹2,400",
        icon: Utensils,
        iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
        isReal: false,
      },
      {
        id: "sample-2",
        date: "10 Oct 2026",
        description: "Groceries",
        subtext: "House supplies",
        groupName: "Maple House",
        paidBy: "Sam",
        paidByInitials: "SK",
        paidByBg: "bg-[#D4FF00] text-black",
        amount: "₹1,700",
        icon: ShoppingCart,
        iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
        isReal: false,
      },
      {
        id: "sample-3",
        date: "8 Oct 2026",
        description: "Airport taxi",
        subtext: "To the villa",
        groupName: "Goa Getaway",
        paidBy: "Maya",
        paidByInitials: "MA",
        paidByBg: "bg-[#FFD6A5] text-[#7A3E00]",
        amount: "₹1,200",
        icon: Car,
        iconBg: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
        isReal: false,
      },
    ];
  }, [hasExpenses, expenses, groups, users, currentUserId]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in-50 duration-300">
      {/* 1. HERO HEADER ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
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
              {hasExpenses ? `${netSign}${formattedNet}` : "+₹6,300"}
            </span>

            <div className="space-y-0.5">
              <p className="text-sm sm:text-base font-extrabold text-black leading-tight">
                Your net balance
              </p>
              <p className="text-xs sm:text-sm text-black/75 font-semibold">
                {hasExpenses ? netSubtitle : "Coming back to you"}
              </p>
            </div>
          </div>

          {/* Sub Metrics: People Owe You & You Owe */}
          <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
            {/* Divider */}
            <div className="hidden lg:block h-12 w-[1.5px] bg-black/15" />

            {/* People Owe You */}
            <div className="space-y-0.5">
              <p className="text-xl sm:text-2xl font-black text-black">
                {hasExpenses ? formatMoney(userBalance.totalOwedToYou, curr) : "₹8,450"}
              </p>
              <p className="text-xs sm:text-sm text-black/75 font-semibold">People owe you</p>
            </div>

            {/* Divider */}
            <div className="hidden sm:block h-12 w-[1.5px] bg-black/15" />

            {/* You Owe */}
            <div className="space-y-0.5">
              <p className="text-xl sm:text-2xl font-black text-black">
                {hasExpenses ? formatMoney(userBalance.totalOwed, curr) : "₹2,150"}
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

      {/* 3. MIDDLE ROW: 3 GROUP CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Electric Blue Feature Card (Goa Getaway) */}
        <Link
          to={hasGroups && groups[0] ? `/groups/${groups[0].id}` : "/groups"}
          className="group rounded-3xl bg-[#0052FF] text-white p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between min-h-[200px] sm:min-h-[220px] transition-all hover:-translate-y-1 shadow-sm"
        >
          {/* Top Info */}
          <div className="flex items-start justify-between relative z-10">
            <div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white group-hover:underline">
                {hasGroups && groups[0] ? groups[0].name : "Goa Getaway"}
              </h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">
                {hasGroups && groups[0] ? `${groups[0].memberIds?.length ?? 0} members` : "6 members"}
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center group-hover:bg-white/25 transition-colors">
              <ArrowRight className="h-4 w-4 text-white" />
            </div>
          </div>

          {/* Bottom Info */}
          <div className="relative z-10 pt-6">
            <p className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              +₹4,800
            </p>
            <p className="text-xs text-white/80 font-medium mt-0.5">Coming back to you</p>
          </div>

          {/* Palm trees line art graphic */}
          <PalmTreesIcon className="absolute right-[-10px] bottom-[-10px] w-36 h-32 text-white/20 sm:text-white/25" />
        </Link>

        {/* Card 2: Clean Card (Maple House) */}
        <Link
          to={hasGroups && groups[1] ? `/groups/${groups[1].id}` : "/groups"}
          className="group rounded-3xl bg-card border border-border/80 text-foreground p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between min-h-[200px] sm:min-h-[220px] transition-all hover:-translate-y-1 shadow-xs"
        >
          {/* Top Info */}
          <div className="flex items-start justify-between relative z-10">
            <div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight text-foreground group-hover:text-[#0055FF] transition-colors">
                {hasGroups && groups[1] ? groups[1].name : "Maple House"}
              </h3>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {hasGroups && groups[1] ? `${groups[1].memberIds?.length ?? 0} members` : "5 members"}
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </div>
          </div>

          {/* Bottom Info */}
          <div className="relative z-10 pt-6">
            <p className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              −₹2,150
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">You owe</p>
          </div>

          {/* House line art graphic */}
          <HouseOutlineIcon className="absolute right-1 bottom-1 w-28 h-28 text-foreground/15 dark:text-foreground/20" />
        </Link>

        {/* Card 3: Clean Card (Weekend Crew) */}
        <Link
          to={hasGroups && groups[2] ? `/groups/${groups[2].id}` : "/groups"}
          className="group rounded-3xl bg-card border border-border/80 text-foreground p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between min-h-[200px] sm:min-h-[220px] transition-all hover:-translate-y-1 shadow-xs"
        >
          {/* Top Info */}
          <div className="flex items-start justify-between relative z-10">
            <div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight text-foreground group-hover:text-[#0055FF] transition-colors">
                {hasGroups && groups[2] ? groups[2].name : "Weekend Crew"}
              </h3>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {hasGroups && groups[2] ? `${groups[2].memberIds?.length ?? 0} members` : "4 members"}
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </div>
          </div>

          {/* Bottom Info */}
          <div className="relative z-10 pt-6">
            <p className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              +₹3,650
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Coming back to you</p>
          </div>

          {/* Sparkles line art graphic */}
          <SparklesOutlineIcon className="absolute right-2 bottom-1 w-28 h-28 text-foreground/15 dark:text-foreground/20" />
        </Link>
      </div>

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
          <div className="hidden sm:grid grid-cols-12 text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 border-b border-border/40">
            <div className="col-span-2">Date</div>
            <div className="col-span-4">Description</div>
            <div className="col-span-3">Group</div>
            <div className="col-span-2">Paid by</div>
            <div className="col-span-1 text-right">Amount</div>
          </div>

          {/* Rows List */}
          <div className="divide-y divide-border/40">
            {recentActivityList.map((item) => {
              const Icon = item.icon || Utensils;
              const linkTo = item.isReal ? `/expenses/${item.id}` : "/expenses";

              return (
                <Link
                  key={item.id}
                  to={linkTo}
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
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0 shadow-2xs",
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

          {/* Settle Up People List */}
          <div className="space-y-4">
            {settleList.map((person) => {
              const formattedAmt = formatMoney(person.amountMinor, curr);

              return (
                <div
                  key={person.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full font-black text-xs flex items-center justify-center shrink-0 shadow-2xs",
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
                        navigate(`/settlements/new?toUserId=${person.id}&amountMinor=${person.amountMinor}`)
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

          {/* Settle Up Bottom Helper Box */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/50 flex items-center gap-3.5">
            <div className="h-9 w-9 rounded-xl bg-background border border-border flex items-center justify-center shrink-0 text-muted-foreground">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground leading-snug">
                {settleList.length} people to settle with
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Settle up to keep your groups balanced.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
