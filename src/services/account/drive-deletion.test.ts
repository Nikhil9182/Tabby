import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../auth/google-auth-service', () => ({ googleAuthService: { getAccessToken: () => 'test-token', handleTokenExpiry: vi.fn() } }));
import { GoogleDriveService, isSharedTabbyLedger, isTabbyFile } from '../drive/google-drive-service';
const request = vi.fn();
beforeEach(() => { request.mockReset(); vi.stubGlobal('fetch', request); });
afterEach(() => vi.unstubAllGlobals());
describe('Cloud deletion scope', () => {
  it('rechecks ownership before issuing an irreversible delete', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Tabby_Group_trip', ownedByMe: false, owners: [{ emailAddress: 'bob@example.com' }] })));
    await expect(new GoogleDriveService().deleteOwnedTabbyFile('shared', 'alice@example.com')).rejects.toThrow('not an owned Tabby');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('never deletes an unrelated owned spreadsheet', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Payroll', ownedByMe: true, owners: [{ emailAddress: 'alice@example.com' }] })));
    await expect(new GoogleDriveService().deleteOwnedTabbyFile('payroll', 'alice@example.com')).rejects.toThrow('not an owned Tabby');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('treats an already deleted file as completed on retry', async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(new GoogleDriveService().deleteOwnedTabbyFile('gone', 'alice@example.com')).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('recognizes renamed tagged shared ledgers and excludes unrelated names', () => {
    const file = { id: 'g', name: 'Renamed holiday', ownedByMe: true, shared: true, owners: [], appProperties: { tabby: 'true', kind: 'Group' } };
    expect(isTabbyFile(file)).toBe(true); expect(isSharedTabbyLedger(file)).toBe(true);
    expect(isTabbyFile({ name: 'Tabby_notes.xlsx' })).toBe(false);
  });
});
