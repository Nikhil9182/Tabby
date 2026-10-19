import React, { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateActionObject {
  label: string;
  onClick: () => void;
}

export type EmptyStateAction = EmptyStateActionObject | ReactNode;

export interface EmptyStateProps {
  icon?: LucideIcon | ReactNode;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) {
      return Icon;
    }
    const IconComponent = Icon as LucideIcon;
    return <IconComponent className="h-7 w-7" aria-hidden="true" />;
  };

  const renderAction = (act?: EmptyStateAction) => {
    if (!act) return null;
    if (React.isValidElement(act)) {
      return act;
    }
    const actObj = act as EmptyStateActionObject;
    return (
      <Button variant="default" size="sm" onClick={actObj.onClick}>
        {actObj.label}
      </Button>
    );
  };

  const renderSecondaryAction = (act?: EmptyStateAction) => {
    if (!act) return null;
    if (React.isValidElement(act)) {
      return act;
    }
    const actObj = act as EmptyStateActionObject;
    return (
      <Button variant="outline" size="sm" onClick={actObj.onClick}>
        {actObj.label}
      </Button>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl border border-dashed border-border/80 bg-card/40 my-4",
        className
      )}
    >
      {Icon && (
        <div className="h-14 w-14 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mb-4 ring-8 ring-muted/30 transition-transform duration-200 hover:scale-105">
          {renderIcon()}
        </div>
      )}
      <h3 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
        {description}
      </p>

      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {renderSecondaryAction(secondaryAction)}
          {renderAction(action)}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
