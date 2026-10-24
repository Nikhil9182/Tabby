import { describe, it, expect } from 'vitest';
import {
  parseReceipt,
  cleanNumericString,
  detectCurrency,
  parseReceiptDate,
  parseItemCandidate,
} from '../receipt-parser';
import type { ReceiptRawData } from '../types';

describe('Receipt Parser', () => {
  describe('Helper functions', () => {
    it('cleans OCR numeric confusions: O->0, l->1, S->5, comma as decimal', () => {
      expect(cleanNumericString('35O.OO')).toBe('350.00');
      expect(cleanNumericString('l50.00')).toBe('150.00');
      expect(cleanNumericString('3S0.00')).toBe('350.00');
      expect(cleanNumericString('250,50')).toBe('250.50');
      expect(cleanNumericString('₹ 1,250.00')).toBe('1250.00');
      expect(cleanNumericString('Rs. 99.00')).toBe('99.00');
    });

    it('detects currency correctly', () => {
      expect(detectCurrency('Total: ₹ 885.00')).toBe('INR');
      expect(detectCurrency('Rs. 350 Pizza')).toBe('INR');
      expect(detectCurrency('Grand Total $45.00')).toBe('USD');
      expect(detectCurrency('Total 50.00 EUR')).toBe('EUR');
      expect(detectCurrency('Total £25.00')).toBe('GBP');
      expect(detectCurrency('No currency symbol', 'USD')).toBe('USD');
    });

    it('parses dates in various formats', () => {
      expect(parseReceiptDate('Date: 24/10/2026')).toBe('2026-10-24');
      expect(parseReceiptDate('Invoice Date 2026-10-24')).toBe('2026-10-24');
      expect(parseReceiptDate('24-10-2026 20:30')).toBe('2026-10-24');
      expect(parseReceiptDate('No date here')).toBeUndefined();
    });

    it('parses individual item candidate formats', () => {
      // Basic item
      const item1 = parseItemCandidate('Margherita Pizza 350.00', 'INR');
      expect(item1).not.toBeNull();
      expect(item1?.name).toBe('Margherita Pizza');
      expect(item1?.quantity).toBe(1);
      expect(item1?.lineTotalMinor).toBe(35000);

      // Leading quantity
      const item2 = parseItemCandidate('2 Cold Coffee 200.00', 'INR');
      expect(item2).not.toBeNull();
      expect(item2?.name).toBe('Cold Coffee');
      expect(item2?.quantity).toBe(2);
      expect(item2?.unitPriceMinor).toBe(10000);
      expect(item2?.lineTotalMinor).toBe(20000);

      // Trailing quantity with 'x'
      const item3 = parseItemCandidate('Iced Latte x 2 240.00', 'INR');
      expect(item3).not.toBeNull();
      expect(item3?.name).toBe('Iced Latte');
      expect(item3?.quantity).toBe(2);
      expect(item3?.lineTotalMinor).toBe(24000);

      // Quantity with '@'
      const item4 = parseItemCandidate('Garlic Bread 2 @ 60.00 120.00', 'INR');
      expect(item4).not.toBeNull();
      expect(item4?.name).toBe('Garlic Bread');
      expect(item4?.quantity).toBe(2);
      expect(item4?.unitPriceMinor).toBe(6000);
      expect(item4?.lineTotalMinor).toBe(12000);
    });
  });

  describe('Full receipt parsing', () => {
    it('parses a normal itemized Indian restaurant receipt with GST and service charge', () => {
      const receiptText = `
        PUNJAB GRILL RESTAURANT
        Connaught Place, New Delhi
        GSTIN: 07AABCP1234F1Z5
        Date: 24/10/2026 21:15
        Order No: 4092

        Paneer Tikka 320.00
        Dal Makhani 280.00
        2 Butter Naan 100.00
        Cold Coffee x 2 200.00

        Subtotal 900.00
        CGST 9% 81.00
        SGST 9% 81.00
        Service Charge 45.00
        Discount 50.00
        Grand Total 1057.00
        Thank you for visiting!
      `;

      const lines = receiptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 95, lineNumber: idx + 1 }));

      const rawData: ReceiptRawData = {
        text: receiptText,
        lines,
        confidence: 95,
      };

      const parsed = parseReceipt(rawData, 'INR');

      expect(parsed.merchantName).toBe('PUNJAB GRILL RESTAURANT');
      expect(parsed.date).toBe('2026-10-24');
      expect(parsed.currency).toBe('INR');

      // Check items
      expect(parsed.items.length).toBe(4);
      expect(parsed.items[0].name).toBe('Paneer Tikka');
      expect(parsed.items[0].lineTotalMinor).toBe(32000);

      expect(parsed.items[1].name).toBe('Dal Makhani');
      expect(parsed.items[1].lineTotalMinor).toBe(28000);

      expect(parsed.items[2].name).toBe('Butter Naan');
      expect(parsed.items[2].quantity).toBe(2);
      expect(parsed.items[2].lineTotalMinor).toBe(10000);

      expect(parsed.items[3].name).toBe('Cold Coffee');
      expect(parsed.items[3].quantity).toBe(2);
      expect(parsed.items[3].lineTotalMinor).toBe(20000);

      // Check taxes and charges
      expect(parsed.itemSubtotalMinor).toBe(90000);
      expect(parsed.taxes.length).toBe(2);
      expect(parsed.taxMinor).toBe(16200); // 81 + 81
      expect(parsed.serviceChargeMinor).toBe(4500);
      expect(parsed.discountMinor).toBe(5000);
      expect(parsed.totalMinor).toBe(105700);
      expect(parsed.isTotalConfirmed).toBe(true);
    });

    it('handles INR receipts with ₹ and Rs. currency labels and decimal amounts', () => {
      const receiptText = `
        CAFE COFFEE DAY
        Date: 2026-10-24
        1 Cappuccino ₹ 180.50
        Veg Sandwich Rs. 140.00
        Sub Total: 320.50
        Total: ₹ 320.50
      `;

      const lines = receiptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 90, lineNumber: idx + 1 }));

      const parsed = parseReceipt({ text: receiptText, lines, confidence: 90 }, 'USD');

      expect(parsed.currency).toBe('INR');
      expect(parsed.items.length).toBe(2);
      expect(parsed.items[0].lineTotalMinor).toBe(18050);
      expect(parsed.items[1].lineTotalMinor).toBe(14000);
      expect(parsed.totalMinor).toBe(32050);
      expect(parsed.isTotalConfirmed).toBe(true);
    });

    it('handles duplicate-looking rows safely with unique ids', () => {
      const receiptText = `
        PIZZERIA
        Date: 2026-10-24
        Pizza 350.00
        Pizza 350.00
        Total 700.00
      `;

      const lines = receiptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 90, lineNumber: idx + 1 }));

      const parsed = parseReceipt({ text: receiptText, lines, confidence: 90 }, 'INR');

      expect(parsed.items.length).toBe(2);
      expect(parsed.items[0].id).not.toBe(parsed.items[1].id);
      expect(parsed.totalMinor).toBe(70000);
    });

    it('handles empty or unrecognized OCR output gracefully', () => {
      const parsedEmpty = parseReceipt({ text: '', lines: [], confidence: 0 }, 'INR');
      expect(parsedEmpty.items.length).toBe(0);
      expect(parsedEmpty.totalMinor).toBe(0);
      expect(parsedEmpty.isTotalConfirmed).toBe(false);

      const unreadableText = `
        ~~~???
        ######
        -----
      `;
      const unreadableLines = unreadableText.split('\n').map((text, idx) => ({ text, confidence: 20, lineNumber: idx + 1 }));
      const parsedUnreadable = parseReceipt({ text: unreadableText, lines: unreadableLines, confidence: 20 }, 'INR');
      expect(parsedUnreadable.items.length).toBe(0);
      expect(parsedUnreadable.totalMinor).toBe(0);
    });

    it('preserves unassigned lines for user review when amounts are found without clear labels', () => {
      const receiptText = `
        UNKNOWN BISTRO
        Pasta 280.00
        Chef Special Code 99 45.00
        Total 325.00
      `;
      const lines = receiptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 75, lineNumber: idx + 1 }));

      const parsed = parseReceipt({ text: receiptText, lines, confidence: 75 }, 'INR');
      // At least 1 item is parsed (Pasta)
      expect(parsed.items.length).toBeGreaterThanOrEqual(1);
      expect(parsed.totalMinor).toBe(32500);
    });
  });
});
