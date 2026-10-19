import { useState } from "react";
import {
  RefreshCw,
  Cloud,
  CloudOff,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  ArrowUpRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSync, useSyncStatus } from "@/hooks/use-sync";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SyncIndicatorProps {
  compact?: boolean;
  className?: string;
}

export function SyncIndicator({ compact = false, className }: SyncIndicatorProps) {
  const syncStatus = useSyncStatus();
  const { triggerSync, isSyncing } = useSync();
  const { authState, signIn } = useAuth();
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleManualSync = async () => {
    setSyncError(null);
    try {
      await triggerSync();
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    }
  };

  // Determine status color, badge, and label
  let dotColor = "bg-emerald-500";
  let textColor = "text-emerald-700 dark:text-emerald-400";
  let statusLabel = "Synced";
  let Icon = CheckCircle2;
  let isSpinning = false;

  if (!syncStatus.isOnline) {
    dotColor = "bg-amber-500";
    textColor = "text-amber-700 dark:text-amber-400";
    statusLabel = "Offline";
    Icon = CloudOff;
  } else if (syncStatus.isSyncing || isSyncing) {
    dotColor = "bg-blue-500";
    textColor = "text-blue-700 dark:text-blue-400";
    statusLabel = "Syncing...";
    Icon = RefreshCw;
    isSpinning = true;
  } else if (syncStatus.authState === "error" || syncStatus.hasConflicts || syncError) {
    dotColor = "bg-red-500";
    textColor = "text-red-700 dark:text-red-400";
    statusLabel = syncStatus.hasConflicts
      ? "Conflicts"
      : syncStatus.authState === "error"
      ? "Sync Error"
      : "Needs Auth";
    Icon = AlertCircle;
  } else if (syncStatus.authState === "expired") {
    dotColor = "bg-red-500";
    textColor = "text-red-700 dark:text-red-400";
    statusLabel = "Needs Auth";
    Icon = AlertCircle;
  } else if (syncStatus.pendingCount > 0) {
    dotColor = "bg-amber-400";
    textColor = "text-amber-800 dark:text-amber-300";
    statusLabel = `${syncStatus.pendingCount} pending`;
    Icon = Clock;
  }

  // Format last synced timestamp
  const formattedLastSync = syncStatus.lastSyncedAt
    ? (() => {
        try {
          return formatDistanceToNow(new Date(syncStatus.lastSyncedAt), {
            addSuffix: true,
          });
        } catch {
          return "Recently";
        }
      })()
    : "Never";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Sync Status: ${statusLabel}`}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/90 px-2.5 py-1 text-xs font-medium transition-all hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer select-none",
            className
          )}
        >
          {compact ? (
            <span className="relative flex h-2.5 w-2.5">
              {isSpinning && (
                <span
                  className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                    dotColor
                  )}
                />
              )}
              <span
                className={cn(
                  "relative inline-flex rounded-full h-2.5 w-2.5 transition-colors",
                  dotColor
                )}
              />
            </span>
          ) : (
            <>
              <span className="relative flex h-2 w-2 shrink-0">
                {isSpinning && (
                  <span
                    className={cn(
                      "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                      dotColor
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2 w-2 transition-colors",
                    dotColor
                  )}
                />
              </span>
              <span className={cn("text-xs font-medium tracking-tight truncate", textColor)}>
                {statusLabel}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-4 shadow-xl border-border bg-card text-card-foreground rounded-2xl"
      >
        <div className="space-y-3.5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-8 w-8 rounded-xl flex items-center justify-center text-primary-foreground",
                  syncStatus.isOnline ? "bg-primary" : "bg-muted text-muted-foreground"
                )}
              >
                {syncStatus.isOnline ? (
                  <Cloud className="h-4 w-4" />
                ) : (
                  <CloudOff className="h-4 w-4" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-tight text-foreground">
                  Sync Status
                </h4>
                <p className="text-xs text-muted-foreground">
                  {syncStatus.isOnline ? "Online (IndexedDB + Cloud)" : "Offline (Local only)"}
                </p>
              </div>
            </div>

            <Badge
              variant={
                syncStatus.hasConflicts || syncStatus.authState === "error"
                  ? "destructive"
                  : syncStatus.pendingCount > 0
                  ? "secondary"
                  : "outline"
              }
              className="text-[11px] capitalize"
            >
              {statusLabel}
            </Badge>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50">
              <span className="text-muted-foreground block text-[11px]">Last sync</span>
              <span className="font-medium text-foreground truncate block mt-0.5">
                {formattedLastSync}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50">
              <span className="text-muted-foreground block text-[11px]">Pending changes</span>
              <span className="font-medium text-foreground block mt-0.5">
                {syncStatus.pendingCount}
              </span>
            </div>
          </div>

          {/* Cloud Auth State */}
          <div className="rounded-xl border border-border/60 bg-accent/30 p-2.5 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary shrink-0" />
              <div className="truncate">
                <span className="font-medium text-foreground block">Google Drive Backup</span>
                <span className="text-muted-foreground text-[11px] block capitalize">
                  {authState === "connected" ? "Connected" : "Not connected"}
                </span>
              </div>
            </div>

            {authState !== "connected" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1 shrink-0"
                onClick={() => void signIn()}
              >
                Connect <ArrowUpRight className="h-3 w-3" />
              </Button>
            )}
          </div>

          {syncError && (
            <div className="p-2 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {syncError}
            </div>
          )}

          {/* Manual Trigger Button */}
          <Button
            className="w-full h-8 text-xs font-medium gap-2"
            disabled={!syncStatus.isOnline || isSyncing || syncStatus.isSyncing}
            onClick={handleManualSync}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                (isSyncing || syncStatus.isSyncing) && "animate-spin"
              )}
            />
            {isSyncing || syncStatus.isSyncing ? "Syncing now..." : "Sync now"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
