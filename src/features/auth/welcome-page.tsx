import { useNavigate } from "react-router-dom";
import { resumeAfterErasure } from '@/services/account/deletion-state';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  Database,
  Calculator,
} from "lucide-react";
import { TabbyIcon } from "@/components/common/tabby-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export function WelcomePage() {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, user } = useAuth();

  const handleStart = () => {
    resumeAfterErasure();
    navigate("/dashboard");
  };

  const handleGoogleConnect = async () => {
    try {
      await signIn();
      navigate("/dashboard");
    } catch {
      // Handled in auth context
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

        <Button variant="ghost" size="sm" onClick={handleStart}>
          Skip to Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl w-full mx-auto my-12 text-center space-y-8 animate-in fade-in-50 duration-500">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
          <Zap className="h-3.5 w-3.5" />
          Offline-First &bull; Private &bull; Exact Accounting
        </div>

        <div className="space-y-4 max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground">
            Fair expense splitting, without the headache
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Tabby tracks shared expenses, roommates, group trips, and settlements.
            Your financial data stays on your device with optional Google Drive backup.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button size="lg" className="h-12 px-8 text-base font-semibold gap-2 shadow-sm" onClick={handleStart}>
            Open Tabby Dashboard <ArrowRight className="h-4 w-4" />
          </Button>

          {!isAuthenticated && (
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base font-medium gap-2"
              onClick={handleGoogleConnect}
            >
              <Database className="h-4 w-4 text-primary" />
              Sign in with Google
            </Button>
          )}
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
                Equal, percentage, exact amount, and shares splitting with remainder penny allocation.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">100% Offline Capable</CardTitle>
              <CardDescription>
                Fast local IndexedDB storage. Works completely on airplanes and offline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Changes are queued locally and automatically synced when an internet connection returns.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Users className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Debt Simplification</CardTitle>
              <CardDescription>
                Minimizes total transfers within groups to settle balances with fewest payments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Optimal settlement planner resolves multi-party debts with minimal transactions.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-muted-foreground pt-8 border-t border-border/50">
        Tabby Expense Splitting &bull; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default WelcomePage;
