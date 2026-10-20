import { db } from '@/storage/local/database';
import { generateId } from '@/lib/id';
import type { User, Group, GroupMembership, Expense, ExpenseSplit, Settlement, Category } from '@/domain/models/types';

export const SAMPLE_TRIP_IMAGES = {
  goa: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1200&auto=format&fit=crop&q=80',
  mountains: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&auto=format&fit=crop&q=80',
  city: 'https://images.unsplash.com/photo-1477959858617-67f30bc75b82?w=1200&auto=format&fit=crop&q=80',
};

export async function seedDemoData(): Promise<{
  currentUser: User;
  friends: User[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
}> {
  const now = new Date();
  const isoNow = now.toISOString();

  // 1. Current User
  let currentUser = await db.users.filter((u) => !!u.isCurrentUser).first();
  if (!currentUser) {
    currentUser = {
      id: generateId(),
      name: 'Nikhil',
      email: '91827364n@gmail.com',
      isCurrentUser: true,
      createdAt: isoNow,
      updatedAt: isoNow,
    };
    await db.users.put(currentUser);
  } else if (!currentUser.name || currentUser.name === 'You' || currentUser.name === 'User') {
    currentUser = { ...currentUser, name: 'Nikhil' };
    await db.users.put(currentUser);
  }

  // 2. Sample Friends
  const friendSarah: User = {
    id: 'usr_sarah_' + generateId().slice(0, 6),
    name: 'Sarah Chen',
    email: 'sarah.chen@gmail.com',
    isCurrentUser: false,
    createdAt: isoNow,
    updatedAt: isoNow,
  };

  const friendAlex: User = {
    id: 'usr_alex_' + generateId().slice(0, 6),
    name: 'Alex Rivera',
    email: 'alex.rivera@gmail.com',
    isCurrentUser: false,
    createdAt: isoNow,
    updatedAt: isoNow,
  };

  const friendPriya: User = {
    id: 'usr_priya_' + generateId().slice(0, 6),
    name: 'Priya Sharma',
    email: 'priya.sharma@gmail.com',
    isCurrentUser: false,
    createdAt: isoNow,
    updatedAt: isoNow,
  };

  const friends = [friendSarah, friendAlex, friendPriya];
  for (const f of friends) {
    const existing = await db.users.filter((u) => u.email.toLowerCase() === f.email.toLowerCase()).first();
    if (!existing) {
      await db.users.put(f);
    }
  }

  // Reload friend records to use existing IDs if already seeded
  const actualSarah = (await db.users.filter((u) => u.email.toLowerCase() === friendSarah.email.toLowerCase()).first()) || friendSarah;
  const actualAlex = (await db.users.filter((u) => u.email.toLowerCase() === friendAlex.email.toLowerCase()).first()) || friendAlex;
  const actualPriya = (await db.users.filter((u) => u.email.toLowerCase() === friendPriya.email.toLowerCase()).first()) || friendPriya;

  // 3. Categories
  const categories: Category[] = [
    { id: 'cat_food', name: 'Food & Dining', icon: 'Utensils', color: '#F59E0B', scope: 'personal', createdAt: isoNow },
    { id: 'cat_transport', name: 'Transportation', icon: 'Car', color: '#3B82F6', scope: 'personal', createdAt: isoNow },
    { id: 'cat_housing', name: 'Accommodation', icon: 'Home', color: '#8B5CF6', scope: 'personal', createdAt: isoNow },
    { id: 'cat_groceries', name: 'Groceries', icon: 'ShoppingCart', color: '#10B981', scope: 'personal', createdAt: isoNow },
    { id: 'cat_other', name: 'General', icon: 'Tag', color: '#6B7280', scope: 'personal', createdAt: isoNow },
  ];
  for (const c of categories) {
    await db.categories.put(c);
  }

  // 4. Sample Groups
  const group1Id = 'grp_goa_' + generateId().slice(0, 6);
  const group1: Group = {
    id: group1Id,
    name: 'Goa Roadtrip 🏖️',
    description: 'Beach villa, seafood, scooter rentals & sunset parties in North Goa.',
    currency: 'INR',
    createdBy: currentUser.id,
    imageUrl: SAMPLE_TRIP_IMAGES.goa,
    isArchived: false,
    createdAt: isoNow,
    updatedAt: isoNow,
  };

  const group2Id = 'grp_trek_' + generateId().slice(0, 6);
  const group2: Group = {
    id: group2Id,
    name: 'Mountain Trek & Camp 🏔️',
    description: 'Weekend alpine trek, campfire supplies, and hiking trail passes.',
    currency: 'INR',
    createdBy: currentUser.id,
    imageUrl: SAMPLE_TRIP_IMAGES.mountains,
    isArchived: false,
    createdAt: isoNow,
    updatedAt: isoNow,
  };

  await db.groups.put(group1);
  await db.groups.put(group2);

  // Memberships
  const memberships: GroupMembership[] = [
    // Goa
    { groupId: group1Id, userId: currentUser.id, role: 'owner', status: 'active', joinedAt: isoNow, updatedAt: isoNow },
    { groupId: group1Id, userId: actualSarah.id, role: 'member', status: 'active', joinedAt: isoNow, updatedAt: isoNow },
    { groupId: group1Id, userId: actualAlex.id, role: 'member', status: 'active', joinedAt: isoNow, updatedAt: isoNow },
    // Trek
    { groupId: group2Id, userId: currentUser.id, role: 'owner', status: 'active', joinedAt: isoNow, updatedAt: isoNow },
    { groupId: group2Id, userId: actualAlex.id, role: 'member', status: 'active', joinedAt: isoNow, updatedAt: isoNow },
    { groupId: group2Id, userId: actualPriya.id, role: 'member', status: 'active', joinedAt: isoNow, updatedAt: isoNow },
  ];
  for (const m of memberships) {
    await db.groupMemberships.put(m);
  }

  // 5. Sample Expenses & Splits
  const expenses: Expense[] = [];
  const splits: ExpenseSplit[] = [];

  // Expense 1: Beachside Villa (Goa) - ₹18,000 paid by Nikhil, split 3 ways
  const exp1Id = generateId();
  const exp1Date = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const exp1: Expense = {
    id: exp1Id,
    sourceType: 'group',
    sourceId: group1Id,
    groupId: group1Id,
    description: 'Beachside Villa Stay (3 Nights)',
    amountMinor: 1800000, // ₹18,000.00
    originalAmountMinor: 1800000,
    currency: 'INR',
    originalCurrency: 'INR',
    paidBy: currentUser.id,
    expenseDate: exp1Date,
    categoryId: 'cat_housing',
    splitType: 'equal',
    participants: [currentUser.id, actualSarah.id, actualAlex.id],
    createdAt: exp1Date,
    updatedAt: exp1Date,
  };
  expenses.push(exp1);
  splits.push(
    { id: generateId(), expenseId: exp1Id, userId: currentUser.id, shareMinor: 600000, amountMinor: 600000 },
    { id: generateId(), expenseId: exp1Id, userId: actualSarah.id, shareMinor: 600000, amountMinor: 600000 },
    { id: generateId(), expenseId: exp1Id, userId: actualAlex.id, shareMinor: 600000, amountMinor: 600000 }
  );

  // Expense 2: Seafood Dinner (Goa) - ₹4,500 paid by Sarah, split 3 ways
  const exp2Id = generateId();
  const exp2Date = new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString();
  const exp2: Expense = {
    id: exp2Id,
    sourceType: 'group',
    sourceId: group1Id,
    groupId: group1Id,
    description: 'Seafood Dinner at Curlies',
    amountMinor: 450000, // ₹4,500.00
    originalAmountMinor: 450000,
    currency: 'INR',
    originalCurrency: 'INR',
    paidBy: actualSarah.id,
    expenseDate: exp2Date,
    categoryId: 'cat_food',
    splitType: 'equal',
    participants: [currentUser.id, actualSarah.id, actualAlex.id],
    createdAt: exp2Date,
    updatedAt: exp2Date,
  };
  expenses.push(exp2);
  splits.push(
    { id: generateId(), expenseId: exp2Id, userId: currentUser.id, shareMinor: 150000, amountMinor: 150000 },
    { id: generateId(), expenseId: exp2Id, userId: actualSarah.id, shareMinor: 150000, amountMinor: 150000 },
    { id: generateId(), expenseId: exp2Id, userId: actualAlex.id, shareMinor: 150000, amountMinor: 150000 }
  );

  // Expense 3: Scooter Rentals & Fuel (Goa) - ₹3,000 paid by Alex, split 3 ways
  const exp3Id = generateId();
  const exp3Date = new Date(now.getTime() - 18 * 3600 * 1000).toISOString();
  const exp3: Expense = {
    id: exp3Id,
    sourceType: 'group',
    sourceId: group1Id,
    groupId: group1Id,
    description: 'Scooter Rentals & Fuel',
    amountMinor: 300000, // ₹3,000.00
    originalAmountMinor: 300000,
    currency: 'INR',
    originalCurrency: 'INR',
    paidBy: actualAlex.id,
    expenseDate: exp3Date,
    categoryId: 'cat_transport',
    splitType: 'equal',
    participants: [currentUser.id, actualSarah.id, actualAlex.id],
    createdAt: exp3Date,
    updatedAt: exp3Date,
  };
  expenses.push(exp3);
  splits.push(
    { id: generateId(), expenseId: exp3Id, userId: currentUser.id, shareMinor: 100000, amountMinor: 100000 },
    { id: generateId(), expenseId: exp3Id, userId: actualSarah.id, shareMinor: 100000, amountMinor: 100000 },
    { id: generateId(), expenseId: exp3Id, userId: actualAlex.id, shareMinor: 100000, amountMinor: 100000 }
  );

  // Expense 4: Campsite Tents (Mountain Trek) - ₹9,000 paid by Nikhil, split 3 ways
  const exp4Id = generateId();
  const exp4Date = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString();
  const exp4: Expense = {
    id: exp4Id,
    sourceType: 'group',
    sourceId: group2Id,
    groupId: group2Id,
    description: 'Tents & Camp Equipment Rental',
    amountMinor: 900000, // ₹9,000.00
    originalAmountMinor: 900000,
    currency: 'INR',
    originalCurrency: 'INR',
    paidBy: currentUser.id,
    expenseDate: exp4Date,
    categoryId: 'cat_housing',
    splitType: 'equal',
    participants: [currentUser.id, actualAlex.id, actualPriya.id],
    createdAt: exp4Date,
    updatedAt: exp4Date,
  };
  expenses.push(exp4);
  splits.push(
    { id: generateId(), expenseId: exp4Id, userId: currentUser.id, shareMinor: 300000, amountMinor: 300000 },
    { id: generateId(), expenseId: exp4Id, userId: actualAlex.id, shareMinor: 300000, amountMinor: 300000 },
    { id: generateId(), expenseId: exp4Id, userId: actualPriya.id, shareMinor: 300000, amountMinor: 300000 }
  );

  // Expense 5: Campfire BBQ Supplies (Mountain Trek) - ₹3,600 paid by Priya, split 3 ways
  const exp5Id = generateId();
  const exp5Date = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const exp5: Expense = {
    id: exp5Id,
    sourceType: 'group',
    sourceId: group2Id,
    groupId: group2Id,
    description: 'Campfire BBQ & Trail Rations',
    amountMinor: 360000, // ₹3,600.00
    originalAmountMinor: 360000,
    currency: 'INR',
    originalCurrency: 'INR',
    paidBy: actualPriya.id,
    expenseDate: exp5Date,
    categoryId: 'cat_food',
    splitType: 'equal',
    participants: [currentUser.id, actualAlex.id, actualPriya.id],
    createdAt: exp5Date,
    updatedAt: exp5Date,
  };
  expenses.push(exp5);
  splits.push(
    { id: generateId(), expenseId: exp5Id, userId: currentUser.id, shareMinor: 120000, amountMinor: 120000 },
    { id: generateId(), expenseId: exp5Id, userId: actualAlex.id, shareMinor: 120000, amountMinor: 120000 },
    { id: generateId(), expenseId: exp5Id, userId: actualPriya.id, shareMinor: 120000, amountMinor: 120000 }
  );

  // Expense 6: Personal Split (Airport Taxi with Sarah) - ₹1,200 paid by Nikhil, split 2 ways
  const exp6Id = generateId();
  const exp6Date = new Date(now.getTime() - 6 * 3600 * 1000).toISOString();
  const exp6: Expense = {
    id: exp6Id,
    sourceType: 'personal',
    sourceId: currentUser.id,
    description: 'Shared Airport Taxi',
    amountMinor: 120000, // ₹1,200.00
    originalAmountMinor: 120000,
    currency: 'INR',
    originalCurrency: 'INR',
    paidBy: currentUser.id,
    expenseDate: exp6Date,
    categoryId: 'cat_transport',
    splitType: 'equal',
    participants: [currentUser.id, actualSarah.id],
    createdAt: exp6Date,
    updatedAt: exp6Date,
  };
  expenses.push(exp6);
  splits.push(
    { id: generateId(), expenseId: exp6Id, userId: currentUser.id, shareMinor: 60000, amountMinor: 60000 },
    { id: generateId(), expenseId: exp6Id, userId: actualSarah.id, shareMinor: 60000, amountMinor: 60000 }
  );

  for (const e of expenses) {
    await db.expenses.put(e);
  }
  for (const s of splits) {
    await db.expenseSplits.put(s);
  }

  // 6. Sample Settlement
  const settlements: Settlement[] = [];
  const st1Date = new Date(now.getTime() - 4 * 3600 * 1000).toISOString();
  const st1: Settlement = {
    id: generateId(),
    sourceType: 'group',
    sourceId: group1Id,
    groupId: group1Id,
    fromUserId: actualSarah.id,
    toUserId: currentUser.id,
    amountMinor: 150000, // ₹1,500.00
    currency: 'INR',
    settlementDate: st1Date,
    notes: 'Goa dinner settlement via UPI',
    note: 'Goa dinner settlement via UPI',
    createdAt: st1Date,
    updatedAt: st1Date,
  };
  settlements.push(st1);
  await db.settlements.put(st1);

  return {
    currentUser,
    friends: [actualSarah, actualAlex, actualPriya],
    groups: [group1, group2],
    expenses,
    settlements,
  };
}
