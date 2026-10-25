import React, { useState } from 'react';
import {
  User as UserIcon,
  Moon,
  Sun,
  Laptop,
  Database,
  RefreshCw,
  Download,
  ShieldCheck,
  CheckCircle2,
  LogOut,
  LogIn,
  Coffee,
  Heart,
  ExternalLink,
  Sparkles,
  Key,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { CurrencySelector } from '@/components/currency/currency-selector';
import {
  useCurrentUser,
  useCurrency,
  useTheme,
  useAuth,
  useSync,
  useExpenses,
  useGroups,
  useSettlements,
  useGeminiConfig,
} from '@/hooks';
import { formatDate } from '@/lib/date';
import { toMajorUnits } from '@/domain/money/money';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { user, updateProfile, isUpdating } = useCurrentUser();
  const { defaultCurrency, setDefaultCurrency, isSavingDefaultCurrency } = useCurrency();
  const { theme, setTheme } = useTheme();
  const { user: authUser, signIn, signOut, isAuthenticated, isGuest } = useAuth();
  const { syncStatus, triggerSync, isSyncing } = useSync();
  const { expenses } = useExpenses();
  const { groups } = useGroups();
  const { settlements } = useSettlements();
  const {
    apiKey: geminiKey,
    saveKey: saveGeminiKey,
    clearKey: clearGeminiKey,
    testKey: testGeminiKey,
    isTesting: isTestingGemini,
  } = useGeminiConfig();

  // Gemini state
  const [geminiInput, setGeminiInput] = useState(geminiKey);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [geminiSaved, setGeminiSaved] = useState(false);

  React.useEffect(() => {
    setGeminiInput(geminiKey);
  }, [geminiKey]);

  // Profile edit state
  const [name, setName] = useState(user?.name || '');
  const [profileSaved, setProfileSaved] = useState(false);

  React.useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await updateProfile({ name: name.trim() });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  // Export JSON of current server records
  const handleExportJSON = () => {
    const data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      user,
      groups,
      expenses,
      settlements,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabby-backup-${formatDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Description',
      'Group ID',
      'Payer ID',
      'Amount',
      'Currency',
      'Split Type',
    ];
    const rows = expenses.map((e) => [
      `"${formatDate(e.expenseDate)}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.groupId || ''}"`,
      `"${e.paidBy}"`,
      toMajorUnits(e.originalAmountMinor, e.originalCurrency),
      e.originalCurrency,
      e.splitType || 'equal',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabby-expenses-${formatDate(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const displayName = user?.name || authUser?.name || 'User';
  const displayEmail = user?.email || authUser?.email || '';
  const displayPicture = user?.picture || authUser?.picture;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <PageHeader
        title="Settings"
        description="Preferences, profile, cloud sync, and data exports."
      />

      {/* 1. Profile Section */}
      <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-7 shadow-xs space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-[#0055FF]" />
            <h2 className="text-xl font-black tracking-tight text-foreground">
              Profile &amp; Account
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            Your identity shown when splitting expenses and settlements.
          </p>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex items-center gap-4 pb-2">
            <Avatar className="h-14 w-14 border-2 border-background ring-2 ring-primary/20">
              {displayPicture && <AvatarImage src={displayPicture} alt={displayName} />}
              <AvatarFallback className="font-black text-sm uppercase bg-muted text-foreground">
                {displayName.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{displayEmail}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="settings-name" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Display Name
            </label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="rounded-xl h-11"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="submit"
              disabled={isUpdating || !name.trim()}
              className="bg-[#0055FF] hover:bg-[#0055FF]/90 text-white rounded-xl font-bold h-10 px-5"
            >
              {isUpdating ? 'Saving...' : 'Save Profile'}
            </Button>
            {profileSaved && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4" />
                Profile updated
              </span>
            )}
          </div>
        </form>
      </div>

      {/* 2. Preferences (Currency & Theme) */}
      <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-7 shadow-xs space-y-6">
        <h2 className="text-xl font-black tracking-tight text-foreground">
          Preferences
        </h2>

        <div className="space-y-5">
          {/* Default Currency */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
              Display currency
            </label>
            <CurrencySelector
              value={defaultCurrency}
              onChange={(c) => setDefaultCurrency(c)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Balances and totals are shown in this currency, converted at current exchange rates.
              Your expenses always keep the currency they were recorded in.
              {isSavingDefaultCurrency && ' Saving…'}
            </p>
          </div>

          {/* Theme Selector */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
              Theme Mode
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  'flex flex-col items-center justify-center p-3.5 rounded-2xl border text-xs font-bold gap-1.5 transition-all cursor-pointer',
                  theme === 'light'
                    ? 'border-[#0055FF] bg-[#0055FF]/10 text-[#0055FF] ring-2 ring-[#0055FF]/20'
                    : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                )}
              >
                <Sun className="h-4 w-4" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  'flex flex-col items-center justify-center p-3.5 rounded-2xl border text-xs font-bold gap-1.5 transition-all cursor-pointer',
                  theme === 'dark'
                    ? 'border-[#0055FF] bg-[#0055FF]/10 text-[#0055FF] ring-2 ring-[#0055FF]/20'
                    : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                )}
              >
                <Moon className="h-4 w-4" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={cn(
                  'flex flex-col items-center justify-center p-3.5 rounded-2xl border text-xs font-bold gap-1.5 transition-all cursor-pointer',
                  theme === 'system'
                    ? 'border-[#0055FF] bg-[#0055FF]/10 text-[#0055FF] ring-2 ring-[#0055FF]/20'
                    : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                )}
              >
                <Laptop className="h-4 w-4" />
                <span>System</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Cloud Database & Authentication */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <span>Account</span>
          </CardTitle>
          <CardDescription>
            Your expenses, groups and payments are saved to your account and stay in sync on every device.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl border border-border/40 bg-muted/20 gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">Google account</span>
                <Badge
                  variant={isAuthenticated ? 'default' : isGuest ? 'secondary' : 'outline'}
                  className="text-[10px] capitalize"
                >
                  {isAuthenticated ? 'Signed In' : isGuest ? 'Guest Mode' : 'Signed Out'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground break-words">
                {isAuthenticated
                  ? `Signed in as ${authUser?.email || displayEmail}`
                  : isGuest
                  ? 'Stored locally on this device. Sign in with Google to sync across devices.'
                  : 'Sign in to see your expenses and balances.'}
              </p>
            </div>

            {isAuthenticated ? (
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
                className="gap-1.5 shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void signIn()}
                className="gap-1.5 shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Sign In</span>
              </Button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void triggerSync()}
            disabled={isSyncing || !syncStatus.isOnline}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            <span>{isSyncing ? 'Refreshing...' : 'Refresh now'}</span>
          </Button>
        </CardContent>
      </Card>

      {/* 4. Data Export */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <span>Download your data</span>
          </CardTitle>
          <CardDescription>
            Get a spreadsheet of your expenses, or a full backup file.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Expenses spreadsheet (CSV)</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Full backup</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 5. AI Receipt Scanner (Google Gemini) */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#0055FF] dark:text-[#3B82F6]" />
              <span>AI Receipt Scanner</span>
            </CardTitle>
            <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
              Google Gemini 1.5 Flash
            </Badge>
          </div>
          <CardDescription>
            Power receipt scanning with Google&apos;s free Vision AI. Extracts itemized names, quantities, and GST/taxes with near-perfect accuracy across angled or folded paper.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" />
                Gemini API Key
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 font-normal"
              >
                <span>Get free key (No credit card)</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showGeminiKey ? 'text' : 'password'}
                  placeholder="AIzaSy..."
                  value={geminiInput}
                  onChange={(e) => {
                    setGeminiInput(e.target.value);
                    setGeminiTestResult(null);
                  }}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showGeminiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!geminiInput.trim()) return;
                  const res = await testGeminiKey(geminiInput.trim());
                  setGeminiTestResult(res);
                }}
                disabled={isTestingGemini || !geminiInput.trim()}
                className="shrink-0"
              >
                {isTestingGemini ? 'Testing...' : 'Test Key'}
              </Button>
            </div>

            {geminiTestResult && (
              <p
                className={cn(
                  'text-xs font-medium flex items-center gap-1.5',
                  geminiTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                )}
              >
                {geminiTestResult.success ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                <span>{geminiTestResult.message}</span>
              </p>
            )}

            {geminiSaved && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Gemini API key saved! AI Smart Scan is now active.</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              Google provides <strong>1,500 free scans/day</strong>. Key is stored locally in your browser.
            </p>
            <div className="flex items-center gap-2">
              {geminiKey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearGeminiKey();
                    setGeminiInput('');
                    setGeminiTestResult(null);
                  }}
                  className="text-xs text-destructive hover:text-destructive"
                >
                  Remove Key
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  saveGeminiKey(geminiInput.trim());
                  setGeminiSaved(true);
                  setTimeout(() => setGeminiSaved(false), 3000);
                }}
                disabled={!geminiInput.trim() || geminiInput === geminiKey}
              >
                Save Key
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6. Support Tabby */}
      <Card className="border-border/60 shadow-xs bg-gradient-to-br from-amber-500/5 via-transparent to-transparent">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Coffee className="h-4 w-4 text-amber-500" />
            <span>Support Tabby</span>
          </CardTitle>
          <CardDescription>
            Tabby is 100% free, private, and ad-free. If it saved you time or settled a bill without headaches, consider buying a coffee!
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-2 border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/10 text-foreground"
          >
            <a
              href={import.meta.env.VITE_DONATION_URL || 'https://buymeacoffee.com'}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
              <span>Buy Me a Coffee</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground ml-0.5" />
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* 6. App Info & Security */}
      <div className="space-y-3 pt-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/10">
          <div>
            <p className="font-semibold text-foreground">Tabby</p>
            <p>Version 1.0.0</p>
            <a
              href={`${import.meta.env.BASE_URL}privacy.html`}
              className="underline-offset-4 hover:underline hover:text-foreground"
            >
              Privacy Policy
            </a>
          </div>
        </div>

        <p className="flex items-start gap-1.5 px-1">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>
            Your expenses are private. Only the friends and group members you share them with can see them.
          </span>
        </p>
      </div>
    </div>
  );
}

export default SettingsPage;
