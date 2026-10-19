import { z } from 'zod';

/**
 * Split strategy type for expenses.
 */
export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

/**
 * Status of an asynchronous sync operation.
 */
export type OperationStatus =
  | 'pending'
  | 'in_progress'
  | 'syncing'
  | 'synced'
  | 'retry'
  | 'conflict'
  | 'failed';

/**
 * Alias for OperationStatus for backward/sync compatibility.
 */
export type SyncOperationStatus = OperationStatus;

/**
 * User roles within a group.
 */
export type MemberRole = 'owner' | 'admin' | 'member';

/**
 * Group membership status.
 */
export type MembershipStatus = 'active' | 'invited' | 'removed';

/**
 * Scope/source type for entities (personal workspace or shared group).
 */
export type SourceType = 'personal' | 'group';

/**
 * Category scope: personal (user custom), group (group custom), or system (predefined).
 */
export type CategoryScope = 'personal' | 'group' | 'system' | 'custom';

/**
 * Synchronization mutation type.
 */
export type SyncOperationType = 'create' | 'update' | 'delete';
export type SyncOperationAction = SyncOperationType;

/**
 * Authentication state for Google Identity Services.
 */
export type AuthState = 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';

/**
 * Currency identifier string (ISO 4217 3-letter currency code, e.g., 'USD', 'EUR').
 */
export type Currency = string;

/**
 * Standard money representation combining minor unit amount and currency.
 */
export interface MoneyAmount {
  amountMinor: number;
  currency: Currency;
}

// ==========================================
// Base Validators
// ==========================================

const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

/**
 * Validator for ISO 8601 UTC timestamp or date strings.
 */
export const isoTimestampSchema = z.string().refine(
  (val) => isoPattern.test(val) && !isNaN(Date.parse(val)),
  { message: 'Must be a valid ISO 8601 date or timestamp string' }
);

/**
 * Validator for 3-letter currency codes.
 */
export const currencySchema = z
  .string()
  .trim()
  .length(3, 'Currency code must be a 3-letter ISO code')
  .toUpperCase();

export const splitTypeSchema = z.enum(['equal', 'exact', 'percentage', 'shares']);
export const operationStatusSchema = z.enum([
  'pending',
  'in_progress',
  'syncing',
  'synced',
  'retry',
  'conflict',
  'failed',
]);
export const memberRoleSchema = z.enum(['owner', 'admin', 'member']);
export const membershipStatusSchema = z.enum(['active', 'invited', 'removed']);
export const sourceTypeSchema = z.enum(['personal', 'group']);
export const categoryScopeSchema = z.enum(['personal', 'group', 'system', 'custom']);
export const syncOperationTypeSchema = z.enum(['create', 'update', 'delete']);
export const authStateSchema = z.enum(['disconnected', 'connecting', 'connected', 'expired', 'error']);

export const moneyAmountSchema: z.ZodType<MoneyAmount> = z.object({
  amountMinor: z.number().int('Amount in minor units must be an integer'),
  currency: currencySchema,
});

// ==========================================
// 1. User
// ==========================================

export interface User {
  id: string;
  googleSub?: string;
  displayName?: string;
  name?: string;
  email: string;
  avatarUrl?: string;
  picture?: string;
  isCurrentUser?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const userSchema: z.ZodType<User> = z.object({
  id: z.string().min(1, 'User ID is required'),
  googleSub: z.string().optional(),
  displayName: z.string().trim().optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().email('Invalid email address'),
  avatarUrl: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
  picture: z.string().optional(),
  isCurrentUser: z.boolean().optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export interface GoogleUser {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

export const googleUserSchema: z.ZodType<GoogleUser> = z.object({
  sub: z.string().min(1),
  name: z.string(),
  email: z.string().email(),
  picture: z.string().optional(),
});

// ==========================================
// 2. Group
// ==========================================

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  currency?: Currency;
  defaultCurrency?: Currency;
  memberIds?: string[];
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  schemaVersion?: number;
}

export const groupSchema: z.ZodType<Group> = z.object({
  id: z.string().min(1, 'Group ID is required'),
  name: z.string().trim().min(1, 'Group name cannot be empty'),
  description: z.string().optional(),
  createdBy: z.string().min(1, 'CreatedBy user ID is required'),
  currency: currencySchema.optional(),
  defaultCurrency: currencySchema.optional(),
  memberIds: z.array(z.string().min(1)).optional(),
  isArchived: z.boolean().optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  archivedAt: isoTimestampSchema.optional(),
  schemaVersion: z.number().int().positive().optional(),
});

// ==========================================
// 3. Group Membership
// ==========================================

export interface GroupMembership {
  id?: string;
  groupId: string;
  userId: string;
  role: MemberRole | string;
  status?: MembershipStatus;
  joinedAt: string;
  updatedAt?: string;
}

export const groupMembershipSchema: z.ZodType<GroupMembership> = z.object({
  id: z.string().optional(),
  groupId: z.string().min(1, 'Group ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  role: z.string(),
  status: membershipStatusSchema.optional(),
  joinedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema.optional(),
});

// ==========================================
// 4. Expense
// ==========================================

export interface Expense {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  groupId?: string;
  description: string;
  notes?: string;
  categoryId?: string;
  paidBy: string;
  originalAmountMinor: number;
  amountMinor?: number;
  originalCurrency: Currency;
  currency?: Currency;
  reportingCurrency?: Currency;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  reportingAmountMinor?: number;
  splitType?: SplitType;
  participants: string[];
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  operationId?: string;
  revision?: number;
  deletedAt?: string | null;
}

export const expenseSchema = z.object({
  id: z.string().min(1, 'Expense ID is required'),
  sourceType: sourceTypeSchema,
  sourceId: z.string().min(1, 'Source ID is required'),
  groupId: z.string().optional(),
  description: z.string().trim().min(1, 'Expense description cannot be empty'),
  notes: z.string().optional(),
  categoryId: z.string().optional(),
  paidBy: z.string().min(1, 'Payer user ID is required'),
  originalAmountMinor: z.number().int().positive('Expense amount must be a positive integer in minor units'),
  amountMinor: z.number().int().positive().optional(),
  originalCurrency: currencySchema,
  currency: currencySchema.optional(),
  reportingCurrency: currencySchema.optional(),
  exchangeRate: z.number().positive().optional(),
  exchangeRateDate: isoTimestampSchema.optional(),
  exchangeRateSource: z.string().optional(),
  reportingAmountMinor: z.number().int().nonnegative().optional(),
  splitType: splitTypeSchema.optional(),
  participants: z.array(z.string().min(1)),
  expenseDate: isoTimestampSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  createdBy: z.string().optional(),
  operationId: z.string().optional(),
  revision: z.number().int().nonnegative().optional(),
  deletedAt: isoTimestampSchema.nullable().optional(),
});

/**
 * Filter parameters for querying expenses.
 */
export interface ExpenseFilters {
  sourceId?: string;
  sourceType?: SourceType;
  groupId?: string;
  categoryId?: string;
  paidBy?: string;
  participantId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  minAmountMinor?: number;
  maxAmountMinor?: number;
  includeDeleted?: boolean;
}

// ==========================================
// 5. Expense Split
// ==========================================

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  shareMinor: number;
  amountMinor?: number;
  weight?: number;
  share?: number;
  percentageBasisPoints?: number;
  percentage?: number;
  exactAmountMinor?: number;
  createdAt?: string;
}

export const expenseSplitSchema: z.ZodType<ExpenseSplit> = z.object({
  id: z.string().min(1, 'Split ID is required'),
  expenseId: z.string().min(1, 'Expense ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  shareMinor: z.number().int(),
  amountMinor: z.number().int().optional(),
  weight: z.number().positive().optional(),
  share: z.number().optional(),
  percentageBasisPoints: z.number().int().min(0).max(10000).optional(),
  percentage: z.number().optional(),
  exactAmountMinor: z.number().int().optional(),
  createdAt: isoTimestampSchema.optional(),
});

// ==========================================
// 6. Settlement
// ==========================================

export interface Settlement {
  id: string;
  sourceType?: SourceType;
  sourceId: string;
  groupId?: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  currency: Currency;
  settlementDate: string;
  notes?: string;
  note?: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  operationId?: string;
  revision?: number;
  deletedAt?: string | null;
}

export const settlementSchema: z.ZodType<Settlement> = z.object({
  id: z.string().min(1, 'Settlement ID is required'),
  sourceType: sourceTypeSchema.optional(),
  sourceId: z.string().min(1, 'Source ID is required'),
  groupId: z.string().optional(),
  fromUserId: z.string().min(1, 'Payer user ID (fromUserId) is required'),
  toUserId: z.string().min(1, 'Recipient user ID (toUserId) is required'),
  amountMinor: z.number().int().positive('Settlement amount must be a positive integer in minor units'),
  currency: currencySchema,
  settlementDate: isoTimestampSchema,
  notes: z.string().optional(),
  note: z.string().optional(),
  exchangeRate: z.number().positive().optional(),
  exchangeRateDate: isoTimestampSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  createdBy: z.string().optional(),
  operationId: z.string().optional(),
  revision: z.number().int().nonnegative().optional(),
  deletedAt: isoTimestampSchema.nullable().optional(),
});

// ==========================================
// 7. Settlement Allocation
// ==========================================

export interface SettlementAllocation {
  id: string;
  settlementId: string;
  expenseId: string;
  amountMinor: number;
  currency?: Currency;
}

export const settlementAllocationSchema: z.ZodType<SettlementAllocation> = z.object({
  id: z.string().min(1, 'Settlement allocation ID is required'),
  settlementId: z.string().min(1, 'Settlement ID is required'),
  expenseId: z.string().min(1, 'Expense ID is required'),
  amountMinor: z.number().int().positive('Allocation amount must be a positive integer in minor units'),
  currency: currencySchema.optional(),
});

// ==========================================
// 8. Category
// ==========================================

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  scope: CategoryScope;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const categorySchema: z.ZodType<Category> = z.object({
  id: z.string().min(1, 'Category ID is required'),
  name: z.string().trim().min(1, 'Category name cannot be empty'),
  icon: z.string().optional(),
  color: z.string().optional(),
  scope: categoryScopeSchema,
  ownerId: z.string().optional(),
  createdAt: isoTimestampSchema.optional(),
  updatedAt: isoTimestampSchema.optional(),
});

// ==========================================
// 9. Sync Operation
// ==========================================

export interface SyncOperation {
  id: string;
  operationId: string;
  entityType: string;
  entityId: string;
  sourceId: string;
  operationType?: SyncOperationType;
  action?: SyncOperationType;
  payload: any;
  createdAt: string;
  updatedAt?: string;
  attemptCount?: number;
  retryCount?: number;
  lastAttemptAt?: string;
  status: OperationStatus;
  lastError?: string;
  error?: string;
  baseRevision?: number;
  conflictData?: string;
}

export const syncOperationSchema: z.ZodType<SyncOperation> = z.object({
  id: z.string().min(1, 'Sync operation ID is required'),
  operationId: z.string().min(1, 'Operation ID is required'),
  entityType: z.string().min(1, 'Entity type is required'),
  entityId: z.string().min(1, 'Entity ID is required'),
  sourceId: z.string().min(1, 'Source ID is required'),
  operationType: syncOperationTypeSchema.optional(),
  action: syncOperationTypeSchema.optional(),
  payload: z.any(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema.optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  lastAttemptAt: isoTimestampSchema.optional(),
  status: operationStatusSchema,
  lastError: z.string().optional(),
  error: z.string().optional(),
  baseRevision: z.number().int().nonnegative().optional(),
  conflictData: z.string().optional(),
});

// ==========================================
// 10. Exchange Rate Cache
// ==========================================

export interface ExchangeRateCache {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  rate: number;
  rateDate: string;
  fetchedAt: string;
  source?: string;
}

export const exchangeRateCacheSchema: z.ZodType<ExchangeRateCache> = z.object({
  baseCurrency: currencySchema,
  quoteCurrency: currencySchema,
  rate: z.number().positive('Exchange rate must be positive'),
  rateDate: isoTimestampSchema,
  fetchedAt: isoTimestampSchema,
  source: z.string().optional(),
});

// ==========================================
// 11. File Metadata
// ==========================================

export interface FileMetadata {
  id: string;
  fileType: 'personal' | 'group';
  logicalId: string;
  googleFileId?: string;
  fileName?: string;
  name?: string;
  webViewLink?: string;
  createdAt?: string;
  updatedAt?: string;
  lastSyncedAt?: string;
  schemaVersion?: number;
}

export const fileMetadataSchema: z.ZodType<FileMetadata> = z.object({
  id: z.string().min(1, 'File metadata ID is required'),
  fileType: z.enum(['personal', 'group']),
  logicalId: z.string().min(1, 'Logical ID is required'),
  googleFileId: z.string().optional(),
  fileName: z.string().optional(),
  name: z.string().optional(),
  webViewLink: z.string().optional(),
  createdAt: isoTimestampSchema.optional(),
  updatedAt: isoTimestampSchema.optional(),
  lastSyncedAt: isoTimestampSchema.optional(),
  schemaVersion: z.number().int().positive().optional(),
});

// ==========================================
// 12. Sync Checkpoint
// ==========================================

export interface SyncCheckpoint {
  sourceId: string;
  entityType: string;
  lastSyncedAt: string;
  lastRemoteRevision?: number;
  lastServerVersion?: string;
}

export const syncCheckpointSchema: z.ZodType<SyncCheckpoint> = z.object({
  sourceId: z.string().min(1, 'Source ID is required'),
  entityType: z.string().min(1, 'Entity type is required'),
  lastSyncedAt: isoTimestampSchema,
  lastRemoteRevision: z.number().int().nonnegative().optional(),
  lastServerVersion: z.string().optional(),
});

// ==========================================
// 13. Drive & Sheets Models
// ==========================================

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  owners?: string[];
  shared?: boolean;
  permissions?: any[];
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheets: SheetInfo[];
}

// ==========================================
// 14. Sync Engine Types
// ==========================================

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt?: string | null;
  hasConflicts: boolean;
  authState: AuthState;
}

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
}

export interface ConflictResolution {
  type: 'use_local' | 'use_remote' | 'merge' | 'manual';
  resolved: boolean;
}

export type { PairwiseBalance } from '../balances/balance-engine';

