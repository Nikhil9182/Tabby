import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar as CalendarIcon,
  Users,
  Tag,
  FileText,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Divide,
  Percent,
  PieChart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
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
  useCurrentUser,
  useExpenses,
  useExpense,
  useGroups,
  useGroup,
  useUsers,
  useCategories,
  useCurrency,
} from '@/hooks';
import {
  toMajorUnits,
  toMinorUnits,
  formatMoney,
  parseMoney,
} from '@/domain/money/money';
import {
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit,
  calculateSharesSplit,
  validateSplit,
} from '@/domain/splits/split-calculator';
import type { SplitType, ExpenseSplit } from '@/domain/models/types';
import { cn } from '@/lib/utils';

interface ExpenseFormProps {
  expenseId?: string;
}

const expenseFormSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(200),
  amount: z.string().min(1, 'Amount is required'),
  currency: z.string().trim().length(3).toUpperCase(),
  expenseDate: z.string().min(1, 'Date is required'),
  groupId: z.string().default('personal'),
  categoryId: z.string().optional(),
  paidBy: z.string().min(1, 'Payer is required'),
  notes: z.string().max(500).optional(),
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

export function ExpenseForm({ expenseId: propExpenseId }: ExpenseFormProps) {
  const navigate = useNavigate();
  const routeParams = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const queryGroupId = searchParams.get('groupId');
  const queryFriendId = searchParams.get('friendId');
  const expenseId = propExpenseId || routeParams.id;
  const isEditing = Boolean(expenseId);

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { defaultCurrency } = useCurrency();
  const { createExpense, updateExpense, isCreating, isUpdating } = useExpenses();
  const { expense: existingExpense, splits: existingSplits, isLoading: isLoadingExisting } =
    useExpense(expenseId || '');
  const { groups } = useGroups();
  const { categories } = useCategories();
  const { users } = useUsers();

  // Split state
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([currentUserId]);
  // exact amounts input strings per user
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  // percentage input numbers per user (0-100)
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  // shares input numbers per user (e.g. 1, 2)
  const [shares, setShares] = useState<Record<string, number>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      description: '',
      amount: '',
      currency: defaultCurrency,
      expenseDate: todayStr,
      groupId: queryGroupId || 'personal',
      categoryId: 'cat_other',
      paidBy: currentUserId,
      notes: '',
    },
  });

  const watchedGroupId = watch('groupId');
  const watchedCurrency = watch('currency') || defaultCurrency;
  const watchedAmountStr = watch('amount');

  // Load group members if a group is selected
  const { members: groupMemberships } = useGroup(
    watchedGroupId !== 'personal' ? watchedGroupId : ''
  );

  // Determine eligible participants based on group and existing data
  const availableMembers = useMemo(() => {
    const list: Array<{ id: string; name: string }> = [];

    const isCurrentEntity = (uid: string) =>
      uid === currentUserId ||
      uid === 'user_self' ||
      uid === 'current_user' ||
      (currentUser?.id && uid === currentUser.id) ||
      (currentUser?.googleSub && uid === currentUser.googleSub);

    const resolveMemberName = (uid: string, fallbackUser?: any) => {
      if (isCurrentEntity(uid)) {
        return currentUser?.name ? `${currentUser.name} (You)` : 'You';
      }
      return fallbackUser?.name || fallbackUser?.email || uid;
    };

    // 1. Current user is always added exactly ONCE
    const selfLabel = currentUser?.name ? `${currentUser.name} (You)` : 'You';
    list.push({
      id: currentUserId,
      name: selfLabel,
    });

    // 2. Add other participants
    if (watchedGroupId !== 'personal' && groupMemberships && groupMemberships.length > 0) {
      groupMemberships.forEach((gm) => {
        if (isCurrentEntity(gm.userId)) return;
        const u = users.find((user) => user.id === gm.userId || user.googleSub === gm.userId);
        if (!list.some((m) => m.id === gm.userId)) {
          list.push({
            id: gm.userId,
            name: resolveMemberName(gm.userId, u),
          });
        }
      });
    } else {
      // Personal contacts / friends (excluding current user and any placeholder aliases)
      users.forEach((u) => {
        if (isCurrentEntity(u.id) || (u.googleSub && isCurrentEntity(u.googleSub)) || u.isCurrentUser) {
          return;
        }
        if (!list.some((m) => m.id === u.id)) {
          list.push({
            id: u.id,
            name: resolveMemberName(u.id, u),
          });
        }
      });
    }

    // Always ensure existing expense payer is included if editing
    if (existingExpense?.paidBy && !isCurrentEntity(existingExpense.paidBy)) {
      if (!list.some((m) => m.id === existingExpense.paidBy)) {
        const u = users.find(
          (user) => user.id === existingExpense.paidBy || user.googleSub === existingExpense.paidBy
        );
        list.push({
          id: existingExpense.paidBy,
          name: resolveMemberName(existingExpense.paidBy, u),
        });
      }
    }

    // Ensure any participant from existing expense is included if editing
    if (existingExpense?.participants) {
      existingExpense.participants.forEach((pId) => {
        if (!isCurrentEntity(pId) && !list.some((m) => m.id === pId)) {
          const u = users.find((user) => user.id === pId || user.googleSub === pId);
          list.push({
            id: pId,
            name: resolveMemberName(pId, u),
          });
        }
      });
    }

    // Strictly deduplicate by ID
    const seen = new Set<string>();
    const deduplicated: Array<{ id: string; name: string }> = [];
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }, [watchedGroupId, groupMemberships, users, currentUserId, currentUser, existingExpense]);

  // When group changes, update participants list if not editing
  useEffect(() => {
    if (!isEditing && availableMembers.length > 0) {
      // If a specific friend was selected via query param, select user and that friend
      if (queryFriendId && availableMembers.some((m) => m.id === queryFriendId)) {
        const friendIds = [currentUserId, queryFriendId];
        setSelectedParticipants(friendIds);
        setPercentages({ [currentUserId]: 50, [queryFriendId]: 50 });
        setShares({ [currentUserId]: 1, [queryFriendId]: 1 });
        return;
      }

      const allIds = availableMembers.map((m) => m.id);
      setSelectedParticipants((prev) => {
        if (prev.length === allIds.length && prev.every((id) => allIds.includes(id))) {
          return prev;
        }
        return allIds;
      });

      const equalPct = Math.floor(100 / allIds.length);
      const newPct: Record<string, number> = {};
      const newShares: Record<string, number> = {};
      allIds.forEach((id) => {
        newPct[id] = equalPct;
        newShares[id] = 1;
      });
      setPercentages(newPct);
      setShares(newShares);
    }
  }, [watchedGroupId, isEditing, availableMembers.length, queryFriendId, currentUserId]);

  // Prepopulate if editing (once when expense is loaded)
  const hasPopulatedRef = React.useRef(false);

  useEffect(() => {
    if (isEditing && existingExpense && !hasPopulatedRef.current) {
      hasPopulatedRef.current = true;
      const curr = existingExpense.originalCurrency || defaultCurrency;
      reset({
        description: existingExpense.description,
        amount: toMajorUnits(existingExpense.originalAmountMinor, curr).toString(),
        currency: curr,
        expenseDate: existingExpense.expenseDate.slice(0, 10),
        groupId: existingExpense.groupId || 'personal',
        categoryId: existingExpense.categoryId || 'cat_other',
        paidBy: existingExpense.paidBy,
        notes: existingExpense.notes || '',
      });

      setSplitType(existingExpense.splitType || 'equal');
      setSelectedParticipants(existingExpense.participants || [existingExpense.paidBy]);

      if (existingSplits && existingSplits.length > 0) {
        const exactMap: Record<string, string> = {};
        const pctMap: Record<string, number> = {};
        const shareMap: Record<string, number> = {};

        existingSplits.forEach((s) => {
          exactMap[s.userId] = toMajorUnits(s.shareMinor, curr).toString();
          if (s.percentageBasisPoints !== undefined) {
            pctMap[s.userId] = s.percentageBasisPoints / 100;
          }
          if (s.weight !== undefined) {
            shareMap[s.userId] = s.weight;
          }
        });

        setExactAmounts(exactMap);
        setPercentages(pctMap);
        setShares(shareMap);
      }
    }
  }, [isEditing, existingExpense, existingSplits, defaultCurrency, reset]);

  // Total amount in integer minor units
  const totalAmountMinor = useMemo(() => {
    if (!watchedAmountStr) return 0;
    return parseMoney(watchedAmountStr, watchedCurrency);
  }, [watchedAmountStr, watchedCurrency]);

  // Toggle participant
  const toggleParticipant = (userId: string) => {
    setSelectedParticipants((prev) => {
      if (prev.includes(userId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((id) => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Compute calculated splits and validation status
  const splitCalculation = useMemo(() => {
    if (totalAmountMinor <= 0 || selectedParticipants.length === 0) {
      return {
        splits: [] as ExpenseSplit[],
        allocatedMinor: 0,
        remainingMinor: 0,
        isValid: false,
        error: 'Enter a valid amount greater than 0',
      };
    }

    try {
      if (splitType === 'equal') {
        const splits = calculateEqualSplit(totalAmountMinor, selectedParticipants, watchedCurrency);
        return {
          splits,
          allocatedMinor: totalAmountMinor,
          remainingMinor: 0,
          isValid: true,
        };
      }

      if (splitType === 'exact') {
        let allocated = 0;
        const sharesPayload = selectedParticipants.map((userId) => {
          const raw = exactAmounts[userId] || '0';
          const amtMinor = parseMoney(raw, watchedCurrency);
          allocated += amtMinor;
          return { userId, amountMinor: amtMinor };
        });

        const remaining = totalAmountMinor - allocated;
        const isValid = remaining === 0;

        return {
          splits: sharesPayload.map((s) => ({
            id: '',
            expenseId: '',
            userId: s.userId,
            shareMinor: s.amountMinor,
          })),
          allocatedMinor: allocated,
          remainingMinor: remaining,
          isValid,
          error: !isValid ? `Remaining amount to allocate: ${formatMoney(remaining, watchedCurrency)}` : undefined,
        };
      }

      if (splitType === 'percentage') {
        let totalPct = 0;
        const pctPayload = selectedParticipants.map((userId) => {
          const pct = percentages[userId] ?? 0;
          totalPct += pct;
          return {
            userId,
            basisPoints: Math.round(pct * 100),
          };
        });

        // Sum must be 10000 basis points
        const basisPointsSum = pctPayload.reduce((a, b) => a + b.basisPoints, 0);
        if (basisPointsSum !== 10000) {
          const remainingPct = 100 - totalPct;
          return {
            splits: [],
            allocatedMinor: 0,
            remainingMinor: 0,
            isValid: false,
            error: `Percentages must add up to 100%. Remaining: ${remainingPct.toFixed(1)}%`,
          };
        }

        const splits = calculatePercentageSplit(totalAmountMinor, pctPayload, watchedCurrency);
        return {
          splits,
          allocatedMinor: totalAmountMinor,
          remainingMinor: 0,
          isValid: true,
        };
      }

      if (splitType === 'shares') {
        const sharesPayload = selectedParticipants.map((userId) => ({
          userId,
          weight: Math.max(0, shares[userId] ?? 1),
        }));

        const totalWeight = sharesPayload.reduce((a, b) => a + b.weight, 0);
        if (totalWeight <= 0) {
          return {
            splits: [],
            allocatedMinor: 0,
            remainingMinor: 0,
            isValid: false,
            error: 'Total shares must be greater than zero',
          };
        }

        const splits = calculateSharesSplit(totalAmountMinor, sharesPayload, watchedCurrency);
        return {
          splits,
          allocatedMinor: totalAmountMinor,
          remainingMinor: 0,
          isValid: true,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid split calculation';
      return {
        splits: [],
        allocatedMinor: 0,
        remainingMinor: 0,
        isValid: false,
        error: msg,
      };
    }

    return {
      splits: [],
      allocatedMinor: 0,
      remainingMinor: 0,
      isValid: false,
    };
  }, [
    totalAmountMinor,
    selectedParticipants,
    splitType,
    watchedCurrency,
    exactAmounts,
    percentages,
    shares,
  ]);

  // Form submission
  const onSubmit = async (data: ExpenseFormData) => {
    setSubmitError(null);

    if (totalAmountMinor <= 0) {
      setSubmitError('Please enter a valid expense amount.');
      return;
    }

    if (selectedParticipants.length === 0) {
      setSubmitError('Please select at least one participant.');
      return;
    }

    if (!splitCalculation.isValid) {
      setSubmitError(splitCalculation.error || 'Please balance all split allocations.');
      return;
    }

    const finalSplits = splitCalculation.splits.map((s) => ({
      userId: s.userId,
      shareMinor: s.shareMinor,
      weight: splitType === 'shares' ? shares[s.userId] : undefined,
      percentageBasisPoints: splitType === 'percentage' ? Math.round((percentages[s.userId] || 0) * 100) : undefined,
    }));

    try {
      const isGroup = data.groupId !== 'personal';
      const expenseDateISO = new Date(data.expenseDate).toISOString();

      if (isEditing && expenseId) {
        await updateExpense({
          id: expenseId,
          description: data.description,
          notes: data.notes,
          categoryId: data.categoryId,
          paidBy: data.paidBy,
          groupId: isGroup ? data.groupId : undefined,
          sourceType: isGroup ? 'group' : 'personal',
          sourceId: isGroup ? data.groupId : currentUserId,
          originalAmountMinor: totalAmountMinor,
          originalCurrency: data.currency,
          splitType,
          participants: selectedParticipants,
          expenseDate: expenseDateISO,
          splits: finalSplits,
        });
        navigate(`/expenses/${expenseId}`);
      } else {
        const created = await createExpense({
          description: data.description,
          amountMinor: totalAmountMinor,
          originalAmountMinor: totalAmountMinor,
          currency: data.currency,
          originalCurrency: data.currency,
          paidBy: data.paidBy,
          sourceType: isGroup ? 'group' : 'personal',
          groupId: isGroup ? data.groupId : undefined,
          categoryId: data.categoryId,
          notes: data.notes,
          expenseDate: expenseDateISO,
          splitType,
          participants: selectedParticipants,
          splits: finalSplits,
          createdBy: currentUserId,
        });
        navigate(`/expenses/${created.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save expense';
      setSubmitError(msg);
    }
  };

  const isSubmitting = isCreating || isUpdating;

  if (isEditing && isLoadingExisting) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-16">
        <Skeleton className="h-10 w-48" />
        <Card className="p-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    );
  }

  if (isEditing && !isLoadingExisting && !existingExpense) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold">Expense not found</h2>
        <p className="text-sm text-muted-foreground">The expense you are trying to edit does not exist or was deleted.</p>
        <Button onClick={() => navigate('/expenses')} variant="outline">
          Back to Expenses
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <PageHeader
        title={isEditing ? 'Edit Expense' : 'Add Expense'}
        description={
          isEditing
            ? 'Update the details and splits for this transaction.'
            : 'Record a new personal or group split expense.'
        }
        onBack={() => navigate(-1)}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Core Details Card */}
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base sm:text-lg">Expense Details</CardTitle>
            <CardDescription>
              Basic information about this payment and who covered it.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 space-y-4">
            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description *
              </label>
              <Input
                {...register('description')}
                placeholder="e.g., Dinner at Osteria, Airbnb booking, Groceries"
                className="h-10 text-base"
              />
              {errors.description && (
                <p className="text-xs text-rose-500 font-medium">{errors.description.message}</p>
              )}
            </div>

            {/* Amount & Currency in one row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount *
                </label>
                <div className="relative">
                  <Input
                    {...register('amount')}
                    type="number"
                    step="any"
                    placeholder="0.00"
                    className="h-10 text-lg font-semibold tracking-tight"
                  />
                </div>
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

            {/* Date & Category in one row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Date
                </label>
                <Input
                  {...register('expenseDate')}
                  type="date"
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Category
                </label>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Group & Paid By */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Group / Context
                </label>
                <Controller
                  control={control}
                  name="groupId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Personal or group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personal">Personal Expense</SelectItem>
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

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paid By
                </label>
                <Controller
                  control={control}
                  name="paidBy"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Who paid" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notes (Optional)
              </label>
              <Textarea
                {...register('notes')}
                placeholder="Add receipt details, items breakdown, or notes..."
                className="resize-none h-20 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Split Details Card */}
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base sm:text-lg">Split Method</CardTitle>
                <CardDescription>
                  How should this {formatMoney(totalAmountMinor, watchedCurrency)} be split?
                </CardDescription>
              </div>

              {/* Status pill */}
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border self-start sm:self-auto',
                  splitCalculation.isValid
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                )}
              >
                {splitCalculation.isValid ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Balanced</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>
                      {splitCalculation.remainingMinor !== 0
                        ? `Remaining: ${formatMoney(splitCalculation.remainingMinor, watchedCurrency)}`
                        : 'Unbalanced'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 pt-2 space-y-5">
            {/* Split Type Tabs */}
            <Tabs
              value={splitType}
              onValueChange={(val: any) => setSplitType(val)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-4 w-full h-10">
                <TabsTrigger value="equal" className="text-xs">
                  <Divide className="h-3.5 w-3.5 mr-1" />
                  Equal
                </TabsTrigger>
                <TabsTrigger value="exact" className="text-xs">
                  <DollarSign className="h-3.5 w-3.5 mr-1" />
                  Exact
                </TabsTrigger>
                <TabsTrigger value="percentage" className="text-xs">
                  <Percent className="h-3.5 w-3.5 mr-1" />
                  Percent
                </TabsTrigger>
                <TabsTrigger value="shares" className="text-xs">
                  <PieChart className="h-3.5 w-3.5 mr-1" />
                  Shares
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Participants Selector & Split Allocations */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider">
                  Participants ({selectedParticipants.length})
                </span>
                {availableMembers.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      if (selectedParticipants.length === availableMembers.length) {
                        setSelectedParticipants([currentUserId]);
                      } else {
                        setSelectedParticipants(availableMembers.map((m) => m.id));
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {selectedParticipants.length === availableMembers.length
                      ? 'Select only you'
                      : 'Select all'}
                  </Button>
                )}
              </div>

              <div className="space-y-2.5">
                {availableMembers.map((member) => {
                  const isChecked = selectedParticipants.includes(member.id);
                  const memberSplit = splitCalculation.splits.find((s) => s.userId === member.id);

                  return (
                    <div
                      key={member.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border transition-all text-sm',
                        isChecked
                          ? 'bg-card border-border/80'
                          : 'bg-muted/20 border-transparent opacity-60'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleParticipant(member.id)}
                          id={`p-${member.id}`}
                        />
                        <label
                          htmlFor={`p-${member.id}`}
                          className="font-medium cursor-pointer text-foreground"
                        >
                          {member.name}
                        </label>
                      </div>

                      {/* Split inputs depending on method */}
                      {isChecked && (
                        <div className="flex items-center gap-3">
                          {splitType === 'equal' && (
                            <div className="text-right">
                              <span className="font-semibold">
                                {memberSplit
                                  ? formatMoney(memberSplit.shareMinor, watchedCurrency)
                                  : '₹0.00'}
                              </span>
                            </div>
                          )}

                          {splitType === 'exact' && (
                            <div className="w-32">
                              <Input
                                type="number"
                                step="any"
                                value={exactAmounts[member.id] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setExactAmounts((prev) => ({
                                    ...prev,
                                    [member.id]: val,
                                  }));
                                }}
                                placeholder="0.00"
                                className="h-8 text-right font-mono"
                              />
                            </div>
                          )}

                          {splitType === 'percentage' && (
                            <div className="flex items-center gap-2">
                              <div className="w-20">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={percentages[member.id] ?? ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setPercentages((prev) => ({
                                      ...prev,
                                      [member.id]: val,
                                    }));
                                  }}
                                  placeholder="0"
                                  className="h-8 text-right font-mono"
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">%</span>
                              <span className="text-xs font-semibold w-20 text-right">
                                {memberSplit
                                  ? formatMoney(memberSplit.shareMinor, watchedCurrency)
                                  : '₹0.00'}
                              </span>
                            </div>
                          )}

                          {splitType === 'shares' && (
                            <div className="flex items-center gap-2">
                              <div className="w-16">
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={shares[member.id] ?? 1}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 0;
                                    setShares((prev) => ({
                                      ...prev,
                                      [member.id]: val,
                                    }));
                                  }}
                                  placeholder="1"
                                  className="h-8 text-center font-mono"
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">share(s)</span>
                              <span className="text-xs font-semibold w-20 text-right">
                                {memberSplit
                                  ? formatMoney(memberSplit.shareMinor, watchedCurrency)
                                  : '₹0.00'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {splitCalculation.error && (
                <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{splitCalculation.error}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {submitError && (
          <div className="p-4 text-sm rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            {submitError}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !splitCalculation.isValid}
            className="font-semibold min-w-[120px]"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Expense'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ExpenseForm;
