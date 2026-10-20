import { db } from '@/storage/local/database';
import { userRepository } from '@/storage/repositories/user-repository';
import { googleAuthService } from '../auth/google-auth-service';
import { googleDriveService, isSharedTabbyLedger, type OwnedTabbyFile } from '../drive/google-drive-service';
import { syncEngine } from '../sync/sync-engine';
import { collaborationService } from '../collaboration/collaboration-service';
import { DELETION_STATE_KEY, markAccountErased, setDeletingAccount } from './deletion-state';

export interface DeletionPlan {
  scope: 'device' | 'cloud';
  accountEmail: string;
  files: OwnedTabbyFile[];
}

export class AccountDeletionService {
  private executing = false;
  async prepare(scope: DeletionPlan['scope']): Promise<DeletionPlan> {
    const localUser = await userRepository.getCurrentUser();
    const accountEmail = (localUser?.email || '').trim().toLowerCase();
    if (scope === 'device') return { scope, accountEmail, files: [] };
    const googleUser = googleAuthService.getCurrentUser();
    if (!googleAuthService.isAuthenticated() || !googleUser || googleUser.email.toLowerCase() !== accountEmail) throw new Error('Connect the matching Google account to erase its Drive data.');
    const files = await googleDriveService.listOwnedTabbyFiles();
    return { scope, accountEmail, files: files.filter(f => f.ownedByMe && f.owners.some(owner => owner.emailAddress.toLowerCase() === accountEmail)) };
  }

  async execute(plan: DeletionPlan, confirmation: string, sharedAcknowledged: boolean, progress?: (text: string) => void): Promise<void> {
    if (this.executing) throw new Error('Deletion is already in progress.');
    if (confirmation !== 'DELETE') throw new Error('Type DELETE to confirm.');
    const currentUser = await userRepository.getCurrentUser();
    if ((currentUser?.email || '').trim().toLowerCase() !== plan.accountEmail) throw new Error('The account changed. Review deletion again.');
    if (plan.scope === 'cloud') {
      const googleUser = googleAuthService.getCurrentUser();
      if (!googleAuthService.isAuthenticated() || googleUser?.email.toLowerCase() !== plan.accountEmail) throw new Error('Reconnect the matching Google account before deleting.');
      if (plan.files.some(isSharedTabbyLedger) && !sharedAcknowledged) throw new Error('Confirm that deleting owned shared ledgers affects other members.');
    }
    setDeletingAccount(true);
    this.executing = true;
    try {
      progress?.('Stopping synchronization…');
      await syncEngine.waitUntilIdle();
      await collaborationService.waitUntilIdle();
      if (plan.scope === 'cloud') {
        for (let index = 0; index < plan.files.length; index++) {
          progress?.(`Deleting Google Drive file ${index + 1} of ${plan.files.length}…`);
          await googleDriveService.deleteOwnedTabbyFile(plan.files[index].id, plan.accountEmail);
        }
      }
      progress?.('Erasing data from this device…');
      for (const storage of [localStorage, sessionStorage]) {
        for (const key of Object.keys(storage)) if (key !== DELETION_STATE_KEY && /^tabby(?:_|-)/i.test(key)) storage.removeItem(key);
      }
      if (typeof caches !== 'undefined') {
        for (const key of await caches.keys()) if (key.startsWith('tabby-')) await caches.delete(key);
      }
      // Keep identity and records until fallible cloud/cache cleanup is complete.
      // The transaction prevents a half-cleared local database on failure.
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) await table.clear();
      });
      googleAuthService.signOut();
      markAccountErased();
      // Keep synchronization suspended until the caller navigates to onboarding.
    } finally {
      // Leave sync paused after a partial failure, otherwise local data could
      // recreate a cloud file that was already erased. Retrying is idempotent.
      this.executing = false;
    }
  }
}
export const accountDeletionService = new AccountDeletionService();
