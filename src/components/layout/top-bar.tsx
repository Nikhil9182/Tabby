import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SyncIndicator } from "@/components/sync/sync-indicator";
import { Button } from "@/components/ui/button";
import { TabbyIcon } from "@/components/common/tabby-icon";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  title?: string;
  action?: ReactNode;
  showBackButton?: boolean;
  className?: string;
}

function getDefaultTitle(pathname: string): string {
  if (pathname === "/dashboard" || pathname === "/") return "Dashboard";
  if (pathname === "/expenses") return "Expenses";
  if (pathname === "/expenses/new") return "Add Expense";
  if (pathname.startsWith("/expenses/")) return "Expense Details";
  if (pathname === "/groups") return "Groups";
  if (pathname === "/groups/new") return "New Group";
  if (pathname.startsWith("/groups/")) return "Group Details";
  if (pathname === "/friends") return "Friends";
  if (pathname === "/settlements") return "Settlements";
  if (pathname === "/settlements/new") return "Record Settlement";
  if (pathname === "/reports") return "Reports";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/welcome") return "Welcome to Tabby";
  return "Tabby";
}

export function TopBar({
  title,
  action,
  showBackButton,
  className,
}: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const isDeepRoute =
    location.pathname.startsWith("/expenses/") ||
    location.pathname.startsWith("/groups/") ||
    location.pathname.startsWith("/settlements/") ||
    location.pathname === "/friends" ||
    location.pathname === "/reports" ||
    location.pathname === "/settings";

  const shouldShowBack =
    typeof showBackButton === "boolean" ? showBackButton : isDeepRoute;

  const displayTitle = title || getDefaultTitle(location.pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-14 bg-background/90 backdrop-blur-md border-b border-border/80 px-4 flex items-center justify-between gap-3 select-none",
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {shouldShowBack ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-1 text-muted-foreground hover:text-foreground"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <TabbyIcon size={28} className="h-7 w-7 rounded-lg shadow-2xs shrink-0" />
        )}

        <h1 className="text-base font-semibold tracking-tight text-foreground truncate">
          {displayTitle}
        </h1>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action}
        <SyncIndicator compact />
      </div>
    </header>
  );
}
