import { describe, it, expect } from 'vitest';
import { calculateGroupBalances, calculatePairwiseBalance } from '@/domain/balances/balance-engine';
import { SAMPLE_TRIP_IMAGES } from '@/lib/seed-data';
import type { User, Group, GroupMembership, Expense, ExpenseSplit, Settlement } from '@/domain/models/types';

describe('Demo Seed Data Workflow & Balance Engine Verification', () => {
  it('correctly calculates balances and simplified debts for seeded Goa group', () => {
    const currentUser: User = {
      id: 'usr_nikhil_1',
      name: 'Nikhil',
      email: '91827364n@gmail.com',
      isCurrentUser: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const friendSarah: User = {
      id: 'usr_sarah_2',
      name: 'Sarah Chen',
      email: 'sarah.chen@gmail.com',
      isCurrentUser: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const friendAlex: User = {
      id: 'usr_alex_3',
      name: 'Alex Rivera',
      email: 'alex.rivera@gmail.com',
      isCurrentUser: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const goaGroup: Group = {
      id: 'grp_goa_123',
      name: 'Goa Roadtrip 🏖️',
      description: 'Beach villa, seafood, scooter rentals & sunset parties in North Goa.',
      currency: 'INR',
      createdBy: currentUser.id,
      imageUrl: SAMPLE_TRIP_IMAGES.goa,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Expense 1: Beachside Villa - ₹18,000 paid by Nikhil, split 3 ways
    const exp1: Expense = {
      id: 'exp_1',
      sourceType: 'group',
      sourceId: goaGroup.id,
      groupId: goaGroup.id,
      description: 'Beachside Villa Stay (3 Nights)',
      amountMinor: 1800000,
      originalAmountMinor: 1800000,
      currency: 'INR',
      originalCurrency: 'INR',
      paidBy: currentUser.id,
      expenseDate: new Date().toISOString(),
      splitType: 'equal',
      participants: [currentUser.id, friendSarah.id, friendAlex.id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const splits1: ExpenseSplit[] = [
      { id: 'sp_1', expenseId: 'exp_1', userId: currentUser.id, shareMinor: 600000, amountMinor: 600000 },
      { id: 'sp_2', expenseId: 'exp_1', userId: friendSarah.id, shareMinor: 600000, amountMinor: 600000 },
      { id: 'sp_3', expenseId: 'exp_1', userId: friendAlex.id, shareMinor: 600000, amountMinor: 600000 },
    ];

    // Expense 2: Seafood Dinner - ₹4,500 paid by Sarah, split 3 ways
    const exp2: Expense = {
      id: 'exp_2',
      sourceType: 'group',
      sourceId: goaGroup.id,
      groupId: goaGroup.id,
      description: 'Seafood Dinner at Curlies',
      amountMinor: 450000,
      originalAmountMinor: 450000,
      currency: 'INR',
      originalCurrency: 'INR',
      paidBy: friendSarah.id,
      expenseDate: new Date().toISOString(),
      splitType: 'equal',
      participants: [currentUser.id, friendSarah.id, friendAlex.id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const splits2: ExpenseSplit[] = [
      { id: 'sp_4', expenseId: 'exp_2', userId: currentUser.id, shareMinor: 150000, amountMinor: 150000 },
      { id: 'sp_5', expenseId: 'exp_2', userId: friendSarah.id, shareMinor: 150000, amountMinor: 150000 },
      { id: 'sp_6', expenseId: 'exp_2', userId: friendAlex.id, shareMinor: 150000, amountMinor: 150000 },
    ];

    // Expense 3: Scooter Rentals - ₹3,000 paid by Alex, split 3 ways
    const exp3: Expense = {
      id: 'exp_3',
      sourceType: 'group',
      sourceId: goaGroup.id,
      groupId: goaGroup.id,
      description: 'Scooter Rentals & Fuel',
      amountMinor: 300000,
      originalAmountMinor: 300000,
      currency: 'INR',
      originalCurrency: 'INR',
      paidBy: friendAlex.id,
      expenseDate: new Date().toISOString(),
      splitType: 'equal',
      participants: [currentUser.id, friendSarah.id, friendAlex.id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const splits3: ExpenseSplit[] = [
      { id: 'sp_7', expenseId: 'exp_3', userId: currentUser.id, shareMinor: 100000, amountMinor: 100000 },
      { id: 'sp_8', expenseId: 'exp_3', userId: friendSarah.id, shareMinor: 100000, amountMinor: 100000 },
      { id: 'sp_9', expenseId: 'exp_3', userId: friendAlex.id, shareMinor: 100000, amountMinor: 100000 },
    ];

    // Settlement 1: Sarah paid Nikhil ₹1,500
    const st1: Settlement = {
      id: 'st_1',
      sourceType: 'group',
      sourceId: goaGroup.id,
      groupId: goaGroup.id,
      fromUserId: friendSarah.id,
      toUserId: currentUser.id,
      amountMinor: 150000,
      currency: 'INR',
      settlementDate: new Date().toISOString(),
      notes: 'Goa dinner settlement via UPI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const groupExpenses = [exp1, exp2, exp3];
    const groupSplits = [...splits1, ...splits2, ...splits3];
    const groupSettlements = [st1];

    const balances = calculateGroupBalances(
      groupExpenses,
      groupSplits,
      groupSettlements,
      'INR'
    );

    const nikhilBal = balances.balances.get(currentUser.id);
    const sarahBal = balances.balances.get(friendSarah.id);
    const alexBal = balances.balances.get(friendAlex.id);

    // Verified net calculations:
    // Nikhil: +800000 minor (₹8,000.00)
    // Sarah: -250000 minor (-₹2,500.00)
    // Alex: -550000 minor (-₹5,500.00)
    expect(nikhilBal?.netBalance).toBe(800000);
    expect(sarahBal?.netBalance).toBe(-250000);
    expect(alexBal?.netBalance).toBe(-550000);

    // Sum of all net balances must be zero
    const sumNet = (nikhilBal?.netBalance ?? 0) + (sarahBal?.netBalance ?? 0) + (alexBal?.netBalance ?? 0);
    expect(sumNet).toBe(0);

    // Debt simplification:
    // Sarah pays Nikhil ₹2,500
    // Alex pays Nikhil ₹5,500
    expect(balances.simplifiedDebts).toHaveLength(2);

    const sarahDebt = balances.simplifiedDebts.find((d) => d.fromUserId === friendSarah.id);
    expect(sarahDebt?.toUserId).toBe(currentUser.id);
    expect(sarahDebt?.amountMinor).toBe(250000);

    const alexDebt = balances.simplifiedDebts.find((d) => d.fromUserId === friendAlex.id);
    expect(alexDebt?.toUserId).toBe(currentUser.id);
    expect(alexDebt?.amountMinor).toBe(550000);
  });

  it('correctly calculates pairwise personal balance across group & personal expenses', () => {
    const currentUserId = 'usr_nikhil_1';
    const sarahId = 'usr_sarah_2';

    // Personal expense: Shared airport taxi ₹1,200 (₹600 each) paid by Nikhil
    const personalExp: Expense = {
      id: 'exp_personal_1',
      sourceType: 'personal',
      sourceId: currentUserId,
      description: 'Shared Airport Taxi',
      amountMinor: 120000,
      originalAmountMinor: 120000,
      currency: 'INR',
      originalCurrency: 'INR',
      paidBy: currentUserId,
      expenseDate: new Date().toISOString(),
      splitType: 'equal',
      participants: [currentUserId, sarahId],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const personalSplits: ExpenseSplit[] = [
      { id: 'sp_p1', expenseId: personalExp.id, userId: currentUserId, shareMinor: 60000, amountMinor: 60000 },
      { id: 'sp_p2', expenseId: personalExp.id, userId: sarahId, shareMinor: 60000, amountMinor: 60000 },
    ];

    const pb = calculatePairwiseBalance(
      currentUserId,
      sarahId,
      [personalExp],
      personalSplits,
      [],
      'INR'
    );

    // Sarah owes Nikhil ₹600 (60000 minor)
    expect(pb.amountMinor).toBe(60000);
    expect(pb.fromUserId).toBe(sarahId);
    expect(pb.toUserId).toBe(currentUserId);
  });
});
