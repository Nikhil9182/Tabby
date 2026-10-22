import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  Database,
  Calculator,
  RefreshCw,
  AlertCircle,
  Lock,
} from "lucide-react";
import { TabbyIcon } from "@/components/common/tabby-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { checkSupabaseConfig } from "@/lib/supabase";

export function WelcomePage() {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, isLoading, error: authError } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = checkSupabaseConfig();

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign in failed. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-6 md:p-12">
      {/* Top Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <TabbyIcon size={40} className="h-10 w-10 rounded-xl shadow-xs" />
          <span className="text-xl font-bold tracking-tight">Tabby</span>
        </div>

        {isAuthenticated && (
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            Go to Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl w-full mx-auto my-12 text-center space-y-8 animate-in fade-in-50 duration-500">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Realtime Multi-User &bull; PostgreSQL Security &bull; Exact Split Math
        </div>

        <div className="space-y-4 max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground">
            Fair expense splitting, centralized &amp; realtime
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Tabby tracks shared expenses, roommates, group trips, and settlements.
            Your financial records are secured with PostgreSQL Row Level Security and kept in sync across all devices.
          </p>
        </div>

        {/* Configuration Notice if missing */}
        {!config.isConfigured && (
          <div className="max-w-md mx-auto p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs text-left flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Setup required</p>
              <p className="text-muted-foreground mt-0.5">
                Set <code className="bg-muted px-1 rounded">VITE_SUPABASE_URL</code> and <code className="bg-muted px-1 rounded">VITE_SUPABASE_PUBLISHABLE_KEY</code> in your environment file to connect your Supabase project.
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {(error || authError) && (
          <div className="max-w-md mx-auto p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2.5 text-left">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error || authError}</span>
          </div>
        )}

        {/* Auth CTA */}
        <div className="flex flex-col items-center justify-center gap-3 pt-2">
          <Button
            size="lg"
            className="h-12 px-8 text-base font-semibold gap-3 shadow-md"
            disabled={isSigningIn || isLoading || !config.isConfigured}
            onClick={handleGoogleSignIn}
          >
            {isSigningIn || isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
            <Lock className="h-3.5 w-3.5" />
            Signed in via Supabase Auth &bull; Google credentials are never stored by Tabby
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left pt-8">
          <Card className="rounded-2xl border-border bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Calculator className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Exact Minor Units</CardTitle>
              <CardDescription>
                Calculations use integer cents to prevent floating-point rounding errors in splits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Equal, percentage, exact amount, and shares splitting with deterministic remainder penny distribution.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">PostgreSQL Row Security</CardTitle>
              <CardDescription>
                Strict database authorization guarantees personal expenses and groups remain private.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Only authenticated members of a group can read its financial ledgers. No unauthorized data leaks.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Users className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Realtime Collaboration</CardTitle>
              <CardDescription>
                Multi-user updates broadcast seamlessly to all active group members.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Shared expenses and settlements appear instantly across phones and laptops without refreshing.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-muted-foreground pt-8 border-t border-border/50">
        Tabby &bull; Centralized Expense Management &bull; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default WelcomePage;
