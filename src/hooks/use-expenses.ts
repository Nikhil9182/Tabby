import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type {
  Expense,
  ExpenseSplit,
  SourceType,
  SplitType,
} from '@/domain/models/types';
import { expenseService, type UnifiedExpense } from '@/services/supabase/expense-service';

export interface ExpenseFilters {
  sourceType?: SourceType;
  contextType?: 'personal' | 'group' | 'direct';
  groupId?: string;
  friendId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
  paidBy?: string;
  userId?: string;
}

export interface ExpenseSplitInput {
  userId: string;
  shareMinor: number;
  weight?: number;
  percentageBasisPoints?: number;
}

export interface CreateExpenseInput {
  title?: string;
  description?: string;
  amountMinor?: number;
  originalAmountMinor?: number;
  currency?: string;
  originalCurrency?: string;
  reportingCurrency?: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  reportingAmountMinor?: number;
  paidBy: string;
  sourceType?: SourceType;
  contextType?: 'personal' | 'group' | 'direct';
  sourceId?: string;
  groupId?: string;
  friendId?: string;
  categoryId?: string;
  notes?: string;
  expenseDate?: string;
  splitType?: SplitType;
  participants?: string[];
  splits: ExpenseSplitInput[];
  createdBy?: string;
}

export interface UpdateExpenseInput {
  id: string;
  description?: string;
  notes?: string;
  categoryId?: string;
  paidBy?: string;
  groupId?: string;
  sourceType?: SourceType;
  sourceId?: string;
  originalAmountMinor?: number;
  originalCurrency?: string;
  /** Conversion snapshot, recomputed whenever amount, currency or date change. */
  reportingCurrency?: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  reportingAmountMinor?: number;
  splitType?: SplitType;
  participants?: string[];
  expenseDate?: string;
  splits?: ExpenseSplitInput[];
}

export const expenseSplitInputSchema = z.object({
  userId: z.string().min(1, 'Participant user ID is required'),
  shareMinor: z.number().int('Share amount must be an integer in minor units'),
  weight: z.number().positive().optional(),
  percentageBasisPoints: z.number().int().min(0).max(10000).optional(),
});

export const createExpenseInputSchema = z.object({
  description: z.string().trim().min(1, 'Expense description or title is required'),
  amountMinor: z.number().int().positive('Amount must be positive integer minor units'),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  paidBy: z.string().min(1, 'Payer user ID is required'),
  sourceType: z.enum(['personal', 'group', 'direct']).default('personal'),
  contextType: z.enum(['personal', 'group', 'direct']).optional(),
  sourceId: z.string().optional(),
  groupId: z.string().optional(),
  friendId: z.string().optional(),
  categoryId: z.string().optional(),
  notes: z.string().optional(),
  expenseDate: z.string().min(1, 'Expense date is required'),
  splitType: z.enum(['equal', 'exact', 'percentage', 'shares']).default('equal'),
  participants: z.array(z.string()).min(1, 'At least one participant is required'),
  splits: z.array(expenseSplitInputSchema).min(1, 'At least one split is required'),
  createdBy: z.string().optional(),
});

export interface UseExpensesResult {
  expenses: Expense[];
  splits: Record<string, ExpenseSplit[]>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  createExpense: (input: CreateExpenseInput) => Promise<Expense>;
  updateExpense: (input: UpdateExpenseInput) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

export function useExpenses(filters?: ExpenseFilters): UseExpensesResult {
  const queryClient = useQueryClient();
  const queryKey = ['expenses', filters];

  // Fetch expenses from Supabase
  const {
    data: expensesData = [],
    isLoading: isLoadingExpenses,
    error: expensesError,
    refetch,
  } = useQuery<UnifiedExpense[], Error>({
    queryKey,
    queryFn: async () => {
      return await expenseService.getExpenses({
        groupId: filters?.groupId,
        friendId: filters?.friendId,
        sourceType: filters?.sourceType,
        contextType: filters?.contextType,
        categoryId: filters?.categoryId,
        paidBy: filters?.paidBy,
        startDate: filters?.dateFrom,
        endDate: filters?.dateTo,
        searchQuery: filters?.searchQuery,
      });
    },
  });

  const expenses: Expense[] = expensesData.map((e) => ({
    id: e.id,
    sourceType: e.sourceType,
    contextType: e.contextType,
    sourceId: e.sourceId,
    groupId: e.groupId,
    friendshipId: e.friendshipId,
    friendId: e.friendId,
    description: e.description,
    notes: e.notes,
    categoryId: e.categoryId,
    paidBy: e.paidBy,
    originalAmountMinor: e.originalAmountMinor,
    amountMinor: e.amountMinor,
    originalCurrency: e.originalCurrency,
    currency: e.currency,
    reportingCurrency: e.reportingCurrency,
    exchangeRate: e.exchangeRate,
    exchangeRateDate: e.exchangeRateDate,
    exchangeRateSource: e.exchangeRateSource,
    reportingAmountMinor: e.reportingAmountMinor,
    splitType: e.splitType,
    participants: e.participants,
    expenseDate: e.expenseDate,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    createdBy: e.createdBy,
    deletedAt: e.deletedAt,
  }));

  // Fetch splits for currently loaded expenses from Supabase
  const { data: rawSplits = {} } = useQuery<Record<string, ExpenseSplit[]>>({
    queryKey: ['expenses-splits', expenses.map((e) => e.id).sort().join(',')],
    queryFn: async () => {
      if (expenses.length === 0) return {};
      const expenseIds = expenses.map((e) => e.id);
      const dbSplits = await expenseService.getSplitsForExpenses(expenseIds);
      const mapped: Record<string, ExpenseSplit[]> = {};

      for (const [expId, list] of Object.entries(dbSplits)) {
        mapped[expId] = list.map((s) => ({
          id: s.id,
          expenseId: s.group_expense_id,
          userId: s.user_id,
          shareMinor: s.share_minor,
          amountMinor: s.share_minor,
          weight: s.weight || undefined,
          percentageBasisPoints: s.percentage_basis_points || undefined,
          createdAt: s.created_at,
        }));
      }

      return mapped;
    },
    enabled: expenses.length > 0,
  });

  // Create Expense Mutation via Supabase
  const createMutation = useMutation({
    mutationFn: async (input: CreateExpenseInput): Promise<Expense> => {
      const normalizedDescription = (input.description || input.title || '').trim();
      const normalizedAmount = input.amountMinor ?? input.originalAmountMinor ?? 0;
      const normalizedCurrency = (input.currency || input.originalCurrency || 'USD').trim().toUpperCase();
      const isDirect = input.contextType === 'direct' || input.sourceType === 'direct' || (!input.groupId && !!input.friendId);
      const isGroup = (input.contextType === 'group' || input.sourceType === 'group' || !!input.groupId) && !isDirect;
      const normalizedContextType: 'personal' | 'group' | 'direct' = isDirect ? 'direct' : isGroup ? 'group' : 'personal';
      const normalizedSourceType = isDirect ? 'direct' : isGroup ? 'group' : 'personal';
      const normalizedSourceId = input.sourceId ?? (isGroup ? input.groupId! : isDirect ? (input.friendId || input.paidBy) : input.paidBy);
      const participantIds =
        input.participants && input.participants.length > 0
          ? input.participants
          : Array.from(new Set(input.splits.map((s) => s.userId)));

      // Validate input schema
      createExpenseInputSchema.parse({
        description: normalizedDescription,
        amountMinor: normalizedAmount,
        currency: normalizedCurrency,
        paidBy: input.paidBy,
        sourceType: normalizedSourceType,
        contextType: normalizedContextType,
        sourceId: normalizedSourceId,
        groupId: input.groupId,
        friendId: input.friendId,
        categoryId: input.categoryId,
        notes: input.notes,
        expenseDate: input.expenseDate || new Date().toISOString(),
        splitType: input.splitType || 'equal',
        participants: participantIds,
        splits: input.splits,
        createdBy: input.createdBy || input.paidBy,
      });

      const result = await expenseService.createExpense({
        description: normalizedDescription,
        amountMinor: normalizedAmount,
        currency: normalizedCurrency,
        reportingCurrency: input.reportingCurrency || normalizedCurrency,
        exchangeRate: input.exchangeRate,
        exchangeRateDate: input.exchangeRateDate,
        exchangeRateSource: input.exchangeRateSource,
        reportingAmountMinor: input.reportingAmountMinor ?? normalizedAmount,
        paidBy: input.paidBy,
        sourceType: normalizedSourceType,
        contextType: normalizedContextType,
        groupId: input.groupId,
        friendId: input.friendId,
        categoryId: input.categoryId,
        notes: input.notes,
        expenseDate: input.expenseDate,
        splitType: input.splitType || 'equal',
        splits: input.splits,
      });

      const now = new Date().toISOString();
      const createdExpense: Expense = {
        id: result.id,
        sourceType: normalizedSourceType,
        contextType: normalizedContextType,
        sourceId: normalizedSourceId,
        groupId: input.groupId,
        friendId: input.friendId,
        description: normalizedDescription,
        notes: input.notes,
        categoryId: input.categoryId,
        paidBy: input.paidBy,
        originalAmountMinor: normalizedAmount,
        amountMinor: normalizedAmount,
        originalCurrency: normalizedCurrency,
        currency: normalizedCurrency,
        reportingCurrency: input.reportingCurrency || normalizedCurrency,
        reportingAmountMinor: input.reportingAmountMinor ?? normalizedAmount,
        splitType: input.splitType || 'equal',
        participants: participantIds,
        expenseDate: input.expenseDate || now,
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy || input.paidBy,
      };

      return createdExpense;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      if (input.groupId) {
        void queryClient.invalidateQueries({ queryKey: ['group', input.groupId] });
        void queryClient.invalidateQueries({ queryKey: ['group-balances', input.groupId] });
      }
      if (input.friendId) {
        void queryClient.invalidateQueries({ queryKey: ['friends'] });
      }
    },
  });

  // Update Expense Mutation
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateExpenseInput): Promise<Expense> => {
      // Re-create or update
      const existing = expenses.find((e) => e.id === input.id);
      if (!existing) throw new Error(`Expense ${input.id} not found`);

      // Delete existing and insert updated with same ID/data
      await expenseService.deleteExpense(input.id);

      const updated = await createMutation.mutateAsync({
        description: input.description ?? existing.description,
        amountMinor: input.originalAmountMinor ?? existing.originalAmountMinor,
        currency: input.originalCurrency ?? existing.originalCurrency,
        reportingCurrency: input.reportingCurrency,
        exchangeRate: input.exchangeRate,
        exchangeRateDate: input.exchangeRateDate,
        exchangeRateSource: input.exchangeRateSource,
        reportingAmountMinor: input.reportingAmountMinor,
        paidBy: input.paidBy ?? existing.paidBy,
        groupId: input.groupId ?? existing.groupId,
        sourceType: input.sourceType ?? existing.sourceType,
        categoryId: input.categoryId ?? existing.categoryId,
        notes: input.notes ?? existing.notes,
        expenseDate: input.expenseDate ?? existing.expenseDate,
        splitType: input.splitType ?? existing.splitType,
        participants: input.participants ?? existing.participants,
        splits: input.splits ?? [],
      });

      return updated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['group-balances'] });
    },
  });

  // Delete Expense Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await expenseService.deleteExpense(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['group-balances'] });
    },
  });

  return {
    expenses,
    splits: rawSplits,
    isLoading: isLoadingExpenses,
    error: expensesError,
    refetch,
    createExpense: (input: CreateExpenseInput) => createMutation.mutateAsync(input),
    updateExpense: (input: UpdateExpenseInput) => updateMutation.mutateAsync(input),
    deleteExpense: (id: string) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useExpense(id?: string) {
  const {
    expenses,
    splits,
    isLoading,
    error,
    updateExpense,
    deleteExpense,
    isUpdating,
    isDeleting,
  } = useExpenses();

  const expense = id ? expenses.find((e) => e.id === id) : undefined;
  const expenseSplits = id && splits[id] ? splits[id] : [];

  return {
    expense,
    splits: expenseSplits,
    isLoading,
    error,
    updateExpense,
    deleteExpense,
    isUpdating,
    isDeleting,
  };
}
