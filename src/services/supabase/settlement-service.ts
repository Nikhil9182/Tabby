import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';
import { friendService } from './friend-service';

export type DbSettlement = Database['public']['Tables']['settlements']['Row'];

export interface CreateSettlementInput {
  groupId?: string;
  friendId?: string;
  contextType?: 'direct' | 'group';
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
   * Fetches settlements with optional group, friend, or context filter
   */
  async getSettlements(groupId?: string, contextType?: 'direct' | 'group'): Promise<DbSettlement[]> {
    let query = (supabase.from('settlements') as any)
      .select('*')
      .is('deleted_at', null)
      .order('settlement_date', { ascending: false });

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    if (contextType) {
      query = query.eq('context_type', contextType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching settlements:', error);
      throw new Error(error.message);
    }

    return (data || []) as DbSettlement[];
  }

  /**
   * Records a new settlement in Supabase (direct friend or group)
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

    const isDirect = input.contextType === 'direct' || (!input.groupId && !!input.friendId) || !input.groupId;

    if (isDirect) {
      const otherUser = input.fromUserId === user.id ? input.toUserId : input.fromUserId;
      const friendId = input.friendId || otherUser;

      // Try RPC first
      try {
        const { data, error } = await (supabase.rpc as any)('record_direct_settlement', {
          p_friend_id: friendId,
          p_amount_minor: input.amountMinor,
          p_currency: input.currency.toUpperCase(),
          p_settlement_date: input.settlementDate || new Date().toISOString(),
          p_notes: input.notes?.trim() || null,
          p_payer_id: input.fromUserId,
          p_recipient_id: input.toUserId,
        });

        if (!error && data) {
          return data as DbSettlement;
        }
      } catch {
        // Fallback to direct table write if RPC not yet migrated
      }

      // Fallback: resolve friendship and insert
      let friendshipId: string | null = null;
      try {
        friendshipId = await friendService.getOrCreateFriendship(input.fromUserId, input.toUserId);
      } catch {
        // Continue if table doesn't exist
      }

      const { data, error } = await (supabase.from('settlements') as any)
        .insert({
          context_type: 'direct',
          friendship_id: friendshipId,
          group_id: null,
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
        console.error('Error creating direct settlement:', error);
        throw new Error(error.message);
      }

      return data as DbSettlement;
    } else {
      // Group settlement
      const { data, error } = await (supabase.from('settlements') as any)
        .insert({
          context_type: 'group',
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
        console.error('Error creating group settlement:', error);
        throw new Error(error.message);
      }

      return data as DbSettlement;
    }
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
