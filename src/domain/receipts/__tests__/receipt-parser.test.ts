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
      expect(cleanNumericString('1,035.00')).toBe('1035.00');
      expect(cleanNumericString('1,139.00')).toBe('1139.00');
      expect(cleanNumericString('-10.00')).toBe('-10.00');
    });

    it('detects currency correctly', () => {
      expect(detectCurrency('Total: ₹ 885.00')).toBe('INR');
      expect(detectCurrency('Rs. 350 Pizza')).toBe('INR');
      expect(detectCurrency('GSTIN : 06AACCO6344G1ZJ')).toBe('INR');
      expect(detectCurrency('CGST@2.5 25.89 SGST@2.5 25.89')).toBe('INR');
      expect(detectCurrency('Grand Total $45.00')).toBe('USD');
      expect(detectCurrency('Total 50.00 EUR')).toBe('EUR');
      expect(detectCurrency('Total £25.00')).toBe('GBP');
      expect(detectCurrency('No currency symbol', 'USD')).toBe('USD');
    });

    it('parses dates in various formats', () => {
      expect(parseReceiptDate('Date: 24/10/2026')).toBe('2026-10-24');
      expect(parseReceiptDate('Invoice Date 2026-10-24')).toBe('2026-10-24');
      expect(parseReceiptDate('24-10-2026 20:30')).toBe('2026-10-24');
      expect(parseReceiptDate('Invoice Date: 20-May-18 22:55')).toBe('2018-05-20');
      expect(parseReceiptDate('Time: 7:05:53 PM Date: 03/08/2023')).toBe('2023-08-03');
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

      // Quantity with rate in middle
      const item4 = parseItemCandidate('Tandoori chicken 1 295.00 309.75', 'INR');
      expect(item4).not.toBeNull();
      expect(item4?.name).toBe('Tandoori chicken');
      expect(item4?.quantity).toBe(1);
      expect(item4?.lineTotalMinor).toBe(30975);
    });
  });

  describe('Full receipt parsing with real fixtures', () => {
    it('parses User Image 2: Liquor Street (Indian restaurant receipt with multi-line items and taxes)', () => {
      const receiptText = `
Liquor Street
(ODVJH Private Limited)
11/2 Sector- 37,
Faridabad-121003.
Ph. No. : 0129-4360377, 9311111116
GSTIN : 06AACCO6344G1ZJ
Invoice Number: IN001001259
Invoice Date: 20-May-18 22:55
Item Qty. Rate Total

Tandoori chicken 1 295.00 309.75
Lasooni Dal Tadka 1 275.00 288.75
HYDERABADI MURG
BIRYANI 1 375.00 393.75
Tandoori Roti all food
less spicy 2 30.00 63.00
Tandoori Roti 1 30.00 31.50
Total Qty: 6

Sub Total: 1,035.00
CGST@2.5 25.89
SGST@2.5 25.89
S.Tax 51.75
Total: 1,139.00

Thanks For Visit...
      `;

      const lines = receiptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 95, lineNumber: idx + 1 }));

      const parsed = parseReceipt({ text: receiptText, lines, confidence: 95 }, 'USD');

      // Currency detected as INR due to GSTIN and CGST/SGST
      expect(parsed.currency).toBe('INR');
      expect(parsed.merchantName).toBe('Liquor Street');
      expect(parsed.date).toBe('2018-05-20');

      // Check items
      expect(parsed.items.length).toBe(5);
      expect(parsed.items[0].name).toBe('Tandoori chicken');
      expect(parsed.items[0].lineTotalMinor).toBe(30975);

      expect(parsed.items[1].name).toBe('Lasooni Dal Tadka');
      expect(parsed.items[1].lineTotalMinor).toBe(28875);

      // Multi-line items joined seamlessly
      expect(parsed.items[2].name).toBe('HYDERABADI MURG BIRYANI');
      expect(parsed.items[2].lineTotalMinor).toBe(39375);

      expect(parsed.items[3].name).toBe('Tandoori Roti all food less spicy');
      expect(parsed.items[3].quantity).toBe(2);
      expect(parsed.items[3].lineTotalMinor).toBe(6300);

      expect(parsed.items[4].name).toBe('Tandoori Roti');
      expect(parsed.items[4].lineTotalMinor).toBe(3150);

      // Check taxes and total
      expect(parsed.taxes.length).toBe(3); // CGST, SGST, S.Tax
      expect(parsed.totalMinor).toBe(113900); // 1,139.00
      expect(parsed.isTotalConfirmed).toBe(true);
    });

    it('parses User Image 1: Restaurant receipt with leading quantities and discounts', () => {
      const receiptText = `
Name: b
Table #: 33 Person #: 1,2 3
Time: 7:05:53 PM Date: 03/08/2023
Check No: 326195 Server: Katie
-------------------------------------------
1 FRIED CHICKEN TIT 18.00
1 CARBONARA 26.00
1 Brown Butter Cake 10.00
1 Side Ice Cream 3.00
1 Lenalicious 13.00
1 You're an Asshole 15.00
SUB TOTAL 75.00
Birthday Comp 28195 1 -10.00
Discounts Sub-Total -10.00
      `;

      const lines = receiptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 90, lineNumber: idx + 1 }));

      const parsed = parseReceipt({ text: receiptText, lines, confidence: 90 }, 'USD');

      expect(parsed.date).toBe('2023-08-03');
      expect(parsed.items.length).toBe(6);

      expect(parsed.items[0].name).toBe('FRIED CHICKEN TIT');
      expect(parsed.items[0].lineTotalMinor).toBe(1800);

      expect(parsed.items[1].name).toBe('CARBONARA');
      expect(parsed.items[1].lineTotalMinor).toBe(2600);

      expect(parsed.items[2].name).toBe('Brown Butter Cake');
      expect(parsed.items[2].lineTotalMinor).toBe(1000);

      expect(parsed.items[3].name).toBe('Side Ice Cream');
      expect(parsed.items[3].lineTotalMinor).toBe(300);

      expect(parsed.items[4].name).toBe('Lenalicious');
      expect(parsed.items[4].lineTotalMinor).toBe(1300);

      expect(parsed.items[5].name).toBe("You're an Asshole");
      expect(parsed.items[5].lineTotalMinor).toBe(1500);

      expect(parsed.itemSubtotalMinor).toBe(8500); // 18+26+10+3+13+15 = 85.00
      expect(parsed.discountMinor).toBe(1000); // 10.00
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
      expect(parsed.items.length).toBeGreaterThanOrEqual(1);
      expect(parsed.totalMinor).toBe(32500);
    });
  });
});
