import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  geminiReceiptService,
  GEMINI_API_KEY_STORAGE_KEY,
} from '../gemini-receipt-service';

describe('GeminiReceiptService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('manages API key in localStorage correctly', () => {
    expect(geminiReceiptService.hasApiKey()).toBe(false);
    expect(geminiReceiptService.getApiKey()).toBeNull();

    geminiReceiptService.setApiKey('AIzaSyTestKey123');
    expect(geminiReceiptService.hasApiKey()).toBe(true);
    expect(geminiReceiptService.getApiKey()).toBe('AIzaSyTestKey123');
    expect(localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)).toBe('AIzaSyTestKey123');

    geminiReceiptService.clearApiKey();
    expect(geminiReceiptService.hasApiKey()).toBe(false);
    expect(geminiReceiptService.getApiKey()).toBeNull();
  });

  it('validates API key with testApiKey', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as any);

    const result = await geminiReceiptService.testApiKey('AIzaSyValidKey');
    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('AIzaSyValidKey'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('reports error on invalid API key in testApiKey', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'API key not valid' } }),
    } as any);

    const result = await geminiReceiptService.testApiKey('bad-key');
    expect(result.success).toBe(false);
    expect(result.message).toContain('API key not valid');
  });

  it('parses receipt image with structured outputs and exact integer minor units', async () => {
    geminiReceiptService.setApiKey('AIzaSyValidKey');

    const mockAiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  merchantName: 'Tandoori Nights',
                  date: '2026-10-25',
                  currency: 'INR',
                  subtotal: 500.0,
                  tax: 25.0,
                  tip: 20.0,
                  discount: 10.0,
                  total: 535.0,
                  items: [
                    { name: 'Butter Chicken', quantity: 1, unitPrice: 350.0, lineTotal: 350.0 },
                    { name: 'Garlic Naan', quantity: 3, unitPrice: 50.0, lineTotal: 150.0 },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockAiResponse,
    } as any);

    // Mock FileReader
    class MockFileReader {
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      public result: string = 'data:image/jpeg;base64,mockBase64String';

      readAsDataURL() {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    const file = new File(['fake-image'], 'receipt.jpg', { type: 'image/jpeg' });
    const parsed = await geminiReceiptService.parseReceipt(file, 'INR');

    expect(parsed.merchantName).toBe('Tandoori Nights');
    expect(parsed.date).toBe('2026-10-25');
    expect(parsed.currency).toBe('INR');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].name).toBe('Butter Chicken');
    expect(parsed.items[0].lineTotalMinor).toBe(35000);
    expect(parsed.items[1].name).toBe('Garlic Naan');
    expect(parsed.items[1].quantity).toBe(3);
    expect(parsed.items[1].lineTotalMinor).toBe(15000);
    expect(parsed.taxMinor).toBe(2500);
    expect(parsed.tipMinor).toBe(2000);
    expect(parsed.discountMinor).toBe(1000);
    expect(parsed.totalMinor).toBe(53500);
    expect(parsed.rawConfidence).toBe(98);
  });
});
