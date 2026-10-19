import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Users,
  Calendar,
  FileText,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout/page-header';
import { CurrencySelector } from '@/components/currency/currency-selector';
import { CurrencyDisplay } from '@/components/currency/currency-display';
import {
  useSettlements,
  useCurrentUser,
  useUsers,
  useGroups,
  useExpenses,
  useCurrency,
} from '@/hooks';
import { calculatePairwiseBalance } from '@/domain/balances/balance-engine';
import { toMajorUnits, parseMoney, formatMoney } from '@/domain/money/money';
import type { ExpenseSplit } from '@/domain/models/types';
import { cn } from '@/lib/utils';

const settlementFormSchema = z
  .object({
    groupId: z.string().optional(),
    fromUserId: z.string().min(1, 'Payer is required'),
    toUserId: z.string().min(1, 'Recipient is required'),
    amount: z.string().min(1, 'Amount is required'),
    currency: z.string().trim().length(3).toUpperCase(),
    settlementDate: z.string().min(1, 'Date is required'),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.fromUserId !== data.toUserId, {
    message: 'Payer and recipient cannot be the same person',
    path: ['toUserId'],
  });

type SettlementFormData = z.infer<typeof settlementFormSchema>;

export function SettlementForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const paramGroupId = searchParams.get('groupId') || '';
  const paramFrom = searchParams.get('from') || '';
  const paramTo = searchParams.get('to') || '';
  const paramAmountMinor = searchParams.get('amount') ? parseInt(searchParams.get('amount')!, 10) : undefined;

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { defaultCurrency } = useCurrency();
  const { recordSettlement, isRecording } = useSettlements();
  const { users } = useUsers();
  const { groups } = useGroups();
  const { expenses, splits } = useExpenses();
  const { settlements } = useSettlements();

  const [submitError, setSubmitError] = useState<string | null>(null);

  const allSplitsList = useMemo(() => {
    return Object.values(splits).flat() as ExpenseSplit[];
  }, [splits]);

  const initialAmount = useMemo(() => {
    if (paramAmountMinor && paramAmountMinor > 0) {
      return toMajorUnits(paramAmountMinor, defaultCurrency).toString();
    }
    return '';
  }, [paramAmountMinor, defaultCurrency]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SettlementFormData>({
    resolver: zodResolver(settlementFormSchema),
    defaultValues: {
      groupId: paramGroupId || 'none',
      fromUserId: paramFrom || currentUserId,
      toUserId: paramTo || '',
      amount: initialAmount,
      currency: defaultCurrency,
      settlementDate: todayStr,
      notes: '',
    },
  });

  const watchedFrom = watch('fromUserId');
  const watchedTo = watch('toUserId');
  const watchedCurrency = watch('currency') || defaultCurrency;
  const watchedAmountStr = watch('amount');
  const watchedGroupId = watch('groupId');

  const parsedAmountMinor = useMemo(() => {
    if (!watchedAmountStr) return 0;
    return parseMoney(watchedAmountStr, watchedCurrency);
  }, [watchedAmountStr, watchedCurrency]);

  // Compute current debt between From and To
  const currentDebtInfo = useMemo(() => {
    if (!watchedFrom || !watchedTo || watchedFrom === watchedTo) {
      return null;
    }

    const pb = calculatePairwiseBalance(
      watchedFrom,
      watchedTo,
      expenses,
      allSplitsList,
      settlements,
      watchedCurrency
    );

    // If pb.fromUserId === watchedFrom, watchedFrom owes watchedTo pb.amountMinor
    const owesMinor = pb.fromUserId === watchedFrom ? pb.amountMinor : -pb.amountMinor;
    return {
      currentOwedMinor: owesMinor,
      remainingAfterPaymentMinor: owesMinor - parsedAmountMinor,
    };
  }, [watchedFrom, watchedTo, expenses, allSplitsList, settlements, watchedCurrency, parsedAmountMinor]);

  const onSubmit = async (data: SettlementFormData) => {
    setSubmitError(null);

    if (parsedAmountMinor <= 0) {
      setSubmitError('Please enter a valid settlement amount.');
      return;
    }

    try {
      const settlementDateISO = new Date(data.settlementDate).toISOString();
      const actualGroupId = data.groupId && data.groupId !== 'none' ? data.groupId : undefined;

      await recordSettlement({
        groupId: actualGroupId,
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
        amountMinor: parsedAmountMinor,
        currency: data.currency,
        settlementDate: settlementDateISO,
        notes: data.notes,
        createdBy: currentUserId,
      });

      if (actualGroupId) {
        navigate(`/groups/${actualGroupId}`);
      } else {
        navigate('/settlements');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record settlement';
      setSubmitError(msg);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-16">
      <PageHeader
        title="Record Settlement"
        description="Log a payment made from one member to another to settle debts."
        onBack={() => navigate(-1)}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base sm:text-lg">Payment Details</CardTitle>
            <CardDescription>
              Select who paid and who received the money.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 space-y-5">
            {/* From -> To Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
              {/* From (Payer) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Payer (From) *
                </label>
                <Controller
                  control={control}
                  name="fromUserId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Who paid" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.id === currentUserId ? 'You' : u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.fromUserId && (
                  <p className="text-xs text-rose-500 font-medium">{errors.fromUserId.message}</p>
                )}
              </div>

              {/* To (Recipient) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recipient (To) *
                </label>
                <Controller
                  control={control}
                  name="toUserId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Who received" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.id === currentUserId ? 'You' : u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.toUserId && (
                  <p className="text-xs text-rose-500 font-medium">{errors.toUserId.message}</p>
                )}
              </div>
            </div>

            {/* Amount & Currency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount *
                </label>
                <Input
                  {...register('amount')}
                  type="number"
                  step="any"
                  placeholder="0.00"
                  className="h-10 text-lg font-semibold tracking-tight"
                />
                {errors.amount && (
                  <p className="text-xs text-rose-500 font-medium">{errors.amount.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Currency
                </label>
                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <CurrencySelector
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            {/* Date & Group */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Date
                </label>
                <Input
                  {...register('settlementDate')}
                  type="date"
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Group Association
                </label>
                <Controller
                  control={control}
                  name="groupId"
                  render={({ field }) => (
                    <Select value={field.value || 'none'} onValueChange={field.onChange}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Select group (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">General / No Group</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payment Method / Notes
              </label>
              <Textarea
                {...register('notes')}
                placeholder="e.g. Venmo transfer, Cash paid, UPI #123456"
                className="resize-none h-16 text-sm"
              />
            </div>

            {/* Dynamic Balance Impact Preview */}
            {currentDebtInfo && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Balance Impact Preview
                </span>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current balance:</span>
                  <span className="font-medium">
                    {currentDebtInfo.currentOwedMinor > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400">
                        Payer owes {formatMoney(currentDebtInfo.currentOwedMinor, watchedCurrency)}
                      </span>
                    ) : currentDebtInfo.currentOwedMinor < 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Recipient owes {formatMoney(Math.abs(currentDebtInfo.currentOwedMinor), watchedCurrency)}
                      </span>
                    ) : (
                      'Settled up'
                    )}
                  </span>
                </div>

                {parsedAmountMinor > 0 && (
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">After this payment:</span>
                    <span className="font-bold">
                      {currentDebtInfo.remainingAfterPaymentMinor === 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Fully Settled!</span>
                        </span>
                      ) : currentDebtInfo.remainingAfterPaymentMinor > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          Payer still owes {formatMoney(currentDebtInfo.remainingAfterPaymentMinor, watchedCurrency)}
                        </span>
                      ) : (
                        <span className="text-indigo-600 dark:text-indigo-400">
                          Recipient will owe {formatMoney(Math.abs(currentDebtInfo.remainingAfterPaymentMinor), watchedCurrency)}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {submitError && (
          <div className="p-4 text-sm rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            {submitError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={isRecording}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isRecording || parsedAmountMinor <= 0}
            className="font-semibold min-w-[130px]"
          >
            {isRecording ? 'Recording...' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default SettlementForm;
