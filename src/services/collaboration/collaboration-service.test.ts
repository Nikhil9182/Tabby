import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationInvitation } from '@/domain/models/collaboration';

const mock = vi.hoisted(() => {
  const tables: Record<string, Map<string, any>> = {};
  const table = (name: string) => {
    const data = tables[name] = new Map();
    const key = (v: any) => Array.isArray(v) ? v.join('|') : String(v);
    const matches = (predicate: (row: any) => boolean) => ({
      toArray: async () => [...data.values()].filter(predicate),
      first: async () => [...data.values()].find(predicate),
    });
    return {
      get: async (id: any) => data.get(key(id)),
      put: async (row: any) => { data.set(row.id || key([row.groupId, row.userId]), row); },
      update: async (id: any, updates: any) => { data.set(key(id), { ...data.get(key(id)), ...updates }); },
      where: (field: string) => ({ equals: (value: any) => matches(r => r[field] === value) }),
      filter: (predicate: (row: any) => boolean) => matches(predicate),
    };
  };
  const db = { invitations: table('invitations'), users: table('users'), groups: table('groups'), groupMemberships: table('members'), fileMetadata: table('metadata') };
  const owner = { id: 'alice', email: 'alice@example.com', name: 'Alice', isCurrentUser: true };
  return { db, tables, current: owner as any,
    drive: { listInvitationFiles: vi.fn(), shareWithUser: vi.fn(), revokeUser: vi.fn(), ensureTabbyFolder: vi.fn(), createSpreadsheet: vi.fn(), preventResharing: vi.fn() },
    sheets: { getSheetData: vi.fn(), updateRows: vi.fn(), initializeSheet: vi.fn(), findRowById: vi.fn(), getSpreadsheet: vi.fn(), batchUpdate: vi.fn() },
  };
});
vi.mock('@/storage/local/database', () => ({ db: mock.db }));
vi.mock('@/storage/repositories/user-repository', () => ({ userRepository: { getCurrentUser: async () => mock.current } }));
vi.mock('../auth/google-auth-service', () => ({ googleAuthService: { isAuthenticated: () => true, getCurrentUser: () => mock.current } }));
vi.mock('../drive/google-drive-service', () => ({ googleDriveService: mock.drive }));
vi.mock('../sheets/google-sheets-service', () => ({ googleSheetsService: mock.sheets }));
vi.mock('../sync/sync-engine', () => ({ syncEngine: { ensureSpreadsheetForSource: async () => 'private-ledger' } }));
import { CollaborationService } from './collaboration-service';
import { requireActiveParticipants } from './access';
import { serializeMember, deserializeMember, serializeGroupMetadata, deserializeGroupMetadata } from '../sheets/schema';

const request: CollaborationInvitation = {
  id: 'request', fileId: 'invite-sheet', accountEmail: 'alice@example.com', kind: 'friend',
  sender: { id: 'alice', email: 'alice@example.com', name: 'Alice' },
  recipientEmail: 'bob@example.com', sourceId: 'direct_request', spreadsheetId: 'private-ledger',
  groupName: 'Alice & Bob', currency: 'USD', createdAt: '2026-10-21T00:00:00Z', status: 'pending',
};
const bob = { id: 'bob', email: 'bob@example.com', name: 'Bob' };
let remoteStatus: string;
let response: string;

beforeEach(async () => {
  vi.clearAllMocks();
  Object.values(mock.tables).forEach(t => t.clear());
  mock.current = { ...request.sender, isCurrentUser: true };
  remoteStatus = 'pending'; response = 'pending';
  await mock.db.invitations.put({ ...request });
  await mock.db.groups.put({ id: request.sourceId, createdBy: 'alice', kind: 'direct' });
  await mock.db.groupMemberships.put({ groupId: request.sourceId, userId: 'alice', role: 'owner', status: 'active' });
  mock.drive.listInvitationFiles.mockResolvedValue([{ id: request.fileId, owners: [{ emailAddress: request.sender.email }] }]);
  mock.sheets.getSheetData.mockImplementation(async (_id, sheet) => {
    if (sheet === 'Request') return [['Request'], [JSON.stringify(request)]];
    if (sheet === 'State') return [['State'], [remoteStatus]];
    if (sheet === 'Response') return [['Status', 'Profile'], [response, response === 'pending' ? '' : JSON.stringify(bob)]];
    return [];
  });
  mock.drive.shareWithUser.mockResolvedValue(undefined);
  mock.sheets.updateRows.mockResolvedValue(undefined);
  mock.drive.ensureTabbyFolder.mockResolvedValue('folder');
  mock.drive.createSpreadsheet.mockResolvedValue('new-invitation-sheet');
  mock.drive.preventResharing.mockResolvedValue(undefined);
  mock.sheets.getSpreadsheet.mockResolvedValue({ sheets: [{ sheetId: 1, title: 'Request' }, { sheetId: 2, title: 'Response' }, { sheetId: 3, title: 'State' }] });
});

describe('Collaboration acceptance and access', () => {
  it('sends email access to a protected invitation only, while leaving the expense ledger private', async () => {
    const result = await new CollaborationService().send('  charlie@example.com  ');
    expect(result.status).toBe('pending');
    expect(result.recipientEmail).toBe('charlie@example.com');
    expect(mock.drive.shareWithUser).toHaveBeenCalledExactlyOnceWith('new-invitation-sheet', 'charlie@example.com', expect.stringContaining('accept or decline'));
    expect(mock.sheets.batchUpdate).toHaveBeenCalledWith('new-invitation-sheet', [
      expect.objectContaining({ addProtectedRange: expect.objectContaining({ protectedRange: expect.objectContaining({ range: { sheetId: 1 } }) }) }),
      expect.objectContaining({ addProtectedRange: expect.objectContaining({ protectedRange: expect.objectContaining({ range: { sheetId: 3 } }) }) }),
    ]);
  });
  it('never lets a third person be invited into a private pair ledger', async () => {
    await expect(new CollaborationService().send('charlie@example.com', request.sourceId)).rejects.toThrow('private to two people');
    expect(mock.drive.shareWithUser).not.toHaveBeenCalled();
  });
  it('never grants expense access or creates a friend for a pending request', async () => {
    await new CollaborationService().refresh();
    expect(mock.drive.shareWithUser).not.toHaveBeenCalled();
    expect(await mock.db.users.get('bob')).toBeUndefined();
    expect((await mock.db.invitations.get('request')).status).toBe('pending');
  });
  it('accepts only for the addressed Google account, without granting expense access', async () => {
    const service = new CollaborationService();
    await expect(service.respond('request', true)).rejects.toThrow('not addressed');
    mock.current = { ...bob, isCurrentUser: true };
    await mock.db.invitations.put({ ...request, accountEmail: bob.email });
    await service.respond('request', true);
    expect(mock.sheets.updateRows).toHaveBeenCalledWith('invite-sheet', 'Response', 'A2:B2', [['accepted', expect.any(String)]]);
    expect(mock.drive.shareWithUser).not.toHaveBeenCalled();
    expect(await mock.db.fileMetadata.where('logicalId').equals(request.sourceId).first()).toBeUndefined();
  });
  it('grants precisely the pair ledger after acceptance and imports the real profile', async () => {
    response = 'accepted';
    await new CollaborationService().refresh();
    expect(mock.drive.shareWithUser).toHaveBeenCalledWith('private-ledger', bob.email, expect.any(String));
    expect((await mock.db.invitations.get('request')).status).toBe('active');
    expect((await mock.db.users.get('bob')).name).toBe('Bob');
    expect((await mock.db.groupMemberships.get([request.sourceId, 'bob'])).status).toBe('active');
    expect(mock.drive.shareWithUser).toHaveBeenCalledTimes(1);
  });
  it('keeps a failed permission grant retryable without activating membership', async () => {
    response = 'accepted';
    mock.drive.shareWithUser.mockRejectedValueOnce(new Error('Drive unavailable'));
    await expect(new CollaborationService().refresh()).rejects.toThrow('Drive unavailable');
    expect(await mock.db.groupMemberships.get([request.sourceId, 'bob'])).toBeUndefined();
    expect(mock.sheets.updateRows).not.toHaveBeenCalledWith('invite-sheet', 'State', 'A2', [['active']]);
  });
  it.each(['declined', 'cancelled'])('does not grant access for a %s request', async status => {
    if (status === 'cancelled') remoteStatus = status; else response = status;
    await new CollaborationService().refresh();
    expect(mock.drive.shareWithUser).not.toHaveBeenCalled();
  });
  it('rejects a request whose claimed sender is not the Drive owner', async () => {
    response = 'accepted';
    mock.drive.listInvitationFiles.mockResolvedValueOnce([{ id: request.fileId, owners: [{ emailAddress: 'mallory@example.com' }] }]);
    await new CollaborationService().refresh();
    expect(mock.drive.shareWithUser).not.toHaveBeenCalled();
  });
  it('imports a group request into a separate ledger without converting it to a friendship', async () => {
    const groupRequest = { ...request, kind: 'group', sourceId: 'trip', spreadsheetId: 'group-ledger', groupName: 'Trip' };
    remoteStatus = 'active'; response = 'accepted';
    mock.current = { ...bob, isCurrentUser: true };
    const getData = mock.sheets.getSheetData.getMockImplementation()!;
    mock.sheets.getSheetData.mockImplementation(async (id, sheet) => sheet === 'Request' ? [['Request'], [JSON.stringify(groupRequest)]] : getData(id, sheet));
    await new CollaborationService().refresh();
    expect((await mock.db.groups.get('trip')).kind).toBe('group');
    expect((await mock.db.fileMetadata.where('logicalId').equals('trip').first()).googleFileId).toBe('group-ledger');
    expect((await mock.db.invitations.get('request')).kind).toBe('group');
    expect(mock.drive.shareWithUser).not.toHaveBeenCalled();
  });
  it('blocks pending members at the write boundary and preserves personal isolation', async () => {
    await mock.db.groupMemberships.put({ groupId: request.sourceId, userId: 'bob', status: 'invited' });
    await expect(requireActiveParticipants(request.sourceId, ['alice', 'bob'])).rejects.toThrow('Only active members');
    await expect(requireActiveParticipants(undefined, ['alice', 'bob'])).rejects.toThrow('accepted friendship');
    await expect(requireActiveParticipants(undefined, ['alice'])).resolves.toBeUndefined();
  });
  it('round-trips membership status and distinguishes direct ledgers from groups', () => {
    const membership = { groupId: 'g', userId: 'bob', role: 'member', status: 'invited' as const, joinedAt: request.createdAt };
    expect(deserializeMember(serializeMember(membership)).status).toBe('invited');
    const group = { id: 'g', kind: 'direct' as const, name: 'Pair', createdBy: 'alice', createdAt: request.createdAt, updatedAt: request.createdAt };
    expect(deserializeGroupMetadata([['Key', 'Value'], ...serializeGroupMetadata(group)])?.kind).toBe('direct');
  });
});
