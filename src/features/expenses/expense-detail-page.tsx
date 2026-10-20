import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Edit2,
  Trash2,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useExpense,
  useExpenses,
  useCurrentUser,
  useUsers,
  useGroups,
  useCategories,
} from '@/hooks';
import { formatDate } from '@/lib/date';
import { formatMoney } from '@/domain/money/money';

export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { expense, splits, isLoading, error } = useExpense(id || '');
  const { deleteExpense, isDeleting } = useExpenses();
  const { users } = useUsers();
  const { groups } = useGroups();
  const { categories } = useCategories();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        <Skeleton className="h-10 w-32" />
        <Card className="p-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold">Expense not found</h2>
        <p className="text-sm text-muted-foreground">
          The requested expense does not exist or was removed.
        </p>
        <Button onClick={() => navigate('/expenses')} variant="outline">
          Back to Expenses
        </Button>
      </div>
    );
  }

  // Payer
  const isPayerSelf =
    expense.paidBy === currentUserId ||
    expense.paidBy === 'user_self' ||
    expense.paidBy === 'current_user' ||
    expense.paidBy === currentUser?.googleSub;
  const payer = users.find((u) => u.id === expense.paidBy || u.googleSub === expense.paidBy);
  const payerName = isPayerSelf
    ? currentUser?.name || 'You'
    : payer?.name || payer?.email || 'Friend';

  // Group
  const group = groups.find((g) => g.id === expense.groupId);

  // Category
  const category = categories.find((c) => c.id === expense.categoryId);

  // Currency conversion info
  const isDifferentCurrency =
    expense.reportingCurrency &&
    expense.reportingCurrency.toUpperCase() !== expense.originalCurrency.toUpperCase();

  const handleDelete = async () => {
    try {
      await deleteExpense(expense.id);
      setDeleteDialogOpen(false);
      navigate('/expenses');
    } catch (err) {
      console.error('Failed to delete expense:', err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      {/* Back button and actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/expenses/${expense.id}/edit`)}
            className="gap-1.5"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="gap-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {/* Main Expense Detail Card */}
      <Card className="border-border/60 shadow-xs overflow-hidden">
        <CardHeader className="p-6 pb-4 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs font-normal">
                  {formatDate(expense.expenseDate, 'MMMM d, yyyy')}
                </Badge>
                {group && (
                  <Badge variant="secondary" className="text-xs font-normal gap-1">
                    <Users className="h-3 w-3" />
                    <span>{group.name}</span>
                  </Badge>
                )}
                {category && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {category.name}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground break-words pt-1">
                {expense.description}
              </h1>
            </div>

            {/* Total Amount Display */}
            <div className="shrink-0 flex flex-col items-start sm:items-end">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Amount
              </span>
              <CurrencyDisplay
                amountMinor={expense.originalAmountMinor}
                currency={expense.originalCurrency}
                size="xl"
                className="font-black text-foreground"
              />
              {isDifferentCurrency && expense.reportingAmountMinor && (
                <span className="text-xs text-muted-foreground">
                  ≈ {formatMoney(expense.reportingAmountMinor, expense.reportingCurrency!)}
                  {expense.exchangeRate && ` (Rate: ${expense.exchangeRate.toFixed(4)})`}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Metadata Row: Paid By & Split Strategy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/30 border border-border/40">
            {/* Payer info */}
            <div className="flex items-center gap-3">
              <Avatar size="default" className="ring-1 ring-border">
                {payer?.picture && <AvatarImage src={payer.picture} alt={payerName} />}
                <AvatarFallback className="font-semibold text-xs uppercase">
                  {payerName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-0.5 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paid By
                </span>
                <p className="font-semibold text-sm truncate">{payerName}</p>
              </div>
            </div>

            {/* Split Strategy */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Split Strategy
                </span>
                <p className="font-semibold text-sm capitalize">
                  {expense.splitType || 'Equal'} Split ({splits.length} participants)
                </p>
              </div>
            </div>
          </div>

          {/* Notes if available */}
          {expense.notes && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                <span>Notes & Remarks</span>
              </span>
              <p className="text-sm text-foreground bg-muted/20 p-3.5 rounded-lg border border-border/40 whitespace-pre-wrap">
                {expense.notes}
              </p>
            </div>
          )}

          {/* Participant Shares Breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase tracking-wider">
              Allocation Breakdown
            </h3>

            <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/40">
              {splits.map((split) => {
                const isYou =
                  split.userId === currentUserId ||
                  split.userId === 'user_self' ||
                  split.userId === 'current_user' ||
                  split.userId === currentUser?.googleSub;
                const u = users.find((user) => user.id === split.userId || user.googleSub === split.userId);
                const memberName = isYou ? currentUser?.name || 'You' : u?.name || u?.email || 'Participant';
                const percentage =
                  split.percentageBasisPoints !== undefined
                    ? `${(split.percentageBasisPoints / 100).toFixed(1)}%`
                    : `${((split.shareMinor / expense.originalAmountMinor) * 100).toFixed(1)}%`;

                return (
                  <div
                    key={split.id || split.userId}
                    className="flex items-center justify-between p-3.5 bg-card hover:bg-muted/30 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar size="sm">
                        {u?.picture && <AvatarImage src={u.picture} alt={memberName} />}
                        <AvatarFallback className="text-[10px] font-semibold">
                          {memberName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-0.5">
                        <span className="font-medium text-foreground">
                          {memberName}
                        </span>
                        {split.weight !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            {split.weight} share(s)
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right space-y-0.5">
                      <CurrencyDisplay
                        amountMinor={split.shareMinor}
                        currency={expense.originalCurrency}
                        size="md"
                        className="font-bold text-foreground"
                      />
                      <p className="text-xs text-muted-foreground">{percentage}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit / Sync Info */}
          <div className="flex items-center justify-between pt-4 border-t border-border/40 text-xs text-muted-foreground">
            <span>Created {formatDate(expense.createdAt, 'MMM d, yyyy h:mm a')}</span>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Saved locally</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <span>Delete Expense</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{expense.description}&rdquo;? This will remove
              all participant debts and update balances accordingly. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExpenseDetailPage;
