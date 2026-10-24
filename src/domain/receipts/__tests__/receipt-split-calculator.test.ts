import { describe, it, expect } from 'vitest';
import {
  calculateReceiptSplit,
  distributeProportionallyMinor,
} from '../receipt-split-calculator';
import type { ReceiptItem } from '../types';

describe('Receipt Split Calculator', () => {
  const alice = 'user_alice';
  const bob = 'user_bob';
  const charlie = 'user_charlie';

  const items: ReceiptItem[] = [
    { id: 'item_pizza', name: 'Pizza', quantity: 1, unitPriceMinor: 35000, lineTotalMinor: 35000 },
    { id: 'item_pasta', name: 'Pasta', quantity: 1, unitPriceMinor: 28000, lineTotalMinor: 28000 },
    { id: 'item_drinks', name: 'Drinks', quantity: 2, unitPriceMinor: 6000, lineTotalMinor: 12000 },
    { id: 'item_dessert', name: 'Dessert', quantity: 1, unitPriceMinor: 20000, lineTotalMinor: 20000 },
  ];

  describe('Equal Split Mode', () => {
    it('splits equally between two people with penny-perfect rounding', () => {
      // 100.01 split between 2 people -> 50.01 + 50.00 = 100.01
      const res = calculateReceiptSplit({
        mode: 'equal',
        totalMinor: 10001,
        items,
        assignments: {},
        participantIds: [alice, bob],
        currency: 'INR',
      });

      expect(res.isBalanced).toBe(true);
      expect(res.shares.length).toBe(2);
      expect(res.shares[0].totalShareMinor + res.shares[1].totalShareMinor).toBe(10001);
      expect(res.shares[0].totalShareMinor).toBe(5001);
      expect(res.shares[1].totalShareMinor).toBe(5000);
    });

    it('splits equally among three people (₹1000 -> 333.34 + 333.33 + 333.33 = ₹1000)', () => {
      const res = calculateReceiptSplit({
        mode: 'equal',
        totalMinor: 100000, // ₹1,000.00
        items,
        assignments: {},
        participantIds: [alice, bob, charlie],
        currency: 'INR',
      });

      expect(res.isBalanced).toBe(true);
      expect(res.shares.length).toBe(3);
      const sum = res.shares.reduce((acc, s) => acc + s.totalShareMinor, 0);
      expect(sum).toBe(100000);
      expect(res.shares[0].totalShareMinor).toBe(33334);
      expect(res.shares[1].totalShareMinor).toBe(33333);
      expect(res.shares[2].totalShareMinor).toBe(33333);
    });
  });

  describe('Item Assignment Mode', () => {
    it('flags unassigned items and prevents balanced completion', () => {
      const res = calculateReceiptSplit({
        mode: 'items',
        totalMinor: 95000,
        items,
        assignments: {
          item_pizza: [alice],
          item_pasta: [bob],
          // drinks and dessert are unassigned!
        },
        participantIds: [alice, bob, charlie],
        currency: 'INR',
      });

      expect(res.isBalanced).toBe(false);
      expect(res.unassignedItemIds).toContain('item_drinks');
      expect(res.unassignedItemIds).toContain('item_dessert');
      expect(res.error).toBeDefined();
    });

    it('assigns items cleanly: single, shared by 2, and shared by 3 participants', () => {
      // Pizza (350) -> Alice
      // Pasta (280) -> Bob
      // Drinks (120) -> Alice, Bob (60 each)
      // Dessert (200) -> Alice, Bob, Charlie (66.67, 66.67, 66.66)
      // Item Subtotal = 350 + 280 + 120 + 200 = 950.00 (95000 minor)
      const res = calculateReceiptSplit({
        mode: 'items',
        totalMinor: 95000,
        items,
        assignments: {
          item_pizza: [alice],
          item_pasta: [bob],
          item_drinks: [alice, bob],
          item_dessert: [alice, bob, charlie],
        },
        participantIds: [alice, bob, charlie],
        currency: 'INR',
      });

      expect(res.isBalanced).toBe(true);
      expect(res.unassignedItemIds.length).toBe(0);

      const aliceShare = res.shares.find((s) => s.userId === alice)!;
      const bobShare = res.shares.find((s) => s.userId === bob)!;
      const charlieShare = res.shares.find((s) => s.userId === charlie)!;

      // Alice: 350 + 60 + 66.67 = 476.67 (47667 minor)
      // Bob: 280 + 60 + 66.67 = 406.67 (40667 minor)
      // Charlie: 66.66 (6666 minor)
      // 47667 + 40667 + 6666 = 95000
      expect(aliceShare.totalShareMinor + bobShare.totalShareMinor + charlieShare.totalShareMinor).toBe(95000);
      expect(aliceShare.assignedItemsSubtotalMinor).toBe(47667);
      expect(bobShare.assignedItemsSubtotalMinor).toBe(40667);
      expect(charlieShare.assignedItemsSubtotalMinor).toBe(6666);
    });

    it('allocates taxes and discounts proportionally to each person’s subtotal', () => {
      // Items:
      // Item A: 100.00 -> Alice
      // Item B: 300.00 -> Bob
      // Total Items = 400.00
      // Tax: 40.00 (Alice should get 10.00, Bob should get 30.00)
      // Discount: 20.00 (Alice should get 5.00, Bob should get 15.00)
      // Final Total: 400 + 40 - 20 = 420.00
      const testItems: ReceiptItem[] = [
        { id: 'item_a', name: 'Item A', quantity: 1, unitPriceMinor: 10000, lineTotalMinor: 10000 },
        { id: 'item_b', name: 'Item B', quantity: 1, unitPriceMinor: 30000, lineTotalMinor: 30000 },
      ];

      const res = calculateReceiptSplit({
        mode: 'items',
        totalMinor: 42000,
        items: testItems,
        assignments: {
          item_a: [alice],
          item_b: [bob],
        },
        participantIds: [alice, bob],
        taxMinor: 4000,
        discountMinor: 2000,
        currency: 'INR',
      });

      expect(res.isBalanced).toBe(true);
      const aliceShare = res.shares.find((s) => s.userId === alice)!;
      const bobShare = res.shares.find((s) => s.userId === bob)!;

      expect(aliceShare.assignedItemsSubtotalMinor).toBe(10000);
      expect(aliceShare.taxShareMinor).toBe(1000); // 25% of 40.00
      expect(aliceShare.discountShareMinor).toBe(500); // 25% of 20.00
      expect(aliceShare.totalShareMinor).toBe(10500); // 100 + 10 - 5 = 105.00

      expect(bobShare.assignedItemsSubtotalMinor).toBe(30000);
      expect(bobShare.taxShareMinor).toBe(3000); // 75% of 40.00
      expect(bobShare.discountShareMinor).toBe(1500); // 75% of 20.00
      expect(bobShare.totalShareMinor).toBe(31500); // 300 + 30 - 15 = 315.00

      expect(aliceShare.totalShareMinor + bobShare.totalShareMinor).toBe(42000);
    });

    it('reconciles any final total discrepancy down to exact minor units', () => {
      // Items total 750.00. Final bill is 885.00 (e.g. 135 tax/tip difference).
      const testItems: ReceiptItem[] = [
        { id: 'item_1', name: 'Food 1', quantity: 1, unitPriceMinor: 25000, lineTotalMinor: 25000 },
        { id: 'item_2', name: 'Food 2', quantity: 1, unitPriceMinor: 50000, lineTotalMinor: 50000 },
      ];

      const res = calculateReceiptSplit({
        mode: 'items',
        totalMinor: 88500, // ₹885.00
        items: testItems,
        assignments: {
          item_1: [alice],
          item_2: [bob],
        },
        participantIds: [alice, bob],
        taxMinor: 13500, // ₹135.00
        currency: 'INR',
      });

      expect(res.isBalanced).toBe(true);
      const sum = res.shares.reduce((acc, s) => acc + s.totalShareMinor, 0);
      expect(sum).toBe(88500);
    });
  });

  describe('distributeProportionallyMinor', () => {
    it('distributes rounding remainders deterministically penny-by-penny', () => {
      // Distribute 10 pennies among 3 participants with equal weights
      const result = distributeProportionallyMinor(10, [
        { userId: alice, weight: 1 },
        { userId: bob, weight: 1 },
        { userId: charlie, weight: 1 },
      ]);

      const sum = result[alice] + result[bob] + result[charlie];
      expect(sum).toBe(10);
      expect(result[alice]).toBe(4);
      expect(result[bob]).toBe(3);
      expect(result[charlie]).toBe(3);
    });
  });
});
