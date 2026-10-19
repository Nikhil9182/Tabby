import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error("Tabby ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    this.props.onReset?.();
  };

  private handleGoHome = (): void => {
    this.handleReset();
    window.location.href = "/dashboard";
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-[360px] p-6 flex flex-col items-center justify-center text-center rounded-2xl border border-destructive/20 bg-destructive/5 my-8 max-w-xl mx-auto shadow-xs"
        >
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 ring-8 ring-destructive/5">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            {this.state.error?.message ||
              "An unexpected error occurred while rendering this component. Your data is safely stored locally."}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={this.handleGoHome}
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              Go to dashboard
            </Button>
          </div>

          {import.meta.env.DEV && this.state.errorInfo && (
            <details className="mt-6 text-left w-full text-xs text-muted-foreground bg-background/80 p-3 rounded-lg border border-border overflow-x-auto max-h-48">
              <summary className="cursor-pointer font-medium text-foreground hover:text-primary">
                Technical error details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-destructive">
                {this.state.error?.stack}
              </pre>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px]">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
