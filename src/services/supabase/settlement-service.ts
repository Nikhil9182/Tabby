import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';

export type DbSettlement = Database['public']['Tables']['settlements']['Row'];

export interface CreateSettlementInput {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  currency: string;
  notes?: string;
  settlementDate?: string;
  exchangeRate?: number;
}

class SettlementService {
  /**
   * Fetches settlements for a group or all accessible groups
   */
  async getSettlements(groupId?: string): Promise<DbSettlement[]> {
    let query = (supabase.from('settlements') as any)
      .select('*')
      .is('deleted_at', null)
      .order('settlement_date', { ascending: false });

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching settlements:', error);
      throw new Error(error.message);
    }

    return (data || []) as DbSettlement[];
  }

  /**
   * Records a new settlement in Supabase
   */
  async createSettlement(input: CreateSettlementInput): Promise<DbSettlement> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (input.fromUserId === input.toUserId) {
      throw new Error('Self-settlement is not permitted.');
    }

    if (input.amountMinor <= 0) {
      throw new Error('Settlement amount must be positive.');
    }

    const { data, error } = await (supabase.from('settlements') as any)
      .insert({
        group_id: input.groupId,
        from_user_id: input.fromUserId,
        to_user_id: input.toUserId,
        amount_minor: input.amountMinor,
        currency: input.currency.toUpperCase(),
        notes: input.notes?.trim() || null,
        settlement_date: input.settlementDate || new Date().toISOString(),
        exchange_rate: input.exchangeRate || 1.0,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating settlement:', error);
      throw new Error(error.message);
    }

    return data as DbSettlement;
  }

  /**
   * Deletes a settlement
   */
  async deleteSettlement(id: string): Promise<void> {
    const { error } = await (supabase.from('settlements') as any)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export const settlementService = new SettlementService();
