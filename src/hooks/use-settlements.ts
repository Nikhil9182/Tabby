import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { Settlement } from '@/domain/models/types';
import { settlementService } from '@/services/supabase/settlement-service';

export interface RecordSettlementInput {
  groupId?: string;
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

export function useSettlements(groupId?: string): UseSettlementsResult {
  const queryClient = useQueryClient();
  const queryKey = groupId ? ['settlements', { groupId }] : ['settlements'];

  const {
    data: settlements = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Settlement[], Error>({
    queryKey,
    queryFn: async () => {
      const raw = await settlementService.getSettlements(groupId);
      return raw.map((s) => ({
        id: s.id,
        sourceId: s.group_id,
        groupId: s.group_id,
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
      const targetGroupId = input.groupId || input.sourceId;

      if (!targetGroupId) {
        throw new Error('Settlements must belong to a group.');
      }

      recordSettlementSchema.parse({
        groupId: targetGroupId,
        sourceId: targetGroupId,
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
        sourceId: dbSettlement.group_id,
        groupId: dbSettlement.group_id,
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
      if (input.groupId) {
        void queryClient.invalidateQueries({ queryKey: ['group', input.groupId] });
        void queryClient.invalidateQueries({ queryKey: ['group-balances', input.groupId] });
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
