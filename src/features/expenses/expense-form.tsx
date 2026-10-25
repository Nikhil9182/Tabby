import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCollaboration } from '@/hooks/use-collaboration';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar as CalendarIcon,
  Users,
  UserCheck,
  Tag,
  FileText,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Divide,
  Percent,
  PieChart,
  Camera,
  Sparkles,
  X,
  ReceiptText,
} from 'lucide-react';
import { ReceiptScannerDialog } from '@/components/receipts/receipt-scanner-dialog';
import {
  ReceiptItemsEditor,
  type ReceiptItemRowState,
  type ReceiptItemsEditorState,
} from '@/components/receipts/receipt-items-editor';
import { extractReceiptItems } from '@/domain/receipts/receipt-item-parser';
import { calculateReceiptSplit } from '@/domain/receipts/receipt-split-calculator';
import { generateId } from '@/lib/id';
import { compressImageForStorage } from '@/services/image/image-compression';
import { receiptService } from '@/services/receipts/receipt-service';
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
  useFriends,
  useReceipt,
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
import { currencyService } from '@/services/currency/currency-service';
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
  const expenseId = propExpenseId || routeParams.id;
  const isEditing = Boolean(expenseId);

  const { user: currentUser } = useCurrentUser();
  const currentUserId = currentUser?.id || 'current_user';

  const { defaultCurrency } = useCurrency();
  const { createExpense, updateExpense, isCreating, isUpdating } = useExpenses();
  const { expense: existingExpense, splits: existingSplits, isLoading: isLoadingExisting } =
    useExpense(expenseId || '');
  const { allGroups: groups } = useGroups();
  const { friends: supabaseFriends } = useFriends();
  const { categories } = useCategories();
  const { users } = useUsers();

  const queryFriendId = searchParams.get('friendId') || searchParams.get('queryFriendId');
  const [trackingMode, setTrackingMode] = useState<'direct' | 'group'>(() => {
    if (queryFriendId) return 'direct';
    if (queryGroupId) return 'group';
    return 'direct';
  });
  const [selectedFriendId, setSelectedFriendId] = useState<string>(queryFriendId || '');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(queryGroupId || '');

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

  const queryScan = searchParams.get('scan') === 'true' || searchParams.get('scan') === '1';
  const [isScannerOpen, setIsScannerOpen] = useState(queryScan);

  // Receipt data & structured itemization
  const { receipt, saveReceiptItems } = useReceipt(expenseId || '');
  const [hasReceiptItems, setHasReceiptItems] = useState(false);
  const [receiptItems, setReceiptItems] = useState<ReceiptItemRowState[]>([]);
  const [receiptTaxStr, setReceiptTaxStr] = useState('0');
  const [receiptDiscountStr, setReceiptDiscountStr] = useState('0');
  const [receiptTipStr, setReceiptTipStr] = useState('0');

  // Optional manual receipt attachment
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSubmitError('Please select a JPG, PNG, or WebP receipt image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setSubmitError('Receipt image must be smaller than 15MB.');
      return;
    }
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    setReceiptFile(file);
    setReceiptPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveReceiptFile = () => {
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors, dirtyFields },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      description: '',
      amount: '',
      currency: defaultCurrency,
      expenseDate: todayStr,
      groupId: queryGroupId || 'personal',
      categoryId: '',
      paidBy: currentUserId,
      notes: '',
    },
  });

  const watchedCurrency = watch('currency') || defaultCurrency;
  const watchedAmountStr = watch('amount');
  const watchedCategoryId = watch('categoryId');

  // Default to the "General"/"Other" category once real categories load
  useEffect(() => {
    if (categories.length === 0) return;
    if (watchedCategoryId && categories.some((c) => c.id === watchedCategoryId)) return;
    const fallback = categories.find((c) => /general|other/i.test(c.name)) || categories[0];
    setValue('categoryId', fallback.id);
  }, [categories, watchedCategoryId, setValue]);

  // Load group members if a group is selected
  const { members: groupMemberships } = useGroup(
    trackingMode === 'group' && selectedGroupId ? selectedGroupId : ''
  );

  // The currency balances are reported in: the group's, or the user's display currency
  const contextCurrency =
    (trackingMode === 'group' ? groups.find((g) => g.id === selectedGroupId)?.currency : undefined) || defaultCurrency;

  // Until the user picks a currency themselves, follow the context (never after an amount is typed)
  useEffect(() => {
    if (isEditing || dirtyFields.currency || getValues('amount')) return;
    if (getValues('currency') !== contextCurrency) setValue('currency', contextCurrency);
  }, [isEditing, dirtyFields.currency, contextCurrency, getValues, setValue]);

  // When the transaction currency changes under a typed amount, the number is kept
  // as-is and we say so; converting is an explicit action.
  const [currencyChange, setCurrencyChange] = useState<{ from: string; to: string } | null>(null);
  const [isConvertingAmount, setIsConvertingAmount] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const handleTransactionCurrencyChange = (next: string, onChange: (value: string) => void) => {
    const previous = getValues('currency');
    onChange(next);
    setConvertError(null);
    if (getValues('amount') && previous && previous.toUpperCase() !== next.toUpperCase()) {
      setCurrencyChange({ from: previous.toUpperCase(), to: next.toUpperCase() });
    } else {
      setCurrencyChange(null);
    }
  };

  const convertTypedAmount = async () => {
    if (!currencyChange) return;
    setIsConvertingAmount(true);
    setConvertError(null);
    try {
      const fromMinor = parseMoney(getValues('amount'), currencyChange.from);
      const converted = await currencyService.convertAmount(fromMinor, currencyChange.from, currencyChange.to);
      setValue('amount', String(toMajorUnits(converted.amountMinor, currencyChange.to)), { shouldDirty: true });
      setCurrencyChange(null);
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Exchange rate unavailable');
    } finally {
      setIsConvertingAmount(false);
    }
  };

  /**
   * Snapshot of the expense converted into the context currency at the expense
   * date's rate. No rate → an honest identity snapshot marked 'unavailable'.
   */
  const buildRateSnapshot = async (amountMinor: number, currency: string, expenseDay: string) => {
    const from = currency.toUpperCase();
    const to = contextCurrency.toUpperCase();
    if (from === to) {
      return {
        reportingCurrency: from,
        exchangeRate: 1,
        exchangeRateDate: expenseDay,
        exchangeRateSource: 'identity',
        reportingAmountMinor: amountMinor,
      };
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const converted = await currencyService.convertAmount(amountMinor, from, to, expenseDay < today ? expenseDay : undefined);
      return {
        reportingCurrency: to,
        exchangeRate: converted.quote.rate,
        exchangeRateDate: converted.quote.effectiveDate,
        exchangeRateSource: converted.quote.source === 'cache' ? 'cache' : 'frankfurter',
        reportingAmountMinor: converted.amountMinor,
      };
    } catch {
      return {
        reportingCurrency: from,
        exchangeRate: 1,
        exchangeRateDate: expenseDay,
        exchangeRateSource: 'unavailable',
        reportingAmountMinor: amountMinor,
      };
    }
  };

  // Auto-select first friend or first group if none selected
  useEffect(() => {
    if (!isEditing) {
      if (trackingMode === 'direct' && !selectedFriendId && supabaseFriends.length > 0) {
        setSelectedFriendId(supabaseFriends[0].id);
      } else if (trackingMode === 'group' && !selectedGroupId && groups.length > 0) {
        setSelectedGroupId(groups[0].id);
        setValue('groupId', groups[0].id);
      }
    }
  }, [trackingMode, supabaseFriends, groups, selectedFriendId, selectedGroupId, isEditing, setValue]);

  // Determine eligible participants based on trackingMode and existing data
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
    if (trackingMode === 'direct') {
      if (selectedFriendId && selectedFriendId !== currentUserId) {
        const friend = supabaseFriends.find((f) => f.id === selectedFriendId) || users.find((u) => u.id === selectedFriendId);
        list.push({
          id: selectedFriendId,
          name: resolveMemberName(selectedFriendId, friend),
        });
      }
    } else {
      // Group mode
      groupMemberships.forEach((gm) => {
        if (gm.status && gm.status !== 'active') return;
        if (isCurrentEntity(gm.userId)) return;
        const u = users.find((user) => user.id === gm.userId || user.googleSub === gm.userId);
        if (!list.some((m) => m.id === gm.userId)) {
          list.push({
            id: gm.userId,
            name: resolveMemberName(gm.userId, u),
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
      existingExpense.participants.forEach((pId: string) => {
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
  }, [trackingMode, selectedFriendId, supabaseFriends, groupMemberships, users, currentUserId, currentUser, existingExpense]);

  // When the set of available members changes, update participants list if not editing.
  // Keyed on the ids (not the array) so a re-render with the same members doesn't reset state.
  const availableMemberIdsKey = availableMembers.map((m) => m.id).join(',');

  useEffect(() => {
    if (!isEditing && availableMemberIdsKey) {
      const allIds = availableMemberIdsKey.split(',');
      setSelectedParticipants(allIds);

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
  }, [availableMemberIdsKey, isEditing]);

  // Prepopulate if editing (once when expense is loaded)
  const hasPopulatedRef = React.useRef(false);

  useEffect(() => {
    if (isEditing && existingExpense && !hasPopulatedRef.current) {
      hasPopulatedRef.current = true;
      const isDirectExp =
        existingExpense.contextType === 'direct' ||
        existingExpense.sourceType === 'direct' ||
        (!existingExpense.groupId && !!existingExpense.friendId);

      if (isDirectExp) {
        setTrackingMode('direct');
        const otherParticipant =
          existingExpense.friendId ||
          existingExpense.participants?.find((p) => p !== currentUserId) ||
          '';
        setSelectedFriendId(otherParticipant);
      } else {
        setTrackingMode('group');
        if (existingExpense.groupId) {
          setSelectedGroupId(existingExpense.groupId);
        }
      }

      const curr = existingExpense.originalCurrency || defaultCurrency;

      // Extract receipt items from receipt store or legacy notes
      const parsedFromNotes = extractReceiptItems(existingExpense.notes, curr);
      const itemsSource =
        receipt?.items && receipt.items.length > 0
          ? receipt.items
          : parsedFromNotes.hasItems
          ? parsedFromNotes.items
          : null;

      let cleanNotes = existingExpense.notes || '';
      if (itemsSource && itemsSource.length > 0) {
        setHasReceiptItems(true);
        setReceiptItems(
          itemsSource.map((it) => ({
            id: it.id || generateId(),
            name: it.name,
            quantity: it.quantity,
            lineTotalStr: toMajorUnits(it.lineTotalMinor, curr).toString(),
            assignedUserIds:
              it.assignedUserIds && it.assignedUserIds.length > 0
                ? it.assignedUserIds
                : existingExpense.participants || [currentUserId],
          }))
        );
        const taxMinor = receipt?.taxMinor ?? parsedFromNotes.taxMinor ?? 0;
        const discountMinor = receipt?.discountMinor ?? parsedFromNotes.discountMinor ?? 0;
        const tipMinor = receipt?.tipMinor ?? parsedFromNotes.tipMinor ?? 0;

        setReceiptTaxStr(taxMinor > 0 ? toMajorUnits(taxMinor, curr).toString() : '0');
        setReceiptDiscountStr(discountMinor > 0 ? toMajorUnits(discountMinor, curr).toString() : '0');
        setReceiptTipStr(tipMinor > 0 ? toMajorUnits(tipMinor, curr).toString() : '0');

        // Clean user notes (exclude raw items text)
        cleanNotes = parsedFromNotes.userNotes || '';
      }

      reset({
        description: existingExpense.description,
        amount: toMajorUnits(existingExpense.originalAmountMinor, curr).toString(),
        currency: curr,
        expenseDate: existingExpense.expenseDate.slice(0, 10),
        groupId: existingExpense.groupId || 'personal',
        categoryId: existingExpense.categoryId || '',
        paidBy: existingExpense.paidBy,
        notes: cleanNotes,
      });

      setSplitType(existingExpense.splitType || 'equal');
      setSelectedParticipants(existingExpense.participants || [existingExpense.paidBy]);

      if (existingSplits && existingSplits.length > 0) {
        const exactMap: Record<string, string> = {};
        const pctMap: Record<string, number> = {};
        const shareMap: Record<string, number> = {};

        existingSplits.forEach((s: any) => {
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
  }, [isEditing, existingExpense, existingSplits, defaultCurrency, reset, receipt, currentUserId]);

  // Catch receipt items if receipt query resolves after initial expense load
  useEffect(() => {
    if (isEditing && receipt?.items && receipt.items.length > 0 && receiptItems.length === 0) {
      const curr = existingExpense?.originalCurrency || defaultCurrency;
      setHasReceiptItems(true);
      setReceiptItems(
        receipt.items.map((it) => ({
          id: it.id || generateId(),
          name: it.name,
          quantity: it.quantity,
          lineTotalStr: toMajorUnits(it.lineTotalMinor, curr).toString(),
          assignedUserIds:
            it.assignedUserIds && it.assignedUserIds.length > 0
              ? it.assignedUserIds
              : existingExpense?.participants || [currentUserId],
        }))
      );
      if (receipt.taxMinor) setReceiptTaxStr(toMajorUnits(receipt.taxMinor, curr).toString());
      if (receipt.discountMinor) setReceiptDiscountStr(toMajorUnits(receipt.discountMinor, curr).toString());
      if (receipt.tipMinor) setReceiptTipStr(toMajorUnits(receipt.tipMinor, curr).toString());
    }
  }, [isEditing, receipt, existingExpense, defaultCurrency, receiptItems.length, currentUserId]);

  // Handle changes in the itemized receipt editor
  const handleReceiptEditorChange = (updated: ReceiptItemsEditorState) => {
    setReceiptItems(updated.items);
    setReceiptTaxStr(updated.taxStr);
    setReceiptDiscountStr(updated.discountStr);
    setReceiptTipStr(updated.tipStr);

    let subtotal = 0;
    const convertedItems = updated.items.map((it) => {
      const lineMinor = parseMoney(it.lineTotalStr || '0', watchedCurrency);
      subtotal += lineMinor;
      return {
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        lineTotalMinor: lineMinor,
        unitPriceMinor: it.quantity > 1 ? Math.round(lineMinor / it.quantity) : lineMinor,
        assignedUserIds: it.assignedUserIds,
      };
    });

    const taxMinor = parseMoney(updated.taxStr || '0', watchedCurrency);
    const discountMinor = parseMoney(updated.discountStr || '0', watchedCurrency);
    const tipMinor = parseMoney(updated.tipStr || '0', watchedCurrency);
    const newTotalMinor = Math.max(0, subtotal + taxMinor + tipMinor - discountMinor);

    // Sync form total amount
    setValue('amount', String(toMajorUnits(newTotalMinor, watchedCurrency)), { shouldDirty: true });

    // Recalculate participant shares if split is exact / item-assigned
    if (selectedParticipants.length > 0) {
      const assignmentsMap: Record<string, string[]> = {};
      convertedItems.forEach((it) => {
        assignmentsMap[it.id] =
          it.assignedUserIds && it.assignedUserIds.length > 0
            ? it.assignedUserIds
            : selectedParticipants;
      });

      try {
        const splitRecalc = calculateReceiptSplit({
          mode: splitType === 'equal' ? 'equal' : 'items',
          totalMinor: newTotalMinor,
          items: convertedItems,
          assignments: assignmentsMap,
          participantIds: selectedParticipants,
          taxMinor,
          discountMinor,
          tipMinor,
          currency: watchedCurrency,
        });

        if (splitType === 'exact') {
          const newExact: Record<string, string> = {};
          splitRecalc.shares.forEach((share) => {
            newExact[share.userId] = toMajorUnits(share.totalShareMinor, watchedCurrency).toString();
          });
          setExactAmounts(newExact);
        }
      } catch {
        // Fallback
      }
    }
  };

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
    if (data.paidBy === 'current_user' || data.paidBy === 'user_self') data.paidBy = currentUserId;

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

    const uploadReceiptIfPresent = async (targetExpenseId: string) => {
      if (!receiptFile || !targetExpenseId) return;
      try {
        const compressed = await compressImageForStorage(receiptFile, {
          maxDimension: 1600,
          quality: 0.75,
          outputFileName: receiptFile.name,
        });
        await receiptService.uploadReceiptAttachment({
          expenseId: targetExpenseId,
          file: compressed.file,
          originalFilename: receiptFile.name,
        });
      } catch (receiptErr) {
        console.error('Failed to attach receipt to expense:', receiptErr);
      }
    };

    const saveReceiptItemsIfPresent = async (targetExpenseId: string) => {
      if (!hasReceiptItems || receiptItems.length === 0 || !targetExpenseId) return;
      try {
        const convertedItems = receiptItems.map((it) => {
          const lineMinor = parseMoney(it.lineTotalStr || '0', data.currency);
          return {
            id: it.id,
            name: it.name,
            quantity: it.quantity,
            lineTotalMinor: lineMinor,
            unitPriceMinor:
              it.quantity > 1
                ? Math.round(lineMinor / it.quantity)
                : lineMinor,
            assignedUserIds: it.assignedUserIds,
          };
        });

        await receiptService.saveReceiptItems({
          expenseId: targetExpenseId,
          items: convertedItems,
          taxMinor: parseMoney(receiptTaxStr || '0', data.currency),
          discountMinor: parseMoney(receiptDiscountStr || '0', data.currency),
          tipMinor: parseMoney(receiptTipStr || '0', data.currency),
          totalMinor: totalAmountMinor,
          currency: data.currency,
        });
      } catch (err) {
        console.error('Failed to save receipt items:', err);
      }
    };

    try {
      let expenseDateISO: string;
      try {
        const d = new Date(data.expenseDate);
        expenseDateISO = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      } catch {
        expenseDateISO = new Date().toISOString();
      }
      const rateSnapshot = await buildRateSnapshot(totalAmountMinor, data.currency, data.expenseDate.slice(0, 10));

      if (trackingMode === 'direct') {
        if (!selectedFriendId) {
          setSubmitError('Please select a friend for this direct expense.');
          return;
        }

        const directParticipants = [currentUserId, selectedFriendId];

        if (isEditing && expenseId) {
          await updateExpense({
            id: expenseId,
            description: data.description,
            notes: data.notes,
            categoryId: data.categoryId,
            paidBy: data.paidBy,
            groupId: undefined,
            sourceType: 'direct',
            sourceId: selectedFriendId,
            originalAmountMinor: totalAmountMinor,
            originalCurrency: data.currency,
            ...rateSnapshot,
            splitType,
            participants: directParticipants,
            expenseDate: expenseDateISO,
            splits: finalSplits,
          });
          await uploadReceiptIfPresent(expenseId);
          await saveReceiptItemsIfPresent(expenseId);
          navigate(`/friends?friendId=${selectedFriendId}`);
        } else {
          const created = await createExpense({
            description: data.description,
            amountMinor: totalAmountMinor,
            originalAmountMinor: totalAmountMinor,
            currency: data.currency,
            originalCurrency: data.currency,
            ...rateSnapshot,
            paidBy: data.paidBy,
            sourceType: 'direct',
            contextType: 'direct',
            friendId: selectedFriendId,
            categoryId: data.categoryId,
            notes: data.notes,
            expenseDate: expenseDateISO,
            splitType,
            participants: directParticipants,
            splits: finalSplits,
            createdBy: currentUserId,
          });
          if (created?.id) {
            await uploadReceiptIfPresent(created.id);
            await saveReceiptItemsIfPresent(created.id);
          }
          navigate(`/friends?friendId=${selectedFriendId}`);
        }
      } else {
        // Group mode
        if (!selectedGroupId || selectedGroupId === 'personal') {
          setSubmitError('Please select a group for this group expense.');
          return;
        }

        if (isEditing && expenseId) {
          await updateExpense({
            id: expenseId,
            description: data.description,
            notes: data.notes,
            categoryId: data.categoryId,
            paidBy: data.paidBy,
            groupId: selectedGroupId,
            sourceType: 'group',
            sourceId: selectedGroupId,
            originalAmountMinor: totalAmountMinor,
            originalCurrency: data.currency,
            ...rateSnapshot,
            splitType,
            participants: selectedParticipants,
            expenseDate: expenseDateISO,
            splits: finalSplits,
          });
          await uploadReceiptIfPresent(expenseId);
          await saveReceiptItemsIfPresent(expenseId);
          navigate(`/groups/${selectedGroupId}`);
        } else {
          const created = await createExpense({
            description: data.description,
            amountMinor: totalAmountMinor,
            originalAmountMinor: totalAmountMinor,
            currency: data.currency,
            originalCurrency: data.currency,
            ...rateSnapshot,
            paidBy: data.paidBy,
            sourceType: 'group',
            contextType: 'group',
            groupId: selectedGroupId,
            categoryId: data.categoryId,
            notes: data.notes,
            expenseDate: expenseDateISO,
            splitType,
            participants: selectedParticipants,
            splits: finalSplits,
            createdBy: currentUserId,
          });
          if (created?.id) {
            await uploadReceiptIfPresent(created.id);
            await saveReceiptItemsIfPresent(created.id);
          }
          navigate(`/groups/${selectedGroupId}`);
        }
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
        action={
          !isEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsScannerOpen(true)}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/5 shadow-2xs font-semibold"
            >
              <Camera className="h-4 w-4" />
              <span>Scan Receipt</span>
            </Button>
          )
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Quick Scan Receipt Banner */}
        {!isEditing && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-primary/30 bg-primary/5 text-xs shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-xs sm:text-sm">Have a paper or digital receipt?</p>
                <p className="text-muted-foreground text-[11px] sm:text-xs">
                  Scan receipt photo to automatically extract itemized lines, taxes, and split the bill.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="xs"
              onClick={() => setIsScannerOpen(true)}
              className="shrink-0 gap-1.5 font-semibold self-start sm:self-auto h-8 px-3"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Scan Receipt</span>
            </Button>
          </div>
        )}
        {/* Core Details Card */}
        <Card className="border-border/60 shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base sm:text-lg">Expense Details</CardTitle>
            <CardDescription>
              Basic information about this payment and who covered it.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-2 space-y-4">
            {/* Tracking Mode: Direct with Friend vs In a Group */}
            {!isEditing && (
              <div className="space-y-1.5 pb-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Split Context
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-muted/40 border border-border/60">
                  <button
                    type="button"
                    onClick={() => {
                      setTrackingMode('direct');
                      if (!selectedFriendId && supabaseFriends.length > 0) {
                        setSelectedFriendId(supabaseFriends[0].id);
                      }
                    }}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all',
                      trackingMode === 'direct'
                        ? 'bg-card text-foreground shadow-xs border border-border/80'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <UserCheck className="h-4 w-4 text-emerald-500" />
                    <span>With a Friend</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrackingMode('group');
                      if (!selectedGroupId && groups.length > 0) {
                        setSelectedGroupId(groups[0].id);
                        setValue('groupId', groups[0].id);
                      }
                    }}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all',
                      trackingMode === 'group'
                        ? 'bg-card text-foreground shadow-xs border border-border/80'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Users className="h-4 w-4 text-primary" />
                    <span>In a Group</span>
                  </button>
                </div>
              </div>
            )}

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
                      onChange={(next) => handleTransactionCurrencyChange(next, field.onChange)}
                    />
                  )}
                />
              </div>
            </div>

            {currencyChange && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <span>
                  Currency changed from {currencyChange.from}. The amount was kept as {watchedAmountStr} {currencyChange.to}, not converted.
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={convertTypedAmount}
                    disabled={isConvertingAmount}
                  >
                    {isConvertingAmount ? 'Converting…' : `Convert from ${currencyChange.from}`}
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setCurrencyChange(null)}>
                    Keep
                  </Button>
                </span>
                {convertError && <span className="w-full text-rose-600 dark:text-rose-400">{convertError}</span>}
              </div>
            )}

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

            {/* Context Participant/Group & Paid By */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {trackingMode === 'direct' ? 'Split With Friend *' : 'Group *'}
                </label>
                {trackingMode === 'direct' ? (
                  <Select
                    value={selectedFriendId}
                    onValueChange={(val) => setSelectedFriendId(val)}
                    disabled={isEditing || Boolean(queryFriendId)}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Choose a friend" />
                    </SelectTrigger>
                    <SelectContent>
                      {supabaseFriends.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground text-center">
                          No friends added yet.
                        </div>
                      ) : (
                        supabaseFriends.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name || f.email}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={selectedGroupId}
                    onValueChange={(val) => {
                      setSelectedGroupId(val);
                      setValue('groupId', val);
                    }}
                    disabled={isEditing || Boolean(queryGroupId)}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Choose a group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground text-center">
                          No groups created yet.
                        </div>
                      ) : (
                        groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
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
                placeholder="Add any remarks or personal notes..."
                className="resize-none h-20 text-sm"
              />
            </div>

            {/* Receipt Image Attachment (Optional) */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" />
                  <span>Attach Receipt Image (Optional)</span>
                </label>
                {receiptPreviewUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleRemoveReceiptFile}
                    className="h-6 text-xs text-rose-500 hover:text-rose-600 gap-1 px-2"
                  >
                    <X className="h-3 w-3" />
                    <span>Remove</span>
                  </Button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={handleReceiptFileChange}
              />

              {receiptPreviewUrl && receiptFile ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20">
                  <div className="h-14 w-14 rounded-lg overflow-hidden border border-border/60 bg-black/5 shrink-0 relative">
                    <img
                      src={receiptPreviewUrl}
                      alt="Receipt preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="font-medium text-xs truncate text-foreground">
                      {receiptFile.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {(receiptFile.size / 1024).toFixed(1)} KB • Will be saved with this expense
                    </p>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full gap-2 border-dashed h-10 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Camera className="h-4 w-4" />
                  <span>Choose or capture receipt photo</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Receipt Items & Breakdown Editor */}
        {hasReceiptItems ? (
          <ReceiptItemsEditor
            items={receiptItems}
            taxStr={receiptTaxStr}
            discountStr={receiptDiscountStr}
            tipStr={receiptTipStr}
            currency={watchedCurrency}
            participants={availableMembers}
            currentUserId={currentUserId}
            onChange={handleReceiptEditorChange}
            onRemoveReceiptSection={() => setHasReceiptItems(false)}
          />
        ) : (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setHasReceiptItems(true);
                setReceiptItems([
                  {
                    id: generateId(),
                    name: '',
                    quantity: 1,
                    lineTotalStr: watchedAmountStr || '',
                    assignedUserIds: selectedParticipants,
                  },
                ]);
              }}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8"
            >
              <ReceiptText className="h-3.5 w-3.5" />
              <span>Add Itemized Receipt Items</span>
            </Button>
          </div>
        )}

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
              <TabsList className="w-full [&_svg]:hidden sm:[&_svg]:block">
                <TabsTrigger value="equal" className="text-xs">
                  <Divide className="h-3.5 w-3.5" />
                  Equal
                </TabsTrigger>
                <TabsTrigger value="exact" className="text-xs">
                  <DollarSign className="h-3.5 w-3.5" />
                  Exact
                </TabsTrigger>
                <TabsTrigger value="percentage" className="text-xs">
                  <Percent className="h-3.5 w-3.5" />
                  Percent
                </TabsTrigger>
                <TabsTrigger value="shares" className="text-xs">
                  <PieChart className="h-3.5 w-3.5" />
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
                        'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg border transition-all text-sm',
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
                          className="min-w-0 break-words font-medium cursor-pointer text-foreground"
                        >
                          {member.name}
                        </label>
                      </div>

                      {/* Split inputs depending on method */}
                      {isChecked && (
                        <div className="flex flex-wrap justify-end items-center gap-3">
                          {splitType === 'equal' && (
                            <div className="text-right">
                              <span className="font-semibold">
                                {memberSplit
                                  ? formatMoney(memberSplit.shareMinor, watchedCurrency)
                                  : formatMoney(0, watchedCurrency)}
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
                                  : formatMoney(0, watchedCurrency)}
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
                                  : formatMoney(0, watchedCurrency)}
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

      {/* Receipt Scanner Modal */}
      {!isEditing && (
        <ReceiptScannerDialog
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          contextType={trackingMode}
          friendId={selectedFriendId}
          groupId={selectedGroupId}
          defaultCurrency={defaultCurrency}
          contextCurrency={contextCurrency}
          participants={availableMembers}
          currentUserId={currentUserId}
          paidBy={watch('paidBy') || currentUserId}
          categoryId={watch('categoryId')}
        />
      )}
    </div>
  );
}

export default ExpenseForm;
