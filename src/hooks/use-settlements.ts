import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requireActiveParticipants } from '@/services/collaboration/access';
import { z } from 'zod';
import type { Settlement, SyncOperation } from '@/domain/models/types';
import { settlementRepository } from '@/storage/repositories/settlement-repository';
import { syncRepository } from '@/storage/repositories/sync-repository';
import { generateId, generateOperationId } from '@/lib/id';
import { notifySyncQueueUpdated } from './use-sync';

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
      if (groupId) {
        return await settlementRepository.getSettlementsByGroup(groupId);
      }
      return await settlementRepository.getAllSettlements();
    },
  });

  const recordMutation = useMutation({
    mutationFn: async (input: RecordSettlementInput): Promise<Settlement> => {
      const normalizedCurrency = (input.currency || 'USD').trim().toUpperCase();
      const normalizedDate = input.settlementDate || new Date().toISOString();
      const sourceId = input.groupId || input.sourceId || input.fromUserId;
      await requireActiveParticipants(input.groupId, [input.fromUserId, input.toUserId]);

      recordSettlementSchema.parse({
        groupId: input.groupId,
        sourceId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor: input.amountMinor,
        currency: normalizedCurrency,
        settlementDate: normalizedDate,
        notes: input.notes,
        createdBy: input.createdBy || input.fromUserId,
      });

      const now = new Date().toISOString();
      const settlementId = generateId();
      const operationId = generateOperationId();

      const settlement: Settlement = {
        id: settlementId,
        sourceId,
        groupId: input.groupId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor: input.amountMinor,
        currency: normalizedCurrency,
        settlementDate: normalizedDate,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy || input.fromUserId,
        operationId,
        revision: 1,
      };

      await settlementRepository.createSettlement(settlement);

      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'settlement',
        entityId: settlementId,
        sourceId,
        operationType: 'create',
        payload: JSON.stringify(settlement),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();

      return settlement;
    },
    onMutate: async (newSettlementInput) => {
      await queryClient.cancelQueries({ queryKey });
      const previousSettlements = queryClient.getQueryData<Settlement[]>(queryKey);

      const tempId = `temp_settlement_${Date.now()}`;
      const now = new Date().toISOString();
      const optimisticSettlement: Settlement = {
        id: tempId,
        sourceId: newSettlementInput.sourceId || newSettlementInput.groupId || newSettlementInput.fromUserId,
        groupId: newSettlementInput.groupId,
        fromUserId: newSettlementInput.fromUserId,
        toUserId: newSettlementInput.toUserId,
        amountMinor: newSettlementInput.amountMinor,
        currency: (newSettlementInput.currency || 'USD').toUpperCase(),
        settlementDate: newSettlementInput.settlementDate || now,
        notes: newSettlementInput.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: newSettlementInput.createdBy || newSettlementInput.fromUserId,
        operationId: `op_temp_${tempId}`,
        revision: 1,
      };

      queryClient.setQueryData<Settlement[]>(queryKey, (old = []) => [optimisticSettlement, ...old]);

      return { previousSettlements };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSettlements) {
        queryClient.setQueryData(queryKey, context.previousSettlements);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
      if (groupId) {
        void queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['group-balances'] });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const existing = await settlementRepository.getSettlementById(id);
      await settlementRepository.deleteSettlement(id);

      if (existing) {
        const now = new Date().toISOString();
        const operationId = generateOperationId();
        const syncOp: SyncOperation = {
          id: generateId(),
          operationId,
          entityType: 'settlement',
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
      const previousSettlements = queryClient.getQueryData<Settlement[]>(queryKey);

      queryClient.setQueryData<Settlement[]>(queryKey, (old = []) =>
        old.filter((s) => s.id !== deletedId)
      );

      return { previousSettlements };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSettlements) {
        queryClient.setQueryData(queryKey, context.previousSettlements);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
      if (groupId) {
        void queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
      }
    },
  });

  return {
    settlements,
    isLoading,
    error,
    recordSettlement: (input: RecordSettlementInput) => recordMutation.mutateAsync(input),
    deleteSettlement: (id: string) => deleteMutation.mutateAsync(id),
    refetch,
    isRecording: recordMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
