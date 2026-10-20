import { googleAuthService } from '../auth/google-auth-service';
import type { SpreadsheetInfo } from '../../domain/models/types';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class GoogleSheetsService {
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
      throw new Error('Google Sheets authorization token expired or invalid (HTTP 401).');
    }

    if (response.status === 403) {
      const errorText = await response.text();
      throw new Error(`Google Sheets permission denied (HTTP 403): ${errorText}`);
    }

    if (response.status === 404) {
      throw new Error('Google spreadsheet not found (HTTP 404).');
    }

    if (response.status === 429) {
      throw new Error('Google Sheets rate limit exceeded (HTTP 429). Please retry later.');
    }

    return response;
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
    const url = `${SHEETS_API_BASE}/${spreadsheetId}`;
    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to get spreadsheet ${spreadsheetId}: HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      spreadsheetId: data.spreadsheetId,
      title: data.properties?.title || '',
      sheets: (data.sheets || []).map((s: any) => ({
        sheetId: s.properties?.sheetId,
        title: s.properties?.title,
        index: s.properties?.index,
      })),
    };
  }

  async getSheetData(spreadsheetId: string, sheetName: string, range?: string): Promise<any[][]> {
    const fullRange = range ? `${sheetName}!${range}` : sheetName;
    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?valueRenderOption=UNFORMATTED_VALUE`;

    const response = await this.fetchWithAuth(url);
    if (!response.ok) {
      // If sheet is empty or not yet written, it might return 400 or empty values
      if (response.status === 400) {
        return [];
      }
      throw new Error(`Failed to get sheet data from ${fullRange}: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  async appendRows(spreadsheetId: string, sheetName: string, rows: any[][]): Promise<void> {
    if (rows.length === 0) return;

    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to append rows to ${sheetName}: HTTP ${response.status}`);
    }
  }

  async updateRows(spreadsheetId: string, sheetName: string, range: string, values: any[][]): Promise<void> {
    const fullRange = `${sheetName}!${range}`;
    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?valueInputOption=RAW`;

    const response = await this.fetchWithAuth(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update rows at ${fullRange}: HTTP ${response.status}`);
    }
  }

  async findRowById(
    spreadsheetId: string,
    sheetName: string,
    idColumn: number,
    id: string
  ): Promise<{ rowIndex: number; data: any[] } | null> {
    const rows = await this.getSheetData(spreadsheetId, sheetName);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && String(row[idColumn]) === id) {
        // Return 1-based row index for Google Sheets A1 notation
        return {
          rowIndex: i + 1,
          data: row,
        };
      }
    }
    return null;
  }

  async createSheet(spreadsheetId: string, sheetName: string): Promise<void> {
    const request = {
      addSheet: {
        properties: {
          title: sheetName,
        },
      },
    };

    await this.batchUpdate(spreadsheetId, [request]);
  }

  async initializeSheet(spreadsheetId: string, sheetName: string, headers: string[]): Promise<void> {
    const info = await this.getSpreadsheet(spreadsheetId);
    const sheetExists = info.sheets.some((s: { title: string }) => s.title === sheetName);

    if (!sheetExists) {
      await this.createSheet(spreadsheetId, sheetName);
    }

    const currentData = await this.getSheetData(spreadsheetId, sheetName, '1:1');
    if (!currentData || currentData.length === 0 || !currentData[0] || currentData[0].length === 0) {
      await this.updateRows(spreadsheetId, sheetName, '1:1', [headers]);
    }
  }

  async batchUpdate(spreadsheetId: string, requests: any[]): Promise<void> {
    if (requests.length === 0) return;

    const url = `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`;
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to execute batchUpdate on ${spreadsheetId}: HTTP ${response.status}`);
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
