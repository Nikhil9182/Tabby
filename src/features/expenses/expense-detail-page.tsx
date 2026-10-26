import React, { useMemo, useState, useRef } from 'react';
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
  Camera,
  FileImage,
  Eye,
  Loader2,
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
import { ConvertedAmount } from '@/components/currency/converted-amount';
import {
  useExpense,
  useExpenses,
  useCurrentUser,
  useUsers,
  useGroups,
  useCategories,
  useReceipt,
} from '@/hooks';
import { formatDate } from '@/lib/date';
import { formatMoney } from '@/domain/money/money';
import { ReceiptViewerModal } from '@/components/receipts/receipt-viewer-modal';
import { compressImageForStorage } from '@/services/image/image-compression';
import { ReceiptItemsList } from '@/components/receipts/receipt-items-list';
import { extractReceiptItems } from '@/domain/receipts/receipt-item-parser';

export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { expense, splits, isLoading, error } = useExpense(id || '');
  const { deleteExpense, isDeleting } = useExpenses();
  // Load profiles for the payer and everyone in the split so names/avatars resolve
  const involvedUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (expense?.paidBy) ids.add(expense.paidBy);
    splits.forEach((s: any) => s.userId && ids.add(s.userId));
    ids.delete(currentUserId);
    return [...ids];
  }, [expense?.paidBy, splits, currentUserId]);
  const { users } = useUsers(involvedUserIds);
  const { groups } = useGroups();
  const { categories } = useCategories();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const {
    receipt,
    isLoading: isReceiptLoading,
    uploadReceipt,
    isUploading: isUploadingReceipt,
    deleteReceipt,
    isDeleting: isDeletingReceipt,
  } = useReceipt(expense?.id);

  const receiptItemsData = useMemo(() => {
    // 1. If structured items exist on the receipt record, prefer them
    if (receipt?.items && receipt.items.length > 0) {
      return {
        hasItems: true,
        items: receipt.items,
        subtotalMinor: receipt.subtotalMinor,
        taxMinor: receipt.taxMinor,
        discountMinor: receipt.discountMinor,
        tipMinor: receipt.tipMinor,
        serviceChargeMinor: receipt.serviceChargeMinor,
        totalMinor: receipt.totalMinor,
        currency: expense?.originalCurrency,
        userNotes: expense?.notes || undefined,
      };
    }
    // 2. Otherwise fall back to extracting from legacy notes
    return extractReceiptItems(expense?.notes, expense?.originalCurrency);
  }, [
    receipt?.items,
    receipt?.subtotalMinor,
    receipt?.taxMinor,
    receipt?.discountMinor,
    receipt?.tipMinor,
    receipt?.serviceChargeMinor,
    receipt?.totalMinor,
    expense?.notes,
    expense?.originalCurrency,
  ]);

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !expense) return;
    try {
      setAttachError(null);
      const compressed = await compressImageForStorage(file, {
        maxDimension: 1600,
        quality: 0.75,
        outputFileName: file.name,
      });
      await uploadReceipt({
        file: compressed.file,
        originalFilename: file.name,
        width: compressed.width,
        height: compressed.height,
      });
    } catch (err: any) {
      console.error('Failed to attach receipt:', err);
      setAttachError(err?.message || 'Failed to attach receipt image');
    } finally {
      if (attachInputRef.current) {
        attachInputRef.current.value = '';
      }
    }
  };

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

  // A stored conversion snapshot is only shown when it holds a real rate
  const hasRateSnapshot =
    !!expense.reportingCurrency &&
    expense.reportingCurrency.toUpperCase() !== expense.originalCurrency.toUpperCase() &&
    expense.reportingAmountMinor !== undefined &&
    !!expense.exchangeRate &&
    !['identity', 'unavailable'].includes(expense.exchangeRateSource || 'identity');

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
          {receipt && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceiptViewerOpen(true)}
              className="gap-1.5"
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>View Receipt</span>
            </Button>
          )}

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
              {/* Recorded amount is the record; the converted line uses the expense date's rate */}
              <ConvertedAmount
                amountMinor={expense.originalAmountMinor}
                currency={expense.originalCurrency}
                date={expense.expenseDate.slice(0, 10)}
                size="xl"
                className="items-start sm:items-end font-black text-foreground"
              />
              {hasRateSnapshot && (
                <span className="text-xs text-muted-foreground">
                  Saved when recorded: {formatMoney(expense.reportingAmountMinor!, expense.reportingCurrency!)} at 1{' '}
                  {expense.originalCurrency} = {expense.exchangeRate} {expense.reportingCurrency}
                  {expense.exchangeRateDate && ` (rate for ${formatDate(expense.exchangeRateDate, 'd MMM yyyy')})`}
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

          {/* Itemized Receipt Items (if parsed/detected from receipt) */}
          {receiptItemsData.hasItems && (
            <ReceiptItemsList
              items={receiptItemsData.items}
              currency={expense.originalCurrency}
              subtotalMinor={receiptItemsData.subtotalMinor}
              taxMinor={receiptItemsData.taxMinor}
              discountMinor={receiptItemsData.discountMinor}
              tipMinor={receiptItemsData.tipMinor}
              serviceChargeMinor={receiptItemsData.serviceChargeMinor}
              totalMinor={receiptItemsData.totalMinor}
              users={users}
              currentUserId={currentUserId}
            />
          )}

          {/* User Notes if available (excluding receipt raw breakdown) */}
          {receiptItemsData.userNotes && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                <span>Notes & Remarks</span>
              </span>
              <p className="text-sm text-foreground bg-muted/20 p-3.5 rounded-lg border border-border/40 whitespace-pre-wrap">
                {receiptItemsData.userNotes}
              </p>
            </div>
          )}

          {/* Attached Receipt Section */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                <span>Receipt Attachment</span>
              </span>
              {receipt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReceiptViewerOpen(true)}
                  className="text-xs h-7 px-2 gap-1 text-primary hover:text-primary"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Inspect</span>
                </Button>
              )}
            </div>

            {isReceiptLoading ? (
              <div className="h-16 rounded-xl border border-border/40 bg-muted/20 animate-pulse flex items-center px-4 gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ) : receipt ? (
              <div
                onClick={() => setReceiptViewerOpen(true)}
                className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileImage className="h-5 w-5" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {receipt.originalFilename || 'Receipt Image'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(receipt.fileSize / 1024).toFixed(1)} KB • Attached {formatDate(receipt.createdAt, 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs">
                  <Eye className="h-3.5 w-3.5" />
                  <span>View</span>
                </Button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-border/70 bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">No receipt photo attached</p>
                  <p className="text-[11px] text-muted-foreground">
                    Upload or take a photo of the bill to keep with this record.
                  </p>
                </div>
                <div>
                  <input
                    ref={attachInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={handleAttachFile}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => attachInputRef.current?.click()}
                    disabled={isUploadingReceipt}
                    className="gap-1.5 text-xs w-full sm:w-auto h-8"
                  >
                    {isUploadingReceipt ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="h-3.5 w-3.5" />
                        <span>Attach Receipt</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {attachError && (
              <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{attachError}</span>
              </p>
            )}
          </div>

          {/* Participant Shares Breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase tracking-wider">
              Allocation Breakdown
            </h3>

            <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/40">
              {splits.map((split: any) => {
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
              <span>Saved</span>
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

      {/* Receipt Viewer Modal */}
      <ReceiptViewerModal
        isOpen={receiptViewerOpen}
        onClose={() => setReceiptViewerOpen(false)}
        receipt={receipt}
        expenseDescription={expense.description}
        onDeleteReceipt={async () => {
          if (receipt) {
            await deleteReceipt({
              receiptId: receipt.id,
              storagePath: receipt.storagePath,
            });
            setReceiptViewerOpen(false);
          }
        }}
        isDeleting={isDeletingReceipt}
      />
    </div>
  );
}

export default ExpenseDetailPage;
