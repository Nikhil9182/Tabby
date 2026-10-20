import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}

export function PageHeader({
  title,
  description,
  action,
  actions,
  onBack,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  const actionContent = action || actions;

  return (
    <header className={cn("space-y-2 mb-6 sm:mb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={index} className="inline-flex items-center gap-1.5">
                  {index > 0 && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  )}
                  {crumb.href && !isLast ? (
                    <Link
                      to={crumb.href}
                      className="hover:text-foreground transition-colors font-medium"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        "font-medium",
                        isLast ? "text-foreground" : "text-muted-foreground"
                      )}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="min-w-0 space-y-1">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground break-words">
              {title}
            </h1>
            {description && (
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        {actionContent && (
          <div className="flex flex-wrap items-center gap-2.5 max-w-full self-start sm:self-center">
            {actionContent}
          </div>
        )}
      </div>
    </header>
  );
}

export default PageHeader;
