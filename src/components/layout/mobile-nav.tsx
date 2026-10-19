import { useState } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Users,
  ArrowLeftRight,
  MoreHorizontal,
  UserCheck,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Laptop,
  Database,
  PawPrint,
  ChevronRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { SyncIndicator } from "@/components/sync/sync-indicator";
import { cn } from "@/lib/utils";

interface MobileTabItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const mainTabs: MobileTabItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/groups", label: "Groups", icon: Users },
  { to: "/settlements", label: "Settlements", icon: ArrowLeftRight },
];

export function MobileNav({ className }: { className?: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { theme, setTheme } = useTheme();

  // Check if current route is one of the "More" items
  const isMoreActive =
    location.pathname.startsWith("/friends") ||
    location.pathname.startsWith("/reports") ||
    location.pathname.startsWith("/settings");

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "TY";

  return (
    <nav
      aria-label="Mobile Navigation"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/80 shadow-lg pb-[env(safe-area-inset-bottom)]",
        className
      )}
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1">
        {mainTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center min-h-[48px] py-1 px-1 transition-colors relative select-none rounded-xl",
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      "p-1 rounded-full transition-transform",
                      isActive ? "scale-110" : ""
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] leading-tight tracking-tight mt-0.5 truncate max-w-full">
                    {tab.label}
                  </span>
                  {isActive && (
                    <span className="absolute top-1 right-1/4 h-1 w-1 rounded-full bg-primary" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}

        {/* 5th Tab: More */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center min-h-[48px] py-1 px-1 transition-colors relative select-none rounded-xl cursor-pointer",
                isMoreActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Open more navigation options"
            >
              <div
                className={cn(
                  "p-1 rounded-full transition-transform",
                  isMoreActive ? "scale-110" : ""
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
              </div>
              <span className="text-[11px] leading-tight tracking-tight mt-0.5">
                More
              </span>
              {isMoreActive && (
                <span className="absolute top-1 right-1/4 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          </SheetTrigger>

          <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] p-6 space-y-5">
            <SheetHeader className="text-left pb-2 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                    <PawPrint className="h-5 w-5 fill-current" />
                  </div>
                  <div>
                    <SheetTitle className="text-base font-bold text-foreground">
                      Tabby Split
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground">
                      Menu & Quick Settings
                    </SheetDescription>
                  </div>
                </div>
                <SyncIndicator compact={false} />
              </div>
            </SheetHeader>

            {/* User Quick Info */}
            <div className="p-3 rounded-2xl border border-border/70 bg-muted/30 flex items-center gap-3">
              <Avatar className="h-10 w-10 ring-1 ring-border shrink-0">
                {user?.picture && (
                  <AvatarImage src={user.picture} alt={user.name || "User"} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">
                  {user?.name || (isAuthenticated ? "Tabby User" : "Offline Guest")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {user?.email || "Local storage only"}
                </p>
              </div>
            </div>

            {/* Secondary Navigation Options */}
            <div className="space-y-1.5">
              <Link
                to="/friends"
                onClick={() => setSheetOpen(false)}
                className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
              >
                <div className="flex items-center gap-3">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <span>Friends & People</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              <Link
                to="/reports"
                onClick={() => setSheetOpen(false)}
                className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span>Reports & Analytics</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              <Link
                to="/settings"
                onClick={() => setSheetOpen(false)}
                className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Settings className="h-4 w-4 text-primary" />
                  <span>Settings & Sync</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>

            {/* Theme Toggle in Sheet */}
            <div className="pt-2 border-t border-border/60">
              <span className="text-xs font-medium text-muted-foreground block mb-2">
                Appearance
              </span>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                  className="gap-1.5 text-xs h-9"
                >
                  <Sun className="h-3.5 w-3.5" /> Light
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                  className="gap-1.5 text-xs h-9"
                >
                  <Moon className="h-3.5 w-3.5" /> Dark
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("system")}
                  className="gap-1.5 text-xs h-9"
                >
                  <Laptop className="h-3.5 w-3.5" /> System
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
