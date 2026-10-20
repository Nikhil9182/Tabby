import React, { useState } from 'react';
import {
  User as UserIcon,
  Moon,
  Sun,
  Laptop,
  HardDrive,
  RefreshCw,
  Database,
  Download,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  LogOut,
  LogIn,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
} from '@/hooks';
import { db } from '@/storage/local/database';
import { seedDemoData } from '@/lib/seed-data';
import { formatDate, formatRelativeDate } from '@/lib/date';
import { toMajorUnits } from '@/domain/money/money';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { user, updateProfile, isUpdating } = useCurrentUser();
  const { defaultCurrency, setDefaultCurrency } = useCurrency();
  const { theme, setTheme } = useTheme();
  const { authState, user: googleUser, signIn, signOut, isAuthenticated } = useAuth();
  const { syncStatus, triggerSync, isSyncing } = useSync();
  const { expenses } = useExpenses();
  const { groups } = useGroups();
  const { settlements } = useSettlements();

  // Profile edit state
  const [name, setName] = useState(user?.name || '');
  const [profileSaved, setProfileSaved] = useState(false);

  // Clear cache dialog
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    try {
      await seedDemoData();
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Failed to seed demo data:', err);
    } finally {
      setIsSeeding(false);
    }
  };

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

  // Export JSON
  const handleExportJSON = () => {
    const data = {
      version: '0.1.0',
      schemaVersion: 1,
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
  };

  // Clear Local Database Cache
  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await Promise.all(db.tables.map((table) => table.clear()));
      setClearDialogOpen(false);
      window.location.reload();
    } catch (err) {
      console.error('Failed to clear cache:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const displayName = user?.name || googleUser?.name || 'Local User';
  const displayEmail = user?.email || googleUser?.email || 'offline@tabby.local';
  const displayPicture = user?.picture || googleUser?.picture;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <PageHeader
        title="Settings"
        description="Preferences, profile, cloud sync, and local data management."
      />

      {/* 1. Profile Section */}
      <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-7 shadow-xs space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-[#0055FF]" />
            <h2 className="text-xl font-black tracking-tight text-foreground">
              Profile & Account
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            Your identity shown when splitting expenses and settlements.
          </p>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex items-center gap-4 pb-2">
            <Avatar size="lg" className="border-2 border-background ring-2 ring-primary/20">
              {displayPicture && <AvatarImage src={displayPicture} alt={displayName} />}
              <AvatarFallback className="font-black text-sm uppercase bg-muted text-foreground">
                {displayName.slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 space-y-0.5">
              <p className="font-bold text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate font-medium">{displayEmail}</p>
              <Badge variant="outline" className="text-[10px] font-bold capitalize">
                {isAuthenticated ? 'Connected to Google' : 'Local Workspace'}
              </Badge>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Display Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your Name"
              className="h-11 rounded-2xl bg-muted/30 border-0 focus-visible:ring-1 focus-visible:ring-primary text-sm font-medium max-w-sm"
            />
          </div>

          {profileSaved && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Profile updated</span>
            </p>
          )}

          <Button
            type="submit"
            disabled={isUpdating}
            className="h-10 px-5 rounded-2xl bg-[#0055FF] hover:bg-[#0055FF]/90 text-white font-bold"
          >
            Save Profile
          </Button>
        </form>
      </div>

      {/* 2. Preferences (Currency & Theme) */}
      <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-7 shadow-xs space-y-5">
        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-tight text-foreground">Preferences</h2>
          <p className="text-xs text-muted-foreground font-medium">
            Default display units and interface color scheme.
          </p>
        </div>

        <div className="space-y-5">
          {/* Default Currency */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Primary Currency
            </label>
            <div className="max-w-sm">
              <CurrencySelector
                value={defaultCurrency}
                onChange={setDefaultCurrency}
              />
            </div>
          </div>

          {/* Theme Selector */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Interface Theme
            </label>
            <div className="grid grid-cols-3 gap-3 max-w-sm">
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

      {/* 3. Google Account & Cloud Sync */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <span>Google Drive Synchronization</span>
          </CardTitle>
          <CardDescription>
            Sync ledgers and backup data directly to your personal Google Drive and Sheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl border border-border/40 bg-muted/20 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Google Drive Connection</span>
                <Badge
                  variant={isAuthenticated ? 'default' : 'outline'}
                  className="text-[10px] capitalize"
                >
                  {isAuthenticated ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAuthenticated
                  ? `Authenticated as ${googleUser?.email}`
                  : 'Connect your Google account to sync spreadsheets across devices.'}
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
                <span>Disconnect</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void signIn()}
                className="gap-1.5 shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Connect Google</span>
              </Button>
            )}
          </div>

          {/* Sync Status Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-border/40 bg-card space-y-1">
              <span className="text-muted-foreground font-medium">Last Synced</span>
              <p className="font-semibold text-foreground">
                {syncStatus.lastSyncedAt
                  ? formatRelativeDate(syncStatus.lastSyncedAt)
                  : 'Never synced'}
              </p>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-card space-y-1">
              <span className="text-muted-foreground font-medium">Pending Sync Operations</span>
              <p className="font-semibold text-foreground">
                {syncStatus.pendingCount} operations waiting
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void triggerSync()}
            disabled={isSyncing || !syncStatus.isOnline}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            <span>{isSyncing ? 'Synchronizing...' : 'Trigger Manual Sync'}</span>
          </Button>
        </CardContent>
      </Card>

      {/* 4. Data Management (Export & Clear Cache) */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <span>Data Management & Backup</span>
          </CardTitle>
          <CardDescription>
            Download your raw financial data or reset local browser IndexedDB storage.
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
              <span>Export Expenses (CSV)</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Full Data Backup (JSON)</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={isSeeding}
              onClick={handleSeedDemo}
              className="gap-1.5 border-[#0055FF]/40 text-[#0055FF] hover:bg-[#0055FF]/10 font-bold"
            >
              <Sparkles className="h-3.5 w-3.5 fill-[#0055FF]/20" />
              <span>{isSeeding ? 'Loading Demo Data...' : 'Load Sample Demo Data'}</span>
            </Button>
          </div>

          <div className="pt-3 border-t border-border/40">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Local Cache</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 5. App Info & Privacy */}
      <div className="space-y-3 pt-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/10">
          <div>
            <p className="font-semibold text-foreground">Tabby Expense Splitting</p>
            <p>Version 0.1.0 &bull; Database Schema v1</p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            Dexie IndexedDB
          </Badge>
        </div>

        <p className="flex items-start gap-1.5 px-1">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>
            <strong>Privacy Note:</strong> Tabby operates client-side with zero centralized database
            servers. All records are stored securely in your browser's IndexedDB and your private
            Google Drive storage.
          </span>
        </p>
      </div>

      {/* Clear Cache Confirmation Dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <span>Clear Local Database?</span>
            </DialogTitle>
            <DialogDescription>
              This will remove all expenses, groups, and settlements stored locally on this browser.
              Make sure you have exported a JSON backup or synchronized with Google Drive first!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={isClearing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearCache}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Yes, Clear Local Cache'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SettingsPage;
