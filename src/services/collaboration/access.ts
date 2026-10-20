import { db } from '@/storage/local/database';
import { userRepository } from '@/storage/repositories/user-repository';

/** Validate local writes too: a pending contact can never become an expense participant. */
export async function requireActiveParticipants(groupId: string | undefined, participants: string[]): Promise<void> {
  const user = await userRepository.getCurrentUser();
  if (!groupId) {
    if (participants.some(id => id !== user?.id)) throw new Error('Choose an accepted friendship or group ledger to share expenses.');
    return;
  }
  const members = await db.groupMemberships.where('groupId').equals(groupId).toArray();
  const active = new Set(members.filter(m => !m.status || m.status === 'active').map(m => m.userId));
  if (!user || !active.has(user.id) || participants.some(id => !active.has(id))) throw new Error('Only active members who accepted an invitation can share expenses in this ledger.');
}
