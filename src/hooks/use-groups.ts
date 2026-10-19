import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type {
  Group,
  GroupMembership,
  Expense,
  ExpenseSplit,
  Settlement,
  MemberRole,
  SyncOperation,
} from '@/domain/models/types';
import { groupRepository } from '@/storage/repositories/group-repository';
import { expenseRepository } from '@/storage/repositories/expense-repository';
import { settlementRepository } from '@/storage/repositories/settlement-repository';
import { syncRepository } from '@/storage/repositories/sync-repository';
import {
  calculateGroupBalances,
  type PairwiseBalance,
  type UserBalance,
  type GroupBalances,
} from '@/domain/balances/balance-engine';
import { generateId, generateOperationId } from '@/lib/id';
import { notifySyncQueueUpdated } from './use-sync';

export interface CreateGroupInput {
  name: string;
  description?: string;
  currency?: string;
  createdBy: string;
  members?: Array<{
    userId: string;
    role?: MemberRole;
  }>;
}

export interface UpdateGroupInput {
  id: string;
  name?: string;
  description?: string;
  currency?: string;
}

export const createGroupInputSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(100),
  description: z.string().max(500).optional(),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  createdBy: z.string().min(1, 'Creator user ID is required'),
  members: z
    .array(
      z.object({
        userId: z.string().min(1),
        role: z.enum(['owner', 'admin', 'member']).optional(),
      })
    )
    .optional(),
});

export function useGroups() {
  const queryClient = useQueryClient();
  const queryKey = ['groups'];

  const {
    data: groups = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Group[], Error>({
    queryKey,
    queryFn: () => groupRepository.getAllGroups(),
  });

  const createGroupMutation = useMutation({
    mutationFn: async (input: CreateGroupInput): Promise<Group> => {
      createGroupInputSchema.parse(input);

      const now = new Date().toISOString();
      const groupId = generateId();
      const operationId = generateOperationId();
      const currency = (input.currency || 'USD').toUpperCase();

      const group: Group = {
        id: groupId,
        name: input.name.trim(),
        description: input.description,
        currency,
        createdBy: input.createdBy,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };

      const ownerMembership: GroupMembership = {
        groupId,
        userId: input.createdBy,
        role: 'owner',
        status: 'active',
        joinedAt: now,
        updatedAt: now,
      };

      await groupRepository.createGroup(group, ownerMembership);

      if (input.members && input.members.length > 0) {
        for (const member of input.members) {
          if (member.userId !== input.createdBy) {
            await groupRepository.addMember({
              groupId,
              userId: member.userId,
              role: member.role || 'member',
              status: 'active',
              joinedAt: now,
              updatedAt: now,
            });
          }
        }
      }

      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'group',
        entityId: groupId,
        sourceId: groupId,
        operationType: 'create',
        payload: JSON.stringify(group),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();

      return group;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (input: UpdateGroupInput): Promise<Group> => {
      const existing = await groupRepository.getGroupById(input.id);
      if (!existing) {
        throw new Error(`Group with id ${input.id} not found`);
      }

      const now = new Date().toISOString();
      const operationId = generateOperationId();

      const updatedGroup: Group = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
        updatedAt: now,
      };

      await groupRepository.updateGroup(updatedGroup);

      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'group',
        entityId: input.id,
        sourceId: input.id,
        operationType: 'update',
        payload: JSON.stringify(updatedGroup),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();

      return updatedGroup;
    },
    onSuccess: (updatedGroup) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['group', updatedGroup.id] });
    },
  });

  const archiveGroupMutation = useMutation({
    mutationFn: async (groupId: string): Promise<void> => {
      await groupRepository.archiveGroup(groupId);

      const now = new Date().toISOString();
      const operationId = generateOperationId();
      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'group',
        entityId: groupId,
        sourceId: groupId,
        operationType: 'update',
        payload: JSON.stringify({ id: groupId, isArchived: true, archivedAt: now }),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();
    },
    onSuccess: (_data, groupId) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    },
  });

  return {
    groups,
    isLoading,
    error,
    createGroup: (input: CreateGroupInput) => createGroupMutation.mutateAsync(input),
    updateGroup: (input: UpdateGroupInput) => updateGroupMutation.mutateAsync(input),
    archiveGroup: (groupId: string) => archiveGroupMutation.mutateAsync(groupId),
    refetch,
  };
}

export function useGroup(groupId: string) {
  const queryClient = useQueryClient();

  const {
    data: group,
    isLoading: isLoadingGroup,
    error: groupError,
  } = useQuery<Group | undefined>({
    queryKey: ['group', groupId],
    queryFn: () => groupRepository.getGroupById(groupId),
    enabled: !!groupId,
  });

  const { data: members = [], isLoading: isLoadingMembers } = useQuery<GroupMembership[]>({
    queryKey: ['group-members', groupId],
    queryFn: () => groupRepository.getGroupMembers(groupId),
    enabled: !!groupId,
  });

  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery<Expense[]>({
    queryKey: ['expenses', { groupId }],
    queryFn: () => expenseRepository.getExpensesByGroup(groupId),
    enabled: !!groupId,
  });

  const { data: settlements = [], isLoading: isLoadingSettlements } = useQuery<Settlement[]>({
    queryKey: ['settlements', { groupId }],
    queryFn: () => settlementRepository.getSettlementsByGroup(groupId),
    enabled: !!groupId,
  });

  const { data: balances = null, isLoading: isLoadingBalances } = useQuery<GroupBalances | null>({
    queryKey: ['group-balances', groupId, expenses.length, settlements.length],
    queryFn: async () => {
      if (!group) return null;
      // Fetch splits for all group expenses
      const allSplits: ExpenseSplit[] = [];
      await Promise.all(
        expenses.map(async (exp) => {
          const splits = await expenseRepository.getExpenseSplits(exp.id);
          allSplits.push(...splits);
        })
      );
      return calculateGroupBalances(expenses, allSplits, settlements, group.currency);
    },
    enabled: !!group,
  });

  const isLoading =
    isLoadingGroup || isLoadingMembers || isLoadingExpenses || isLoadingSettlements || isLoadingBalances;

  return {
    group,
    members,
    expenses,
    settlements,
    balances,
    isLoading,
    error: groupError,
    refetch: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['group-members', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['expenses', { groupId }] }),
        queryClient.invalidateQueries({ queryKey: ['settlements', { groupId }] }),
        queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] }),
      ]);
    },
  };
}

export function useGroupBalances(groupId: string) {
  const { data, isLoading, error, refetch } = useQuery<{
    balances: Map<string, UserBalance>;
    simplifiedDebts: PairwiseBalance[];
  }>({
    queryKey: ['group-balances', groupId],
    queryFn: async () => {
      const [group, expenses, settlements] = await Promise.all([
        groupRepository.getGroupById(groupId),
        expenseRepository.getExpensesByGroup(groupId),
        settlementRepository.getSettlementsByGroup(groupId),
      ]);

      const currency = group?.currency || 'USD';

      const allSplits: ExpenseSplit[] = [];
      await Promise.all(
        expenses.map(async (exp) => {
          const splits = await expenseRepository.getExpenseSplits(exp.id);
          allSplits.push(...splits);
        })
      );

      const computed = calculateGroupBalances(expenses, allSplits, settlements, currency);
      return {
        balances: computed.balances,
        simplifiedDebts: computed.simplifiedDebts,
      };
    },
    enabled: !!groupId,
  });

  return {
    balances: data?.balances ?? new Map<string, UserBalance>(),
    simplifiedDebts: data?.simplifiedDebts ?? [],
    isLoading,
    error,
    refetch,
  };
}
