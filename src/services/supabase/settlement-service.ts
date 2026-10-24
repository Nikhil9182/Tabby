import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';
import type { Settlement } from '@/domain/models/types';
import { friendService } from './friend-service';
import { guestStore } from '@/services/guest/guest-store';

export type DbSettlement = Database['public']['Tables']['settlements']['Row'] & {
  applied_currency?: string | null;
  applied_amount_minor?: number | null;
  exchange_rate_source?: string | null;
};

/** The one mapping from a settlements row to the domain type. */
export function toSettlement(s: DbSettlement): Settlement {
  return {
    id: s.id,
    contextType: ((s as any).context_type as 'direct' | 'group') || (s.group_id ? 'group' : 'direct'),
    friendshipId: (s as any).friendship_id || undefined,
    sourceType: s.group_id ? 'group' : undefined,
    sourceId: s.group_id || (s as any).friendship_id || 'direct',
    groupId: s.group_id || undefined,
    fromUserId: s.from_user_id,
    toUserId: s.to_user_id,
    amountMinor: Number(s.amount_minor),
    currency: s.currency,
    appliedCurrency: s.applied_currency || undefined,
    appliedAmountMinor: s.applied_amount_minor != null ? Number(s.applied_amount_minor) : undefined,
    settlementDate: s.settlement_date,
    notes: s.notes || undefined,
    exchangeRate: s.exchange_rate != null ? Number(s.exchange_rate) : undefined,
    exchangeRateDate: s.exchange_rate_date || undefined,
    exchangeRateSource: s.exchange_rate_source || undefined,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    createdBy: s.created_by,
    deletedAt: s.deleted_at,
  };
}

/** Frozen conversion for a settlement paid in a different currency from the debt. */
export interface SettlementConversionSnapshot {
  appliedCurrency: string;
  appliedAmountMinor: number;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: string;
}

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
  conversion?: SettlementConversionSnapshot;
}

function conversionColumns(input: CreateSettlementInput) {
  const c = input.conversion;
  if (!c || c.appliedCurrency.toUpperCase() === input.currency.toUpperCase()) {
    return { exchange_rate: 1.0, exchange_rate_source: 'identity' };
  }
  return {
    applied_currency: c.appliedCurrency.toUpperCase(),
    applied_amount_minor: c.appliedAmountMinor,
    exchange_rate: c.exchangeRate,
    exchange_rate_date: c.exchangeRateDate,
    exchange_rate_source: c.exchangeRateSource,
  };
}

class SettlementService {
  /**
   * Fetches settlements with optional group, friend, or context filter
   */
  async getSettlements(groupId?: string, contextType?: 'direct' | 'group'): Promise<DbSettlement[]> {
    if (guestStore.isGuestMode()) {
      return guestStore.getSettlements(groupId, contextType);
    }

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
    if (guestStore.isGuestMode()) {
      return guestStore.createSettlement(input);
    }

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

      const conversion = conversionColumns(input);
      const rpcArgs: Record<string, unknown> = {
        p_friend_id: friendId,
        p_amount_minor: input.amountMinor,
        p_currency: input.currency.toUpperCase(),
        p_settlement_date: input.settlementDate || new Date().toISOString(),
        p_notes: input.notes?.trim() || null,
        p_payer_id: input.fromUserId,
        p_recipient_id: input.toUserId,
      };
      if ('applied_currency' in conversion) {
        Object.assign(rpcArgs, {
          p_applied_currency: conversion.applied_currency,
          p_applied_amount_minor: conversion.applied_amount_minor,
          p_exchange_rate: conversion.exchange_rate,
          p_exchange_rate_date: conversion.exchange_rate_date,
          p_exchange_rate_source: conversion.exchange_rate_source,
        });
      }

      // Try RPC first
      try {
        const { data, error } = await (supabase.rpc as any)('record_direct_settlement', rpcArgs);

        if (!error && data) {
          return data as DbSettlement;
        }
        // A cross-currency settlement must not silently fall back to an unconverted write
        if (error && 'applied_currency' in conversion) {
          throw new Error(error.message);
        }
      } catch (err) {
        if ('applied_currency' in conversion) throw err;
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
          ...conversionColumns(input),
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
          ...conversionColumns(input),
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
    if (guestStore.isGuestMode()) {
      return guestStore.deleteSettlement(id);
    }

    const { error } = await (supabase.from('settlements') as any)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export const settlementService = new SettlementService();
