import { NavLink } from "react-router-dom";
import {
  PawPrint,
  LayoutDashboard,
  Receipt,
  Users,
  UserCheck,
  ArrowLeftRight,
  BarChart3,
  Settings,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SyncIndicator } from "@/components/sync/sync-indicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/groups", label: "Groups", icon: Users },
  { to: "/friends", label: "Friends", icon: UserCheck },
  { to: "/settlements", label: "Settlements", icon: ArrowLeftRight },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ className }: { className?: string }) {
  const { user, isAuthenticated } = useAuth();

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "TY";

  return (
    <aside
      className={cn(
        "w-60 h-screen shrink-0 border-r border-border bg-card/60 backdrop-blur-xs flex flex-col justify-between select-none z-30",
        className
      )}
      aria-label="Desktop Sidebar Navigation"
    >
      {/* Top Header / Brand */}
      <div className="flex flex-col">
        <div className="h-16 px-5 border-b border-border/60 flex items-center justify-between">
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2.5 group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-1 py-0.5"
          >
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs transition-transform duration-200 group-hover:scale-105">
              <PawPrint className="h-5 w-5 fill-current" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-foreground flex items-center gap-1.5 leading-none">
                Tabby
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                  Split
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Expense Tracker
              </span>
            </div>
          </NavLink>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group relative",
                    isActive
                      ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Area: Sync Status + User Profile */}
      <div className="p-3 border-t border-border/60 space-y-3 bg-muted/20">
        {/* Sync Indicator Card */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-medium text-muted-foreground">Sync</span>
          <SyncIndicator />
        </div>

        {/* User Card */}
        <div className="p-2.5 rounded-xl border border-border/60 bg-card/80 flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-1 ring-border shrink-0">
            {user?.picture && (
              <AvatarImage src={user.picture} alt={user.name || "User avatar"} />
            )}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
              {userInitials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground truncate">
              {user?.name || (isAuthenticated ? "Tabby User" : "Offline Mode")}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {user?.email || "Local storage only"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
