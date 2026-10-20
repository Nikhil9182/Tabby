import { db } from '@/storage/local/database';
import { isDeletingAccount } from '../account/deletion-state';
import { userRepository } from '@/storage/repositories/user-repository';
import { googleAuthService } from '../auth/google-auth-service';
import { googleDriveService } from '../drive/google-drive-service';
import { googleSheetsService } from '../sheets/google-sheets-service';
import { invitationSchema, normalizeEmail, canRespond, type CollaborationInvitation, type InvitationDetails } from '@/domain/models/collaboration';
import { serializeMember, serializeGroupMetadata, deserializeMember, deserializeGroupMetadata } from '../sheets/schema';
import type { User } from '@/domain/models/types';

const RESPONSE = 'Response';
const REQUEST = 'Request';
const STATE = 'State';

export class CollaborationService {
  private refreshTask: Promise<void> | null = null;
  async waitUntilIdle(): Promise<void> { await this.refreshTask?.catch(() => {}); }

  private async identity(): Promise<User> {
    if (isDeletingAccount()) throw new Error('Account deletion is in progress.');
    const googleUser = googleAuthService.getCurrentUser();
    const user = await userRepository.getCurrentUser();
    if (!googleAuthService.isAuthenticated() || !googleUser || !user || normalizeEmail(user.email) !== normalizeEmail(googleUser.email)) {
      throw new Error('Connect your Google account to send or respond to requests.');
    }
    return { ...user, email: normalizeEmail(googleUser.email), name: googleUser.name };
  }

  async send(emailInput: string, groupId?: string): Promise<CollaborationInvitation> {
    const user = await this.identity();
    const email = normalizeEmail(emailInput);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (email === normalizeEmail(user.email)) throw new Error('You cannot invite yourself.');
    await this.refresh();
    const invites = await db.invitations.where('accountEmail').equals(user.email).toArray();
    const kind = groupId ? 'group' : 'friend';
    const duplicate = invites.find(i => i.kind === kind && (groupId ? i.sourceId === groupId : true) &&
      [i.sender.email, i.recipientEmail].map(normalizeEmail).includes(email) &&
      ['pending', 'accepted', 'active'].includes(i.status));
    if (duplicate) throw new Error(duplicate.status === 'active' ? 'You already collaborate with this person.' : 'A request is already pending. Check your received requests.');

    const id = crypto.randomUUID();
    const sourceId = groupId || `direct_${id}`;
    const now = new Date().toISOString();
    let group = await db.groups.get(sourceId);
    if (groupId && (!group || group.createdBy !== user.id)) throw new Error('Only the group owner can invite members.');
    if (groupId && group?.kind === 'direct') throw new Error('A friendship ledger is private to two people. Create a separate group to invite someone else.');
    if (!group) {
      group = { id: sourceId, kind: 'direct', name: `${user.name || user.email} & ${email}`, createdBy: user.id, currency: 'USD', createdAt: now, updatedAt: now };
      await db.groups.put(group);
      await db.groupMemberships.put({ groupId: sourceId, userId: user.id, role: 'owner', status: 'active', joinedAt: now });
    }
    const { syncEngine } = await import('../sync/sync-engine');
    const spreadsheetId = await syncEngine.ensureSpreadsheetForSource(sourceId, true);
    await googleDriveService.preventResharing(spreadsheetId);
    await googleSheetsService.updateRows(spreadsheetId, 'Metadata', 'A2:B11', serializeGroupMetadata(group));
    const details: InvitationDetails = {
      id, kind, sender: { id: user.id, email: user.email, name: user.name || user.email, googleSub: user.googleSub, picture: user.picture },
      recipientEmail: email, sourceId, spreadsheetId, groupName: group.name,
      currency: group.currency || 'USD', createdAt: now,
    };
    const folderId = await googleDriveService.ensureTabbyFolder();
    const fileId = await googleDriveService.createSpreadsheet(`Tabby_Request_${id}`, folderId);
    for (const sheet of [REQUEST, RESPONSE, STATE]) await googleSheetsService.initializeSheet(fileId, sheet, ['Request / status', 'Profile']);
    await googleSheetsService.updateRows(fileId, REQUEST, 'A2', [[JSON.stringify(details)]]);
    await googleSheetsService.updateRows(fileId, STATE, 'A2', [['pending']]);
    // Only the owner can change the invitation identity, ledger target, or activation state.
    const info = await googleSheetsService.getSpreadsheet(fileId);
    await googleSheetsService.batchUpdate(fileId, info.sheets.filter(s => s.title !== RESPONSE).map(s => ({
      addProtectedRange: { protectedRange: { range: { sheetId: s.sheetId }, warningOnly: false, editors: { users: [user.email] } } },
    })));
    await googleDriveService.preventResharing(fileId);
    const link = `${window.location.origin}${import.meta.env.BASE_URL}friends`;
    await googleDriveService.shareWithUser(fileId, email,
      `${user.name || user.email} invited you ${kind === 'friend' ? 'to split expenses together' : `to join ${group.name}`} on Tabby. Open ${link}, connect this Google account, and accept or decline in Requests. This invitation contains no expenses; expense access starts only after you accept and the owner syncs.`);
    const invite: CollaborationInvitation = { ...details, fileId, accountEmail: user.email, status: 'pending' };
    await db.invitations.put(invite);
    return invite;
  }

  async respond(id: string, accept: boolean): Promise<void> {
    const user = await this.identity();
    const invite = await db.invitations.get(id);
    if (!invite || invite.accountEmail !== user.email || !canRespond(invite, user.email) || invite.status !== 'pending') throw new Error('This pending request is not addressed to your account.');
    const statusRows = await googleSheetsService.getSheetData(invite.fileId, STATE);
    if (statusRows[1]?.[0] !== 'pending') throw new Error('This request is no longer pending. Refresh requests.');
    const person = { id: user.id, email: user.email, name: user.name || user.email, googleSub: user.googleSub, picture: user.picture };
    await googleSheetsService.updateRows(invite.fileId, RESPONSE, 'A2:B2', [[accept ? 'accepted' : 'declined', JSON.stringify(person)]]);
    await db.invitations.update(id, { status: accept ? 'accepted' : 'declined', recipient: person });
  }

  async cancel(id: string): Promise<void> {
    const user = await this.identity();
    const invite = await db.invitations.get(id);
    if (!invite || invite.accountEmail !== user.email || normalizeEmail(invite.sender.email) !== user.email || !['pending', 'accepted'].includes(invite.status)) throw new Error('Only the sender can cancel a pending request.');
    await googleSheetsService.updateRows(invite.fileId, STATE, 'A2', [['cancelled']]);
    await db.invitations.update(id, { status: 'cancelled' });
  }

  async removeMember(sourceId: string, userId: string): Promise<void> {
    const user = await this.identity();
    const group = await db.groups.get(sourceId);
    const person = await db.users.get(userId);
    const metadata = await db.fileMetadata.where('logicalId').equals(sourceId).first();
    if (!group || group.createdBy !== user.id || !person || userId === user.id || !metadata?.googleFileId) throw new Error('Only the owner can remove a collaborator.');
    await googleDriveService.revokeUser(metadata.googleFileId, person.email);
    const member = await db.groupMemberships.get([sourceId, userId]);
    if (member) {
      const removed = { ...member, status: 'removed' as const, updatedAt: new Date().toISOString() };
      const row = await googleSheetsService.findRowById(metadata.googleFileId, 'Members', 1, userId);
      if (row) await googleSheetsService.updateRows(metadata.googleFileId, 'Members', `A${row.rowIndex}:F${row.rowIndex}`, [serializeMember(removed)]);
      await db.groupMemberships.put(removed);
    }
    const invites = await db.invitations.where('sourceId').equals(sourceId).toArray();
    for (const invite of invites.filter(i => normalizeEmail(i.recipientEmail) === normalizeEmail(person.email))) {
      await googleSheetsService.updateRows(invite.fileId, STATE, 'A2', [['cancelled']]);
      await db.invitations.update(invite.id, { status: 'cancelled' });
    }
  }

  refresh(): Promise<void> {
    if (isDeletingAccount()) return Promise.resolve();
    if (!this.refreshTask) this.refreshTask = this.loadRequests().finally(() => { this.refreshTask = null; });
    return this.refreshTask;
  }

  private async loadRequests(): Promise<void> {
    if (!googleAuthService.isAuthenticated()) return;
    const user = await this.identity();
    const files = await googleDriveService.listInvitationFiles();
    for (const file of files) {
      const rows = await googleSheetsService.getSheetData(file.id, REQUEST);
      let raw: unknown;
      try { raw = JSON.parse(String(rows[1]?.[0] || 'null')); } catch { continue; }
      const parsed = invitationSchema.safeParse(raw);
      if (!parsed.success) continue;
      const details = parsed.data;
      // A copied or forged request from a third party must never grant ledger access.
      if (!file.owners.some(owner => normalizeEmail(owner.emailAddress) === normalizeEmail(details.sender.email))) continue;
      const outgoing = normalizeEmail(details.sender.email) === user.email;
      if (!outgoing && !canRespond(details, user.email)) continue;
      const stateRows = await googleSheetsService.getSheetData(file.id, STATE);
      const responseRows = await googleSheetsService.getSheetData(file.id, RESPONSE);
      const state = String(stateRows[1]?.[0] || 'pending');
      const response = String(responseRows[1]?.[0] || 'pending');
      let profile: unknown;
      try { profile = responseRows[1]?.[1] ? JSON.parse(String(responseRows[1][1])) : undefined; } catch { continue; }
      const recipientResult = invitationSchema.shape.sender.safeParse(profile);
      const recipient = recipientResult.success ? recipientResult.data : undefined;
      const accepted = response === 'accepted' && recipient && canRespond(details, recipient.email);
      if (state === 'active' && !accepted) continue;
      let status: CollaborationInvitation['status'] = state === 'cancelled' ? 'cancelled' : state === 'active' ? 'active' : response === 'declined' ? 'declined' : accepted ? 'accepted' : 'pending';
      const invite: CollaborationInvitation = { ...details, accountEmail: user.email, fileId: file.id, status, recipient };
      if (outgoing && accepted && state === 'pending') {
        // Financial access is granted by the ledger owner ONLY after recipient acceptance.
        await this.activate(invite);
        await googleSheetsService.updateRows(file.id, STATE, 'A2', [['active']]);
        status = 'active';
        invite.status = status;
      }
      if (status === 'active' && recipient) await this.importActive(invite, user.id);
      await db.invitations.put(invite);
    }
  }

  private async activate(invite: CollaborationInvitation): Promise<void> {
    if (!invite.recipient) throw new Error('Acceptance profile missing.');
    let group = await db.groups.get(invite.sourceId);
    if (!group) {
      const remote = deserializeGroupMetadata(await googleSheetsService.getSheetData(invite.spreadsheetId, 'Metadata'));
      if (remote?.id === invite.sourceId) { group = remote; await db.groups.put(remote); }
    }
    if (!group || group.createdBy !== invite.sender.id) throw new Error('Group owner must sync this invitation.');
    const info = await googleSheetsService.getSpreadsheet(invite.fileId);
    const responseSheet = info.sheets.find(s => s.title === RESPONSE);
    if (!responseSheet) throw new Error('Invitation response sheet is missing.');
    await googleSheetsService.batchUpdate(invite.fileId, [{ addProtectedRange: { protectedRange: {
      range: { sheetId: responseSheet.sheetId }, warningOnly: false, editors: { users: [invite.sender.email] },
    } } }]);
    const confirmed = await googleSheetsService.getSheetData(invite.fileId, RESPONSE);
    if (confirmed[1]?.[0] !== 'accepted' || JSON.stringify(JSON.parse(String(confirmed[1]?.[1] || 'null'))) !== JSON.stringify(invite.recipient)) {
      throw new Error('Invitation response changed during activation. Refresh requests.');
    }
    await googleDriveService.shareWithUser(invite.spreadsheetId, invite.recipientEmail,
      `Your Tabby request was accepted. Open ${window.location.origin}${import.meta.env.BASE_URL}friends to collaborate.`);
    const now = new Date().toISOString();
    const member = { groupId: invite.sourceId, userId: invite.recipient.id, role: 'member', status: 'active' as const, joinedAt: now, updatedAt: now };
    const remoteMembers = await googleSheetsService.getSheetData(invite.spreadsheetId, 'Members');
    const members = remoteMembers.slice(1).filter(row => row[0]).map(deserializeMember);
    const merged = [...members.filter(m => m.userId !== member.userId && m.userId !== invite.sender.id),
      { groupId: invite.sourceId, userId: invite.sender.id, role: 'owner', status: 'active' as const, joinedAt: invite.createdAt }, member];
    await googleSheetsService.updateRows(invite.spreadsheetId, 'Members', 'A2:F' + (merged.length + 1), merged.map(serializeMember));
    // Profiles are necessary to resolve names on every collaborator's device.
    await googleSheetsService.initializeSheet(invite.spreadsheetId, 'Profiles', ['id', 'profile']);
    const existing = await googleSheetsService.getSheetData(invite.spreadsheetId, 'Profiles');
    const profiles = new Map(existing.slice(1).map(r => [String(r[0]), r]));
    for (const person of [invite.sender, invite.recipient]) profiles.set(person.id, [person.id, JSON.stringify(person)]);
    await googleSheetsService.updateRows(invite.spreadsheetId, 'Profiles', `A2:B${profiles.size + 1}`, [...profiles.values()]);
    await db.groupMemberships.put(member);
  }

  private async importActive(invite: CollaborationInvitation, currentId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const person of [invite.sender, invite.recipient!]) {
      const existing = await db.users.get(person.id);
      await db.users.put({ ...existing, ...person, isCurrentUser: person.id === currentId, createdAt: existing?.createdAt || now, updatedAt: now });
    }
    const existing = await db.fileMetadata.where('logicalId').equals(invite.sourceId).first();
    await db.fileMetadata.put({ id: existing?.id || crypto.randomUUID(), fileType: 'group', logicalId: invite.sourceId, googleFileId: invite.spreadsheetId });
    if (!await db.groups.get(invite.sourceId)) await db.groups.put({
      id: invite.sourceId, kind: invite.kind === 'friend' ? 'direct' : 'group', name: invite.groupName,
      currency: invite.currency, createdBy: invite.sender.id, createdAt: invite.createdAt, updatedAt: now,
    });
    for (const person of [invite.sender, invite.recipient!]) {
      if (!await db.groupMemberships.get([invite.sourceId, person.id])) await db.groupMemberships.put({
        groupId: invite.sourceId, userId: person.id, role: person.id === invite.sender.id ? 'owner' : 'member', status: 'active', joinedAt: now,
      });
    }
  }
}

export const collaborationService = new CollaborationService();
