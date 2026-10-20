import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  account: { email: 'alice@example.com' }, authenticated: true,
  list: vi.fn(), erase: vi.fn(), clear: vi.fn(), signOut: vi.fn(), idle: vi.fn(),
}));
vi.mock('@/storage/local/database', () => ({ db: {
  tables: [{ clear: () => mocks.clear() }],
  transaction: async (_mode: string, _tables: unknown, callback: () => Promise<void>) => callback(),
} }));
vi.mock('@/storage/repositories/user-repository', () => ({ userRepository: { getCurrentUser: async () => mocks.account } }));
vi.mock('../auth/google-auth-service', () => ({ googleAuthService: {
  isAuthenticated: () => mocks.authenticated, getCurrentUser: () => mocks.account, signOut: () => mocks.signOut(),
} }));
vi.mock('../drive/google-drive-service', () => ({
  googleDriveService: { listOwnedTabbyFiles: (...args: unknown[]) => mocks.list(...args), deleteOwnedTabbyFile: (...args: unknown[]) => mocks.erase(...args) },
  isSharedTabbyLedger: (file: { name: string }) => file.name.startsWith('Tabby_Group_'),
}));
vi.mock('../sync/sync-engine', () => ({ syncEngine: { waitUntilIdle: () => mocks.idle() } }));
vi.mock('../collaboration/collaboration-service', () => ({ collaborationService: { waitUntilIdle: async () => {} } }));
import { AccountDeletionService, type DeletionPlan } from './account-deletion-service';
import { isDeletingAccount, setDeletingAccount } from './deletion-state';

const owned = { id: 'personal', name: 'Tabby_Personal_alice', ownedByMe: true, owners: [{ emailAddress: 'alice@example.com' }] };
const plan: DeletionPlan = { scope: 'cloud', accountEmail: 'alice@example.com', files: [owned] };
beforeEach(() => {
  vi.clearAllMocks(); setDeletingAccount(false);
  mocks.account = { email: 'alice@example.com' }; mocks.authenticated = true;
  mocks.list.mockResolvedValue([owned]); mocks.erase.mockResolvedValue(undefined); mocks.idle.mockResolvedValue(undefined);
  localStorage.clear(); sessionStorage.clear();
});
describe('Account deletion', () => {
  it('does not delete anything while preparing the review', async () => {
    const reviewed = await new AccountDeletionService().prepare('cloud');
    expect(reviewed.files).toEqual([owned]);
    expect(mocks.erase).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it('excludes files belonging to someone else', async () => {
    mocks.list.mockResolvedValue([owned, { ...owned, id: 'bob-file', ownedByMe: false, owners: [{ emailAddress: 'bob@example.com' }] }]);
    expect((await new AccountDeletionService().prepare('cloud')).files).toEqual([owned]);
  });
  it('requires exact confirmation before stopping sync or erasing data', async () => {
    await expect(new AccountDeletionService().execute(plan, 'delete', false)).rejects.toThrow('Type DELETE');
    expect(mocks.erase).not.toHaveBeenCalled(); expect(mocks.idle).not.toHaveBeenCalled();
  });
  it('requires acknowledgement of the effect on shared ledger members', async () => {
    await expect(new AccountDeletionService().execute({ ...plan, files: [{ ...owned, name: 'Tabby_Group_trip' }] }, 'DELETE', false)).rejects.toThrow('other members');
    expect(mocks.erase).not.toHaveBeenCalled();
  });
  it('waits for sync, erases the reviewed files, clears local data, and signs out last', async () => {
    localStorage.setItem('tabby_default_currency', 'INR'); localStorage.setItem('unrelated-app', 'keep');
    await new AccountDeletionService().execute(plan, 'DELETE', false);
    expect(mocks.erase).toHaveBeenCalledExactlyOnceWith('personal', 'alice@example.com');
    expect(mocks.idle.mock.invocationCallOrder[0]).toBeLessThan(mocks.erase.mock.invocationCallOrder[0]);
    expect(mocks.erase.mock.invocationCallOrder[0]).toBeLessThan(mocks.clear.mock.invocationCallOrder[0]);
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0]);
    expect(localStorage.getItem('tabby_default_currency')).toBeNull(); expect(localStorage.getItem('unrelated-app')).toBe('keep');
    expect(isDeletingAccount()).toBe(true);
  });
  it('retains local data and pauses sync if a cloud deletion fails midway', async () => {
    mocks.erase.mockRejectedValueOnce(new Error('Drive offline'));
    await expect(new AccountDeletionService().execute(plan, 'DELETE', false)).rejects.toThrow('Drive offline');
    expect(mocks.clear).not.toHaveBeenCalled(); expect(mocks.signOut).not.toHaveBeenCalled();
    expect(isDeletingAccount()).toBe(true);
  });
  it('supports erasing this device without Google and never touches Drive in that mode', async () => {
    mocks.authenticated = false;
    const service = new AccountDeletionService();
    await service.execute(await service.prepare('device'), 'DELETE', false);
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.erase).not.toHaveBeenCalled(); expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it('refuses a reviewed plan when the account has changed', async () => {
    mocks.account = { email: 'bob@example.com' };
    await expect(new AccountDeletionService().execute(plan, 'DELETE', true)).rejects.toThrow('account changed');
    expect(mocks.erase).not.toHaveBeenCalled();
  });
});
