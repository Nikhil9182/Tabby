import { describe, it, expect } from 'vitest';
import { extractReceiptItems, formatReceiptNotes } from '../receipt-item-parser';

describe('Receipt Item Parser', () => {
  it('correctly parses the exact screenshot text format', () => {
    const screenshotText =
      'Items: Tandoori chicken: ₹309.75, Lasooni Dal Tadka: ₹288.75, HYDERABADI MURG BIRYANI |: ₹393.75, 2x Tandoori Roti all food less spicy: ₹63.00, Tandoori Roti: ₹31.50 | Tax: ₹51.78';

    const result = extractReceiptItems(screenshotText, 'INR');

    expect(result.hasItems).toBe(true);
    expect(result.items).toHaveLength(5);

    expect(result.items[0]).toEqual({
      name: 'Tandoori chicken',
      quantity: 1,
      lineTotalMinor: 30975,
      unitPriceMinor: 30975,
    });

    expect(result.items[1]).toEqual({
      name: 'Lasooni Dal Tadka',
      quantity: 1,
      lineTotalMinor: 28875,
      unitPriceMinor: 28875,
    });

    expect(result.items[2]).toEqual({
      name: 'HYDERABADI MURG BIRYANI',
      quantity: 1,
      lineTotalMinor: 39375,
      unitPriceMinor: 39375,
    });

    expect(result.items[3]).toEqual({
      name: 'Tandoori Roti all food less spicy',
      quantity: 2,
      lineTotalMinor: 6300,
      unitPriceMinor: 3150,
    });

    expect(result.items[4]).toEqual({
      name: 'Tandoori Roti',
      quantity: 1,
      lineTotalMinor: 3150,
      unitPriceMinor: 3150,
    });

    expect(result.taxMinor).toBe(5178);
    expect(result.subtotalMinor).toBe(30975 + 28875 + 39375 + 6300 + 3150); // 108675
    expect(result.totalMinor).toBe(108675 + 5178); // 113853 (₹1,138.53 matches screenshot)
    expect(result.userNotes).toBeUndefined();
  });

  it('preserves user notes while extracting items and metadata', () => {
    const textWithNotes =
      'Had an awesome team dinner!\nItems: Pizza: $15.00, 2x Soda: $6.00 | Tax: $1.80 | Tip: $3.00';

    const result = extractReceiptItems(textWithNotes, 'USD');

    expect(result.hasItems).toBe(true);
    expect(result.userNotes).toBe('Had an awesome team dinner!');
    expect(result.items).toHaveLength(2);
    expect(result.taxMinor).toBe(180);
    expect(result.tipMinor).toBe(300);
  });

  it('parses embedded JSON metadata correctly with assigned participants', () => {
    const formatted = formatReceiptNotes({
      items: [
        {
          name: 'Butter Chicken',
          quantity: 1,
          lineTotalMinor: 45000,
          assignedUserIds: ['user_nikhil'],
        },
        {
          name: 'Garlic Naan',
          quantity: 3,
          lineTotalMinor: 18000,
          assignedUserIds: ['user_nikhil', 'user_neha'],
        },
      ],
      taxMinor: 3150,
      discountMinor: 5000,
      currency: 'INR',
      userNotes: 'Client dinner celebration',
    });

    const parsed = extractReceiptItems(formatted, 'INR');

    expect(parsed.hasItems).toBe(true);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].assignedUserIds).toEqual(['user_nikhil']);
    expect(parsed.items[1].assignedUserIds).toEqual(['user_nikhil', 'user_neha']);
    expect(parsed.taxMinor).toBe(3150);
    expect(parsed.discountMinor).toBe(5000);
    expect(parsed.userNotes).toBe('Client dinner celebration');
  });

  it('returns hasItems=false for regular text without receipt items', () => {
    const normalNotes = 'Monthly rent share for apartment 4B';
    const result = extractReceiptItems(normalNotes, 'INR');

    expect(result.hasItems).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.userNotes).toBe(normalNotes);
  });
});
