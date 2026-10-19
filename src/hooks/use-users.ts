import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User, SyncOperation } from '@/domain/models/types';
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
      const existing = await userRepository.getCurrentUser();

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
          return syncedUser;
        }
      }

      return existing ?? null;
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
