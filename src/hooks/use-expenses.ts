import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requireActiveParticipants } from '@/services/collaboration/access';
import { z } from 'zod';
import type {
  Expense,
  ExpenseSplit,
  SourceType,
  SplitType,
  SyncOperation,
} from '@/domain/models/types';
import { expenseRepository } from '@/storage/repositories/expense-repository';
import { syncRepository } from '@/storage/repositories/sync-repository';
import { generateId, generateOperationId } from '@/lib/id';
import { notifySyncQueueUpdated } from './use-sync';

export interface ExpenseFilters {
  sourceType?: SourceType;
  groupId?: string;
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
  paidBy: string;
  sourceType?: SourceType;
  sourceId?: string;
  groupId?: string;
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
  sourceType: z.enum(['personal', 'group']).default('personal'),
  sourceId: z.string().optional(),
  groupId: z.string().optional(),
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

  // Fetch expenses according to provided filters
  const {
    data: expensesData,
    isLoading: isLoadingExpenses,
    error: expensesError,
    refetch,
  } = useQuery<Expense[], Error>({
    queryKey,
    queryFn: async () => {
      if (filters?.searchQuery || filters?.dateFrom || filters?.dateTo || filters?.categoryId || filters?.paidBy) {
        return await expenseRepository.searchExpenses(filters.searchQuery || '', {
          groupId: filters.groupId,
          sourceType: filters.sourceType,
          categoryId: filters.categoryId,
          paidBy: filters.paidBy,
          startDate: filters.dateFrom,
          endDate: filters.dateTo,
        });
      }

      if (filters?.groupId) {
        return await expenseRepository.getExpensesByGroup(filters.groupId);
      }

      return await expenseRepository.getAllExpenses();
    },
  });

  const expenses = expensesData ?? [];

  // Fetch splits for currently loaded expenses
  const { data: splitsMap = {} } = useQuery<Record<string, ExpenseSplit[]>>({
    queryKey: ['expenses-splits', expenses.map((e) => e.id).sort().join(',')],
    queryFn: async () => {
      const map: Record<string, ExpenseSplit[]> = {};
      await Promise.all(
        expenses.map(async (exp) => {
          const splits = await expenseRepository.getExpenseSplits(exp.id);
          map[exp.id] = splits;
        })
      );
      return map;
    },
    enabled: expenses.length > 0,
  });

  // Create Expense Mutation
  const createMutation = useMutation({
    mutationFn: async (input: CreateExpenseInput): Promise<{ expense: Expense; splits: ExpenseSplit[] }> => {
      const normalizedDescription = (input.description || input.title || '').trim();
      const normalizedAmount = input.amountMinor ?? input.originalAmountMinor ?? 0;
      const normalizedCurrency = (input.currency || input.originalCurrency || 'USD').trim().toUpperCase();
      const normalizedSourceType = input.sourceType ?? (input.groupId ? 'group' : 'personal');
      const normalizedSourceId = input.sourceId ?? (input.groupId ? input.groupId : input.paidBy);
      const participantIds =
        input.participants && input.participants.length > 0
          ? input.participants
          : Array.from(new Set(input.splits.map((s) => s.userId)));

      // Validate input schema
      await requireActiveParticipants(input.groupId, [...participantIds, input.paidBy]);
      createExpenseInputSchema.parse({
        description: normalizedDescription,
        amountMinor: normalizedAmount,
        currency: normalizedCurrency,
        paidBy: input.paidBy,
        sourceType: normalizedSourceType,
        sourceId: normalizedSourceId,
        groupId: input.groupId,
        categoryId: input.categoryId,
        notes: input.notes,
        expenseDate: input.expenseDate || new Date().toISOString(),
        splitType: input.splitType || 'equal',
        participants: participantIds,
        splits: input.splits,
        createdBy: input.createdBy || input.paidBy,
      });

      const now = new Date().toISOString();
      const expenseId = generateId();
      const operationId = generateOperationId();

      const expense: Expense = {
        id: expenseId,
        sourceType: normalizedSourceType,
        sourceId: normalizedSourceId,
        groupId: input.groupId,
        description: normalizedDescription,
        notes: input.notes,
        categoryId: input.categoryId,
        paidBy: input.paidBy,
        originalAmountMinor: normalizedAmount,
        originalCurrency: normalizedCurrency,
        reportingCurrency: normalizedCurrency,
        reportingAmountMinor: normalizedAmount,
        splitType: input.splitType || 'equal',
        participants: participantIds,
        expenseDate: input.expenseDate || now,
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy || input.paidBy,
        operationId,
        revision: 1,
      };

      const splits: ExpenseSplit[] = input.splits.map((s) => ({
        id: generateId(),
        expenseId,
        userId: s.userId,
        shareMinor: s.shareMinor,
        weight: s.weight,
        percentageBasisPoints: s.percentageBasisPoints,
        createdAt: now,
      }));

      // 1. Save to IndexedDB
      await expenseRepository.createExpense(expense, splits);

      // 2. Add sync operation to outbox
      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'expense',
        entityId: expenseId,
        sourceId: normalizedSourceId,
        operationType: 'create',
        payload: JSON.stringify({ expense, splits }),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);

      // 3. Notify outbox listeners
      notifySyncQueueUpdated();

      return { expense, splits };
    },
    // Optimistic cache update
    onMutate: async (newExpenseInput) => {
      await queryClient.cancelQueries({ queryKey });

      const previousExpenses = queryClient.getQueryData<Expense[]>(queryKey);

      const tempId = `temp_${Date.now()}`;
      const now = new Date().toISOString();
      const desc = (newExpenseInput.description || newExpenseInput.title || '').trim();
      const amount = newExpenseInput.amountMinor ?? newExpenseInput.originalAmountMinor ?? 0;
      const curr = (newExpenseInput.currency || newExpenseInput.originalCurrency || 'USD').toUpperCase();
      const pList =
        newExpenseInput.participants ?? Array.from(new Set(newExpenseInput.splits.map((s) => s.userId)));

      const optimisticExpense: Expense = {
        id: tempId,
        sourceType: newExpenseInput.sourceType || (newExpenseInput.groupId ? 'group' : 'personal'),
        sourceId: newExpenseInput.sourceId || newExpenseInput.groupId || newExpenseInput.paidBy,
        groupId: newExpenseInput.groupId,
        description: desc,
        notes: newExpenseInput.notes,
        categoryId: newExpenseInput.categoryId,
        paidBy: newExpenseInput.paidBy,
        originalAmountMinor: amount,
        originalCurrency: curr,
        reportingCurrency: curr,
        reportingAmountMinor: amount,
        splitType: newExpenseInput.splitType || 'equal',
        participants: pList,
        expenseDate: newExpenseInput.expenseDate || now,
        createdAt: now,
        updatedAt: now,
        createdBy: newExpenseInput.createdBy || newExpenseInput.paidBy,
        operationId: `op_temp_${tempId}`,
        revision: 1,
      };

      queryClient.setQueryData<Expense[]>(queryKey, (old = []) => [optimisticExpense, ...old]);

      return { previousExpenses };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(queryKey, context.previousExpenses);
      }
    },
    onSettled: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['group-balances'] });
      void queryClient.invalidateQueries({ queryKey: ['expense'] });
      void queryClient.invalidateQueries({ queryKey: ['expense-splits'] });
    },
  });

  // Update Expense Mutation
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateExpenseInput): Promise<Expense> => {
      const existing = await expenseRepository.getExpenseById(input.id);
      if (!existing) {
        throw new Error(`Expense with id ${input.id} not found`);
      }

      const now = new Date().toISOString();
      const operationId = generateOperationId();

      const updatedExpense: Expense = {
        ...existing,
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.paidBy !== undefined ? { paidBy: input.paidBy } : {}),
        ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
        ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
        ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
        ...(input.originalAmountMinor !== undefined
          ? {
              originalAmountMinor: input.originalAmountMinor,
              amountMinor: input.originalAmountMinor,
              reportingAmountMinor: input.originalAmountMinor,
            }
          : {}),
        ...(input.originalCurrency !== undefined ? { originalCurrency: input.originalCurrency.toUpperCase() } : {}),
        ...(input.splitType !== undefined ? { splitType: input.splitType } : {}),
        ...(input.participants !== undefined ? { participants: input.participants } : {}),
        ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
        updatedAt: now,
        operationId,
        revision: (existing.revision || 1) + 1,
      };

      await requireActiveParticipants(updatedExpense.groupId, [...(updatedExpense.participants || []), updatedExpense.paidBy]);

      let newSplits: ExpenseSplit[] | undefined;
      if (input.splits !== undefined) {
        newSplits = input.splits.map((s) => ({
          id: generateId(),
          expenseId: input.id,
          userId: s.userId,
          shareMinor: s.shareMinor,
          weight: s.weight,
          percentageBasisPoints: s.percentageBasisPoints,
          createdAt: now,
        }));
      }

      await expenseRepository.updateExpense(updatedExpense, newSplits);

      // Add update sync operation
      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'expense',
        entityId: input.id,
        sourceId: existing.sourceId,
        operationType: 'update',
        payload: JSON.stringify({ expense: updatedExpense, splits: newSplits }),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
        baseRevision: existing.revision,
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();

      return updatedExpense;
    },
    onMutate: async (updatedInput) => {
      await queryClient.cancelQueries({ queryKey });
      const previousExpenses = queryClient.getQueryData<Expense[]>(queryKey);

      queryClient.setQueryData<Expense[]>(queryKey, (old = []) =>
        old.map((exp) =>
          exp.id === updatedInput.id
            ? {
                ...exp,
                ...(updatedInput.description !== undefined ? { description: updatedInput.description } : {}),
                ...(updatedInput.originalAmountMinor !== undefined
                  ? { originalAmountMinor: updatedInput.originalAmountMinor }
                  : {}),
                ...(updatedInput.originalCurrency !== undefined
                  ? { originalCurrency: updatedInput.originalCurrency }
                  : {}),
                updatedAt: new Date().toISOString(),
              }
            : exp
        )
      );

      return { previousExpenses };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(queryKey, context.previousExpenses);
      }
    },
    onSettled: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['group-balances'] });
      void queryClient.invalidateQueries({ queryKey: ['expense'] });
      void queryClient.invalidateQueries({ queryKey: ['expense-splits'] });
    },
  });

  // Delete Expense Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const existing = await expenseRepository.getExpenseById(id);
      await expenseRepository.deleteExpense(id);

      if (existing) {
        const now = new Date().toISOString();
        const operationId = generateOperationId();
        const syncOp: SyncOperation = {
          id: generateId(),
          operationId,
          entityType: 'expense',
          entityId: id,
          sourceId: existing.sourceId,
          operationType: 'delete',
          payload: JSON.stringify({ id, deletedAt: now }),
          createdAt: now,
          attemptCount: 0,
          status: 'pending',
        };
        await syncRepository.addOperation(syncOp);
        notifySyncQueueUpdated();
      }
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey });
      const previousExpenses = queryClient.getQueryData<Expense[]>(queryKey);

      queryClient.setQueryData<Expense[]>(queryKey, (old = []) =>
        old.filter((exp) => exp.id !== deletedId)
      );

      return { previousExpenses };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(queryKey, context.previousExpenses);
      }
    },
    onSettled: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['group-balances'] });
      void queryClient.invalidateQueries({ queryKey: ['expense'] });
      void queryClient.invalidateQueries({ queryKey: ['expense-splits'] });
    },
  });

  return {
    expenses,
    splits: splitsMap,
    isLoading: isLoadingExpenses,
    error: expensesError,
    refetch,
    createExpense: async (input: CreateExpenseInput) => {
      const result = await createMutation.mutateAsync(input);
      return result.expense;
    },
    updateExpense: (input: UpdateExpenseInput) => updateMutation.mutateAsync(input),
    deleteExpense: (id: string) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useExpense(expenseId: string) {
  const queryClient = useQueryClient();

  const {
    data: expense,
    isLoading: isLoadingExpense,
    error: expenseError,
    refetch,
  } = useQuery<Expense | undefined, Error>({
    queryKey: ['expense', expenseId],
    queryFn: () => expenseRepository.getExpenseById(expenseId),
    enabled: !!expenseId,
  });

  const { data: splits = [], isLoading: isLoadingSplits } = useQuery<ExpenseSplit[]>({
    queryKey: ['expense-splits', expenseId],
    queryFn: () => expenseRepository.getExpenseSplits(expenseId),
    enabled: !!expenseId,
  });

  return {
    expense,
    splits,
    isLoading: isLoadingExpense || isLoadingSplits,
    error: expenseError,
    refetch: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expense', expenseId] }),
        queryClient.invalidateQueries({ queryKey: ['expense-splits', expenseId] }),
      ]);
      return refetch();
    },
  };
}
