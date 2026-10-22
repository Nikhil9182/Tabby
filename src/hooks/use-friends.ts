import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { friendService, type AddFriendResult, type DbFriendProfile } from '@/services/supabase/friend-service';
import { useAuth } from './use-auth';

export type FriendItem = DbFriendProfile;

export interface UseFriendsResult {
  friends: FriendItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  addFriend: (email: string) => Promise<AddFriendResult>;
  isAdding: boolean;
  addError: Error | null;
}

const NO_FRIENDS: FriendItem[] = [];

export function useFriends(): UseFriendsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: friends = NO_FRIENDS,
    isLoading,
    error,
    refetch,
  } = useQuery<FriendItem[], Error>({
    queryKey: ['friends', user?.id],
    queryFn: async (): Promise<FriendItem[]> => {
      if (!user?.id) return [];
      return await friendService.getFriends(user.id);
    },
    enabled: !!user?.id,
  });

  const addFriendMutation = useMutation({
    mutationFn: async (email: string) => {
      return await friendService.addFriendByEmail(email);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
    },
  });

  return {
    friends,
    isLoading,
    error,
    refetch,
    addFriend: (email: string) => addFriendMutation.mutateAsync(email),
    isAdding: addFriendMutation.isPending,
    addError: addFriendMutation.error,
  };
}
