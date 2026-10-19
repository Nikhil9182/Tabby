import { Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-media-query";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TopBar } from "@/components/layout/top-bar";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { PageSkeleton } from "@/components/layout/loading-skeleton";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  children?: ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  const isMobile = useIsMobile();

  return (
    <div className={cn("min-h-screen bg-background text-foreground antialiased", className)}>
      {isMobile ? (
        // Mobile Layout: TopBar + Content + Bottom Nav
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <main className="flex-1 w-full px-4 py-4 pb-24">
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                {children || <Outlet />}
              </Suspense>
            </ErrorBoundary>
          </main>
          <MobileNav />
        </div>
      ) : (
        // Desktop Layout: Sidebar + Centered Max-Width Main Content
        <div className="flex min-h-screen">
          <Sidebar className="sticky top-0 h-screen" />
          <div className="flex-1 flex flex-col min-w-0">
            <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
              <ErrorBoundary>
                <Suspense fallback={<PageSkeleton />}>
                  {children || <Outlet />}
                </Suspense>
              </ErrorBoundary>
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
