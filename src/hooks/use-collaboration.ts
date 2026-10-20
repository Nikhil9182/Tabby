import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './use-users';
import { db } from '@/storage/local/database';
import { collaborationService } from '@/services/collaboration/collaboration-service';
import { normalizeEmail } from '@/domain/models/collaboration';

export function useCollaboration() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const email = normalizeEmail(user?.email || '');
  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ['invitations', email],
    queryFn: () => db.invitations.where('accountEmail').equals(email).toArray(),
    enabled: !!email, refetchInterval: 3000,
  });
  const invalidate = async () => {
    for (const key of ['invitations', 'users', 'groups', 'group', 'group-members']) await queryClient.invalidateQueries({ queryKey: [key] });
  };
  const send = useMutation({ mutationFn: ({ email, groupId }: { email: string; groupId?: string }) => collaborationService.send(email, groupId), onSuccess: invalidate });
  const respond = useMutation({ mutationFn: ({ id, accept }: { id: string; accept: boolean }) => collaborationService.respond(id, accept), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: (id: string) => collaborationService.cancel(id), onSuccess: invalidate });
  const refresh = useMutation({ mutationFn: () => collaborationService.refresh(), onSuccess: invalidate });
  const friends = invitations.filter(i => i.kind === 'friend' && i.status === 'active').map(i => ({
    invitation: i,
    person: normalizeEmail(i.sender.email) === email ? i.recipient! : i.sender,
  }));
  return {
    invitations, friends, isLoading,
    pendingIncoming: invitations.filter(i => i.status === 'pending' && normalizeEmail(i.recipientEmail) === email),
    sendRequest: send.mutateAsync, respond: respond.mutateAsync, cancelRequest: cancel.mutateAsync,
    refresh: refresh.mutateAsync,
    isBusy: send.isPending || respond.isPending || cancel.isPending || refresh.isPending,
    error: send.error || respond.error || cancel.error || refresh.error,
  };
}
