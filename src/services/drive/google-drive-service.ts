import { googleAuthService } from '../auth/google-auth-service';
import { isDeletingAccount } from '../account/deletion-state';
import type { DriveFile } from '../../domain/models/types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const TABBY_FOLDER_NAME = 'Tabby';
export interface OwnedTabbyFile { id: string; name: string; ownedByMe: boolean; shared?: boolean; owners: Array<{ emailAddress: string }>; appProperties?: Record<string, string> }
export const isTabbyFile = (file: Pick<OwnedTabbyFile, 'name' | 'appProperties'>) =>
  file.appProperties?.tabby === 'true' || /^Tabby_(Personal|Group|Request)_[A-Za-z0-9_-]+$/.test(file.name);
export const isSharedTabbyLedger = (file: OwnedTabbyFile) => file.name.startsWith('Tabby_Group_') || file.appProperties?.kind === 'Group' ||
  !!(file.shared && !file.name.startsWith('Tabby_Request_') && file.appProperties?.kind !== 'Request');

export class GoogleDriveService {
  async listOwnedTabbyFiles(): Promise<OwnedTabbyFile[]> {
    const files: OwnedTabbyFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: "'me' in owners and trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and (name contains 'Tabby_' or appProperties has { key='tabby' and value='true' })",
        fields: 'nextPageToken,files(id,name,ownedByMe,shared,owners(emailAddress),appProperties)', pageSize: '100',
        ...(pageToken ? { pageToken } : {}),
      });
      const response = await this.fetchWithAuth(`${DRIVE_API_BASE}/files?${params}`);
      if (!response.ok) throw new Error('Could not list owned Tabby files. No data has been erased.');
      const data = await response.json();
      files.push(...(data.files || []).filter(isTabbyFile));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  async deleteOwnedTabbyFile(fileId: string, accountEmail: string): Promise<void> {
    const response = await this.fetchWithAuth(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,ownedByMe,owners(emailAddress),appProperties`, {}, true);
    if (response.status === 404) return; // Safe retry after a partially completed deletion.
    if (!response.ok) throw new Error('Could not verify file ownership.');
    const file: OwnedTabbyFile = await response.json();
    if (!file.ownedByMe || !file.owners.some(owner => owner.emailAddress.toLowerCase() === accountEmail.toLowerCase()) || !isTabbyFile(file)) {
      throw new Error('Deletion stopped: this file is not an owned Tabby spreadsheet.');
    }
    const result = await this.fetchWithAuth(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }, true);
    if (!result.ok && result.status !== 404) throw new Error(`Could not delete ${file.name}. Retry to finish erasing cloud data.`);
  }
  async shareWithUser(fileId: string, email: string, message?: string): Promise<void> {
    const existingResponse = await this.fetchWithAuth(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,emailAddress,role)`);
    if (!existingResponse.ok) throw new Error('Could not verify existing spreadsheet permissions.');
    const existing = await existingResponse.json();
    if (existing.permissions?.some((p: { emailAddress?: string; role: string }) => p.emailAddress?.toLowerCase() === email.toLowerCase() && p.role === 'writer')) return;
    const response = await this.fetchWithAuth(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true${message ? `&emailMessage=${encodeURIComponent(message)}` : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
    });
    if (!response.ok) throw new Error(`Could not send the Google Drive invitation (HTTP ${response.status}).`);
  }

  async revokeUser(fileId: string, email: string): Promise<void> {
    const response = await this.fetchWithAuth(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,emailAddress,role)`);
    if (!response.ok) throw new Error('Could not read spreadsheet permissions.');
    const data = await response.json();
    for (const permission of data.permissions || []) {
      if (permission.emailAddress?.toLowerCase() !== email.toLowerCase() || permission.role === 'owner') continue;
      const result = await this.fetchWithAuth(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permission.id)}`, { method: 'DELETE' });
      if (!result.ok) throw new Error('Could not revoke spreadsheet access.');
    }
  }

  async preventResharing(fileId: string): Promise<void> {
    const response = await this.fetchWithAuth(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writersCanShare: false }),
    });
    if (!response.ok) throw new Error('Could not restrict spreadsheet sharing.');
  }

  async listInvitationFiles(): Promise<Array<{ id: string; owners: Array<{ emailAddress: string }> }>> {
    const files: Array<{ id: string; owners: Array<{ emailAddress: string }> }> = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: "trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet' and name contains 'Tabby_Request_'",
        fields: 'nextPageToken,files(id,owners(emailAddress))', pageSize: '100',
        ...(pageToken ? { pageToken } : {}),
      });
      const response = await this.fetchWithAuth(`${DRIVE_API_BASE}/files?${params}`);
      if (!response.ok) throw new Error('Could not load collaboration requests from Google Drive.');
      const data = await response.json();
      files.push(...(data.files || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}, allowNotFound = false): Promise<Response> {
    const token = googleAuthService.getAccessToken();
    if (!token) {
      googleAuthService.handleTokenExpiry();
      throw new Error('Not authenticated with Google.');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      googleAuthService.handleTokenExpiry();
      throw new Error('Google authorization token expired or invalid (HTTP 401).');
    }

    if (response.status === 403) {
      const errorText = await response.text();
      throw new Error(`Google Drive permission denied (HTTP 403): ${errorText}`);
    }

    if (response.status === 404 && !allowNotFound) {
      throw new Error('Google Drive resource not found (HTTP 404).');
    }

    if (response.status === 429) {
      throw new Error('Google Drive rate limit exceeded (HTTP 429). Please wait before retrying.');
    }

    return response;
  }

  async findTabbyFolder(): Promise<string | null> {
    const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${TABBY_FOLDER_NAME}' and trashed = false`;
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error(`Failed to query Tabby folder: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    return null;
  }

  async createTabbyFolder(): Promise<string> {
    const url = `${DRIVE_API_BASE}/files`;
    const body = {
      name: TABBY_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    };

    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Tabby folder: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.id;
  }

  async ensureTabbyFolder(): Promise<string> {
    const existingId = await this.findTabbyFolder();
    if (existingId) {
      return existingId;
    }
    return await this.createTabbyFolder();
  }

  async findFile(name: string, folderId?: string): Promise<DriveFile | null> {
    const escapedName = name.replace(/'/g, "\\'");
    let query = `name = '${escapedName}' and trashed = false`;
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const fields = 'files(id,name,mimeType,createdTime,modifiedTime,owners,shared,permissions)';
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&spaces=drive`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error(`Failed to search file: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0] as DriveFile;
    }

    return null;
  }

  async createSpreadsheet(name: string, folderId: string): Promise<string> {
    if (isDeletingAccount()) throw new Error('Account deletion is in progress. Spreadsheet creation is paused.');
    const url = `${DRIVE_API_BASE}/files`;
    const body = {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      appProperties: { tabby: 'true', kind: name.split('_')[1] || 'Unknown' },
      parents: [folderId],
    };

    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to create spreadsheet '${name}': HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.id;
  }

  async listTabbyFiles(): Promise<DriveFile[]> {
    const folderId = await this.ensureTabbyFolder();
    const query = `'${folderId}' in parents and trashed = false`;
    const fields = 'files(id,name,mimeType,createdTime,modifiedTime,owners,shared,permissions)';
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&spaces=drive`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error(`Failed to list Tabby files: HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data.files || []) as DriveFile[];
  }

  async checkFileAccess(fileId: string): Promise<boolean> {
    try {
      const url = `${DRIVE_API_BASE}/files/${fileId}?fields=id`;
      const response = await this.fetchWithAuth(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getFileMetadata(fileId: string): Promise<DriveFile> {
    const fields = 'id,name,mimeType,createdTime,modifiedTime,owners,shared,permissions';
    const url = `${DRIVE_API_BASE}/files/${fileId}?fields=${encodeURIComponent(fields)}`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      throw new Error(`Failed to get file metadata for ${fileId}: HTTP ${response.status}`);
    }

    return (await response.json()) as DriveFile;
  }
}

export const googleDriveService = new GoogleDriveService();
