import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@/domain/models/types';
import { useAuth } from './use-auth';
import { profileService, type DbProfile } from '@/services/supabase/profile-service';

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

function mapProfileToUser(profile: DbProfile | null, authUser: any): User | null {
  if (!profile && !authUser) return null;

  const id = profile?.id || authUser?.id || '';
  const name = profile?.display_name || authUser?.name || authUser?.displayName || 'User';
  const email = profile?.email || authUser?.email || '';
  const picture = profile?.avatar_url || authUser?.picture || authUser?.avatarUrl || undefined;

  return {
    id,
    name,
    displayName: name,
    email,
    picture,
    avatarUrl: picture,
    isCurrentUser: true,
    createdAt: profile?.created_at || new Date().toISOString(),
    updatedAt: profile?.updated_at || new Date().toISOString(),
  };
}

export function useCurrentUser(): UseCurrentUserResult {
  const queryClient = useQueryClient();
  const { user: authUser, isAuthenticated } = useAuth();

  const {
    data: user = null,
    isLoading,
    error,
  } = useQuery<User | null, Error>({
    queryKey: ['current-user', authUser?.id],
    queryFn: async () => {
      if (!isAuthenticated || !authUser?.id) return null;
      const profile = await profileService.getCurrentProfile();
      return mapProfileToUser(profile, authUser);
    },
    enabled: !!authUser?.id,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: UpdateProfileInput): Promise<User> => {
      const updatedProfile = await profileService.updateCurrentProfile({
        displayName: updates.name,
        avatarUrl: updates.picture,
      });
      const updated = mapProfileToUser(updatedProfile, authUser)!;
      void queryClient.invalidateQueries({ queryKey: ['current-user'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      return updated;
    },
  });

  return {
    user: user || (authUser ? mapProfileToUser(null, authUser) : null),
    isLoading,
    error: error as Error | null,
    updateProfile: (updates: UpdateProfileInput) => updateProfileMutation.mutateAsync(updates),
    isUpdating: updateProfileMutation.isPending,
  };
}

export interface UseUsersResult {
  users: User[];
  isLoading: boolean;
  error: Error | null;
  getUserById: (id: string) => User | undefined;
  refetch: () => Promise<unknown>;
}

export function useUsers(userIds?: string[]): UseUsersResult {
  const { user: currentUser } = useCurrentUser();

  const {
    data: usersMap = {},
    isLoading,
    error,
    refetch,
  } = useQuery<Record<string, DbProfile>, Error>({
    queryKey: ['users', (userIds || []).sort().join(',')],
    queryFn: async () => {
      if (!userIds || userIds.length === 0) return {};
      return await profileService.getProfiles(userIds);
    },
    enabled: !!userIds && userIds.length > 0,
  });

  const users: User[] = [];
  if (currentUser) {
    users.push(currentUser);
  }

  for (const [id, p] of Object.entries(usersMap)) {
    if (!users.some((u) => u.id === id)) {
      users.push({
        id: p.id,
        name: p.display_name,
        displayName: p.display_name,
        email: p.email || '',
        avatarUrl: p.avatar_url || undefined,
        picture: p.avatar_url || undefined,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      });
    }
  }

  const getUserById = (id: string): User | undefined => {
    if (currentUser && (currentUser.id === id || id === 'current_user' || id === 'user_self')) {
      return currentUser;
    }
    const found = users.find((u) => u.id === id);
    if (found) return found;

    const fromMap = usersMap[id];
    if (fromMap) {
      return {
        id: fromMap.id,
        name: fromMap.display_name,
        displayName: fromMap.display_name,
        email: fromMap.email || '',
        avatarUrl: fromMap.avatar_url || undefined,
        picture: fromMap.avatar_url || undefined,
        createdAt: fromMap.created_at,
        updatedAt: fromMap.updated_at,
      };
    }

    return undefined;
  };

  return {
    users,
    isLoading,
    error: error as Error | null,
    getUserById,
    refetch,
  };
}
