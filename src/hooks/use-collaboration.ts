import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './use-users';
import { supabase } from '@/lib/supabase';
import { groupService } from '@/services/supabase/group-service';

export interface SupabaseInvitation {
  id: string;
  groupId: string;
  groupName: string;
  invitedEmail: string;
  invitedBy: string;
  inviterName: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  token: string;
  expiresAt: string;
  createdAt: string;
}

export function useCollaboration() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const userEmail = (user?.email || '').trim().toLowerCase();

  const { data: invitations = [], isLoading } = useQuery<SupabaseInvitation[]>({
    queryKey: ['invitations', userEmail],
    queryFn: async () => {
      if (!userEmail) return [];

      const { data, error } = await supabase
        .from('group_invitations')
        .select(`
          id,
          group_id,
          invited_email,
          invited_by,
          role,
          status,
          token,
          expires_at,
          created_at,
          groups (
            name
          ),
          profiles:invited_by (
            display_name
          )
        `)
        .or(`invited_email.eq.${userEmail},invited_by.eq.${user?.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching group invitations:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        groupId: row.group_id,
        groupName: row.groups?.name || 'Group',
        invitedEmail: row.invited_email,
        invitedBy: row.invited_by,
        inviterName: row.profiles?.display_name || 'Group Member',
        role: row.role,
        status: row.status,
        token: row.token,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      }));
    },
    enabled: !!userEmail,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['invitations'] }),
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
      queryClient.invalidateQueries({ queryKey: ['group-members'] }),
    ]);
  };

  const send = useMutation({
    mutationFn: async ({ email, groupId }: { email: string; groupId?: string }) => {
      if (!groupId) throw new Error('Please select a group for this invitation.');
      return await groupService.createInvitation(groupId, email);
    },
    onSuccess: invalidate,
  });

  const respond = useMutation({
    mutationFn: async ({ id, accept, token }: { id: string; accept: boolean; token?: string }) => {
      if (accept) {
        if (!token) {
          const inv = invitations.find((i) => i.id === id);
          if (!inv?.token) throw new Error('Invitation token not found');
          return await groupService.acceptInvitation(inv.token);
        }
        return await groupService.acceptInvitation(token);
      } else {
        const { error } = await supabase
          .from('group_invitations')
          .update({ status: 'revoked' })
          .eq('id', id);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('group_invitations')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const pendingIncoming = invitations.filter(
    (i) => i.status === 'pending' && i.invitedEmail.toLowerCase() === userEmail
  );

  return {
    invitations,
    friends: [],
    isLoading,
    pendingIncoming,
    sendRequest: send.mutateAsync,
    respond: respond.mutateAsync,
    cancelRequest: cancel.mutateAsync,
    refresh: () => invalidate(),
    isBusy: send.isPending || respond.isPending || cancel.isPending,
    error: send.error || respond.error || cancel.error,
  };
}
