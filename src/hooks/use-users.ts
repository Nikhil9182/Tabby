import { useCallback } from 'react';
import { isDeletingAccount } from '@/services/account/deletion-state';
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

  const { user: googleUser } = useAuth();

  const {
    data: localUser,
    isLoading,
    error,
  } = useQuery<User | null, Error>({
    queryKey: ['current-user', googleUser?.sub],
    queryFn: async () => {
      if (isDeletingAccount()) return null;
      // Clean up any legacy placeholder alias rows
      await userRepository.cleanLegacyAliases();

      let existing = await userRepository.getCurrentUser();

      // If we have an authenticated Google user but no local record or googleSub mismatch,
      // create or sync the local current user record
      if (googleUser) {
        if (!existing || existing.googleSub !== googleUser.sub || existing.id !== `google_${googleUser.sub}`) {
          const now = new Date().toISOString();
          const syncedUser: User = {
            id: `google_${googleUser.sub}`,
            name: googleUser.name || 'Anonymous User',
            email: googleUser.email,
            googleSub: googleUser.sub,
            picture: googleUser.picture,
            isCurrentUser: true,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };
          const sameAccount = !existing?.googleSub || existing.googleSub === googleUser.sub;
          await userRepository.adoptGoogleIdentity(syncedUser, sameAccount ? existing?.id : undefined);
          void queryClient.invalidateQueries({ queryKey: ['users'] });
          void queryClient.invalidateQueries({ queryKey: ['groups'] });
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
        void queryClient.invalidateQueries({ queryKey: ['users'] });
        return initialUser;
      }

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

      // Retroactively update any legacy records stored with 'user_self' or 'current_user'
      try {
        await userRepository.cleanLegacyAliases();
        const legacyExpenses = await db.expenses
          .filter((exp) => exp.paidBy === 'user_self' || exp.paidBy === 'current_user')
          .toArray();
        for (const exp of legacyExpenses) {
          await db.expenses.update(exp.id, { paidBy: current.id });
        }
        const legacySplits = await db.expenseSplits
          .filter((s) => s.userId === 'user_self' || s.userId === 'current_user')
          .toArray();
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

export interface AddFriendInput {
  email: string;
  name?: string;
}

export interface UseUsersResult {
  users: User[];
  getUserById: (id: string) => User | undefined;
  addFriend: (input: AddFriendInput) => Promise<User>;
  removeFriend: (id: string) => Promise<void>;
  isAddingFriend: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useUsers(): UseUsersResult {
  const queryClient = useQueryClient();
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

  const addFriendMutation = useMutation({
    mutationFn: async (input: AddFriendInput): Promise<User> => {
      const email = input.email.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }

      const currentUser = await userRepository.getCurrentUser();
      if (currentUser?.email && currentUser.email.trim().toLowerCase() === email) {
        throw new Error('You cannot add your own email as a friend.');
      }

      const existing = await userRepository.getUserByEmail(email);
      if (existing) {
        throw new Error(`A contact with the email "${email}" already exists.`);
      }

      const displayName = input.name?.trim() || email.split('@')[0];
      const now = new Date().toISOString();
      const newFriend: User = {
        id: generateId(),
        name: displayName,
        email,
        isCurrentUser: false,
        createdAt: now,
        updatedAt: now,
      };

      await userRepository.upsertUser(newFriend);
      return newFriend;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async (friendId: string): Promise<void> => {
      await userRepository.deleteUser(friendId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return {
    users,
    getUserById,
    addFriend: (input: AddFriendInput) => addFriendMutation.mutateAsync(input),
    removeFriend: (id: string) => removeFriendMutation.mutateAsync(id),
    isAddingFriend: addFriendMutation.isPending,
    isLoading,
    error,
    refetch,
  };
}
