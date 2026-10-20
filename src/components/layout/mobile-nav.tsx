import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileTabItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const mainTabs: MobileTabItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/groups", label: "Groups", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

export function MobileNav({ className }: { className?: string }) {
  const location = useLocation();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] flex items-center justify-around select-none shadow-lg",
        className
      )}
      aria-label="Mobile Navigation"
    >
      {mainTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          tab.to === "/dashboard"
            ? location.pathname === "/dashboard" || location.pathname === "/"
            : location.pathname.startsWith(tab.to);

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1.5 px-1 min-w-0 min-h-[48px] rounded-xl text-[11px] font-semibold transition-all",
              isActive
                ? "text-[#0055FF] dark:text-[#3B82F6]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div
              className={cn(
                "p-1 rounded-xl transition-all",
                isActive && "bg-[#0055FF]/10 text-[#0055FF] dark:text-[#3B82F6]"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <span className="mt-0.5 tracking-tight">{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default MobileNav;
