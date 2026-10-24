import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowRightLeft,
  Globe,
  Receipt,
  Sparkles,
  Users,
  RefreshCw,
  AlertCircle,
  Lock,
  UserCheck,
} from "lucide-react";
import { TabbyIcon } from "@/components/common/tabby-icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { checkSupabaseConfig } from "@/lib/supabase";

const FEATURES = [
  {
    icon: Receipt,
    title: "Add expenses in seconds",
    description: "Split equally, by exact amounts, by percentage, or by shares. Tabby does the maths.",
  },
  {
    icon: Users,
    title: "Friends and groups",
    description: "Keep a running tab with one friend, or create a group for a trip, a flat, or an office lunch.",
  },
  {
    icon: ArrowRightLeft,
    title: "Settle up easily",
    description: "See who owes what at a glance, and record payments when you're square.",
  },
  {
    icon: Globe,
    title: "Any currency",
    description: "Spending abroad? Add expenses in any currency and see your totals in yours.",
  },
];

export function WelcomePage() {
  const navigate = useNavigate();
  const { signIn, continueAsGuest, isAuthenticated, isGuest, isLoading, error: authError } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = checkSupabaseConfig();

  // If already authenticated or in guest mode, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated || isGuest) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, isGuest, navigate]);

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

  const handleContinueAsGuest = () => {
    continueAsGuest();
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-6 md:p-12">
      {/* Top Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <TabbyIcon size={40} className="h-10 w-10 rounded-xl shadow-xs" />
          <span className="text-xl font-bold tracking-tight">Tabby</span>
        </div>

        {(isAuthenticated || isGuest) && (
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            Go to Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl w-full mx-auto my-12 text-center space-y-8 animate-in fade-in-50 duration-500">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Free &bull; Works on your phone and laptop
        </div>

        <div className="space-y-4 max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground">
            Split bills with friends, minus the awkward maths
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Add what you spent, pick who it was for, and Tabby keeps a running tally of who owes whom.
            Perfect for trips, flatmates, dinners out, or anything you share.
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

        {/* Auth CTA: Choice between Google Sign In and Continue as Guest */}
        <div className="flex flex-col items-center justify-center gap-3 pt-2">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
            <Button
              size="lg"
              className="h-12 px-6 text-base font-semibold gap-3 shadow-md w-full sm:w-auto flex-1 cursor-pointer"
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
                  Sign in with Google
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base font-semibold gap-2.5 w-full sm:w-auto flex-1 cursor-pointer border-border hover:bg-muted/80"
              onClick={handleContinueAsGuest}
            >
              <UserCheck className="h-5 w-5 text-primary" />
              <span>Continue as Guest</span>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
            <Lock className="h-3.5 w-3.5" />
            Guest data is saved locally on this device. Sign in anytime to sync across devices.
          </p>
        </div>

        {/* What you can do */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left pt-8">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-4 rounded-xl border border-border/60 bg-card p-5">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-muted-foreground pt-8 border-t border-border/50">
        Tabby &bull; Split expenses with friends &bull; {new Date().getFullYear()} &bull;{' '}
        <a
          href={`${import.meta.env.BASE_URL}privacy.html`}
          className="underline-offset-4 hover:underline hover:text-foreground"
        >
          Privacy Policy
        </a>
      </footer>
    </div>
  );
}

export default WelcomePage;
