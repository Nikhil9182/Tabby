import { db } from '../local/database';
import type { SyncOperation, SyncCheckpoint, SyncOperationStatus } from '../../domain/models/types';

export class SyncRepository {
  async addOperation(op: SyncOperation): Promise<void> {
    await db.syncOperations.put(op);
  }

  async getPendingOperations(): Promise<SyncOperation[]> {
    const ops = await db.syncOperations
      .where('status')
      .equals('pending')
      .toArray();

    // Sort FIFO by createdAt
    return ops.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getOperationById(id: string): Promise<SyncOperation | undefined> {
    return await db.syncOperations.get(id);
  }

  async getOperationByOperationId(operationId: string): Promise<SyncOperation | undefined> {
    return await db.syncOperations
      .where('operationId')
      .equals(operationId)
      .first();
  }

  async updateOperationStatus(id: string, status: SyncOperationStatus | string, error?: string): Promise<void> {
    const now = new Date().toISOString();
    await db.syncOperations.update(id, {
      status: status as SyncOperationStatus,
      ...(error !== undefined ? { error } : {}),
      updatedAt: now,
    });
  }

  async markSynced(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.syncOperations.update(id, {
      status: 'synced',
      error: undefined,
      updatedAt: now,
    });
  }

  async getConflicts(): Promise<SyncOperation[]> {
    return await db.syncOperations
      .where('status')
      .equals('conflict')
      .toArray();
  }

  async getPendingCount(): Promise<number> {
    return await db.syncOperations
      .where('status')
      .equals('pending')
      .count();
  }

  async clearSyncedOperations(): Promise<void> {
    await db.syncOperations
      .where('status')
      .equals('synced')
      .delete();
  }

  async updateCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
    await db.syncCheckpoints.put(checkpoint);
  }

  async getCheckpoint(sourceId: string, entityType: string): Promise<SyncCheckpoint | undefined> {
    return await db.syncCheckpoints.get([sourceId, entityType]);
  }
}

export const syncRepository = new SyncRepository();
