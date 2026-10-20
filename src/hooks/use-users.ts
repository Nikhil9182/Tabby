import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User, SyncOperation } from '@/domain/models/types';
import { db } from '@/storage/local/database';
import { userRepository } from '@/storage/repositories/user-repository';
import { syncRepository } from '@/storage/repositories/sync-repository';
import { generateId, generateOperationId } from '@/lib/id';
import { useAuth } from './use-auth';
import { notifySyncQueueUpdated } from './use-sync';

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  picture?: string;
}

export interface UseCurrentUserResult {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  updateProfile: (updates: UpdateProfileInput) => Promise<User>;
  isUpdating: boolean;
}

export function useCurrentUser(): UseCurrentUserResult {
  const queryClient = useQueryClient();
  const queryKey = ['current-user'];

  let googleUser: any = null;
  try {
    const auth = useAuth();
    googleUser = auth.user;
  } catch {
    // Graceful fallback if invoked outside AuthProvider
    googleUser = null;
  }

  const {
    data: localUser,
    isLoading,
    error,
  } = useQuery<User | null, Error>({
    queryKey: ['current-user', googleUser?.sub],
    queryFn: async () => {
      let existing = await userRepository.getCurrentUser();

      // If we have an authenticated Google user but no local record or googleSub mismatch,
      // create or sync the local current user record
      if (googleUser) {
        if (!existing || existing.googleSub !== googleUser.sub) {
          const now = new Date().toISOString();
          const syncedUser: User = {
            id: existing?.id || generateId(),
            name: googleUser.name || 'Anonymous User',
            email: googleUser.email,
            googleSub: googleUser.sub,
            picture: googleUser.picture,
            isCurrentUser: true,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };
          await userRepository.setCurrentUser(syncedUser);
          await userRepository.upsertUser({ ...syncedUser, id: 'user_self' });
          await userRepository.upsertUser({ ...syncedUser, id: 'current_user' });
          return syncedUser;
        }
      }

      if (!existing) {
        const now = new Date().toISOString();
        const initialUser: User = {
          id: generateId(),
          name: googleUser?.name || 'You',
          email: googleUser?.email || '',
          googleSub: googleUser?.sub,
          picture: googleUser?.picture,
          isCurrentUser: true,
          createdAt: now,
          updatedAt: now,
        };
        await userRepository.setCurrentUser(initialUser);
        await userRepository.upsertUser({ ...initialUser, id: 'user_self' });
        await userRepository.upsertUser({ ...initialUser, id: 'current_user' });
        return initialUser;
      }

      // Ensure alias 'user_self' and 'current_user' are kept in sync with the user's name
      await userRepository.upsertUser({ ...existing, id: 'user_self' });
      await userRepository.upsertUser({ ...existing, id: 'current_user' });

      return existing;
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: UpdateProfileInput): Promise<User> => {
      let current = await userRepository.getCurrentUser();
      const now = new Date().toISOString();

      if (!current) {
        current = {
          id: generateId(),
          name: updates.name || googleUser?.name || 'User',
          email: updates.email || googleUser?.email || '',
          googleSub: googleUser?.sub,
          picture: updates.picture || googleUser?.picture,
          isCurrentUser: true,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        current = {
          ...current,
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.email !== undefined ? { email: updates.email } : {}),
          ...(updates.picture !== undefined ? { picture: updates.picture } : {}),
          updatedAt: now,
        };
      }

      await userRepository.setCurrentUser(current);

      // Also ensure aliases 'user_self' and 'current_user' are stored with the exact same name
      await userRepository.upsertUser({
        ...current,
        id: 'user_self',
        isCurrentUser: true,
      });
      await userRepository.upsertUser({
        ...current,
        id: 'current_user',
        isCurrentUser: true,
      });

      // Retroactively update any legacy records stored with 'user_self'
      try {
        const legacyExpenses = await db.expenses.where('paidBy').equals('user_self').toArray();
        for (const exp of legacyExpenses) {
          await db.expenses.update(exp.id, { paidBy: current.id });
        }
        const legacySplits = await db.expenseSplits.where('userId').equals('user_self').toArray();
        for (const split of legacySplits) {
          await db.expenseSplits.update(split.id, { userId: current.id });
        }
      } catch {
        // Non-fatal if index not yet initialized
      }

      const operationId = generateOperationId();
      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'user',
        entityId: current.id,
        sourceId: current.id,
        operationType: 'update',
        payload: JSON.stringify(current),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();

      return current;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(queryKey, updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return {
    user: localUser ?? null,
    isLoading,
    error,
    updateProfile: (updates: UpdateProfileInput) => updateProfileMutation.mutateAsync(updates),
    isUpdating: updateProfileMutation.isPending,
  };
}

export interface UseUsersResult {
  users: User[];
  getUserById: (id: string) => User | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useUsers(): UseUsersResult {
  const queryKey = ['users'];

  const {
    data: users = [],
    isLoading,
    error,
    refetch,
  } = useQuery<User[], Error>({
    queryKey,
    queryFn: () => userRepository.getAllUsers(),
  });

  const getUserById = useCallback(
    (id: string): User | undefined => {
      return users.find((u) => u.id === id);
    },
    [users]
  );

  return {
    users,
    getUserById,
    isLoading,
    error,
    refetch,
  };
}
