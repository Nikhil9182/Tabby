import { supabase } from '@/lib/supabase';
import { toMinorUnits } from '@/domain/money/money';
import { compressImageForStorage } from '@/services/image/image-compression';
import type { ParsedReceipt, ReceiptItem, ReceiptTaxItem } from '@/domain/receipts/types';

export interface GeminiItemOutput {
  name: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal: number;
}

export interface GeminiReceiptOutput {
  merchantName?: string;
  date?: string; // YYYY-MM-DD
  currency?: string; // e.g. INR, USD
  subtotal?: number;
  tax?: number;
  discount?: number;
  tip?: number;
  total: number;
  items: GeminiItemOutput[];
}

export class GeminiReceiptService {
  /**
   * Scans and parses a receipt image by calling the secure Supabase Edge Function 'scan-receipt'.
   * The Gemini API key is stored and used exclusively on the server side.
   */
  async parseReceipt(
    imageSource: File | Blob,
    fallbackCurrency: string,
    signal?: AbortSignal
  ): Promise<ParsedReceipt> {
    // 1. Verify user session
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      throw new Error(
        'AI receipt scanning requires an active signed-in account. Please sign in or use Local OCR.'
      );
    }

    // 2. Pre-compress oversized camera images (max 1400px, quality 0.82)
    // This reduces payload from ~8MB to ~200KB, preventing timeouts and accelerating AI extraction
    let fileToSend: File | Blob = imageSource;
    try {
      const compressed = await compressImageForStorage(imageSource, {
        maxDimension: 1400,
        quality: 0.82,
        outputFileName: (imageSource as File)?.name || 'receipt.jpg',
      });
      fileToSend = compressed.file;
    } catch (compErr) {
      console.warn('Image pre-compression skipped, using original:', compErr);
    }

    const { base64, mimeType } = await this.fileToBase64(fileToSend);

    if (signal?.aborted) {
      throw new DOMException('Receipt scan was cancelled.', 'AbortError');
    }

    // 3. Invoke Supabase Edge Function
    const { data: responseData, error: functionError } = await supabase.functions.invoke(
      'scan-receipt',
      {
        body: {
          imageBase64: base64,
          mimeType,
          currency: fallbackCurrency,
        },
      }
    );

    if (functionError) {
      let detailedMessage = functionError.message || 'Failed to scan receipt with AI';
      try {
        const ctx = (functionError as any)?.context;
        if (ctx) {
          if (typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) detailedMessage = body.error;
          } else if (typeof ctx.text === 'function') {
            const text = await ctx.text();
            try {
              const body = JSON.parse(text);
              if (body?.error) detailedMessage = body.error;
            } catch {
              if (text) detailedMessage = text;
            }
          }
        }
      } catch {
        // Fallback to functionError.message
      }

      const status = (functionError as any)?.context?.status;

      if (status === 401 || detailedMessage.includes('Unauthorized')) {
        throw new Error('Authentication expired or invalid. Please sign in or use Local OCR.');
      }
      if (status === 429 || detailedMessage.includes('Rate limit')) {
        throw new Error('AI rate limit reached. Please wait a moment or use Local OCR.');
      }
      if (status === 503 || detailedMessage.includes('unavailable')) {
        throw new Error('AI receipt scanning is currently unavailable. Please use Local OCR.');
      }
      throw new Error(detailedMessage);
    }

    // 4. Handle response data
    const structuredOutput: GeminiReceiptOutput =
      (responseData as any)?.data || responseData;

    if (!structuredOutput || !Array.isArray(structuredOutput.items)) {
      throw new Error('Server returned an unexpected or malformed receipt structure.');
    }

    return this.mapOutputToParsedReceipt(structuredOutput, fallbackCurrency);
  }

  /**
   * Helper to convert File or Blob to base64 and extract MIME type.
   */
  private async fileToBase64(file: File | Blob): Promise<{ base64: string; mimeType: string }> {
    const mimeType = file.type || 'image/jpeg';
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve({ base64, mimeType });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Maps Edge Function output to Tabby's standard ParsedReceipt format using minor monetary units.
   */
  mapOutputToParsedReceipt(
    data: GeminiReceiptOutput,
    fallbackCurrency: string
  ): ParsedReceipt {
    const rawCurrency = (data.currency || fallbackCurrency).trim().toUpperCase();
    const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : fallbackCurrency.toUpperCase();

    const items: ReceiptItem[] = (data.items || []).map((it, idx) => {
      const qty = typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1;
      const lineTotalMinor = toMinorUnits(it.lineTotal || 0, currency);
      const unitPriceMinor =
        typeof it.unitPrice === 'number' && it.unitPrice > 0
          ? toMinorUnits(it.unitPrice, currency)
          : Math.round(lineTotalMinor / qty);

      return {
        id: `ai_item_${idx + 1}_${Math.random().toString(36).slice(2, 6)}`,
        name: (it.name || `Item ${idx + 1}`).trim(),
        quantity: qty,
        unitPriceMinor,
        lineTotalMinor,
        confidence: 99,
        isUncertain: false,
      };
    });

    const itemSubtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const taxMinor = toMinorUnits(data.tax || 0, currency);
    let discountMinor = toMinorUnits(data.discount || 0, currency);
    const tipMinor = toMinorUnits(data.tip || 0, currency);
    const subtotalMinor = data.subtotal ? toMinorUnits(data.subtotal, currency) : itemSubtotalMinor;

    let totalMinor = toMinorUnits(data.total || 0, currency);

    // If discount was not extracted or was 0, but total is less than itemSubtotal:
    // Reconcile the discount from the difference so the user's receipt balances automatically
    if (discountMinor === 0 && totalMinor > 0 && itemSubtotalMinor > totalMinor + taxMinor + tipMinor) {
      discountMinor = itemSubtotalMinor + taxMinor + tipMinor - totalMinor;
    }

    if (totalMinor === 0 && (itemSubtotalMinor > 0 || taxMinor > 0)) {
      totalMinor = itemSubtotalMinor + taxMinor + tipMinor - discountMinor;
    }

    const taxes: ReceiptTaxItem[] = [];
    if (taxMinor > 0) {
      taxes.push({
        id: `tax_${Math.random().toString(36).slice(2, 6)}`,
        name: 'Tax / GST',
        amountMinor: taxMinor,
      });
    }

    return {
      merchantName: data.merchantName?.trim() || undefined,
      date: data.date?.trim() || undefined,
      currency,
      itemSubtotalMinor: subtotalMinor,
      taxes,
      taxMinor,
      discountMinor,
      tipMinor,
      serviceChargeMinor: 0,
      totalMinor,
      items,
      unassignedLines: [],
      rawConfidence: 98,
      isTotalConfirmed: true,
    };
  }
}

export const geminiReceiptService = new GeminiReceiptService();
