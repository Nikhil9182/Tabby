import { googleAuthService } from '../auth/google-auth-service';
import type { DriveFile } from '../../domain/models/types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const TABBY_FOLDER_NAME = 'Tabby';

export class GoogleDriveService {
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
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

    if (response.status === 404) {
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
    const url = `${DRIVE_API_BASE}/files`;
    const body = {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
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
