import { toMinorUnits } from '@/domain/money/money';
import type { ParsedReceipt, ReceiptItem, ReceiptTaxItem } from '@/domain/receipts/types';

export const GEMINI_API_KEY_STORAGE_KEY = 'tabby_gemini_api_key';
const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
   * Retrieves configured Gemini API Key from localStorage or environment variables.
   */
  getApiKey(): string | null {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim();
      if (stored) return stored;
    }
    const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
    return envKey || null;
  }

  /**
   * Persists user's Gemini API key to browser localStorage.
   */
  setApiKey(key: string): void {
    if (typeof localStorage !== 'undefined') {
      const trimmed = key.trim();
      if (trimmed) {
        localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
      }
    }
  }

  /**
   * Removes Gemini API key from browser localStorage.
   */
  clearApiKey(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    }
  }

  /**
   * Returns true if a valid Gemini API key is available.
   */
  hasApiKey(): boolean {
    return Boolean(this.getApiKey());
  }

  /**
   * Tests API key validity against Google Gemini API.
   */
  async testApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return { success: false, message: 'Please provide an API key.' };
    }

    try {
      const url = `${GEMINI_API_URL}?key=${trimmed}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with OK' }] }],
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        const errorMsg = errorJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        return { success: false, message: errorMsg };
      }

      return { success: true, message: 'Gemini API key is valid and connected!' };
    } catch (err: any) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Network error testing API key',
      };
    }
  }

  /**
   * Reads a File or Blob into base64 format for Gemini inlineData transmission.
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
   * Scans and parses receipt image using Google Gemini 1.5 Flash Vision.
   */
  async parseReceipt(
    imageSource: File | Blob,
    fallbackCurrency: string,
    signal?: AbortSignal
  ): Promise<ParsedReceipt> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Gemini API Key is not configured. Add your free key in Settings or switch to Local OCR.'
      );
    }

    const { base64, mimeType } = await this.fileToBase64(imageSource);

    const promptText = `
You are an expert receipt extraction AI. Analyze this receipt image and extract structured financial details.
Return ONLY valid JSON with exact numerical values in standard major currency units (e.g. 15.50 or 350.00).
Rules:
- Extract item descriptions, quantities, unit prices (if visible), and line total prices.
- Identify merchant name, receipt date (in YYYY-MM-DD if recognizable), and currency code (e.g. INR, USD, EUR).
- Distinguish subtotal, tax / GST, tip / service charge, discount, and final grand total.
- If quantity is omitted, assume 1.
- Do NOT include currency symbols in numbers.
`;

    const requestPayload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            merchantName: { type: 'STRING' },
            date: { type: 'STRING', description: 'YYYY-MM-DD format if visible' },
            currency: { type: 'STRING', description: '3-letter currency code, e.g. INR, USD, EUR' },
            subtotal: { type: 'NUMBER', description: 'Subtotal before tax' },
            tax: { type: 'NUMBER', description: 'Total tax, VAT, or GST' },
            discount: { type: 'NUMBER', description: 'Total discount' },
            tip: { type: 'NUMBER', description: 'Tip or service charge' },
            total: { type: 'NUMBER', description: 'Final grand total payable' },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  quantity: { type: 'NUMBER' },
                  unitPrice: { type: 'NUMBER' },
                  lineTotal: { type: 'NUMBER' },
                },
                required: ['name', 'lineTotal'],
              },
            },
          },
          required: ['total', 'items'],
        },
      },
    };

    const url = `${GEMINI_API_URL}?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
      signal,
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => null);
      const errorMsg = errorJson?.error?.message || `Gemini API returned status ${res.status}`;
      if (res.status === 400 || res.status === 403) {
        throw new Error(`Invalid Gemini API Key or permission denied: ${errorMsg}`);
      } else if (res.status === 429) {
        throw new Error('Gemini free rate limit reached (15 requests/min). Please try again in a moment or use Local OCR.');
      }
      throw new Error(`AI Scan failed: ${errorMsg}`);
    }

    const jsonResponse = await res.json();
    const candidateText =
      jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Gemini did not return any recognized receipt content.');
    }

    let parsedOutput: GeminiReceiptOutput;
    try {
      parsedOutput = JSON.parse(candidateText);
    } catch {
      throw new Error('Failed to parse AI response into structured receipt data.');
    }

    return this.mapGeminiOutputToParsedReceipt(parsedOutput, fallbackCurrency);
  }

  /**
   * Maps Gemini output to Tabby's standard ParsedReceipt format using minor monetary units.
   */
  private mapGeminiOutputToParsedReceipt(
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
    const discountMinor = toMinorUnits(data.discount || 0, currency);
    const tipMinor = toMinorUnits(data.tip || 0, currency);
    const subtotalMinor = data.subtotal ? toMinorUnits(data.subtotal, currency) : itemSubtotalMinor;

    let totalMinor = toMinorUnits(data.total || 0, currency);
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
