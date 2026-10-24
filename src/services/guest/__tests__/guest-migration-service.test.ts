import { describe, it, expect, beforeEach, vi } from 'vitest';
import { guestStore } from '../guest-store';
import { guestMigrationService } from '../guest-migration-service';
import { supabase } from '@/lib/supabase';
import { groupService } from '@/services/supabase/group-service';
import { expenseService } from '@/services/supabase/expense-service';
import { settlementService } from '@/services/supabase/settlement-service';
import { friendService } from '@/services/supabase/friend-service';
import { profileService } from '@/services/supabase/profile-service';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

describe('GuestMigrationService', () => {
  const authUserId = '11111111-2222-3333-4444-555555555555';

  beforeEach(async () => {
    vi.clearAllMocks();
    guestStore.setGuestMode(true);
    await guestStore.clearGuestData();
    guestStore.setGuestMode(true);
  });

  describe('checkAccountState', () => {
    it('returns hasGuestData: false if no local guest records exist', async () => {
      const result = await guestMigrationService.checkAccountState(authUserId);
      expect(result.hasGuestData).toBe(false);
      expect(result.isExistingAccount).toBe(false);
    });

    it('identifies first-time sign-in when cloud account is empty', async () => {
      // Add local guest expense
      await guestStore.createExpense({
        description: 'Tacos',
        amountMinor: 2500,
        currency: 'USD',
        paidBy: guestStore.getGuestUserId(),
        splits: [{ userId: guestStore.getGuestUserId(), shareMinor: 2500 }],
      });

      // Mock Supabase returning 0 records for all tables
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          or: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      });

      const result = await guestMigrationService.checkAccountState(authUserId);
      expect(result.hasGuestData).toBe(true);
      expect(result.isExistingAccount).toBe(false);
      expect(result.guestSummary.expensesCount).toBe(1);
    });

    it('identifies existing account when cloud records exist', async () => {
      await guestStore.addFriend('Alex');

      // Mock Supabase returning existing cloud records (e.g. 2 group memberships)
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'group_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            or: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        };
      });

      const result = await guestMigrationService.checkAccountState(authUserId);
      expect(result.hasGuestData).toBe(true);
      expect(result.isExistingAccount).toBe(true);
    });
  });

  describe('migrateGuestData', () => {
    it('migrates preferred currency, friends, groups, expenses, and settlements into account', async () => {
      await guestStore.setPreferredCurrency('EUR');

      const friend = await guestStore.addFriend('maya@example.com');
      const friendId = friend.friendProfile.id;

      const group = await guestStore.createGroup({
        name: 'Euro Trip',
        currency: 'EUR',
        members: [{ userId: friendId, role: 'member' }],
      });

      await guestStore.createExpense({
        groupId: group.id,
        description: 'Museum tickets',
        amountMinor: 4000,
        currency: 'EUR',
        paidBy: guestStore.getGuestUserId(),
        splits: [
          { userId: guestStore.getGuestUserId(), shareMinor: 2000 },
          { userId: friendId, shareMinor: 2000 },
        ],
      });

      await guestStore.createSettlement({
        groupId: group.id,
        fromUserId: friendId,
        toUserId: guestStore.getGuestUserId(),
        amountMinor: 2000,
        currency: 'EUR',
      });

      // Spies on target services
      const prefSpy = vi.spyOn(profileService, 'setPreferredCurrency').mockResolvedValue(undefined as any);

      (supabase.rpc as any).mockImplementation((fn: string, args: any) => {
        if (fn === 'find_profile_by_email') {
          return Promise.resolve({
            data: [{ id: '99999999-9999-9999-9999-999999999999', display_name: 'Maya' }],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const friendSpy = vi.spyOn(friendService, 'getOrCreateFriendship').mockResolvedValue('fs-1');
      const groupSpy = vi.spyOn(groupService, 'createGroup').mockResolvedValue({
        id: 'sb-group-1',
        name: 'Euro Trip',
        created_by: authUserId,
        default_currency: 'EUR',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
        description: null,
        image_url: null,
      });

      const expenseSpy = vi.spyOn(expenseService, 'createExpense').mockResolvedValue({
        id: 'sb-exp-1',
        description: 'Museum tickets',
      });

      const settlementSpy = vi.spyOn(settlementService, 'createSettlement').mockResolvedValue({
        id: 'sb-settle-1',
        context_type: 'group',
        friendship_id: null,
        notes: null,
        exchange_rate: 1.0,
        exchange_rate_date: null,
        amount_minor: 2000,
        currency: 'EUR',
        group_id: 'sb-group-1',
        from_user_id: '99999999-9999-9999-9999-999999999999',
        to_user_id: authUserId,
        settlement_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: authUserId,
        deleted_at: null,
      });

      const result = await guestMigrationService.migrateGuestData(authUserId);

      expect(result.success).toBe(true);
      expect(result.migratedGroups).toBe(1);
      expect(result.migratedExpenses).toBe(1);
      expect(result.migratedSettlements).toBe(1);
      expect(result.migratedFriends).toBe(1);

      expect(prefSpy).toHaveBeenCalledWith('EUR');
      expect(friendSpy).toHaveBeenCalledWith(authUserId, '99999999-9999-9999-9999-999999999999');
      expect(groupSpy).toHaveBeenCalled();
      expect(expenseSpy).toHaveBeenCalled();
      expect(settlementSpy).toHaveBeenCalled();

      // Local guest data cleared and guest mode turned off after successful confirmation
      expect(await guestStore.hasGuestData()).toBe(false);
      expect(guestStore.isGuestMode()).toBe(false);
    });

    it('is safe to retry: preserves local data on error and avoids duplicates on retry', async () => {
      const group = await guestStore.createGroup({
        name: 'Ski Trip',
        currency: 'USD',
      });

      await guestStore.createExpense({
        groupId: group.id,
        description: 'Ski Pass',
        amountMinor: 15000,
        currency: 'USD',
        paidBy: guestStore.getGuestUserId(),
        splits: [{ userId: guestStore.getGuestUserId(), shareMinor: 15000 }],
      });

      const groupSpy = vi.spyOn(groupService, 'createGroup').mockResolvedValue({
        id: 'sb-group-ski',
        name: 'Ski Trip',
        created_by: authUserId,
        default_currency: 'USD',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
        description: null,
        image_url: null,
      });

      // Simulate a failure on expense migration
      const expenseSpy = vi.spyOn(expenseService, 'createExpense').mockRejectedValueOnce(new Error('Network error'));

      await expect(guestMigrationService.migrateGuestData(authUserId)).rejects.toThrow('Network error');

      // Local data is NOT cleared on failure!
      expect(await guestStore.hasGuestData()).toBe(true);

      // Verify that group was recorded as migrated so retry will NOT re-insert group
      expect(groupSpy).toHaveBeenCalledTimes(1);

      // Now retry with network recovered
      expenseSpy.mockResolvedValueOnce({
        id: 'sb-exp-pass',
        description: 'Ski Pass',
      });

      const retryResult = await guestMigrationService.migrateGuestData(authUserId);
      expect(retryResult.success).toBe(true);
      // Group was already migrated, so createGroup was NOT called again!
      expect(groupSpy).toHaveBeenCalledTimes(1);

      // Local data is cleared now that everything succeeded
      expect(await guestStore.hasGuestData()).toBe(false);
    });
  });

  describe('discardGuestData', () => {
    it('completely clears guest data and turns off guest mode', async () => {
      await guestStore.addFriend('DiscardMe');
      expect(await guestStore.hasGuestData()).toBe(true);

      await guestMigrationService.discardGuestData();
      expect(await guestStore.hasGuestData()).toBe(false);
      expect(guestStore.isGuestMode()).toBe(false);
    });
  });
});
