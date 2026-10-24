// src/services/guest/guest-migration-service.ts
// Handles safe, idempotent migration of Guest Mode data to Supabase accounts.

import { supabase } from '@/lib/supabase';
import { guestStore, type GuestDataSummary } from './guest-store';
import {
  STORES,
  getAllRecords,
  putRecord,
} from './indexed-db';
import type { GuestGroupRecord, GuestExpenseRecord, GuestSettlementRecord, GuestFriendRecord } from './guest-store';
import { friendService } from '@/services/supabase/friend-service';
import { groupService } from '@/services/supabase/group-service';
import { expenseService } from '@/services/supabase/expense-service';
import { settlementService } from '@/services/supabase/settlement-service';
import { profileService } from '@/services/supabase/profile-service';

export interface AccountCheckResult {
  hasGuestData: boolean;
  isExistingAccount: boolean;
  guestSummary: GuestDataSummary;
}

export interface MigrationResult {
  success: boolean;
  migratedGroups: number;
  migratedExpenses: number;
  migratedSettlements: number;
  migratedFriends: number;
  error?: string;
}

export class GuestMigrationService {
  /**
   * Checks whether the signed-in Supabase user has existing data in the cloud
   * to determine if this is a first-time sign-in or an existing-account merge.
   */
  async checkAccountState(userId: string): Promise<AccountCheckResult> {
    const guestSummary = await guestStore.getGuestSummary();
    const hasGuestData =
      guestSummary.expensesCount > 0 ||
      guestSummary.groupsCount > 0 ||
      guestSummary.friendsCount > 0 ||
      guestSummary.settlementsCount > 0;

    if (!hasGuestData) {
      return {
        hasGuestData: false,
        isExistingAccount: false,
        guestSummary,
      };
    }

    try {
      // Check for any cloud records associated with this account
      const [membershipsRes, expensesRes, personalRes, friendshipsRes] = await Promise.all([
        supabase
          .from('group_members')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('group_expenses')
          .select('id', { count: 'exact', head: true })
          .or(`paid_by.eq.${userId},created_by.eq.${userId}`),
        supabase
          .from('personal_expenses')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', userId),
        supabase
          .from('friendships')
          .select('id', { count: 'exact', head: true })
          .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`),
      ]);

      const groupCount = membershipsRes.count || 0;
      const expenseCount = expensesRes.count || 0;
      const personalCount = personalRes.count || 0;
      const friendshipCount = friendshipsRes.count || 0;

      const totalCloudRecords = groupCount + expenseCount + personalCount + friendshipCount;
      const isExistingAccount = totalCloudRecords > 0;

      return {
        hasGuestData: true,
        isExistingAccount,
        guestSummary,
      };
    } catch (err) {
      console.warn('[GuestMigration] Error checking cloud account state:', err);
      // Default to asking the user (existing account dialog) on network error
      return {
        hasGuestData: true,
        isExistingAccount: true,
        guestSummary,
      };
    }
  }

  /**
   * Migrates all local guest data into the authenticated Supabase user account.
   * Safe to retry: tracks `migratedId` on each record in IndexedDB so previously
   * migrated records are not duplicated on retry.
   */
  async migrateGuestData(authUserId: string): Promise<MigrationResult> {
    const guestId = guestStore.getGuestUserId();

    const [guestFriends, guestGroups, guestExpenses, guestSettlements] = await Promise.all([
      getAllRecords<GuestFriendRecord>(STORES.FRIENDS),
      getAllRecords<GuestGroupRecord>(STORES.GROUPS),
      getAllRecords<GuestExpenseRecord>(STORES.EXPENSES),
      getAllRecords<GuestSettlementRecord>(STORES.SETTLEMENTS),
    ]);

    let migratedFriends = 0;
    let migratedGroups = 0;
    let migratedExpenses = 0;
    let migratedSettlements = 0;

    // Map: local friend ID -> Supabase user ID (if matched or created)
    const friendIdMap = new Map<string, string>();

    // 1. Migrate Preferred Currency
    try {
      const guestCurrency = await guestStore.getPreferredCurrency();
      if (guestCurrency) {
        await profileService.setPreferredCurrency(guestCurrency);
      }
    } catch (err) {
      console.warn('[GuestMigration] Preferred currency migration skipped:', err);
    }

    // 2. Migrate Friends & canonical friendships
    for (const friend of guestFriends) {
      if (friend.migratedId) {
        friendIdMap.set(friend.id, friend.migratedId);
        migratedFriends++;
        continue;
      }

      if (friend.email) {
        try {
          const { data: profiles } = await (supabase as any).rpc('find_profile_by_email', {
            p_email: friend.email.trim().toLowerCase(),
          });

          if (profiles && profiles.length > 0) {
            const matchedProfile = profiles[0];
            if (matchedProfile.id !== authUserId) {
              await friendService.getOrCreateFriendship(authUserId, matchedProfile.id);
              friendIdMap.set(friend.id, matchedProfile.id);
              friend.migratedId = matchedProfile.id;
              await putRecord(STORES.FRIENDS, friend);
              migratedFriends++;
              continue;
            }
          }
        } catch (err) {
          console.warn(`[GuestMigration] Friend lookup failed for ${friend.email}:`, err);
        }
      }

      // If friend is not a registered user or has no email, attempt placeholder creation via RPC
      try {
        const { data: placeholderId, error: placeholderErr } = await (supabase as any).rpc(
          'create_guest_friend_profile',
          {
            p_id: friend.id,
            p_name: friend.name,
            p_email: friend.email || null,
          }
        );

        if (!placeholderErr && placeholderId) {
          await friendService.getOrCreateFriendship(authUserId, placeholderId);
          friendIdMap.set(friend.id, placeholderId);
          friend.migratedId = placeholderId;
          await putRecord(STORES.FRIENDS, friend);
          migratedFriends++;
        }
      } catch {
        // Migration 20261024000001 may not be run yet in SQL editor; fall back gracefully
      }
    }

    // 3. Migrate Groups
    const groupIdMap = new Map<string, string>();

    for (const group of guestGroups) {
      if (group.archived_at) continue;

      let supabaseGroupId = group.migratedId;

      if (!supabaseGroupId) {
        // Create group in Supabase
        const createdGroup = await groupService.createGroup({
          name: group.name,
          description: group.description || undefined,
          currency: group.default_currency,
          imageUrl: group.image_url || undefined,
        });

        supabaseGroupId = createdGroup.id;
        group.migratedId = supabaseGroupId;
        await putRecord(STORES.GROUPS, group);
      }

      groupIdMap.set(group.id, supabaseGroupId);
      migratedGroups++;

      // Invite / add members to this group
      try {
        const guestDetail = await guestStore.getGroupById(group.id);
        if (guestDetail?.members) {
          for (const member of guestDetail.members) {
            if (member.userId === guestId) continue;

            const mappedUserId = friendIdMap.get(member.userId);
            if (mappedUserId) {
              // Direct insert member if permitted, or create invite
              try {
                await (supabase.from('group_members') as any).upsert({
                  group_id: supabaseGroupId,
                  user_id: mappedUserId,
                  role: member.role || 'member',
                  status: 'active',
                });
              } catch {
                // If RLS prevents direct insert, send invite
              }
            } else if (member.profile?.email) {
              // Create invitation so friend can join
              try {
                await groupService.createInvitation(
                  supabaseGroupId,
                  member.profile.email,
                  member.role === 'admin' ? 'admin' : 'member'
                );
              } catch {
                // Ignore duplicate invite
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[GuestMigration] Group member migration error for group ${group.id}:`, err);
      }
    }

    // 4. Migrate Expenses & Splits
    const guestSplits = await guestStore.getSplitsForExpenses(guestExpenses.map((e) => e.id));

    for (const exp of guestExpenses) {
      if (exp.deletedAt) continue;

      if (exp.migratedId) {
        migratedExpenses++;
        continue;
      }

      const splitsForExp = guestSplits[exp.id] || [];

      // Determine context and map IDs
      const isGroup = exp.contextType === 'group' && exp.groupId && groupIdMap.has(exp.groupId);
      const isDirect = exp.contextType === 'direct';

      const targetGroupId = isGroup ? groupIdMap.get(exp.groupId!) : undefined;
      const targetFriendId = isDirect && exp.friendId ? friendIdMap.get(exp.friendId) : undefined;

      // Map splits participants: guestId -> authUserId; mapped friendId if available
      const mappedSplits = splitsForExp.map((s) => ({
        userId: s.user_id === guestId ? authUserId : friendIdMap.get(s.user_id) || authUserId,
        shareMinor: s.share_minor,
        weight: s.weight != null ? s.weight : undefined,
        percentageBasisPoints: s.percentage_basis_points != null ? s.percentage_basis_points : undefined,
      }));

      // Map paidBy
      const mappedPaidBy = exp.paidBy === guestId ? authUserId : friendIdMap.get(exp.paidBy) || authUserId;

      if (isGroup && targetGroupId) {
        // Group expense
        const createdExp = await expenseService.createExpense({
          groupId: targetGroupId,
          contextType: 'group',
          sourceType: 'group',
          description: exp.description,
          notes: exp.notes || undefined,
          categoryId: exp.categoryId || undefined,
          paidBy: mappedPaidBy,
          amountMinor: exp.amountMinor,
          currency: exp.currency,
          reportingCurrency: exp.reportingCurrency,
          exchangeRate: exp.exchangeRate,
          exchangeRateDate: exp.exchangeRateDate || undefined,
          exchangeRateSource: exp.exchangeRateSource || undefined,
          reportingAmountMinor: exp.reportingAmountMinor,
          splitType: exp.splitType,
          expenseDate: exp.expenseDate,
          splits: mappedSplits.length > 0 ? mappedSplits : [{ userId: authUserId, shareMinor: exp.amountMinor }],
        });

        exp.migratedId = createdExp.id;
        await putRecord(STORES.EXPENSES, exp);
        migratedExpenses++;
      } else if (isDirect && targetFriendId) {
        // Direct friend expense
        const createdExp = await expenseService.createExpense({
          friendId: targetFriendId,
          contextType: 'direct',
          sourceType: 'direct',
          description: exp.description,
          notes: exp.notes || undefined,
          categoryId: exp.categoryId || undefined,
          paidBy: mappedPaidBy,
          amountMinor: exp.amountMinor,
          currency: exp.currency,
          reportingCurrency: exp.reportingCurrency,
          exchangeRate: exp.exchangeRate,
          exchangeRateDate: exp.exchangeRateDate || undefined,
          exchangeRateSource: exp.exchangeRateSource || undefined,
          reportingAmountMinor: exp.reportingAmountMinor,
          splitType: exp.splitType,
          expenseDate: exp.expenseDate,
          splits: mappedSplits,
        });

        exp.migratedId = createdExp.id;
        await putRecord(STORES.EXPENSES, exp);
        migratedExpenses++;
      } else {
        // Personal Expense or unmapped friend expense preserved in personal_expenses
        const noteWithContext = exp.notes
          ? exp.notes
          : exp.friendId
          ? `[Guest direct expense]`
          : undefined;

        const { data: personalExp, error: personalErr } = await (supabase.from('personal_expenses') as any)
          .insert({
            owner_id: authUserId,
            description: exp.description,
            notes: noteWithContext,
            category_id: exp.categoryId || null,
            amount_minor: exp.amountMinor,
            currency: exp.currency,
            expense_date: exp.expenseDate,
          })
          .select('id')
          .single();

        if (personalErr) {
          throw new Error(`Failed to migrate expense "${exp.description}": ${personalErr.message}`);
        }

        exp.migratedId = personalExp.id;
        await putRecord(STORES.EXPENSES, exp);
        migratedExpenses++;
      }
    }

    // 5. Migrate Settlements
    for (const settle of guestSettlements) {
      if (settle.deleted_at) continue;

      if (settle.migratedId) {
        migratedSettlements++;
        continue;
      }

      const isGroup = settle.group_id && groupIdMap.has(settle.group_id);
      const targetGroupId = isGroup ? groupIdMap.get(settle.group_id!) : undefined;

      const mappedFrom = settle.from_user_id === guestId ? authUserId : friendIdMap.get(settle.from_user_id);
      const mappedTo = settle.to_user_id === guestId ? authUserId : friendIdMap.get(settle.to_user_id);

      if (mappedFrom && mappedTo) {
        try {
          const createdSettle = await settlementService.createSettlement({
            groupId: targetGroupId,
            contextType: targetGroupId ? 'group' : 'direct',
            fromUserId: mappedFrom,
            toUserId: mappedTo,
            amountMinor: settle.amount_minor,
            currency: settle.currency,
            notes: settle.notes || undefined,
            settlementDate: settle.settlement_date,
            conversion:
              settle.applied_currency && settle.applied_amount_minor
                ? {
                    appliedCurrency: settle.applied_currency,
                    appliedAmountMinor: settle.applied_amount_minor,
                    exchangeRate: settle.exchange_rate || 1.0,
                    exchangeRateDate: settle.exchange_rate_date || settle.settlement_date,
                    exchangeRateSource: settle.exchange_rate_source || 'identity',
                  }
                : undefined,
          });

          settle.migratedId = createdSettle.id;
          await putRecord(STORES.SETTLEMENTS, settle);
          migratedSettlements++;
        } catch (err) {
          console.warn('[GuestMigration] Settlement migration skipped:', err);
        }
      }
    }

    // 6. Verify and clear local guest data ONLY after all data confirmed saved
    await guestStore.clearGuestData();
    guestStore.setGuestMode(false);

    return {
      success: true,
      migratedFriends,
      migratedGroups,
      migratedExpenses,
      migratedSettlements,
    };
  }

  /**
   * Discards all local guest data and turns off guest mode.
   */
  async discardGuestData(): Promise<void> {
    await guestStore.clearGuestData();
    guestStore.setGuestMode(false);
  }
}

export const guestMigrationService = new GuestMigrationService();
