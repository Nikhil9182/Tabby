import React, { useState, useMemo } from "react";
import { useCollaboration } from '@/hooks/use-collaboration';
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Settings,
  Users,
  Moon,
  Sun,
  Laptop,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ExternalLink,
  Receipt,
  ArrowRightLeft,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useSync } from "@/hooks/use-sync";
import { useTheme } from "@/hooks/use-theme";
import { useCurrentUser, useUsers } from "@/hooks/use-users";
import { useExpenses } from "@/hooks/use-expenses";
import { useSettlements } from "@/hooks/use-settlements";
import { useGroups } from "@/hooks/use-groups";
import { formatMoney } from "@/domain/money/money";
import { formatRelativeDate, formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { TabbyIcon } from "@/components/common/tabby-icon";

export interface NavItem {
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/dashboard" },
  { label: "Expenses", to: "/expenses" },
  { label: "Friends", to: "/friends" },
  { label: "Groups", to: "/groups" },
  { label: "Reports", to: "/reports" },
];

export function TabbyLogo({ className }: { className?: string }) {
  return (
    <Link to="/dashboard" className={cn("flex items-center gap-2.5 group select-none", className)}>
      <TabbyIcon size={32} className="h-8 w-8 transition-transform duration-200 group-hover:scale-105 shadow-2xs" />
      <span className="text-xl sm:text-2xl font-black tracking-tight text-foreground lowercase">
        tabby
      </span>
    </Link>
  );
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, isAuthenticated, signOut } = useAuth();
  const { user: currentUser } = useCurrentUser();
  const { isOnline, isSyncing, pendingCount } = useSync();
  const { theme, setTheme } = useTheme();

  const { expenses } = useExpenses();
  const { settlements } = useSettlements();
  const { groups } = useGroups();
  const { users } = useUsers();
  const { pendingIncoming } = useCollaboration();

  const currentUserId = currentUser?.id || "current_user";

  // User initials
  const displayName = currentUser?.name || authUser?.name || "Alex Kumar";
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AK";

  // Build combined recent activity notifications
  const notifications = useMemo(() => {
    const list: Array<{
      id: string;
      type: "expense" | "settlement";
      title: string;
      subtitle: string;
      amount: string;
      timestamp: string;
      timeLabel: string;
      link: string;
    }> = [];

    // 1. Process active expenses
    (expenses || [])
      .filter((e) => !e.deletedAt)
      .slice(0, 10)
      .forEach((exp) => {
        const grp = (groups || []).find((g) => g.id === exp.groupId);
        const payer = (users || []).find((u) => u.id === exp.paidBy);
        const isCurrentPayer = exp.paidBy === currentUserId;
        const payerName = isCurrentPayer ? "You" : payer?.name || "A friend";
        const targetDesc = grp ? `in ${grp.name}` : "as a direct split";

        const dateStr = exp.createdAt || exp.expenseDate;
        list.push({
          id: `exp-${exp.id}`,
          type: "expense",
          title: exp.description,
          subtitle: `${payerName} recorded ${targetDesc}`,
          amount: formatMoney(exp.originalAmountMinor, exp.originalCurrency),
          timestamp: dateStr,
          timeLabel: formatRelativeDate(dateStr),
          link: `/expenses/${exp.id}`,
        });
      });

    // 2. Process active settlements
    (settlements || [])
      .filter((s) => !s.deletedAt)
      .slice(0, 10)
      .forEach((settle) => {
        const fromUser = (users || []).find((u) => u.id === settle.fromUserId);
        const toUser = (users || []).find((u) => u.id === settle.toUserId);
        const fromName = settle.fromUserId === currentUserId ? "You" : fromUser?.name || "User";
        const toName = settle.toUserId === currentUserId ? "you" : toUser?.name || "User";

        const dateStr = settle.createdAt || settle.settlementDate;
        list.push({
          id: `set-${settle.id}`,
          type: "settlement",
          title: "Payment settled",
          subtitle: `${fromName} paid ${toName}`,
          amount: formatMoney(settle.amountMinor, settle.currency),
          timestamp: dateStr,
          timeLabel: formatRelativeDate(dateStr),
          link: `/settlements`,
        });
      });

    // Sort newest first
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return list.slice(0, 8);
  }, [expenses, settlements, groups, users, currentUserId]);

  const hasNotifications = notifications.length > 0 || pendingIncoming.length > 0;

  return (
    <header className="sticky top-0 z-40 w-full pt-[env(safe-area-inset-top)] border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* 1. Left: Logo & Desktop Links */}
          <div className="flex items-center gap-8">
            <TabbyLogo />

            {/* Center Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-7">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.to === "/dashboard"
                    ? location.pathname === "/dashboard" || location.pathname === "/"
                    : location.pathname.startsWith(item.to);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "text-sm font-semibold transition-all relative py-5 text-muted-foreground hover:text-foreground",
                      isActive &&
                        "text-foreground font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2.5px] after:bg-[#0055FF] after:rounded-full"
                    )}
                  >
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* 2. Right Section: Static Non-clickable Sync Badge + Notification Bell + User Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Non-clickable Sync Status Pill (Display only - no glitching) */}
            <div
              className="hidden sm:inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full select-none bg-muted/30 border border-border/40"
              title="Cloud synchronization status"
            >
              {!isAuthenticated ? (
                <span className="text-muted-foreground">Stored on this device</span>
              ) : !isOnline ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Offline</span>
                </>
              ) : isSyncing ? (
                <>
                  <RefreshCw className="h-3 w-3 text-[#0055FF] animate-spin" />
                  <span className="text-[#0055FF] font-medium">Syncing...</span>
                </>
              ) : pendingCount > 0 ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {pendingCount} waiting to sync
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground font-medium">All changes synced</span>
                </>
              )}
            </div>

            {/* Notification Bell with Activity Dropdown Panel */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-foreground/80 hover:text-foreground hover:bg-muted/80 relative"
                  title="Activity and notifications"
                  aria-label="View activity notifications"
                >
                  <Bell className="h-4 w-4" />
                  {hasNotifications && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#0055FF] ring-2 ring-background" />
                  )}
                </Button>
              </PopoverTrigger>

              <PopoverContent
                align="end"
                className="w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100dvh-6rem)] overflow-y-auto p-0 rounded-3xl shadow-xl border border-border/80 bg-card"
              >
                {/* Header */}
                <div className="p-4 border-b border-border/60 flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-sm text-foreground">Activity & Notifications</h3>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      Recent tabs, splits, and repayments
                    </p>
                  </div>
                  {hasNotifications && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0055FF]/10 text-[#0055FF]">
                      {notifications.length} recent
                    </span>
                  )}
                </div>

                {/* Notifications List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
                  {pendingIncoming.map(invite => <button key={invite.id} className="block w-full p-4 text-left hover:bg-muted/40" onClick={() => navigate('/friends')}>
                    <span className="block text-sm font-bold">{invite.inviterName || invite.invitedEmail} sent an invitation for {invite.groupName}</span>
                    <span className="text-xs text-muted-foreground">Review and accept or decline in Friends</span>
                  </button>)}
                  {hasNotifications ? (
                    notifications.map((n) => {
                      return (
                        <div
                          key={n.id}
                          onClick={() => navigate(n.link)}
                          className="p-3.5 hover:bg-muted/40 transition-colors cursor-pointer flex items-start gap-3 group"
                        >
                          <div
                            className={cn(
                              "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs",
                              n.type === "expense"
                                ? "bg-blue-100 text-[#0055FF] dark:bg-blue-950/60 dark:text-blue-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            )}
                          >
                            {n.type === "expense" ? (
                              <Receipt className="h-4 w-4" />
                            ) : (
                              <ArrowRightLeft className="h-4 w-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-foreground truncate group-hover:text-[#0055FF] transition-colors">
                                {n.title}
                              </p>
                              <span className="text-xs font-black text-foreground shrink-0">
                                {n.amount}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {n.subtitle}
                            </p>
                            <p className="text-[10px] text-muted-foreground/80 flex items-center gap-1 pt-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              <span>{n.timeLabel}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 px-4 text-center space-y-2">
                      <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-bold text-foreground">All caught up!</p>
                      <p className="text-[11px] text-muted-foreground max-w-[200px] mx-auto">
                        New expenses and settlements in groups or direct splits will appear here.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-2.5 bg-muted/30 border-t border-border/50 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/settlements")}
                    className="w-full text-xs font-bold text-[#0055FF] hover:text-[#0055FF] h-8 rounded-xl"
                  >
                    <span>View all activity</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* User Profile Avatar with Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 p-1 rounded-full hover:bg-muted/60 transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-primary"
                  aria-label="User account menu"
                >
                  <div className="h-8 w-8 rounded-full bg-[#0055FF] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                    {initials}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-xl">
                <DropdownMenuLabel className="font-normal px-2 py-1.5">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-sm font-bold text-foreground leading-none">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentUser?.email || authUser?.email || "Local offline user"}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => navigate("/settings")}
                  className="rounded-lg cursor-pointer gap-2"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings & Sync</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => navigate("/friends")}
                  className="rounded-lg cursor-pointer gap-2"
                >
                  <Users className="h-4 w-4" />
                  <span>Friends & Balances</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Theme Toggle in Menu */}
                <DropdownMenuItem onClick={() => navigate('/settlements')} className="rounded-lg cursor-pointer gap-2">
                  <Clock className="h-4 w-4" />
                  <span>All Activity</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="rounded-lg cursor-pointer gap-2"
                >
                  {theme === "dark" ? (
                    <>
                      <Sun className="h-4 w-4 text-amber-500" />
                      <span>Switch to Light mode</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4 text-indigo-500" />
                      <span>Switch to Dark mode</span>
                    </>
                  )}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {isAuthenticated ? (
                  <DropdownMenuItem
                    onClick={() => signOut()}
                    className="rounded-lg cursor-pointer gap-2 text-rose-600 dark:text-rose-400"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Disconnect Google</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => navigate("/welcome")}
                    className="rounded-lg cursor-pointer gap-2 text-primary font-semibold"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Connect Google Cloud</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Note: Mobile hamburger button removed per user request: bottom MobileNav already handles navigation without redundancy */}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
