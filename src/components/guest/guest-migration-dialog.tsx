import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import {
  guestMigrationService,
  type AccountCheckResult,
} from '@/services/guest/guest-migration-service';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  Trash2,
  Sparkles,
} from 'lucide-react';

export function GuestMigrationDialog() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [accountInfo, setAccountInfo] = useState<AccountCheckResult | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationSuccess, setMigrationSuccess] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // Check if migration is needed when user logs in with Google
  useEffect(() => {
    let isMounted = true;

    if (!isAuthenticated || !user?.id) {
      setIsOpen(false);
      return;
    }

    const check = async () => {
      setIsChecking(true);
      try {
        const result = await guestMigrationService.checkAccountState(user.id);
        if (!isMounted) return;

        if (result.hasGuestData) {
          setAccountInfo(result);
          setIsOpen(true);

          // If first-time sign-in (empty account), initiate migration automatically
          if (!result.isExistingAccount) {
            void executeMigration(user.id);
          }
        }
      } catch (err) {
        console.warn('Error checking migration state:', err);
      } finally {
        if (isMounted) setIsChecking(false);
      }
    };

    void check();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user?.id]);

  const executeMigration = useCallback(
    async (userId: string) => {
      setIsMigrating(true);
      setMigrationError(null);

      try {
        const result = await guestMigrationService.migrateGuestData(userId);
        if (result.success) {
          setMigrationSuccess(true);
          await queryClient.invalidateQueries();
          setTimeout(() => {
            setIsOpen(false);
            setMigrationSuccess(false);
          }, 1800);
        } else {
          setMigrationError(result.error || 'Migration could not be completed.');
        }
      } catch (err: unknown) {
        setMigrationError(
          err instanceof Error
            ? err.message
            : 'A network or server error occurred during migration. Your guest data is safe on this device.'
        );
      } finally {
        setIsMigrating(false);
      }
    },
    [queryClient]
  );

  const handleMerge = async () => {
    if (!user?.id) return;
    await executeMigration(user.id);
  };

  const handleDiscard = async () => {
    setIsMigrating(true);
    setMigrationError(null);
    try {
      await guestMigrationService.discardGuestData();
      await queryClient.invalidateQueries();
      setIsOpen(false);
    } catch (err: unknown) {
      setMigrationError(err instanceof Error ? err.message : 'Could not discard guest data.');
    } finally {
      setIsMigrating(false);
    }
  };

  if (!isOpen || !accountInfo) return null;

  const { isExistingAccount, guestSummary } = accountInfo;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isMigrating && setIsOpen(open)}>
      <DialogContent className="sm:max-w-lg rounded-3xl p-6 space-y-4">
        {/* Header */}
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              {migrationSuccess ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : isMigrating ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {migrationSuccess
                  ? 'Data Saved to Your Account!'
                  : isExistingAccount
                  ? 'Merge or Discard Guest Data?'
                  : 'Setting Up Your Account'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {migrationSuccess
                  ? 'Your expenses, groups, and settlements are now synced to Google.'
                  : isExistingAccount
                  ? `Signed in as ${user?.email || 'your account'}`
                  : 'Migrating your local guest data to your new account'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Guest Data Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-1">
          <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 text-center">
            <span className="block text-xl font-black text-foreground">
              {guestSummary.expensesCount}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Expenses
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 text-center">
            <span className="block text-xl font-black text-foreground">
              {guestSummary.groupsCount}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Groups
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 text-center">
            <span className="block text-xl font-black text-foreground">
              {guestSummary.friendsCount}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Friends
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 text-center">
            <span className="block text-xl font-black text-foreground">
              {guestSummary.settlementsCount}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Settled
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {migrationError && (
          <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Migration issue</span>
            </div>
            <p className="text-muted-foreground">{migrationError}</p>
          </div>
        )}

        {/* Body Copy */}
        {migrationSuccess ? (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <p>
              All guest data has been migrated successfully. You can now access your data from any
              device.
            </p>
          </div>
        ) : isExistingAccount ? (
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>
              Your account already has existing cloud data in Tabby. You can merge the guest data
              from this device into your account, or discard it to view your account as is.
            </p>
            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-primary" />
                No data will be overwritten
              </p>
              <p>
                Merging combines both records seamlessly. If you made expenses or created groups as
                a guest, they will be safely added alongside your existing account data.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground leading-relaxed">
            {isMigrating ? (
              <p className="flex items-center gap-2 text-foreground font-medium">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                Saving your guest records to your cloud account...
              </p>
            ) : (
              <p>
                Your guest expenses and groups are safe on this device. Click below to complete
                saving them to your Google account.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        {!migrationSuccess && (
          <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2 sm:justify-end">
            {isExistingAccount ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isMigrating}
                  onClick={handleDiscard}
                  className="rounded-2xl gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-border/80"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Discard Guest Data</span>
                </Button>
                <Button
                  type="button"
                  disabled={isMigrating}
                  onClick={handleMerge}
                  className="rounded-2xl gap-2 font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90 shadow-xs"
                >
                  {isMigrating ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Merging data...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4" />
                      <span>Merge Guest Data</span>
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                {migrationError && (
                  <Button
                    type="button"
                    disabled={isMigrating}
                    onClick={() => user?.id && executeMigration(user.id)}
                    className="rounded-2xl gap-2 font-bold bg-[#0055FF] text-white hover:bg-[#0055FF]/90 shadow-xs"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Retry Migration</span>
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GuestMigrationDialog;
