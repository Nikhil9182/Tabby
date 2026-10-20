import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  HardDrive,
  FileSpreadsheet,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Lock,
} from 'lucide-react';
import { TabbyIcon } from '@/components/common/tabby-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrencySelector } from '@/components/currency/currency-selector';
import { useAuth } from '@/hooks/use-auth';
import { useCurrency } from '@/hooks/use-currency';

export function WelcomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, signIn, authState } = useAuth();
  const { defaultCurrency, setDefaultCurrency } = useCurrency();
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleConnect = async () => {
    setErrorMsg(null);
    setIsSigningIn(true);
    try {
      await signIn();
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in was cancelled or failed';
      setErrorMsg(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleContinueOffline = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/30 to-background flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-xl space-y-8 text-center">
        {/* Branding */}
        <div className="space-y-3">
          <TabbyIcon size={64} className="h-16 w-16 rounded-2xl shadow-md ring-8 ring-primary/10 inline-block" />
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Tabby
            </h1>
            <p className="text-lg sm:text-xl font-medium text-muted-foreground">
              Split expenses with friends. No backend needed.
            </p>
          </div>
        </div>

        {/* Main Card */}
        <Card className="border-border/60 shadow-lg bg-card/80 backdrop-blur-sm text-left">
          <CardHeader className="p-6 pb-4 border-b border-border/40">
            <CardTitle className="text-xl">Get Started</CardTitle>
            <CardDescription>
              Choose your primary currency and connect your personal cloud storage to get started.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Currency Preference */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                <span>Default Currency</span>
                <span className="text-xs text-muted-foreground font-normal">Can be changed anytime</span>
              </label>
              <CurrencySelector
                value={defaultCurrency}
                onChange={setDefaultCurrency}
              />
            </div>

            {/* Google Permissions Breakdown */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Transparent Cloud Permissions</span>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <HardDrive className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground font-medium">Google Drive storage:</strong> Keeps your expense tabs synchronized across your own devices.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground font-medium">Google Sheets sync:</strong> Automatically backs up group ledgers into readable Google Sheets you own.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground font-medium">Private by design:</strong> Tabby has no central server or third-party database. All calculations happen in your browser.
                  </span>
                </li>
              </ul>
            </div>

            {errorMsg && (
              <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                {errorMsg}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <Button
                size="lg"
                className="w-full h-11 text-base font-semibold shadow-xs"
                onClick={handleGoogleConnect}
                disabled={isSigningIn || authState === 'connecting'}
              >
                {isSigningIn ? 'Connecting to Google...' : 'Connect with Google'}
              </Button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-border/60"></div>
                <span className="flex-shrink mx-4 text-xs uppercase text-muted-foreground font-medium">or</span>
                <div className="flex-grow border-t border-border/60"></div>
              </div>

              <Button
                variant="outline"
                size="lg"
                className="w-full h-11 text-sm font-medium hover:bg-muted/60"
                onClick={handleContinueOffline}
              >
                <span>Continue without Google (Offline Mode)</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Your data is stored locally in IndexedDB and in your own Google Drive.</span>
        </p>
      </div>
    </div>
  );
}

export default WelcomePage;
