import { db } from '../../storage/local/database';
import { syncRepository } from '../../storage/repositories/sync-repository';
import { googleAuthService } from '../auth/google-auth-service';
import { googleDriveService } from '../drive/google-drive-service';
import { googleSheetsService } from '../sheets/google-sheets-service';
import { onlineDetector } from './online-detector';
import {
  HEADERS,
  PERSONAL_SHEETS,
  GROUP_SHEETS,
  serializeExpense,
  deserializeExpense,
  serializeSplit,
  deserializeSplit,
  serializeSettlement,
  deserializeSettlement,
  serializeSettlementAllocation,
  deserializeSettlementAllocation,
  serializeCategory,
  deserializeCategory,
  serializeMember,
  deserializeMember,
  serializeOperationLog,
} from '../sheets/schema';
import type {
  SyncOperation,
  SyncStatus,
  SyncResult,
  ConflictResolution,
  FileMetadata,
} from '../../domain/models/types';

export class SyncEngine {
  private isSyncing = false;
  private lastSyncedAt?: string;
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  // Queue to serialize writes per spreadsheet ID
  private spreadsheetQueues: Map<string, Promise<any>> = new Map();

  constructor() {
    // Auto-sync when coming online if authenticated
    onlineDetector.onOnlineChange((online) => {
      this.notifyStatusChange();
      if (online && googleAuthService.isAuthenticated()) {
        this.startSync().catch((err) => {
          console.error('Auto-sync on reconnect error:', err);
        });
      }
    });

    googleAuthService.onAuthStateChange((_state) => {
      this.notifyStatusChange();
    });
  }

  getSyncStatus(): SyncStatus {
    return {
      isOnline: onlineDetector.isOnline(),
      isSyncing: this.isSyncing,
      pendingCount: 0, // Updated dynamically or in async queries
      lastSyncedAt: this.lastSyncedAt,
      hasConflicts: false,
      authState: googleAuthService.getAuthState(),
    };
  }

  async getAccurateSyncStatus(): Promise<SyncStatus> {
    const pendingCount = await syncRepository.getPendingCount();
    const conflicts = await syncRepository.getConflicts();

    return {
      isOnline: onlineDetector.isOnline(),
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      hasConflicts: conflicts.length > 0,
      authState: googleAuthService.getAuthState(),
    };
  }

  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    this.getAccurateSyncStatus().then((s) => callback(s));
    return () => {
      this.listeners.delete(callback);
    };
  }

  private async notifyStatusChange(): Promise<void> {
    const status = await this.getAccurateSyncStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('Error in sync status listener:', err);
      }
    }
  }

  /**
   * Serializes write operations per spreadsheet to avoid race conditions.
   */
  private async queueSpreadsheetWrite<T>(spreadsheetId: string, task: () => Promise<T>): Promise<T> {
    const previousPromise = this.spreadsheetQueues.get(spreadsheetId) || Promise.resolve();
    const nextPromise = (async () => {
      await previousPromise.catch(() => {});
      return await task();
    })();

    this.spreadsheetQueues.set(spreadsheetId, nextPromise);
    return await nextPromise;
  }

  /**
   * Resolves or ensures a remote Google Spreadsheet for a given logical source.
   */
  async ensureSpreadsheetForSource(sourceId: string, isGroup: boolean = false): Promise<string> {
    // 1. Check local file metadata
    const metadata = await db.fileMetadata.where('logicalId').equals(sourceId).first();
    if (metadata?.googleFileId) {
      const hasAccess = await googleDriveService.checkFileAccess(metadata.googleFileId);
      if (hasAccess) {
        return metadata.googleFileId;
      }
    }

    // 2. Search Drive for existing spreadsheet
    const folderId = await googleDriveService.ensureTabbyFolder();
    const sheetName = isGroup ? `Tabby_Group_${sourceId}` : `Tabby_Personal_${sourceId}`;
    const existingFile = await googleDriveService.findFile(sheetName, folderId);

    if (existingFile) {
      const fileMeta: FileMetadata = {
        id: crypto.randomUUID(),
        fileType: isGroup ? 'group' : 'personal',
        logicalId: sourceId,
        googleFileId: existingFile.id,
        name: sheetName,
        lastSyncedAt: new Date().toISOString(),
      };
      await db.fileMetadata.put(fileMeta);
      return existingFile.id;
    }

    // 3. Create new spreadsheet in Tabby folder
    const spreadsheetId = await googleDriveService.createSpreadsheet(sheetName, folderId);

    // 4. Initialize schema headers
    if (isGroup) {
      await googleSheetsService.initializeSheet(spreadsheetId, GROUP_SHEETS.METADATA, HEADERS.METADATA);
      await googleSheetsService.initializeSheet(spreadsheetId, GROUP_SHEETS.MEMBERS, HEADERS.MEMBERS);
      await googleSheetsService.initializeSheet(spreadsheetId, GROUP_SHEETS.EXPENSES, HEADERS.EXPENSES);
      await googleSheetsService.initializeSheet(spreadsheetId, GROUP_SHEETS.SPLITS, HEADERS.SPLITS);
      await googleSheetsService.initializeSheet(spreadsheetId, GROUP_SHEETS.SETTLEMENTS, HEADERS.SETTLEMENTS);
      await googleSheetsService.initializeSheet(
        spreadsheetId,
        GROUP_SHEETS.SETTLEMENT_ALLOCATIONS,
        HEADERS.SETTLEMENT_ALLOCATIONS
      );
      await googleSheetsService.initializeSheet(spreadsheetId, GROUP_SHEETS.OPERATION_LOG, HEADERS.OPERATION_LOG);
    } else {
      await googleSheetsService.initializeSheet(spreadsheetId, PERSONAL_SHEETS.METADATA, HEADERS.METADATA);
      await googleSheetsService.initializeSheet(spreadsheetId, PERSONAL_SHEETS.EXPENSES, HEADERS.EXPENSES);
      await googleSheetsService.initializeSheet(spreadsheetId, PERSONAL_SHEETS.CATEGORIES, HEADERS.CATEGORIES);
      await googleSheetsService.initializeSheet(spreadsheetId, PERSONAL_SHEETS.SETTINGS, HEADERS.SETTINGS);
      await googleSheetsService.initializeSheet(spreadsheetId, PERSONAL_SHEETS.OPERATION_LOG, HEADERS.OPERATION_LOG);
    }

    const fileMeta: FileMetadata = {
      id: crypto.randomUUID(),
      fileType: isGroup ? 'group' : 'personal',
      logicalId: sourceId,
      googleFileId: spreadsheetId,
      name: sheetName,
      lastSyncedAt: new Date().toISOString(),
    };
    await db.fileMetadata.put(fileMeta);

    return spreadsheetId;
  }

  async startSync(): Promise<SyncResult> {
    if (!onlineDetector.isOnline()) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    if (!googleAuthService.isAuthenticated()) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    if (this.isSyncing) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    this.isSyncing = true;
    await this.notifyStatusChange();

    try {
      // 1. Fetch remote changes for all known sources
      const allMetadata = await db.fileMetadata.toArray();
      for (const meta of allMetadata) {
        try {
          await this.fetchRemoteChanges(meta.logicalId);
        } catch (fetchErr) {
          console.warn(`Error fetching remote changes for ${meta.logicalId}:`, fetchErr);
        }
      }

      // 2. Process local pending outbox operations
      const result = await this.processOutbox();
      this.lastSyncedAt = new Date().toISOString();
      return result;
    } finally {
      this.isSyncing = false;
      await this.notifyStatusChange();
    }
  }

  async processOutbox(): Promise<SyncResult> {
    const pendingOps = await syncRepository.getPendingOperations();
    let synced = 0;
    let failed = 0;
    let conflicts = 0;

    for (const op of pendingOps) {
      try {
        await this.syncEntity(op);
        const updatedOp = await syncRepository.getOperationById(op.id);
        if (updatedOp?.status === 'synced') {
          synced++;
        } else if (updatedOp?.status === 'conflict') {
          conflicts++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`Failed to sync operation ${op.operationId}:`, err);
        await syncRepository.updateOperationStatus(op.id, 'failed', (err as Error).message);
        failed++;
      }
    }

    return { synced, failed, conflicts };
  }

  async syncEntity(operation: SyncOperation): Promise<void> {
    await syncRepository.updateOperationStatus(operation.id, 'syncing');

    const isGroup = operation.entityType === 'group' || 
                    operation.entityType === 'groupMembership' || 
                    operation.entityType === 'settlement' ||
                    Boolean(operation.payload?.groupId);

    const spreadsheetId = await this.ensureSpreadsheetForSource(operation.sourceId, isGroup);

    await this.queueSpreadsheetWrite(spreadsheetId, async () => {
      // 1. Check idempotency: Has this operation already been logged?
      const existingOp = await googleSheetsService.findRowById(
        spreadsheetId,
        'OperationLog',
        0,
        operation.operationId
      );

      if (existingOp) {
        // Already successfully applied remotely
        await syncRepository.markSynced(operation.id);
        return;
      }

      // 2. Determine target sheet and row ID column
      const { sheetName, idColumnIndex } = this.getSheetMapping(operation.entityType);

      if (operation.action === 'create') {
        // Check for existing record before retrying a create
        const existingRecord = await googleSheetsService.findRowById(
          spreadsheetId,
          sheetName,
          idColumnIndex,
          operation.entityId
        );

        if (existingRecord) {
          const resolution = this.reconcile(operation, existingRecord.data);
          if (!resolution.resolved) {
            await syncRepository.updateOperationStatus(
              operation.id,
              'conflict',
              'Conflict: Remote record exists with conflicting data'
            );
            return;
          }
          // If resolved with local, update the remote row
          const serialized = this.serializePayload(operation.entityType, operation.payload);
          await googleSheetsService.updateRows(
            spreadsheetId,
            sheetName,
            `${existingRecord.rowIndex}:${existingRecord.rowIndex}`,
            [serialized]
          );
        } else {
          // Append new entity row
          const serialized = this.serializePayload(operation.entityType, operation.payload);
          await googleSheetsService.appendRows(spreadsheetId, sheetName, [serialized]);

          // If expense has splits, append them to Splits sheet
          if (operation.entityType === 'expense' && Array.isArray(operation.payload?.splits)) {
            const splitRows = operation.payload.splits.map((split: any) => serializeSplit(split));
            if (splitRows.length > 0) {
              await googleSheetsService.appendRows(spreadsheetId, 'Splits', splitRows);
            }
          }

          // If settlement has allocations, append them to SettlementAllocations sheet
          if (operation.entityType === 'settlement' && Array.isArray(operation.payload?.allocations)) {
            const allocRows = operation.payload.allocations.map((a: any) => serializeSettlementAllocation(a));
            if (allocRows.length > 0) {
              await googleSheetsService.appendRows(spreadsheetId, 'SettlementAllocations', allocRows);
            }
          }
        }
      } else if (operation.action === 'update') {
        const existingRecord = await googleSheetsService.findRowById(
          spreadsheetId,
          sheetName,
          idColumnIndex,
          operation.entityId
        );

        const serialized = this.serializePayload(operation.entityType, operation.payload);
        if (existingRecord) {
          await googleSheetsService.updateRows(
            spreadsheetId,
            sheetName,
            `${existingRecord.rowIndex}:${existingRecord.rowIndex}`,
            [serialized]
          );
        } else {
          await googleSheetsService.appendRows(spreadsheetId, sheetName, [serialized]);
        }
      } else if (operation.action === 'delete') {
        const existingRecord = await googleSheetsService.findRowById(
          spreadsheetId,
          sheetName,
          idColumnIndex,
          operation.entityId
        );

        if (existingRecord) {
          // Soft-delete remotely
          const softDeletedPayload = {
            ...operation.payload,
            deletedAt: new Date().toISOString(),
          };
          const serialized = this.serializePayload(operation.entityType, softDeletedPayload);
          await googleSheetsService.updateRows(
            spreadsheetId,
            sheetName,
            `${existingRecord.rowIndex}:${existingRecord.rowIndex}`,
            [serialized]
          );
        }
      }

      // 3. Log completed operation to OperationLog
      const logRow = serializeOperationLog({
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        action: operation.action || operation.operationType || 'update',
        payload: operation.payload,
        appliedAt: new Date().toISOString(),
        userId: operation.payload?.paidBy || operation.payload?.userId || 'tabby-client',
      });
      await googleSheetsService.appendRows(spreadsheetId, 'OperationLog', [logRow]);

      // 4. Mark synced locally
      await syncRepository.markSynced(operation.id);
    });
  }

  async fetchRemoteChanges(sourceId: string): Promise<void> {
    const metadata = await db.fileMetadata.where('logicalId').equals(sourceId).first();
    if (!metadata?.googleFileId) {
      return;
    }

    const spreadsheetId = metadata.googleFileId;
    const isGroup = metadata.fileType === 'group';

    // Fetch expenses
    try {
      const expenseRows = await googleSheetsService.getSheetData(spreadsheetId, 'Expenses');
      if (expenseRows.length > 1) {
        // Skip header row
        const dataRows = expenseRows.slice(1);
        for (const row of dataRows) {
          if (!row[0]) continue;
          const remoteExpense = deserializeExpense(row);
          const localExpense = await db.expenses.get(remoteExpense.id);

          // If local doesn't exist or remote is strictly newer and not locally modified
          if (!localExpense || (remoteExpense.updatedAt > localExpense.updatedAt)) {
            // Check if there is an unsynced local pending operation on this entity
            const pending = await db.syncOperations
              .where('entityId')
              .equals(remoteExpense.id)
              .filter((op) => op.status === 'pending')
              .first();

            if (!pending) {
              await db.expenses.put(remoteExpense);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to pull Expenses from sheet ${spreadsheetId}:`, err);
    }

    if (isGroup) {
      // Fetch splits
      try {
        const splitRows = await googleSheetsService.getSheetData(spreadsheetId, 'Splits');
        if (splitRows.length > 1) {
          const dataRows = splitRows.slice(1);
          for (const row of dataRows) {
            if (!row[0]) continue;
            const split = deserializeSplit(row);
            await db.expenseSplits.put(split);
          }
        }
      } catch (err) {
        console.warn(`Failed to pull Splits from sheet ${spreadsheetId}:`, err);
      }

      // Fetch settlements
      try {
        const settlementRows = await googleSheetsService.getSheetData(spreadsheetId, 'Settlements');
        if (settlementRows.length > 1) {
          const dataRows = settlementRows.slice(1);
          for (const row of dataRows) {
            if (!row[0]) continue;
            const settlement = deserializeSettlement(row);
            const local = await db.settlements.get(settlement.id);
            if (!local || settlement.updatedAt > local.updatedAt) {
              const pending = await db.syncOperations
                .where('entityId')
                .equals(settlement.id)
                .filter((op) => op.status === 'pending')
                .first();

              if (!pending) {
                await db.settlements.put(settlement);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to pull Settlements from sheet ${spreadsheetId}:`, err);
      }

      // Fetch settlement allocations
      try {
        const allocRows = await googleSheetsService.getSheetData(spreadsheetId, 'SettlementAllocations');
        if (allocRows.length > 1) {
          const dataRows = allocRows.slice(1);
          for (const row of dataRows) {
            if (!row[0]) continue;
            const alloc = deserializeSettlementAllocation(row);
            await db.settlementAllocations.put(alloc);
          }
        }
      } catch (err) {
        console.warn(`Failed to pull SettlementAllocations from sheet ${spreadsheetId}:`, err);
      }

      // Fetch group members
      try {
        const memberRows = await googleSheetsService.getSheetData(spreadsheetId, 'Members');
        if (memberRows.length > 1) {
          const dataRows = memberRows.slice(1);
          for (const row of dataRows) {
            if (!row[0]) continue;
            const member = deserializeMember(row);
            await db.groupMemberships.put(member);
          }
        }
      } catch (err) {
        console.warn(`Failed to pull Members from sheet ${spreadsheetId}:`, err);
      }
    } else {
      // Personal categories
      try {
        const catRows = await googleSheetsService.getSheetData(spreadsheetId, 'Categories');
        if (catRows.length > 1) {
          const dataRows = catRows.slice(1);
          for (const row of dataRows) {
            if (!row[0]) continue;
            const category = deserializeCategory(row);
            await db.categories.put(category);
          }
        }
      } catch (err) {
        console.warn(`Failed to pull Categories from sheet ${spreadsheetId}:`, err);
      }
    }

    // Record checkpoint
    await syncRepository.updateCheckpoint({
      sourceId,
      entityType: 'all',
      lastSyncedAt: new Date().toISOString(),
    });
  }

  reconcile(localOp: SyncOperation, remoteRowData: any[]): ConflictResolution {
    const local = localOp.payload;
    if (!local) {
      return { type: 'use_remote', resolved: true };
    }

    // If expense or settlement, check updatedAt column
    if (operationIsTimestamped(remoteRowData)) {
      const remoteUpdatedAt = String(remoteRowData[remoteRowData.length - 1] || '');
      const localUpdatedAt = String(local.updatedAt || '');

      if (localUpdatedAt >= remoteUpdatedAt) {
        return { type: 'use_local', resolved: true };
      }
      return { type: 'manual', resolved: false };
    }

    return { type: 'use_local', resolved: true };
  }

  async retryFailed(): Promise<void> {
    const failedOps = await db.syncOperations
      .filter((op) => op.status === 'failed' || op.status === 'conflict')
      .toArray();

    for (const op of failedOps) {
      await syncRepository.updateOperationStatus(op.id, 'pending');
    }

    await this.processOutbox();
  }

  private getSheetMapping(entityType: string): { sheetName: string; idColumnIndex: number } {
    switch (entityType) {
      case 'expense':
        return { sheetName: 'Expenses', idColumnIndex: 0 };
      case 'settlement':
        return { sheetName: 'Settlements', idColumnIndex: 0 };
      case 'category':
        return { sheetName: 'Categories', idColumnIndex: 0 };
      case 'groupMembership':
        return { sheetName: 'Members', idColumnIndex: 1 };
      case 'group':
        return { sheetName: 'Metadata', idColumnIndex: 0 };
      default:
        return { sheetName: 'Expenses', idColumnIndex: 0 };
    }
  }

  private serializePayload(entityType: string, payload: any): any[] {
    switch (entityType) {
      case 'expense':
        return serializeExpense(payload);
      case 'settlement':
        return serializeSettlement(payload);
      case 'category':
        return serializeCategory(payload);
      case 'groupMembership':
        return serializeMember(payload);
      default:
        return [payload.id, JSON.stringify(payload)];
    }
  }
}

function operationIsTimestamped(row: any[]): boolean {
  if (!row || row.length < 2) return false;
  const lastCell = String(row[row.length - 1]);
  // Simple check for ISO date format YYYY-MM-DDTHH:...
  return /^\d{4}-\d{2}-\d{2}T/.test(lastCell);
}

export const syncEngine = new SyncEngine();
