import { describe, it, expect, beforeEach } from 'vitest';
import { guestStore } from '../guest-store';
import { closeGuestDB } from '../indexed-db';

describe('guestStore', () => {
  beforeEach(async () => {
    guestStore.setGuestMode(true);
    await guestStore.clearGuestData();
    guestStore.setGuestMode(true);
  });

  it('manages guest mode state and stable guest user id', () => {
    expect(guestStore.isGuestMode()).toBe(true);
    const id1 = guestStore.getGuestUserId();
    const id2 = guestStore.getGuestUserId();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);

    guestStore.setGuestUserName('Traveler');
    expect(guestStore.getGuestUserName()).toBe('Traveler');

    guestStore.setGuestMode(false);
    expect(guestStore.isGuestMode()).toBe(false);
  });

  it('adds and lists friends', async () => {
    const friendResult = await guestStore.addFriend('Alice Wonderland');
    expect(friendResult.friendProfile.display_name).toBe('Alice Wonderland');
    expect(friendResult.friendship.status).toBe('accepted');

    const friends = await guestStore.getFriends();
    expect(friends).toHaveLength(1);
    expect(friends[0].name).toBe('Alice Wonderland');

    // Duplicate prevention
    await expect(guestStore.addFriend('Alice Wonderland')).rejects.toThrow(/already in your friends list/);
  });

  it('creates and manages groups and group members', async () => {
    const friend = await guestStore.addFriend('Bob');
    const guestId = guestStore.getGuestUserId();

    const group = await guestStore.createGroup({
      name: 'Weekend Getaway',
      description: 'Camping trip',
      currency: 'EUR',
      members: [{ userId: friend.friendProfile.id, role: 'member' }],
    });

    expect(group.name).toBe('Weekend Getaway');
    expect(group.default_currency).toBe('EUR');

    const groups = await guestStore.getUserGroups();
    expect(groups).toHaveLength(1);

    const detail = await guestStore.getGroupById(group.id);
    expect(detail).not.toBeNull();
    expect(detail?.members).toHaveLength(2); // Guest (owner) + Bob
    const memberIds = detail?.members.map((m) => m.userId);
    expect(memberIds).toContain(guestId);
    expect(memberIds).toContain(friend.friendProfile.id);

    // Update group
    await guestStore.updateGroup({ id: group.id, name: 'Mountain Retreat' });
    const updated = await guestStore.getGroupById(group.id);
    expect(updated?.name).toBe('Mountain Retreat');

    // Archive group
    await guestStore.archiveGroup(group.id);
    const activeGroups = await guestStore.getUserGroups();
    expect(activeGroups).toHaveLength(0);
  });

  it('records, queries, and splits expenses', async () => {
    const friend = await guestStore.addFriend('Charlie');
    const guestId = guestStore.getGuestUserId();
    const friendId = friend.friendProfile.id;

    const group = await guestStore.createGroup({
      name: 'Dinner Club',
      currency: 'USD',
      members: [{ userId: friendId }],
    });

    // 1. Group expense
    const res = await guestStore.createExpense({
      description: 'Sushi Dinner',
      amountMinor: 6000,
      currency: 'USD',
      paidBy: guestId,
      groupId: group.id,
      splitType: 'equal',
      splits: [
        { userId: guestId, shareMinor: 3000 },
        { userId: friendId, shareMinor: 3000 },
      ],
    });

    expect(res.id).toBeDefined();

    const expenses = await guestStore.getExpenses({ groupId: group.id });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].description).toBe('Sushi Dinner');
    expect(expenses[0].amountMinor).toBe(6000);

    const splits = await guestStore.getSplitsForExpenses([res.id]);
    expect(splits[res.id]).toHaveLength(2);

    // 2. Direct friend expense
    const directRes = await guestStore.createExpense({
      description: 'Coffee',
      amountMinor: 800,
      currency: 'USD',
      paidBy: friendId,
      friendId,
      contextType: 'direct',
      splitType: 'equal',
      splits: [
        { userId: guestId, shareMinor: 400 },
        { userId: friendId, shareMinor: 400 },
      ],
    });

    const directExpenses = await guestStore.getExpenses({ friendId });
    expect(directExpenses.some((e) => e.id === directRes.id)).toBe(true);
  });

  it('records and queries settlements', async () => {
    const friend = await guestStore.addFriend('Diana');
    const guestId = guestStore.getGuestUserId();
    const friendId = friend.friendProfile.id;

    const settlement = await guestStore.createSettlement({
      contextType: 'direct',
      friendId,
      fromUserId: friendId,
      toUserId: guestId,
      amountMinor: 1500,
      currency: 'USD',
      notes: 'Cash payment',
    });

    expect(settlement.amount_minor).toBe(1500);

    const list = await guestStore.getSettlements(undefined, 'direct');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(settlement.id);
  });

  it('tracks guest data summary correctly and clears cleanly', async () => {
    expect(await guestStore.hasGuestData()).toBe(false);

    await guestStore.addFriend('Elena');
    expect(await guestStore.hasGuestData()).toBe(true);

    const summary = await guestStore.getGuestSummary();
    expect(summary.friendsCount).toBe(1);

    await guestStore.clearGuestData();
    expect(await guestStore.hasGuestData()).toBe(false);
  });
});
