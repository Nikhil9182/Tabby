import { Skeleton } from "@/components/ui/skeleton";

export function GenericListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3 w-full" role="status" aria-label="Loading list...">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/60"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

export function ExpenseListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3 w-full" role="status" aria-label="Loading expenses...">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
        >
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading expenses...</span>
    </div>
  );
}

export function GroupCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full"
      role="status"
      aria-label="Loading groups..."
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-xl border border-border bg-card space-y-4"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading groups...</span>
    </div>
  );
}

export function SettlementRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 w-full" role="status" aria-label="Loading settlements...">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading settlements...</span>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 w-full animate-in fade-in-50 duration-300" role="status" aria-label="Loading dashboard...">
      {/* Top Welcome / Stats Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-5 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Two-column layout for Recent Expenses & Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-16" />
          </div>
          <GenericListSkeleton count={4} />
        </div>
        <div className="p-5 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <GenericListSkeleton count={4} />
        </div>
      </div>
      <span className="sr-only">Loading dashboard...</span>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 w-full animate-in fade-in-50 duration-300" role="status" aria-label="Loading page...">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="p-6 rounded-xl border border-border bg-card space-y-4">
        <GenericListSkeleton count={5} />
      </div>
      <span className="sr-only">Loading page...</span>
    </div>
  );
}
