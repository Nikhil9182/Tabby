import { describe, it, expect, beforeEach, vi } from 'vitest';
import { geminiReceiptService } from '../gemini-receipt-service';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('GeminiReceiptService (Server-Side Edge Function Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default authenticated session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'valid_jwt_token',
          user: { id: 'user_123', email: 'test@example.com' },
        } as any,
      },
      error: null,
    });

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
  });

  const mockFile = new File(['dummy-bytes'], 'receipt.jpg', { type: 'image/jpeg' });

  it('successfully invokes scan-receipt Edge Function and returns structured ParsedReceipt', async () => {
    const mockServerData = {
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
    };

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { data: mockServerData },
      error: null,
    });

    const parsed = await geminiReceiptService.parseReceipt(mockFile, 'INR');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('scan-receipt', {
      body: {
        imageBase64: 'mockBase64String',
        mimeType: 'image/jpeg',
        currency: 'INR',
      },
    });

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

  it('throws error when user is not authenticated (invalid session)', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    await expect(geminiReceiptService.parseReceipt(mockFile, 'INR')).rejects.toThrow(
      /active signed-in account/i
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('handles 401 Unauthorized response from Edge Function', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Unauthorized: Invalid or expired authentication session.',
        context: { status: 401 },
      } as any,
    });

    await expect(geminiReceiptService.parseReceipt(mockFile, 'INR')).rejects.toThrow(
      /Authentication expired or invalid/i
    );
  });

  it('handles 429 Rate Limit exceeded from Edge Function', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Rate limit exceeded. Maximum 10 scans per minute.',
        context: { status: 429 },
      } as any,
    });

    await expect(geminiReceiptService.parseReceipt(mockFile, 'INR')).rejects.toThrow(
      /AI rate limit reached/i
    );
  });

  it('handles 503 Service Unavailable when Gemini is not configured on server', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: {
        message: 'AI receipt scanning is currently unavailable on this server.',
        context: { status: 503 },
      } as any,
    });

    await expect(geminiReceiptService.parseReceipt(mockFile, 'INR')).rejects.toThrow(
      /AI receipt scanning is currently unavailable/i
    );
  });

  it('handles malformed or non-array items responses from Edge Function', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { data: { merchantName: 'Test', items: null } },
      error: null,
    });

    await expect(geminiReceiptService.parseReceipt(mockFile, 'INR')).rejects.toThrow(
      /unexpected or malformed receipt structure/i
    );
  });

  it('handles AbortSignal cancellation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      geminiReceiptService.parseReceipt(mockFile, 'INR', controller.signal)
    ).rejects.toThrow(/cancelled/i);
  });
});
