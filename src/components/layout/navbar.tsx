import React, { useState } from "react";
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
  CloudOff,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Plus,
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
import { useAuth } from "@/hooks/use-auth";
import { useSync } from "@/hooks/use-sync";
import { useTheme } from "@/hooks/use-theme";
import { useCurrentUser } from "@/hooks/use-users";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/dashboard" },
  { label: "Expenses", to: "/expenses" },
  { label: "Groups", to: "/groups" },
  { label: "Activity", to: "/settlements" },
  { label: "Reports", to: "/reports" },
];

export function TabbyLogo({ className }: { className?: string }) {
  return (
    <Link to="/dashboard" className={cn("flex items-center gap-2.5 group select-none", className)}>
      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-[#0055FF] flex items-center justify-center text-white relative shadow-xs group-hover:scale-105 transition-transform">
        {/* Sleek vertical pill slit inside the blue circle */}
        <div className="w-[3px] h-4 bg-background rounded-full" />
      </div>
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
  const { isOnline, isSyncing, pendingCount, triggerSync } = useSync();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // User initials
  const displayName = currentUser?.name || authUser?.name || "Alex Kumar";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "AK";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* 1. Left: Logo */}
          <div className="flex items-center gap-8">
            <TabbyLogo />

            {/* 2. Center Desktop Navigation Links */}
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

          {/* 3. Right Section: Sync Status + Notifications + Avatar */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Sync Status Badge */}
            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              title="Click to trigger cloud synchronization"
              className="hidden sm:inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full transition-all hover:bg-muted/70 cursor-pointer"
            >
              {!isOnline ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">Offline</span>
                </>
              ) : isSyncing ? (
                <>
                  <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
                  <span className="text-blue-600 dark:text-blue-400">Syncing...</span>
                </>
              ) : pendingCount > 0 ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    {pendingCount} waiting to sync
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">All changes synced</span>
                </>
              )}
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-foreground/80 hover:text-foreground hover:bg-muted/80"
                onClick={() => navigate("/settlements")}
                title="Notifications & Activity"
              >
                <Bell className="h-4 w-4" />
                {/* Red badge dot */}
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
              </Button>
            </div>

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

            {/* Mobile Hamburger Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg md:hidden text-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-border/60 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-2 gap-2 pb-2">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.to === "/dashboard"
                    ? location.pathname === "/dashboard" || location.pathname === "/"
                    : location.pathname.startsWith(item.to);

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-between",
                      isActive
                        ? "bg-primary text-primary-foreground font-bold"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Quick Actions in Mobile Drawer */}
            <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
              <Button
                size="sm"
                className="w-full bg-[#0055FF] text-white rounded-xl gap-1.5"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/expenses/new");
                }}
              >
                <Plus className="h-4 w-4" /> Add expense
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl shrink-0"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default Navbar;
