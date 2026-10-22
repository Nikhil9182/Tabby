import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type {
  Group,
  GroupMembership,
  Expense,
  ExpenseSplit,
  Settlement,
  MemberRole,
} from '@/domain/models/types';
import {
  groupService,
  type GroupWithMembers,
  type CreateGroupInput as SvcCreateGroupInput,
} from '@/services/supabase/group-service';
import { expenseService } from '@/services/supabase/expense-service';
import { settlementService } from '@/services/supabase/settlement-service';
import { realtimeService } from '@/services/supabase/realtime-service';
import {
  calculateGroupBalances,
  type PairwiseBalance,
  type UserBalance,
  type GroupBalances,
} from '@/domain/balances/balance-engine';

export interface CreateGroupInput {
  name: string;
  description?: string;
  currency?: string;
  createdBy?: string;
  imageUrl?: string;
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
  imageUrl?: string;
}

export const createGroupInputSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(100),
  description: z.string().max(500).optional(),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  createdBy: z.string().optional(),
  imageUrl: z.string().optional(),
  members: z
    .array(
      z.object({
        userId: z.string().min(1),
        role: z.enum(['owner', 'admin', 'member']).optional(),
      })
    )
    .optional(),
});

function mapDbGroupToGroup(g: any): Group {
  return {
    id: g.id,
    name: g.name,
    description: g.description || undefined,
    createdBy: g.created_by,
    currency: g.default_currency || 'USD',
    defaultCurrency: g.default_currency || 'USD',
    imageUrl: g.image_url || undefined,
    isArchived: !!g.archived_at,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    archivedAt: g.archived_at || undefined,
  };
}

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
    queryFn: async () => {
      const dbGroups = await groupService.getUserGroups();
      return dbGroups.map(mapDbGroupToGroup);
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (input: CreateGroupInput): Promise<Group> => {
      createGroupInputSchema.parse(input);

      const dbGroup = await groupService.createGroup({
        name: input.name,
        description: input.description,
        currency: input.currency || 'USD',
        imageUrl: input.imageUrl,
      });

      return mapDbGroupToGroup(dbGroup);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (input: UpdateGroupInput): Promise<Group> => {
      const dbGroup = await groupService.updateGroup({
        id: input.id,
        name: input.name,
        description: input.description,
        currency: input.currency,
        imageUrl: input.imageUrl,
      });
      return mapDbGroupToGroup(dbGroup);
    },
    onSuccess: (updatedGroup) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['group', updatedGroup.id] });
    },
  });

  const archiveGroupMutation = useMutation({
    mutationFn: async (groupId: string): Promise<void> => {
      await groupService.archiveGroup(groupId);
    },
    onSuccess: (_data, groupId) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    },
  });

  return {
    groups: groups.filter((g) => g.kind !== 'direct'),
    allGroups: groups,
    isLoading,
    isCreating: createGroupMutation.isPending,
    error,
    createGroup: (input: CreateGroupInput) => createGroupMutation.mutateAsync(input),
    updateGroup: (input: UpdateGroupInput) => updateGroupMutation.mutateAsync(input),
    archiveGroup: (groupId: string) => archiveGroupMutation.mutateAsync(groupId),
    refetch,
  };
}

export function useGroup(groupId: string) {
  const queryClient = useQueryClient();

  // Subscribe to Realtime Postgres changes for this group
  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = realtimeService.subscribeToGroup(groupId, queryClient);
    return () => unsubscribe();
  }, [groupId, queryClient]);

  const {
    data: groupDetails,
    isLoading: isLoadingGroup,
    error: groupError,
  } = useQuery<GroupWithMembers | null>({
    queryKey: ['group', groupId],
    queryFn: () => groupService.getGroupById(groupId),
    enabled: !!groupId,
  });

  const group: Group | undefined = groupDetails ? mapDbGroupToGroup(groupDetails) : undefined;

  const members: GroupMembership[] = useMemo(
    () =>
      (groupDetails?.members || []).map((m) => ({
        id: m.id,
        groupId,
        userId: m.userId,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
    [groupDetails, groupId]
  );

  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery<Expense[]>({
    queryKey: ['expenses', { groupId }],
    queryFn: async () => {
      const expList = await expenseService.getExpenses({ groupId });
      return expList.map((e) => ({
        ...e,
        sourceType: 'group',
        sourceId: groupId,
      }));
    },
    enabled: !!groupId,
  });

  const { data: settlements = [], isLoading: isLoadingSettlements } = useQuery<Settlement[]>({
    queryKey: ['settlements', { groupId }],
    queryFn: async (): Promise<Settlement[]> => {
      const rawSettlements = await settlementService.getSettlements(groupId);
      return rawSettlements.map((s) => ({
        id: s.id,
        sourceType: 'group',
        sourceId: s.group_id || groupId || 'group',
        groupId: s.group_id || groupId,
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
    enabled: !!groupId,
  });

  const { data: balances = null, isLoading: isLoadingBalances } = useQuery<GroupBalances | null>({
    queryKey: ['group-balances', groupId, expenses.length, settlements.length],
    queryFn: async () => {
      if (!group) return null;
      const expenseIds = expenses.map((e) => e.id);
      const splitsMap = await expenseService.getSplitsForExpenses(expenseIds);
      const allSplits: ExpenseSplit[] = [];

      for (const [expId, splits] of Object.entries(splitsMap)) {
        for (const s of splits) {
          allSplits.push({
            id: s.id,
            expenseId: expId,
            userId: s.user_id,
            shareMinor: s.share_minor,
            weight: s.weight || undefined,
            percentageBasisPoints: s.percentage_basis_points || undefined,
            createdAt: s.created_at,
          });
        }
      }

      return calculateGroupBalances(expenses, allSplits, settlements, group.currency || 'USD');
    },
    enabled: !!group,
  });

  const isLoading =
    isLoadingGroup || isLoadingExpenses || isLoadingSettlements || isLoadingBalances;

  return {
    group,
    members,
    expenses,
    settlements,
    balances,
    isLoading,
    error: groupError as Error | null,
    refetch: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group', groupId] }),
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
      const [groupDetails, expenses, rawSettlements] = await Promise.all([
        groupService.getGroupById(groupId),
        expenseService.getExpenses({ groupId }),
        settlementService.getSettlements(groupId),
      ]);

      const currency = groupDetails?.default_currency || 'USD';
      const expenseIds = expenses.map((e) => e.id);
      const splitsMap = await expenseService.getSplitsForExpenses(expenseIds);
      const allSplits: ExpenseSplit[] = [];

      for (const [expId, splits] of Object.entries(splitsMap)) {
        for (const s of splits) {
          allSplits.push({
            id: s.id,
            expenseId: expId,
            userId: s.user_id,
            shareMinor: s.share_minor,
            weight: s.weight || undefined,
            percentageBasisPoints: s.percentage_basis_points || undefined,
            createdAt: s.created_at,
          });
        }
      }

      const settlements: Settlement[] = rawSettlements.map((s) => ({
        id: s.id,
        sourceId: s.group_id || 'group',
        groupId: s.group_id || undefined,
        fromUserId: s.from_user_id,
        toUserId: s.to_user_id,
        amountMinor: s.amount_minor,
        currency: s.currency,
        settlementDate: s.settlement_date,
        notes: s.notes || undefined,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        createdBy: s.created_by,
      }));

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
