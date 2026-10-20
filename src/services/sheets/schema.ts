import type {
  Group,
  Expense,
  ExpenseSplit,
  Settlement,
  SettlementAllocation,
  Category,
  GroupMembership,
  SpreadsheetInfo,
  SheetInfo,
  SplitType,
  CategoryScope,
  SourceType,
} from '../../domain/models/types';

export const SCHEMA_VERSION = '1.0.0';

export const PERSONAL_SHEETS = {
  METADATA: 'Metadata',
  EXPENSES: 'Expenses',
  CATEGORIES: 'Categories',
  SETTINGS: 'Settings',
  OPERATION_LOG: 'OperationLog',
} as const;

export const GROUP_SHEETS = {
  METADATA: 'Metadata',
  MEMBERS: 'Members',
  EXPENSES: 'Expenses',
  SPLITS: 'Splits',
  SETTLEMENTS: 'Settlements',
  SETTLEMENT_ALLOCATIONS: 'SettlementAllocations',
  OPERATION_LOG: 'OperationLog',
} as const;

export const HEADERS = {
  METADATA: ['Key', 'Value'],
  MEMBERS: ['groupId', 'userId', 'role', 'joinedAt', 'status', 'updatedAt'],
  EXPENSES: [
    'id',
    'sourceType',
    'sourceId',
    'groupId',
    'paidBy',
    'amountMinor',
    'currency',
    'description',
    'expenseDate',
    'categoryId',
    'splitType',
    'operationId',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  SPLITS: ['id', 'expenseId', 'userId', 'amountMinor', 'share', 'percentage', 'exactAmountMinor'],
  SETTLEMENTS: [
    'id',
    'sourceType',
    'sourceId',
    'groupId',
    'fromUserId',
    'toUserId',
    'amountMinor',
    'currency',
    'settlementDate',
    'note',
    'operationId',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ],
  SETTLEMENT_ALLOCATIONS: ['id', 'settlementId', 'expenseId', 'amountMinor'],
  CATEGORIES: ['id', 'name', 'icon', 'color', 'scope', 'ownerId', 'createdAt'],
  SETTINGS: ['key', 'value', 'updatedAt'],
  OPERATION_LOG: ['operationId', 'entityType', 'entityId', 'action', 'payloadJson', 'appliedAt', 'userId'],
};

// --- Validation Functions ---

export function validateSpreadsheetSchema(
  info: SpreadsheetInfo,
  expectedType: 'personal' | 'group'
): { isValid: boolean; missingSheets: string[] } {
  const existingSheetNames = new Set(info.sheets.map((s: SheetInfo) => s.title));
  const required = expectedType === 'personal'
    ? Object.values(PERSONAL_SHEETS)
    : Object.values(GROUP_SHEETS);

  const missingSheets = required.filter((name) => !existingSheetNames.has(name));
  return {
    isValid: missingSheets.length === 0,
    missingSheets,
  };
}

// --- Serialization & Deserialization Functions ---

export function serializeExpense(expense: Expense): any[] {
  const amount = expense.amountMinor ?? expense.originalAmountMinor ?? 0;
  const curr = expense.currency || expense.originalCurrency || 'USD';

  return [
    expense.id,
    expense.sourceType,
    expense.sourceId,
    expense.groupId || '',
    expense.paidBy,
    amount,
    curr,
    expense.description,
    expense.expenseDate,
    expense.categoryId || '',
    expense.splitType || '',
    expense.operationId || '',
    expense.deletedAt || '',
    expense.createdAt,
    expense.updatedAt,
  ];
}

export function deserializeExpense(row: any[]): Expense {
  const amount = Number.parseInt(String(row[5]), 10) || 0;
  const curr = String(row[6] || 'USD');

  return {
    id: String(row[0] || ''),
    sourceType: (row[1] || 'personal') as SourceType,
    sourceId: String(row[2] || ''),
    groupId: row[3] ? String(row[3]) : undefined,
    paidBy: String(row[4] || ''),
    originalAmountMinor: amount,
    amountMinor: amount,
    originalCurrency: curr,
    currency: curr,
    description: String(row[7] || ''),
    expenseDate: String(row[8] || ''),
    categoryId: row[9] ? String(row[9]) : undefined,
    splitType: (row[10] as SplitType) || 'equal',
    participants: [],
    operationId: row[11] ? String(row[11]) : undefined,
    deletedAt: row[12] ? String(row[12]) : null,
    createdAt: String(row[13] || new Date().toISOString()),
    updatedAt: String(row[14] || new Date().toISOString()),
  };
}

export function serializeSplit(split: ExpenseSplit): any[] {
  const share = split.amountMinor ?? split.shareMinor ?? 0;

  return [
    split.id,
    split.expenseId,
    split.userId,
    share,
    split.share ?? '',
    split.percentage ?? '',
    split.exactAmountMinor ?? '',
  ];
}

export function deserializeSplit(row: any[]): ExpenseSplit {
  const share = Number.parseInt(String(row[3]), 10) || 0;

  return {
    id: String(row[0] || ''),
    expenseId: String(row[1] || ''),
    userId: String(row[2] || ''),
    shareMinor: share,
    amountMinor: share,
    share: row[4] !== '' && row[4] !== undefined ? Number.parseFloat(String(row[4])) : undefined,
    percentage: row[5] !== '' && row[5] !== undefined ? Number.parseFloat(String(row[5])) : undefined,
    exactAmountMinor: row[6] !== '' && row[6] !== undefined ? Number.parseInt(String(row[6]), 10) : undefined,
  };
}

export function serializeSettlement(settlement: Settlement): any[] {
  return [
    settlement.id,
    settlement.sourceType || '',
    settlement.sourceId,
    settlement.groupId || '',
    settlement.fromUserId,
    settlement.toUserId,
    settlement.amountMinor,
    settlement.currency,
    settlement.settlementDate,
    settlement.note || settlement.notes || '',
    settlement.operationId || '',
    settlement.deletedAt || '',
    settlement.createdAt,
    settlement.updatedAt,
  ];
}

export function deserializeSettlement(row: any[]): Settlement {
  const noteVal = row[9] ? String(row[9]) : undefined;

  return {
    id: String(row[0] || ''),
    sourceType: row[1] ? (row[1] as SourceType) : undefined,
    sourceId: String(row[2] || ''),
    groupId: row[3] ? String(row[3]) : undefined,
    fromUserId: String(row[4] || ''),
    toUserId: String(row[5] || ''),
    amountMinor: Number.parseInt(String(row[6]), 10) || 0,
    currency: String(row[7] || 'USD'),
    settlementDate: String(row[8] || ''),
    notes: noteVal,
    note: noteVal,
    operationId: row[10] ? String(row[10]) : undefined,
    deletedAt: row[11] ? String(row[11]) : null,
    createdAt: String(row[12] || new Date().toISOString()),
    updatedAt: String(row[13] || new Date().toISOString()),
  };
}

export function serializeSettlementAllocation(allocation: SettlementAllocation): any[] {
  return [
    allocation.id,
    allocation.settlementId,
    allocation.expenseId,
    allocation.amountMinor,
  ];
}

export function deserializeSettlementAllocation(row: any[]): SettlementAllocation {
  return {
    id: String(row[0] || ''),
    settlementId: String(row[1] || ''),
    expenseId: String(row[2] || ''),
    amountMinor: Number.parseInt(String(row[3]), 10) || 0,
    currency: 'USD',
  };
}

export function serializeCategory(category: Category): any[] {
  return [
    category.id,
    category.name,
    category.icon || '',
    category.color || '',
    category.scope,
    category.ownerId || '',
    category.createdAt || '',
  ];
}

export function deserializeCategory(row: any[]): Category {
  return {
    id: String(row[0] || ''),
    name: String(row[1] || ''),
    icon: row[2] ? String(row[2]) : undefined,
    color: row[3] ? String(row[3]) : undefined,
    scope: (row[4] || 'personal') as CategoryScope,
    ownerId: row[5] ? String(row[5]) : undefined,
    createdAt: row[6] ? String(row[6]) : undefined,
  };
}

export function serializeMember(membership: GroupMembership): any[] {
  return [
    membership.groupId,
    membership.userId,
    membership.role,
    membership.joinedAt,
    membership.status || 'active',
    membership.updatedAt || membership.joinedAt,
  ];
}

export function deserializeMember(row: any[]): GroupMembership {
  return {
    groupId: String(row[0] || ''),
    userId: String(row[1] || ''),
    role: String(row[2] || 'member'),
    joinedAt: String(row[3] || new Date().toISOString()),
    status: row[4] === 'invited' || row[4] === 'removed' ? row[4] : 'active',
    updatedAt: String(row[5] || row[3] || ''),
  };
}

export function serializeOperationLog(op: {
  operationId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: any;
  appliedAt: string;
  userId: string;
}): any[] {
  return [
    op.operationId,
    op.entityType,
    op.entityId,
    op.action,
    JSON.stringify(op.payload ?? {}),
    op.appliedAt,
    op.userId,
  ];
}

export function deserializeOperationLog(row: any[]): {
  operationId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: any;
  appliedAt: string;
  userId: string;
} {
  let parsedPayload = {};
  try {
    if (row[4]) {
      parsedPayload = JSON.parse(String(row[4]));
    }
  } catch {
    parsedPayload = {};
  }

  return {
    operationId: String(row[0] || ''),
    entityType: String(row[1] || ''),
    entityId: String(row[2] || ''),
    action: String(row[3] || ''),
    payload: parsedPayload,
    appliedAt: String(row[5] || ''),
    userId: String(row[6] || ''),
  };
}

export function serializeGroupMetadata(group: Group): any[][] {
  return [
    ['id', group.id],
    ['name', group.name],
    ['description', group.description || ''],
    ['currency', group.currency || 'USD'],
    ['imageUrl', group.imageUrl || ''],
    ['createdBy', group.createdBy || ''],
    ['isArchived', String(Boolean(group.isArchived))],
    ['createdAt', group.createdAt || new Date().toISOString()],
    ['updatedAt', group.updatedAt || new Date().toISOString()],
    ['kind', group.kind || 'group'],
  ];
}

export function deserializeGroupMetadata(rows: any[][]): Group | null {
  if (!rows || rows.length <= 1) return null;
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row && row[0] !== undefined) {
      map.set(String(row[0]).trim(), String(row[1] ?? ''));
    }
  }
  const id = map.get('id');
  const name = map.get('name');
  if (!id || !name) return null;

  return {
    id,
    name,
    kind: map.get('kind') === 'direct' ? 'direct' : 'group',
    description: map.get('description') || undefined,
    currency: map.get('currency') || 'USD',
    imageUrl: map.get('imageUrl') || undefined,
    createdBy: map.get('createdBy') || '',
    isArchived: map.get('isArchived') === 'true',
    createdAt: map.get('createdAt') || new Date().toISOString(),
    updatedAt: map.get('updatedAt') || new Date().toISOString(),
  };
}

// --- Migration Stubs ---

export interface MigrationStep {
  fromVersion: string;
  toVersion: string;
  migrate: (spreadsheetId: string) => Promise<void>;
}

export const SCHEMA_MIGRATIONS: MigrationStep[] = [
  // Future migrations will be added here
];

export async function migrateSpreadsheetSchema(
  currentVersion: string,
  targetVersion: string,
  _spreadsheetId: string
): Promise<void> {
  if (currentVersion === targetVersion) {
    return;
  }
  // Stub for sequential migrations across versions
}
