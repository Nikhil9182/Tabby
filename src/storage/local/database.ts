import Dexie, { type Table } from 'dexie';
import type { CollaborationInvitation } from '../../domain/models/collaboration';
import type {
  User,
  Group,
  GroupMembership,
  Expense,
  ExpenseSplit,
  Settlement,
  SettlementAllocation,
  Category,
  SyncOperation,
  ExchangeRateCache,
  FileMetadata,
  SyncCheckpoint,
} from '../../domain/models/types';

export class TabbyDatabase extends Dexie {
  invitations!: Table<CollaborationInvitation, string>;
  users!: Table<User, string>;
  groups!: Table<Group, string>;
  groupMemberships!: Table<GroupMembership, [string, string]>;
  expenses!: Table<Expense, string>;
  expenseSplits!: Table<ExpenseSplit, string>;
  settlements!: Table<Settlement, string>;
  settlementAllocations!: Table<SettlementAllocation, string>;
  categories!: Table<Category, string>;
  syncOperations!: Table<SyncOperation, string>;
  exchangeRateCache!: Table<ExchangeRateCache, [string, string, string]>;
  fileMetadata!: Table<FileMetadata, string>;
  syncCheckpoints!: Table<SyncCheckpoint, [string, string]>;

  constructor() {
    super('TabbyDatabase');
    this.version(1).stores({
      users: 'id, email, googleSub',
      groups: 'id, createdBy',
      groupMemberships: '[groupId+userId], groupId, userId',
      expenses: 'id, sourceType, sourceId, groupId, paidBy, expenseDate, categoryId, operationId, deletedAt',
      expenseSplits: 'id, expenseId, userId',
      settlements: 'id, sourceId, groupId, fromUserId, toUserId, operationId, deletedAt',
      settlementAllocations: 'id, settlementId, expenseId',
      categories: 'id, scope, ownerId',
      syncOperations: 'id, operationId, entityType, entityId, status, sourceId',
      exchangeRateCache: '[baseCurrency+quoteCurrency+rateDate], baseCurrency, quoteCurrency',
      fileMetadata: 'id, fileType, logicalId, googleFileId',
      syncCheckpoints: '[sourceId+entityType], sourceId, entityType',
    });
    this.version(2).stores({ invitations: 'id, fileId, accountEmail, status, sourceId' }).upgrade(async transaction => {
      // Old local contacts never went through acceptance or a Drive permission grant.
      const groups = await transaction.table('groups').toArray();
      const owners = new Map(groups.map(g => [g.id, g.createdBy]));
      await transaction.table('groupMemberships').toCollection().modify(member => {
        if (member.userId !== owners.get(member.groupId) && member.status !== 'removed') member.status = 'invited';
      });
    });
  }
}

export const db = new TabbyDatabase();
