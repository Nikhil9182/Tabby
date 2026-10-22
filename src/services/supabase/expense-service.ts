import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';
import type { SplitType } from '@/domain/models/types';

export type DbGroupExpense = Database['public']['Tables']['group_expenses']['Row'];
export type DbPersonalExpense = Database['public']['Tables']['personal_expenses']['Row'];
export type DbExpenseSplit = Database['public']['Tables']['expense_splits']['Row'];

export interface ExpenseSplitInput {
  userId: string;
  shareMinor: number;
  weight?: number;
  percentageBasisPoints?: number;
}

export interface CreateExpenseServiceInput {
  description: string;
  amountMinor: number;
  currency: string;
  reportingCurrency?: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  reportingAmountMinor?: number;
  paidBy: string;
  sourceType?: 'group' | 'personal';
  groupId?: string;
  categoryId?: string;
  notes?: string;
  expenseDate?: string;
  splitType?: SplitType;
  splits: ExpenseSplitInput[];
}

export interface ExpenseFilters {
  groupId?: string;
  sourceType?: 'group' | 'personal';
  categoryId?: string;
  paidBy?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface UnifiedExpense {
  id: string;
  sourceType: 'group' | 'personal';
  sourceId: string;
  groupId?: string;
  description: string;
  notes?: string;
  categoryId?: string;
  paidBy: string;
  originalAmountMinor: number;
  amountMinor: number;
  originalCurrency: string;
  currency: string;
  reportingCurrency: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  reportingAmountMinor: number;
  splitType: SplitType;
  participants: string[];
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt?: string | null;
}

class ExpenseService {
  /**
   * Fetches expenses based on filters
   */
  async getExpenses(filters?: ExpenseFilters): Promise<UnifiedExpense[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const results: UnifiedExpense[] = [];

    // 1. Group Expenses
    if (!filters?.sourceType || filters.sourceType === 'group') {
      let query = (supabase.from('group_expenses') as any)
        .select(`
          *,
          expense_splits (
            user_id
          )
        `)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false });

      if (filters?.groupId) {
        query = query.eq('group_id', filters.groupId);
      }
      if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }
      if (filters?.paidBy) {
        query = query.eq('paid_by', filters.paidBy);
      }
      if (filters?.startDate) {
        query = query.gte('expense_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('expense_date', filters.endDate);
      }
      if (filters?.searchQuery) {
        query = query.ilike('description', `%${filters.searchQuery}%`);
      }

      const { data: groupExps, error: groupError } = await query;

      if (groupError) {
        console.error('Error fetching group expenses:', groupError);
        throw new Error(groupError.message);
      }

      if (groupExps) {
        for (const exp of groupExps) {
          const participantIds = (exp.expense_splits || []).map((s: any) => s.user_id);
          results.push({
            id: exp.id,
            sourceType: 'group',
            sourceId: exp.group_id,
            groupId: exp.group_id,
            description: exp.description,
            notes: exp.notes || undefined,
            categoryId: exp.category_id || undefined,
            paidBy: exp.paid_by,
            originalAmountMinor: exp.amount_minor,
            amountMinor: exp.amount_minor,
            originalCurrency: exp.currency,
            currency: exp.currency,
            reportingCurrency: exp.reporting_currency,
            exchangeRate: exp.exchange_rate || 1.0,
            exchangeRateDate: exp.exchange_rate_date || undefined,
            exchangeRateSource: exp.exchange_rate_source || undefined,
            reportingAmountMinor: exp.reporting_amount_minor,
            splitType: (exp.split_type as SplitType) || 'equal',
            participants: participantIds,
            expenseDate: exp.expense_date,
            createdAt: exp.created_at,
            updatedAt: exp.updated_at,
            createdBy: exp.created_by,
            deletedAt: exp.deleted_at,
          });
        }
      }
    }

    // 2. Personal Expenses (only if not restricted to a specific group)
    if (!filters?.groupId && (!filters?.sourceType || filters.sourceType === 'personal')) {
      let personalQuery = (supabase.from('personal_expenses') as any)
        .select('*')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false });

      if (filters?.categoryId) {
        personalQuery = personalQuery.eq('category_id', filters.categoryId);
      }
      if (filters?.startDate) {
        personalQuery = personalQuery.gte('expense_date', filters.startDate);
      }
      if (filters?.endDate) {
        personalQuery = personalQuery.lte('expense_date', filters.endDate);
      }
      if (filters?.searchQuery) {
        personalQuery = personalQuery.ilike('description', `%${filters.searchQuery}%`);
      }

      const { data: personalExps, error: personalError } = await personalQuery;
      if (personalError) {
        console.error('Error fetching personal expenses:', personalError);
      } else if (personalExps) {
        for (const exp of personalExps) {
          results.push({
            id: exp.id,
            sourceType: 'personal',
            sourceId: exp.owner_id,
            description: exp.description,
            notes: exp.notes || undefined,
            categoryId: exp.category_id || undefined,
            paidBy: exp.owner_id,
            originalAmountMinor: exp.amount_minor,
            amountMinor: exp.amount_minor,
            originalCurrency: exp.currency,
            currency: exp.currency,
            reportingCurrency: exp.currency,
            reportingAmountMinor: exp.amount_minor,
            splitType: 'equal',
            participants: [exp.owner_id],
            expenseDate: exp.expense_date,
            createdAt: exp.created_at,
            updatedAt: exp.updated_at,
            createdBy: exp.owner_id,
            deletedAt: exp.deleted_at,
          });
        }
      }
    }

    // Sort descending by expenseDate
    return results.sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());
  }

  /**
   * Fetches splits for an array of expense IDs
   */
  async getSplitsForExpenses(expenseIds: string[]): Promise<Record<string, DbExpenseSplit[]>> {
    if (expenseIds.length === 0) return {};

    const { data: splits, error } = await (supabase.from('expense_splits') as any)
      .select('*')
      .in('group_expense_id', expenseIds);

    if (error) {
      console.error('Error fetching splits:', error);
      throw new Error(error.message);
    }

    const map: Record<string, DbExpenseSplit[]> = {};
    for (const split of (splits || []) as DbExpenseSplit[]) {
      if (!map[split.group_expense_id]) {
        map[split.group_expense_id] = [];
      }
      map[split.group_expense_id].push(split);
    }

    return map;
  }

  /**
   * Creates an expense atomically with splits in Supabase
   */
  async createExpense(input: CreateExpenseServiceInput): Promise<{ id: string; description: string }> {
    const isGroup = !!input.groupId && input.sourceType !== 'personal';

    if (isGroup && input.groupId) {
      // Call PostgreSQL RPC for atomic transaction
      const { data, error } = await (supabase.rpc as any)('create_group_expense_with_splits', {
        p_group_id: input.groupId,
        p_description: input.description.trim(),
        p_notes: input.notes?.trim() || null,
        p_category_id: input.categoryId || null,
        p_paid_by: input.paidBy,
        p_amount_minor: input.amountMinor,
        p_currency: input.currency.toUpperCase(),
        p_reporting_currency: (input.reportingCurrency || input.currency).toUpperCase(),
        p_exchange_rate: input.exchangeRate || 1.0,
        p_exchange_rate_date: input.exchangeRateDate || null,
        p_exchange_rate_source: input.exchangeRateSource || 'identity',
        p_reporting_amount_minor: input.reportingAmountMinor ?? input.amountMinor,
        p_split_type: input.splitType || 'equal',
        p_expense_date: input.expenseDate || new Date().toISOString(),
        p_splits: input.splits.map((s) => ({
          user_id: s.userId,
          share_minor: s.shareMinor,
          weight: s.weight || null,
          percentage_basis_points: s.percentageBasisPoints || null,
        })),
      });

      if (error) {
        console.error('Error creating group expense RPC:', error);
        throw new Error(error.message);
      }

      const res = data as any;
      return {
        id: res.expense.id,
        description: res.expense.description,
      };
    } else {
      // Personal expense
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('personal_expenses') as any)
        .insert({
          owner_id: user.id,
          description: input.description.trim(),
          notes: input.notes?.trim() || null,
          category_id: input.categoryId || null,
          amount_minor: input.amountMinor,
          currency: input.currency.toUpperCase(),
          expense_date: input.expenseDate || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return {
        id: data.id,
        description: data.description,
      };
    }
  }

  /**
   * Deletes an expense (checks group_expenses first, then personal_expenses)
   */
  async deleteExpense(id: string): Promise<void> {
    const { error: groupError } = await (supabase.from('group_expenses') as any)
      .delete()
      .eq('id', id);

    if (groupError) {
      const { error: personalError } = await (supabase.from('personal_expenses') as any)
        .delete()
        .eq('id', id);

      if (personalError) {
        throw new Error(personalError.message);
      }
    }
  }
}

export const expenseService = new ExpenseService();
