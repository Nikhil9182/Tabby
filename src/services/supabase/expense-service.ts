import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';
import type { SplitType } from '@/domain/models/types';
import { friendService } from './friend-service';

export type DbGroupExpense = Database['public']['Tables']['group_expenses']['Row'];
export type DbPersonalExpense = Database['public']['Tables']['personal_expenses']['Row'];
export type DbExpenseSplit = Database['public']['Tables']['expense_splits']['Row'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// category_id is a UUID column; local fallback ids like 'cat_other' must not reach it
function toCategoryId(id?: string): string | null {
  return id && UUID_RE.test(id) ? id : null;
}

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
  sourceType?: 'group' | 'personal' | 'direct';
  contextType?: 'group' | 'personal' | 'direct';
  groupId?: string;
  friendId?: string;
  categoryId?: string;
  notes?: string;
  expenseDate?: string;
  splitType?: SplitType;
  splits: ExpenseSplitInput[];
}

export interface ExpenseFilters {
  groupId?: string;
  friendId?: string;
  sourceType?: 'group' | 'personal' | 'direct';
  contextType?: 'group' | 'personal' | 'direct';
  categoryId?: string;
  paidBy?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface UnifiedExpense {
  id: string;
  sourceType: 'group' | 'personal' | 'direct';
  contextType: 'group' | 'personal' | 'direct';
  sourceId: string;
  groupId?: string;
  friendshipId?: string;
  friendId?: string;
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

    // 1. Group & Direct Shared Expenses
    if (!filters?.sourceType || filters.sourceType === 'group' || filters.sourceType === 'direct') {
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
      if (filters?.contextType) {
        query = query.eq('context_type', filters.contextType);
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
        console.error('Error fetching group/direct expenses:', groupError);
        throw new Error(groupError.message);
      }

      if (groupExps) {
        for (const exp of groupExps) {
          const participantIds = (exp.expense_splits || []).map((s: any) => s.user_id);
          const isDirect = exp.context_type === 'direct' || (!exp.group_id && exp.friendship_id);
          const otherParticipant = isDirect
            ? participantIds.find((id: string) => id !== user.id) || (exp.paid_by !== user.id ? exp.paid_by : '')
            : undefined;

          // If filtering by specific friend in direct context
          if (filters?.friendId && isDirect && otherParticipant !== filters.friendId && exp.paid_by !== filters.friendId) {
            continue;
          }

          results.push({
            id: exp.id,
            sourceType: isDirect ? 'direct' : 'group',
            contextType: isDirect ? 'direct' : 'group',
            sourceId: isDirect ? (exp.friendship_id || otherParticipant || '') : (exp.group_id || ''),
            groupId: isDirect ? undefined : exp.group_id,
            friendshipId: exp.friendship_id || undefined,
            friendId: otherParticipant,
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

    // 2. Personal Expenses (only if not restricted to a specific group or friend)
    if (!filters?.groupId && !filters?.friendId && (!filters?.sourceType || filters.sourceType === 'personal')) {
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
            contextType: 'personal',
            sourceId: user.id,
            description: exp.description,
            notes: exp.notes || undefined,
            categoryId: exp.category_id || undefined,
            paidBy: user.id,
            originalAmountMinor: exp.amount_minor,
            amountMinor: exp.amount_minor,
            originalCurrency: exp.currency,
            currency: exp.currency,
            reportingCurrency: exp.currency,
            reportingAmountMinor: exp.amount_minor,
            splitType: 'equal',
            participants: [user.id],
            expenseDate: exp.expense_date,
            createdAt: exp.created_at,
            updatedAt: exp.updated_at,
            createdBy: user.id,
            deletedAt: exp.deleted_at,
          });
        }
      }
    }

    return results;
  }

  /**
   * Fetches splits for one or more expenses
   */
  async getSplitsForExpenses(expenseIds: string[]): Promise<Record<string, DbExpenseSplit[]>> {
    if (!expenseIds || expenseIds.length === 0) return {};

    const { data: splits, error } = await (supabase
      .from('expense_splits') as any)
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
   * Supports: Direct Friend Expense, Group Expense, Personal Expense
   */
  async createExpense(input: CreateExpenseServiceInput): Promise<{ id: string; description: string }> {
    const isDirect = input.contextType === 'direct' || input.sourceType === 'direct' || (!input.groupId && !!input.friendId);
    const isGroup = (input.contextType === 'group' || input.sourceType === 'group' || !!input.groupId) && !isDirect;

    if (isDirect) {
      // 1. DIRECT FRIEND EXPENSE
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const otherUserId = input.friendId || input.splits.find((s) => s.userId !== user.id)?.userId || input.paidBy;
      if (!otherUserId || otherUserId === user.id) {
        throw new Error('A direct friend expense requires a valid friend participant.');
      }

      // Try RPC first
      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('create_direct_expense_with_splits', {
          p_friend_id: otherUserId,
          p_description: input.description.trim(),
          p_notes: input.notes?.trim() || null,
          p_category_id: toCategoryId(input.categoryId),
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

        if (!rpcError && rpcData?.expense) {
          return {
            id: rpcData.expense.id,
            description: rpcData.expense.description,
          };
        }
      } catch {
        // Fallback to direct insertion if RPC migration is still pending
      }

      // Direct Table Fallback
      let friendshipId: string | null = null;
      try {
        friendshipId = await friendService.getOrCreateFriendship(user.id, otherUserId);
      } catch {
        // Continue
      }

      const { data: expData, error: expError } = await (supabase.from('group_expenses') as any)
        .insert({
          context_type: 'direct',
          friendship_id: friendshipId,
          group_id: null,
          description: input.description.trim(),
          notes: input.notes?.trim() || null,
          category_id: toCategoryId(input.categoryId),
          paid_by: input.paidBy,
          amount_minor: input.amountMinor,
          currency: input.currency.toUpperCase(),
          reporting_currency: (input.reportingCurrency || input.currency).toUpperCase(),
          exchange_rate: input.exchangeRate || 1.0,
          exchange_rate_date: input.exchangeRateDate || null,
          exchange_rate_source: input.exchangeRateSource || 'identity',
          reporting_amount_minor: input.reportingAmountMinor ?? input.amountMinor,
          split_type: input.splitType || 'equal',
          expense_date: input.expenseDate || new Date().toISOString(),
          created_by: user.id,
        })
        .select()
        .single();

      if (expError) throw new Error(expError.message);

      const splitsToInsert = input.splits.map((s) => ({
        group_expense_id: expData.id,
        user_id: s.userId,
        share_minor: s.shareMinor,
        weight: s.weight || null,
        percentage_basis_points: s.percentageBasisPoints || null,
      }));

      const { error: splitsError } = await (supabase.from('expense_splits') as any).insert(splitsToInsert);
      if (splitsError) {
        // Don't leave an expense with no participants behind
        await (supabase.from('group_expenses') as any).delete().eq('id', expData.id);
        throw new Error(`Failed to save expense splits: ${splitsError.message}`);
      }

      return {
        id: expData.id,
        description: expData.description,
      };
    } else if (isGroup && input.groupId) {
      // 2. GROUP EXPENSE
      const { data, error } = await (supabase.rpc as any)('create_group_expense_with_splits', {
        p_group_id: input.groupId,
        p_description: input.description.trim(),
        p_notes: input.notes?.trim() || null,
        p_category_id: toCategoryId(input.categoryId),
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
      // 3. PERSONAL EXPENSE
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('personal_expenses') as any)
        .insert({
          owner_id: user.id,
          description: input.description.trim(),
          notes: input.notes?.trim() || null,
          category_id: toCategoryId(input.categoryId),
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
   * Deletes an expense
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
