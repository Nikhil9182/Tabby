import { db } from '../local/database';
import type { Settlement, SettlementAllocation } from '../../domain/models/types';

export class SettlementRepository {
  async getAllSettlements(sourceId?: string): Promise<Settlement[]> {
    if (sourceId) {
      return await db.settlements
        .where('sourceId')
        .equals(sourceId)
        .filter((settlement) => !settlement.deletedAt)
        .toArray();
    }

    return await db.settlements
      .filter((settlement) => !settlement.deletedAt)
      .toArray();
  }

  async getSettlementById(id: string): Promise<Settlement | undefined> {
    return await db.settlements.get(id);
  }

  async getSettlementsByGroup(groupId: string): Promise<Settlement[]> {
    return await db.settlements
      .where('groupId')
      .equals(groupId)
      .filter((settlement) => !settlement.deletedAt)
      .toArray();
  }

  async createSettlement(settlement: Settlement, allocations?: SettlementAllocation[]): Promise<void> {
    await db.transaction('rw', db.settlements, db.settlementAllocations, async () => {
      await db.settlements.put(settlement);
      if (allocations && allocations.length > 0) {
        await db.settlementAllocations.bulkPut(allocations);
      }
    });
  }

  async updateSettlement(settlement: Settlement): Promise<void> {
    await db.settlements.put(settlement);
  }

  async deleteSettlement(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.settlements.update(id, {
      deletedAt: now,
      updatedAt: now,
    });
  }

  async getSettlementAllocations(settlementId: string): Promise<SettlementAllocation[]> {
    return await db.settlementAllocations
      .where('settlementId')
      .equals(settlementId)
      .toArray();
  }
}

export const settlementRepository = new SettlementRepository();
