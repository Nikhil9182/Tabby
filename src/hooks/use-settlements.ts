import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { Settlement } from '@/domain/models/types';
import { settlementService } from '@/services/supabase/settlement-service';

export interface RecordSettlementInput {
  groupId?: string;
  friendId?: string;
  contextType?: 'direct' | 'group';
  sourceId?: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  currency?: string;
  settlementDate?: string;
  notes?: string;
  createdBy?: string;
  exchangeRate?: number;
}

export const recordSettlementSchema = z
  .object({
    groupId: z.string().optional(),
    friendId: z.string().optional(),
    contextType: z.enum(['direct', 'group']).optional(),
    sourceId: z.string().optional(),
    fromUserId: z.string().min(1, 'Payer (fromUserId) is required'),
    toUserId: z.string().min(1, 'Recipient (toUserId) is required'),
    amountMinor: z.number().int().positive('Settlement amount must be positive integer minor units'),
    currency: z.string().trim().length(3).toUpperCase().default('USD'),
    settlementDate: z.string().min(1, 'Settlement date is required'),
    notes: z.string().max(500).optional(),
    createdBy: z.string().optional(),
  })
  .refine((data) => data.fromUserId !== data.toUserId, {
    message: 'Payer and recipient cannot be the same user',
    path: ['toUserId'],
  });

export interface SettlementFilters {
  groupId?: string;
  contextType?: 'direct' | 'group';
}

export interface UseSettlementsResult {
  settlements: Settlement[];
  isLoading: boolean;
  error: Error | null;
  recordSettlement: (input: RecordSettlementInput) => Promise<Settlement>;
  deleteSettlement: (id: string) => Promise<void>;
  refetch: () => Promise<unknown>;
  isRecording: boolean;
  isDeleting: boolean;
}

export function useSettlements(filter?: string | SettlementFilters): UseSettlementsResult {
  const queryClient = useQueryClient();
  const groupId = typeof filter === 'string' ? filter : filter?.groupId;
  const contextType = typeof filter === 'object' ? filter?.contextType : undefined;
  const queryKey = ['settlements', { groupId, contextType }];

  const {
    data: settlements = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Settlement[], Error>({
    queryKey,
    queryFn: async (): Promise<Settlement[]> => {
      const raw = await settlementService.getSettlements(groupId, contextType);
      return raw.map((s) => ({
        id: s.id,
        contextType: (s.context_type as any) || (s.group_id ? 'group' : 'direct'),
        friendshipId: s.friendship_id || undefined,
        sourceId: s.group_id || s.friendship_id || 'direct',
        groupId: s.group_id || undefined,
        fromUserId: s.from_user_id,
        toUserId: s.to_user_id,
        amountMinor: s.amount_minor,
        currency: s.currency,
        settlementDate: s.settlement_date,
        notes: s.notes || undefined,
        exchangeRate: s.exchange_rate || 1.0,
        exchangeRateDate: s.exchange_rate_date || undefined,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        createdBy: s.created_by,
        deletedAt: s.deleted_at,
      }));
    },
  });

  const recordMutation = useMutation({
    mutationFn: async (input: RecordSettlementInput): Promise<Settlement> => {
      const normalizedCurrency = (input.currency || 'USD').trim().toUpperCase();
      const normalizedDate = input.settlementDate || new Date().toISOString();
      const isDirect = input.contextType === 'direct' || (!input.groupId && !!input.friendId) || !input.groupId;
      const normalizedContextType: 'direct' | 'group' = isDirect ? 'direct' : 'group';
      const targetGroupId = isDirect ? undefined : (input.groupId || input.sourceId);

      recordSettlementSchema.parse({
        groupId: targetGroupId,
        friendId: input.friendId,
        contextType: normalizedContextType,
        sourceId: input.sourceId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor: input.amountMinor,
        currency: normalizedCurrency,
        settlementDate: normalizedDate,
        notes: input.notes,
        createdBy: input.createdBy || input.fromUserId,
      });

      const dbSettlement = await settlementService.createSettlement({
        groupId: targetGroupId,
        friendId: input.friendId,
        contextType: normalizedContextType,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor: input.amountMinor,
        currency: normalizedCurrency,
        notes: input.notes,
        settlementDate: normalizedDate,
        exchangeRate: input.exchangeRate,
      });

      return {
        id: dbSettlement.id,
        contextType: (dbSettlement.context_type as any) || normalizedContextType,
        friendshipId: dbSettlement.friendship_id || undefined,
        sourceId: dbSettlement.group_id || dbSettlement.friendship_id || 'direct',
        groupId: dbSettlement.group_id || undefined,
        fromUserId: dbSettlement.from_user_id,
        toUserId: dbSettlement.to_user_id,
        amountMinor: dbSettlement.amount_minor,
        currency: dbSettlement.currency,
        settlementDate: dbSettlement.settlement_date,
        notes: dbSettlement.notes || undefined,
        exchangeRate: dbSettlement.exchange_rate || 1.0,
        createdAt: dbSettlement.created_at,
        updatedAt: dbSettlement.updated_at,
        createdBy: dbSettlement.created_by,
      };
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await settlementService.deleteSettlement(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
      void queryClient.invalidateQueries({ queryKey: ['group-balances'] });
    },
  });

  return {
    settlements,
    isLoading,
    error,
    refetch,
    recordSettlement: (input: RecordSettlementInput) => recordMutation.mutateAsync(input),
    deleteSettlement: (id: string) => deleteMutation.mutateAsync(id),
    isRecording: recordMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
