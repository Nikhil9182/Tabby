import { Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/layout/navbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { PageSkeleton } from "@/components/layout/loading-skeleton";
import { GuestMigrationDialog } from "@/components/guest/guest-migration-dialog";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  children?: ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-background text-foreground antialiased flex flex-col", className)}>
      {/* Top Header Navbar */}
      <Navbar />

      {/* Guest Data Migration Dialog when signing in from Guest Mode */}
      <GuestMigrationDialog />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-12">
        <ErrorBoundary>
          <Suspense fallback={<PageSkeleton />}>
            {children || <Outlet />}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Mobile Bottom Navigation Bar (Visible only on mobile) */}
      <div className="md:hidden">
        <MobileNav />
      </div>
    </div>
  );
}

export default AppShell;
