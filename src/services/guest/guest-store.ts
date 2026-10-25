// src/services/guest/guest-store.ts
// In-browser local storage engine for Tabby Guest Mode using IndexedDB.

import { v4 as uuidv4 } from 'uuid';
import {
  STORES,
  getRecord,
  getAllRecords,
  putRecord,
  deleteRecord,
  clearAllGuestStores,
} from './indexed-db';
import type { DbProfile } from '@/services/supabase/profile-service';
import type { DbFriendProfile, AddFriendResult } from '@/services/supabase/friend-service';
import type { DbGroup, GroupWithMembers, CreateGroupInput, UpdateGroupInput } from '@/services/supabase/group-service';
import type { UnifiedExpense, CreateExpenseServiceInput, ExpenseFilters, DbExpenseSplit } from '@/services/supabase/expense-service';
import type { DbSettlement, CreateSettlementInput } from '@/services/supabase/settlement-service';
import type { SplitType } from '@/domain/models/types';

export const GUEST_MODE_STORAGE_KEY = 'tabby_guest_active';
export const GUEST_USER_ID_KEY = 'tabby_guest_user_id';
export const GUEST_USER_NAME_KEY = 'tabby_guest_user_name';
export const GUEST_CURRENCY_KEY = 'tabby_guest_currency';

export interface GuestFriendRecord {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
  migratedId?: string | null;
}

export interface GuestFriendshipRecord {
  id: string;
  userId1: string;
  userId2: string;
  status: 'accepted';
  actionUserId: string;
  createdAt: string;
  updatedAt: string;
  migratedId?: string | null;
}

export interface GuestGroupRecord extends DbGroup {
  migratedId?: string | null;
}

export interface GuestGroupMemberRecord {
  id: string;
  groupId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active';
  joinedAt: string;
  migratedId?: string | null;
}

export interface GuestExpenseRecord {
  id: string;
  sourceType: 'group' | 'personal' | 'direct';
  contextType: 'group' | 'personal' | 'direct';
  sourceId: string;
  groupId?: string | null;
  friendshipId?: string | null;
  friendId?: string | null;
  description: string;
  notes?: string | null;
  categoryId?: string | null;
  paidBy: string;
  amountMinor: number;
  currency: string;
  reportingCurrency: string;
  exchangeRate?: number;
  exchangeRateDate?: string | null;
  exchangeRateSource?: string | null;
  reportingAmountMinor: number;
  splitType: SplitType;
  participants: string[];
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt?: string | null;
  migratedId?: string | null;
}

export interface GuestSplitRecord {
  id: string;
  groupExpenseId: string;
  userId: string;
  shareMinor: number;
  weight?: number | null;
  percentageBasisPoints?: number | null;
  migratedId?: string | null;
}

export interface GuestSettlementRecord extends DbSettlement {
  migratedId?: string | null;
}

export interface GuestReceiptRecord {
  id: string;
  expenseId: string;
  storagePath: string;
  uploadedBy: string;
  originalFilename?: string | null;
  contentType: string;
  fileSize: number;
  dataUrl?: string;
  createdAt: string;
  updatedAt: string;
  items?: any[];
  subtotalMinor?: number;
  taxMinor?: number;
  discountMinor?: number;
  tipMinor?: number;
  serviceChargeMinor?: number;
  totalMinor?: number;
}

export interface GuestDataSummary {
  expensesCount: number;
  groupsCount: number;
  friendsCount: number;
  settlementsCount: number;
}

class GuestStore {
  private cachedGuestUserId: string | null = null;

  isGuestMode(): boolean {
    try {
      return localStorage.getItem(GUEST_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  setGuestMode(active: boolean): void {
    try {
      if (active) {
        localStorage.setItem(GUEST_MODE_STORAGE_KEY, 'true');
        // Ensure guest user id exists
        this.getGuestUserId();
      } else {
        localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage exceptions in private browsing
    }
  }

  getGuestUserId(): string {
    if (this.cachedGuestUserId) return this.cachedGuestUserId;
    try {
      let id = localStorage.getItem(GUEST_USER_ID_KEY);
      if (!id) {
        id = uuidv4();
        localStorage.setItem(GUEST_USER_ID_KEY, id);
      }
      this.cachedGuestUserId = id;
      return id;
    } catch {
      if (!this.cachedGuestUserId) {
        this.cachedGuestUserId = uuidv4();
      }
      return this.cachedGuestUserId;
    }
  }

  getGuestUserName(): string {
    try {
      return localStorage.getItem(GUEST_USER_NAME_KEY) || 'Guest';
    } catch {
      return 'Guest';
    }
  }

  setGuestUserName(name: string): void {
    try {
      localStorage.setItem(GUEST_USER_NAME_KEY, name.trim() || 'Guest');
    } catch {
      // Ignore
    }
  }

  // --------------------------------------------------------------------------
  // Summary & Data Check
  // --------------------------------------------------------------------------

  async getGuestSummary(): Promise<GuestDataSummary> {
    const [expenses, groups, friends, settlements] = await Promise.all([
      getAllRecords<GuestExpenseRecord>(STORES.EXPENSES),
      getAllRecords<GuestGroupRecord>(STORES.GROUPS),
      getAllRecords<GuestFriendRecord>(STORES.FRIENDS),
      getAllRecords<GuestSettlementRecord>(STORES.SETTLEMENTS),
    ]);

    const activeExpenses = expenses.filter((e) => !e.deletedAt);
    const activeGroups = groups.filter((g) => !g.archived_at);
    const activeSettlements = settlements.filter((s) => !s.deleted_at);

    return {
      expensesCount: activeExpenses.length,
      groupsCount: activeGroups.length,
      friendsCount: friends.length,
      settlementsCount: activeSettlements.length,
    };
  }

  async hasGuestData(): Promise<boolean> {
    const summary = await this.getGuestSummary();
    return (
      summary.expensesCount > 0 ||
      summary.groupsCount > 0 ||
      summary.friendsCount > 0 ||
      summary.settlementsCount > 0
    );
  }

  // --------------------------------------------------------------------------
  // Profiles
  // --------------------------------------------------------------------------

  async getCurrentProfile(): Promise<DbProfile> {
    const guestId = this.getGuestUserId();
    const name = this.getGuestUserName();
    return {
      id: guestId,
      display_name: name,
      avatar_url: null,
      email: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      preferred_currency: await this.getPreferredCurrency(),
    } as any;
  }

  async getProfiles(ids: string[]): Promise<Record<string, DbProfile>> {
    const guestId = this.getGuestUserId();
    const guestName = this.getGuestUserName();
    const friends = await getAllRecords<GuestFriendRecord>(STORES.FRIENDS);

    const map: Record<string, DbProfile> = {};

    for (const id of ids) {
      if (id === guestId || id === 'current_user' || id === 'user_self') {
        map[id] = {
          id: guestId,
          display_name: guestName,
          avatar_url: null,
          email: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } else {
        const friend = friends.find((f) => f.id === id);
        if (friend) {
          map[id] = {
            id: friend.id,
            display_name: friend.name,
            avatar_url: friend.avatarUrl || null,
            email: friend.email || null,
            created_at: friend.createdAt,
            updated_at: friend.updatedAt,
          };
        }
      }
    }

    return map;
  }

  async getVisibleProfiles(): Promise<Record<string, DbProfile>> {
    const guestId = this.getGuestUserId();
    const guestName = this.getGuestUserName();
    const friends = await getAllRecords<GuestFriendRecord>(STORES.FRIENDS);

    const map: Record<string, DbProfile> = {
      [guestId]: {
        id: guestId,
        display_name: guestName,
        avatar_url: null,
        email: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    for (const f of friends) {
      map[f.id] = {
        id: f.id,
        display_name: f.name,
        avatar_url: f.avatarUrl || null,
        email: f.email || null,
        created_at: f.createdAt,
        updated_at: f.updatedAt,
      };
    }

    return map;
  }

  async updateCurrentProfile(updates: { displayName?: string; avatarUrl?: string }): Promise<DbProfile> {
    if (updates.displayName) {
      this.setGuestUserName(updates.displayName);
    }
    return this.getCurrentProfile();
  }

  async getPreferredCurrency(): Promise<string | null> {
    try {
      return localStorage.getItem(GUEST_CURRENCY_KEY) || 'USD';
    } catch {
      return 'USD';
    }
  }

  async setPreferredCurrency(currency: string): Promise<void> {
    try {
      localStorage.setItem(GUEST_CURRENCY_KEY, currency.toUpperCase());
    } catch {
      // Ignore
    }
  }

  // --------------------------------------------------------------------------
  // Friends & Friendships
  // --------------------------------------------------------------------------

  async getFriends(): Promise<DbFriendProfile[]> {
    const guestId = this.getGuestUserId();
    const friends = await getAllRecords<GuestFriendRecord>(STORES.FRIENDS);
    const friendships = await getAllRecords<GuestFriendshipRecord>(STORES.FRIENDSHIPS);

    return friends.map((f) => {
      const friendship = friendships.find(
        (fs) =>
          (fs.userId1 === guestId && fs.userId2 === f.id) ||
          (fs.userId2 === guestId && fs.userId1 === f.id)
      );

      return {
        id: f.id,
        display_name: f.name,
        email: f.email || '',
        avatar_url: f.avatarUrl || null,
        created_at: f.createdAt,
        updatedAt: f.updatedAt,
        updated_at: f.updatedAt,
        friendshipId: friendship ? friendship.id : '',
        name: f.name,
        avatarUrl: f.avatarUrl,
        picture: f.avatarUrl,
      };
    });
  }

  async addFriend(nameOrEmail: string): Promise<AddFriendResult> {
    const trimmed = nameOrEmail.trim();
    if (!trimmed) throw new Error('Friend name or email is required.');

    const guestId = this.getGuestUserId();
    const isEmail = trimmed.includes('@');
    const displayName = isEmail ? trimmed.split('@')[0] : trimmed;
    const email = isEmail ? trimmed.toLowerCase() : undefined;

    // Check if friend with same email or name already exists
    const existingFriends = await getAllRecords<GuestFriendRecord>(STORES.FRIENDS);
    const duplicate = existingFriends.find(
      (f) =>
        (email && f.email?.toLowerCase() === email) ||
        (!email && f.name.toLowerCase() === displayName.toLowerCase())
    );

    if (duplicate) {
      throw new Error(`Friend "${displayName}" is already in your friends list.`);
    }

    const friendId = uuidv4();
    const now = new Date().toISOString();

    const friendRecord: GuestFriendRecord = {
      id: friendId,
      name: displayName,
      email,
      createdAt: now,
      updatedAt: now,
    };
    await putRecord(STORES.FRIENDS, friendRecord);

    // Canonical friendship record: user_id_1 < user_id_2
    const u1 = guestId < friendId ? guestId : friendId;
    const u2 = guestId < friendId ? friendId : guestId;
    const friendshipId = uuidv4();

    const friendshipRecord: GuestFriendshipRecord = {
      id: friendshipId,
      userId1: u1,
      userId2: u2,
      status: 'accepted',
      actionUserId: guestId,
      createdAt: now,
      updatedAt: now,
    };
    await putRecord(STORES.FRIENDSHIPS, friendshipRecord);

    const friendProfile: DbProfile = {
      id: friendId,
      display_name: displayName,
      email: email || null,
      avatar_url: null,
      created_at: now,
      updated_at: now,
    };

    return {
      friendship: {
        id: friendshipId,
        userId1: u1,
        userId2: u2,
        status: 'accepted',
        actionUserId: guestId,
        createdAt: now,
        updatedAt: now,
      },
      friendProfile,
      isNewUser: true,
    };
  }

  async getOrCreateFriendship(userA: string, userB: string): Promise<string> {
    if (userA === userB) throw new Error('Cannot create friendship with oneself');
    const u1 = userA < userB ? userA : userB;
    const u2 = userA < userB ? userB : userA;

    const friendships = await getAllRecords<GuestFriendshipRecord>(STORES.FRIENDSHIPS);
    const existing = friendships.find((f) => f.userId1 === u1 && f.userId2 === u2);
    if (existing) return existing.id;

    const id = uuidv4();
    const now = new Date().toISOString();
    await putRecord<GuestFriendshipRecord>(STORES.FRIENDSHIPS, {
      id,
      userId1: u1,
      userId2: u2,
      status: 'accepted',
      actionUserId: userA,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  // --------------------------------------------------------------------------
  // Groups & Members
  // --------------------------------------------------------------------------

  async getUserGroups(): Promise<DbGroup[]> {
    const groups = await getAllRecords<GuestGroupRecord>(STORES.GROUPS);
    return groups
      .filter((g) => !g.archived_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getGroupById(groupId: string): Promise<GroupWithMembers | null> {
    const group = await getRecord<GuestGroupRecord>(STORES.GROUPS, groupId);
    if (!group) return null;

    const allMembers = await getAllRecords<GuestGroupMemberRecord>(STORES.GROUP_MEMBERS);
    const groupMembers = allMembers.filter((m) => m.groupId === groupId && m.status === 'active');

    const memberUserIds = groupMembers.map((m) => m.userId);
    const profiles = await this.getProfiles(memberUserIds);

    const formattedMembers = groupMembers.map((m) => {
      const p = profiles[m.userId];
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        profile: p
          ? {
              id: p.id,
              displayName: p.display_name,
              avatarUrl: p.avatar_url,
              email: p.email,
            }
          : null,
      };
    });

    return {
      ...group,
      members: formattedMembers,
    };
  }

  async createGroup(input: CreateGroupInput & { createdBy?: string; members?: Array<{ userId: string; role?: 'owner' | 'admin' | 'member' }> }): Promise<DbGroup> {
    const guestId = this.getGuestUserId();
    const creatorId = input.createdBy || guestId;
    const groupId = uuidv4();
    const now = new Date().toISOString();

    const groupRecord: GuestGroupRecord = {
      id: groupId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      default_currency: (input.currency || 'USD').toUpperCase(),
      image_url: input.imageUrl || null,
      created_by: creatorId,
      created_at: now,
      updated_at: now,
      archived_at: null,
    };

    await putRecord(STORES.GROUPS, groupRecord);

    // Add owner
    await putRecord<GuestGroupMemberRecord>(STORES.GROUP_MEMBERS, {
      id: uuidv4(),
      groupId,
      userId: creatorId,
      role: 'owner',
      status: 'active',
      joinedAt: now,
    });

    // Add any initial members specified
    if (input.members) {
      for (const m of input.members) {
        if (m.userId !== creatorId) {
          await putRecord<GuestGroupMemberRecord>(STORES.GROUP_MEMBERS, {
            id: uuidv4(),
            groupId,
            userId: m.userId,
            role: m.role || 'member',
            status: 'active',
            joinedAt: now,
          });
        }
      }
    }

    return groupRecord;
  }

  async updateGroup(input: UpdateGroupInput): Promise<DbGroup> {
    const existing = await getRecord<GuestGroupRecord>(STORES.GROUPS, input.id);
    if (!existing) throw new Error('Group not found');

    const updated: GuestGroupRecord = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      description: input.description !== undefined ? input.description.trim() || null : existing.description,
      default_currency: input.currency !== undefined ? input.currency.toUpperCase() : existing.default_currency,
      image_url: input.imageUrl !== undefined ? input.imageUrl || null : existing.image_url,
      updated_at: new Date().toISOString(),
    };

    await putRecord(STORES.GROUPS, updated);
    return updated;
  }

  async archiveGroup(groupId: string): Promise<void> {
    const existing = await getRecord<GuestGroupRecord>(STORES.GROUPS, groupId);
    if (!existing) return;
    existing.archived_at = new Date().toISOString();
    await putRecord(STORES.GROUPS, existing);
  }

  async addMemberToGroup(groupId: string, userId: string, role: 'owner' | 'admin' | 'member' = 'member'): Promise<void> {
    const allMembers = await getAllRecords<GuestGroupMemberRecord>(STORES.GROUP_MEMBERS);
    const existing = allMembers.find((m) => m.groupId === groupId && m.userId === userId);
    if (existing) {
      existing.status = 'active';
      existing.role = role;
      await putRecord(STORES.GROUP_MEMBERS, existing);
      return;
    }

    await putRecord<GuestGroupMemberRecord>(STORES.GROUP_MEMBERS, {
      id: uuidv4(),
      groupId,
      userId,
      role,
      status: 'active',
      joinedAt: new Date().toISOString(),
    });
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    const allMembers = await getAllRecords<GuestGroupMemberRecord>(STORES.GROUP_MEMBERS);
    const member = allMembers.find((m) => m.groupId === groupId && m.userId === userId);
    if (member) {
      await deleteRecord(STORES.GROUP_MEMBERS, member.id);
    }
  }

  // --------------------------------------------------------------------------
  // Expenses & Splits
  // --------------------------------------------------------------------------

  async getExpenses(filters?: ExpenseFilters): Promise<UnifiedExpense[]> {
    const guestId = this.getGuestUserId();
    const allExpenses = await getAllRecords<GuestExpenseRecord>(STORES.EXPENSES);

    const active = allExpenses.filter((e) => !e.deletedAt);

    let filtered = active;

    if (filters?.groupId) {
      filtered = filtered.filter((e) => e.groupId === filters.groupId);
    }
    if (filters?.contextType) {
      filtered = filtered.filter((e) => e.contextType === filters.contextType);
    }
    if (filters?.sourceType) {
      filtered = filtered.filter((e) => e.sourceType === filters.sourceType);
    }
    if (filters?.friendId) {
      filtered = filtered.filter(
        (e) =>
          e.friendId === filters.friendId ||
          (e.participants && e.participants.includes(filters.friendId!)) ||
          e.paidBy === filters.friendId
      );
    }
    if (filters?.categoryId) {
      filtered = filtered.filter((e) => e.categoryId === filters.categoryId);
    }
    if (filters?.paidBy) {
      filtered = filtered.filter((e) => e.paidBy === filters.paidBy);
    }
    if (filters?.startDate) {
      filtered = filtered.filter((e) => e.expenseDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      filtered = filtered.filter((e) => e.expenseDate <= filters.endDate!);
    }
    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((e) => e.description.toLowerCase().includes(q));
    }

    // Sort newest first
    filtered.sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());

    return filtered.map((exp) => ({
      id: exp.id,
      sourceType: exp.sourceType,
      contextType: exp.contextType,
      sourceId: exp.sourceId,
      groupId: exp.groupId || undefined,
      friendshipId: exp.friendshipId || undefined,
      friendId: exp.friendId || undefined,
      description: exp.description,
      notes: exp.notes || undefined,
      categoryId: exp.categoryId || undefined,
      paidBy: exp.paidBy,
      originalAmountMinor: exp.amountMinor,
      amountMinor: exp.amountMinor,
      originalCurrency: exp.currency,
      currency: exp.currency,
      reportingCurrency: exp.reportingCurrency,
      exchangeRate: exp.exchangeRate || 1.0,
      exchangeRateDate: exp.exchangeRateDate || undefined,
      exchangeRateSource: exp.exchangeRateSource || undefined,
      reportingAmountMinor: exp.reportingAmountMinor,
      splitType: exp.splitType,
      participants: exp.participants,
      expenseDate: exp.expenseDate,
      createdAt: exp.createdAt,
      updatedAt: exp.updatedAt,
      createdBy: exp.createdBy || guestId,
      deletedAt: exp.deletedAt || null,
    }));
  }

  async getSplitsForExpenses(expenseIds: string[]): Promise<Record<string, DbExpenseSplit[]>> {
    if (!expenseIds || expenseIds.length === 0) return {};

    const allSplits = await getAllRecords<GuestSplitRecord>(STORES.EXPENSE_SPLITS);
    const idSet = new Set(expenseIds);

    const map: Record<string, DbExpenseSplit[]> = {};
    for (const split of allSplits) {
      if (idSet.has(split.groupExpenseId)) {
        if (!map[split.groupExpenseId]) {
          map[split.groupExpenseId] = [];
        }
        map[split.groupExpenseId].push({
          id: split.id,
          group_expense_id: split.groupExpenseId,
          user_id: split.userId,
          share_minor: split.shareMinor,
          weight: split.weight != null ? split.weight : null,
          percentage_basis_points: split.percentageBasisPoints != null ? split.percentageBasisPoints : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as DbExpenseSplit);
      }
    }

    return map;
  }

  async createExpense(input: CreateExpenseServiceInput): Promise<{ id: string; description: string }> {
    const guestId = this.getGuestUserId();
    const isDirect =
      input.contextType === 'direct' ||
      input.sourceType === 'direct' ||
      (!input.groupId && !!input.friendId);
    const isGroup =
      (input.contextType === 'group' || input.sourceType === 'group' || !!input.groupId) &&
      !isDirect;

    const expenseId = uuidv4();
    const now = new Date().toISOString();

    let friendshipId: string | null = null;
    let friendId: string | null = null;

    if (isDirect) {
      friendId =
        input.friendId ||
        input.splits.find((s) => s.userId !== guestId)?.userId ||
        (input.paidBy !== guestId ? input.paidBy : null);

      if (friendId) {
        friendshipId = await this.getOrCreateFriendship(guestId, friendId);
      }
    }

    const participantIds = input.splits.map((s) => s.userId);
    const currency = input.currency.toUpperCase();
    const reportingCurrency = (input.reportingCurrency || currency).toUpperCase();

    const expenseRecord: GuestExpenseRecord = {
      id: expenseId,
      sourceType: isDirect ? 'direct' : isGroup ? 'group' : 'personal',
      contextType: isDirect ? 'direct' : isGroup ? 'group' : 'personal',
      sourceId: isDirect ? (friendshipId || friendId || '') : (input.groupId || guestId),
      groupId: isGroup ? input.groupId : null,
      friendshipId: isDirect ? friendshipId : null,
      friendId: isDirect ? friendId : null,
      description: input.description.trim(),
      notes: input.notes?.trim() || null,
      categoryId: input.categoryId || null,
      paidBy: input.paidBy || guestId,
      amountMinor: input.amountMinor,
      currency,
      reportingCurrency,
      exchangeRate: input.exchangeRate || 1.0,
      exchangeRateDate: input.exchangeRateDate || null,
      exchangeRateSource: input.exchangeRateSource || 'identity',
      reportingAmountMinor: input.reportingAmountMinor ?? input.amountMinor,
      splitType: input.splitType || 'equal',
      participants: participantIds,
      expenseDate: input.expenseDate || now,
      createdAt: now,
      updatedAt: now,
      createdBy: guestId,
      deletedAt: null,
    };

    await putRecord(STORES.EXPENSES, expenseRecord);

    // Save splits
    for (const split of input.splits) {
      const splitRecord: GuestSplitRecord = {
        id: uuidv4(),
        groupExpenseId: expenseId,
        userId: split.userId,
        shareMinor: split.shareMinor,
        weight: split.weight || null,
        percentageBasisPoints: split.percentageBasisPoints || null,
      };
      await putRecord(STORES.EXPENSE_SPLITS, splitRecord);
    }

    return { id: expenseId, description: expenseRecord.description };
  }

  async updateExpense(input: {
    id: string;
    description?: string;
    notes?: string;
    categoryId?: string;
    paidBy?: string;
    groupId?: string;
    originalAmountMinor?: number;
    originalCurrency?: string;
    reportingCurrency?: string;
    exchangeRate?: number;
    exchangeRateDate?: string;
    exchangeRateSource?: string;
    reportingAmountMinor?: number;
    splitType?: SplitType;
    expenseDate?: string;
    splits?: Array<{ userId: string; shareMinor: number; weight?: number; percentageBasisPoints?: number }>;
  }): Promise<UnifiedExpense> {
    const existing = await getRecord<GuestExpenseRecord>(STORES.EXPENSES, input.id);
    if (!existing) throw new Error('Expense not found');

    const now = new Date().toISOString();
    const updated: GuestExpenseRecord = {
      ...existing,
      description: input.description !== undefined ? input.description.trim() : existing.description,
      notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      paidBy: input.paidBy !== undefined ? input.paidBy : existing.paidBy,
      groupId: input.groupId !== undefined ? input.groupId : existing.groupId,
      amountMinor: input.originalAmountMinor !== undefined ? input.originalAmountMinor : existing.amountMinor,
      currency: input.originalCurrency !== undefined ? input.originalCurrency.toUpperCase() : existing.currency,
      reportingCurrency: input.reportingCurrency !== undefined ? input.reportingCurrency.toUpperCase() : existing.reportingCurrency,
      exchangeRate: input.exchangeRate !== undefined ? input.exchangeRate : existing.exchangeRate,
      exchangeRateDate: input.exchangeRateDate !== undefined ? input.exchangeRateDate : existing.exchangeRateDate,
      exchangeRateSource: input.exchangeRateSource !== undefined ? input.exchangeRateSource : existing.exchangeRateSource,
      reportingAmountMinor: input.reportingAmountMinor !== undefined ? input.reportingAmountMinor : existing.reportingAmountMinor,
      splitType: input.splitType !== undefined ? input.splitType : existing.splitType,
      expenseDate: input.expenseDate !== undefined ? input.expenseDate : existing.expenseDate,
      updatedAt: now,
    };

    if (input.splits) {
      updated.participants = input.splits.map((s) => s.userId);
      // Replace splits
      const allSplits = await getAllRecords<GuestSplitRecord>(STORES.EXPENSE_SPLITS);
      for (const s of allSplits) {
        if (s.groupExpenseId === input.id) {
          await deleteRecord(STORES.EXPENSE_SPLITS, s.id);
        }
      }
      for (const s of input.splits) {
        await putRecord<GuestSplitRecord>(STORES.EXPENSE_SPLITS, {
          id: uuidv4(),
          groupExpenseId: input.id,
          userId: s.userId,
          shareMinor: s.shareMinor,
          weight: s.weight || null,
          percentageBasisPoints: s.percentageBasisPoints || null,
        });
      }
    }

    await putRecord(STORES.EXPENSES, updated);

    return {
      id: updated.id,
      sourceType: updated.sourceType,
      contextType: updated.contextType,
      sourceId: updated.sourceId,
      groupId: updated.groupId || undefined,
      friendshipId: updated.friendshipId || undefined,
      friendId: updated.friendId || undefined,
      description: updated.description,
      notes: updated.notes || undefined,
      categoryId: updated.categoryId || undefined,
      paidBy: updated.paidBy,
      originalAmountMinor: updated.amountMinor,
      amountMinor: updated.amountMinor,
      originalCurrency: updated.currency,
      currency: updated.currency,
      reportingCurrency: updated.reportingCurrency,
      exchangeRate: updated.exchangeRate || 1.0,
      exchangeRateDate: updated.exchangeRateDate || undefined,
      exchangeRateSource: updated.exchangeRateSource || undefined,
      reportingAmountMinor: updated.reportingAmountMinor,
      splitType: updated.splitType,
      participants: updated.participants,
      expenseDate: updated.expenseDate,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy,
      deletedAt: updated.deletedAt || null,
    };
  }

  async deleteExpense(id: string): Promise<void> {
    const existing = await getRecord<GuestExpenseRecord>(STORES.EXPENSES, id);
    if (!existing) return;
    existing.deletedAt = new Date().toISOString();
    await putRecord(STORES.EXPENSES, existing);
  }

  // --------------------------------------------------------------------------
  // Settlements
  // --------------------------------------------------------------------------

  async getSettlements(groupId?: string, contextType?: 'direct' | 'group'): Promise<DbSettlement[]> {
    const all = await getAllRecords<GuestSettlementRecord>(STORES.SETTLEMENTS);
    const active = all.filter((s) => !s.deleted_at);

    let filtered = active;
    if (groupId) {
      filtered = filtered.filter((s) => s.group_id === groupId);
    }
    if (contextType) {
      filtered = filtered.filter((s) => (s as any).context_type === contextType);
    }

    filtered.sort((a, b) => new Date(b.settlement_date).getTime() - new Date(a.settlement_date).getTime());
    return filtered;
  }

  async createSettlement(input: CreateSettlementInput): Promise<DbSettlement> {
    const guestId = this.getGuestUserId();
    const isDirect = input.contextType === 'direct' || (!input.groupId && !!input.friendId);
    const settlementId = uuidv4();
    const now = new Date().toISOString();

    let friendshipId: string | null = null;
    if (isDirect && input.friendId) {
      friendshipId = await this.getOrCreateFriendship(input.fromUserId, input.toUserId);
    }

    const conversion = input.conversion;

    const record: GuestSettlementRecord = {
      id: settlementId,
      group_id: input.groupId || null,
      from_user_id: input.fromUserId,
      to_user_id: input.toUserId,
      amount_minor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      applied_currency: conversion?.appliedCurrency?.toUpperCase() || null,
      applied_amount_minor: conversion?.appliedAmountMinor != null ? conversion.appliedAmountMinor : null,
      exchange_rate: conversion?.exchangeRate != null ? conversion.exchangeRate : 1.0,
      exchange_rate_date: conversion?.exchangeRateDate || null,
      exchange_rate_source: conversion?.exchangeRateSource || 'identity',
      settlement_date: input.settlementDate || now,
      notes: input.notes?.trim() || null,
      created_by: guestId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...({
        context_type: isDirect ? 'direct' : 'group',
        friendship_id: friendshipId,
      } as any),
    };

    await putRecord(STORES.SETTLEMENTS, record);
    return record;
  }

  async deleteSettlement(id: string): Promise<void> {
    const existing = await getRecord<GuestSettlementRecord>(STORES.SETTLEMENTS, id);
    if (!existing) return;
    existing.deleted_at = new Date().toISOString();
    await putRecord(STORES.SETTLEMENTS, existing);
  }

  // --------------------------------------------------------------------------
  // Receipts
  // --------------------------------------------------------------------------

  async saveReceipt(input: {
    expenseId: string;
    file: File | Blob;
    originalFilename?: string;
  }): Promise<GuestReceiptRecord> {
    const guestId = this.getGuestUserId();
    const now = new Date().toISOString();
    const id = uuidv4();

    let dataUrl: string | undefined;
    if (typeof FileReader !== 'undefined') {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(input.file);
      });
    }

    const record: GuestReceiptRecord = {
      id,
      expenseId: input.expenseId,
      storagePath: `guest/${guestId}/${input.expenseId}/${id}.jpg`,
      uploadedBy: guestId,
      originalFilename:
        input.originalFilename ||
        (input.file instanceof File ? input.file.name : 'receipt.jpg'),
      contentType: input.file.type || 'image/jpeg',
      fileSize: input.file.size,
      dataUrl,
      createdAt: now,
      updatedAt: now,
    };

    await putRecord(STORES.RECEIPTS, record);
    return record;
  }

  async getReceiptForExpense(expenseId: string): Promise<GuestReceiptRecord | null> {
    const all = await getAllRecords<GuestReceiptRecord>(STORES.RECEIPTS);
    return all.find((r) => r.expenseId === expenseId) || null;
  }

  async saveReceiptItems(
    expenseId: string,
    data: {
      items: any[];
      subtotalMinor?: number;
      taxMinor?: number;
      discountMinor?: number;
      tipMinor?: number;
      serviceChargeMinor?: number;
      totalMinor?: number;
      currency?: string;
    }
  ): Promise<GuestReceiptRecord> {
    const existing = await this.getReceiptForExpense(expenseId);
    const guestId = this.getGuestUserId();
    const now = new Date().toISOString();

    if (existing) {
      existing.items = data.items;
      existing.subtotalMinor = data.subtotalMinor;
      existing.taxMinor = data.taxMinor;
      existing.discountMinor = data.discountMinor;
      existing.tipMinor = data.tipMinor;
      existing.serviceChargeMinor = data.serviceChargeMinor;
      existing.totalMinor = data.totalMinor;
      existing.updatedAt = now;
      await putRecord(STORES.RECEIPTS, existing);
      return existing;
    }

    const id = uuidv4();
    const newRecord: GuestReceiptRecord = {
      id,
      expenseId,
      storagePath: `guest/${guestId}/${expenseId}/${id}.jpg`,
      uploadedBy: guestId,
      originalFilename: 'receipt_items.json',
      contentType: 'application/json',
      fileSize: 0,
      createdAt: now,
      updatedAt: now,
      items: data.items,
      subtotalMinor: data.subtotalMinor,
      taxMinor: data.taxMinor,
      discountMinor: data.discountMinor,
      tipMinor: data.tipMinor,
      serviceChargeMinor: data.serviceChargeMinor,
      totalMinor: data.totalMinor,
    };
    await putRecord(STORES.RECEIPTS, newRecord);
    return newRecord;
  }

  async deleteReceipt(id: string): Promise<void> {
    await deleteRecord(STORES.RECEIPTS, id);
  }

  // --------------------------------------------------------------------------
  // Clear / Reset
  // --------------------------------------------------------------------------

  async clearGuestData(): Promise<void> {
    await clearAllGuestStores();
    try {
      localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
      localStorage.removeItem(GUEST_USER_ID_KEY);
      localStorage.removeItem(GUEST_USER_NAME_KEY);
      localStorage.removeItem(GUEST_CURRENCY_KEY);
    } catch {
      // Ignore
    }
    this.cachedGuestUserId = null;
  }
}

export const guestStore = new GuestStore();
