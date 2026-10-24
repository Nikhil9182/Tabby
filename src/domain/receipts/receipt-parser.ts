import { generateId } from '@/lib/id';
import { parseMoney } from '@/domain/money/money';
import type {
  ParsedReceipt,
  ReceiptItem,
  ReceiptRawData,
  ReceiptRawLine,
  ReceiptTaxItem,
} from './types';

// Common regex patterns
const SEPARATOR_RE = /^[=\-_*#.]{3,}$/;
const PHONE_RE = /(?:ph|phone|tel|mobile|call|contact)[:.\s]*[+]?\d[\d\s-]{7,}/i;
const GSTIN_RE = /\b(?:gstin|gst\s*no|gst|tin|vat\s*tin|pan|fssai)[:.\s]*[0-9a-z]{8,}/i;
const INVOICE_NO_RE = /\b(?:bill\s*no|inv(?:oice)?\s*no|receipt\s*no|order\s*no|token\s*no|chk|check\s*no|table\s*no)[:.\s]*[a-z0-9\-_/]+/i;
const DATE_RE = /\b(?:\d{1,2}[-/.](?:[0-9]{1,2}|[a-z]{3})[-/.]\d{2,4}|\d{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/i;
const PAYMENT_METHOD_RE = /\b(?:cash\s*tendered|change\s*due|paid\s*via|upi|paytm|gpay|phonepe|visa|mastercard|amex|card\s*ending|debit\s*card|credit\s*card|net\s*banking)\b/i;

// Totals and charge patterns
const GRAND_TOTAL_RE = /\b(?:grand\s*total|net\s*payable|net\s*amount|amount\s*due|bill\s*total|final\s*total|total\s*payable|total\s*due)\b/i;
const TOTAL_RE = /\b(?:total|amount|tot)\b/i;
const SUBTOTAL_RE = /\b(?:sub\s*total|subtotal|sub-total|item\s*total|food\s*total|gross\s*amount|gross\s*total)\b/i;
const TAX_RE = /\b(cgst|sgst|igst|gst|vat|sales\s*tax|service\s*tax|tax)\b/i;
const DISCOUNT_RE = /\b(?:discount|disc|promo|coupon|offer|voucher|special\s*discount|off)\b/i;
const SERVICE_CHARGE_RE = /\b(?:service\s*charge|service\s*fee|s\.?c\.?)\b/i;
const TIP_RE = /\b(?:tip|gratuity)\b/i;
const ROUND_OFF_RE = /\b(?:round\s*off|roundoff|rounding)\b/i;

/**
 * Normalizes text lines, removing odd control chars and collapsing whitespace.
 */
export function normalizeLine(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width spaces
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans a candidate numeric/price string where OCR may have confused
 * digits with letters (e.g. O -> 0, l/I -> 1, S -> 5).
 */
export function cleanNumericString(raw: string): string {
  let cleaned = raw.trim();

  // If prefixed with currency symbols, strip them
  cleaned = cleaned.replace(/^[₹$€£\s]+/, '').replace(/^(?:rs\.?|inr|usd|eur|gbp)\.?\s*/i, '');

  // Handle trailing minus for negative amounts e.g. "50.00-"
  let isNegative = false;
  if (cleaned.startsWith('-') || cleaned.endsWith('-')) {
    isNegative = true;
    cleaned = cleaned.replace(/-/g, '');
  }

  // Handle comma as decimal separator if followed by 2 digits at end e.g. 350,00 -> 350.00
  if (/,\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/,(\d{2})$/, '.$1');
  } else {
    // Comma as thousands separator e.g. 1,250.00 -> 1250.00
    cleaned = cleaned.replace(/,/g, '');
  }

  // Fix common OCR mistakes inside numeric sequences
  // Only replace letters if the token mostly contains digits
  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (digitCount >= 1 && cleaned.length <= 10) {
    cleaned = cleaned
      .replace(/[oO]/g, '0')
      .replace(/[lI|]/g, '1')
      .replace(/[sS](?=\d|\.|$)/g, '5')
      .replace(/(?<=\d|\.)[sS]/g, '5');
  }

  // Ensure valid decimal format: keep only digits and first decimal dot
  const dotIndex = cleaned.lastIndexOf('.');
  if (dotIndex !== -1) {
    const intPart = cleaned.slice(0, dotIndex).replace(/\D/g, '');
    const fracPart = cleaned.slice(dotIndex + 1).replace(/\D/g, '').slice(0, 2);
    cleaned = `${intPart}.${fracPart}`;
  } else {
    cleaned = cleaned.replace(/\D/g, '');
  }

  return isNegative && cleaned ? `-${cleaned}` : cleaned;
}

/**
 * Detects currency from OCR text, defaulting to provided fallback.
 */
export function detectCurrency(text: string, fallback: string = 'INR'): string {
  if (/[₹]|(?:\b(?:rs\.?|inr)\b)/i.test(text)) return 'INR';
  if (/[$]|(?:\busd\b)/i.test(text)) return 'USD';
  if (/[€]|(?:\beur\b)/i.test(text)) return 'EUR';
  if (/[£]|(?:\bgbp\b)/i.test(text)) return 'GBP';
  return fallback.toUpperCase();
}

/**
 * Extracts and formats date into YYYY-MM-DD if recognizable.
 */
export function parseReceiptDate(text: string): string | undefined {
  const match = text.match(DATE_RE);
  if (!match) return undefined;

  const rawDate = match[0];
  try {
    // 1. Format: YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = rawDate.match(/^(\d{4})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])$/);
    if (isoMatch) {
      const year = isoMatch[1];
      const month = isoMatch[2].padStart(2, '0');
      const day = isoMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 2. Format: DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = rawDate.match(/^(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](\d{2,4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      let year = dmyMatch[3];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }

    // 3. Native parse fallback
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      // Validate reasonable year (e.g. 2000 to 2099)
      if (y >= 2000 && y <= 2099) {
        return `${y}-${m}-${d}`;
      }
    }
  } catch {
    // ignore
  }

  return undefined;
}

/**
 * Finds all candidate monetary amounts at the end or within a string.
 */
export function extractCandidateAmounts(line: string, currency: string): Array<{ raw: string; amountMinor: number; index: number }> {
  // Regex finding numbers with optional decimals and optional currency symbols
  const amountRegex = /(?:[₹$€£]|(?:rs\.?|inr|usd|eur|gbp)\.?\s*)?\s*(-?\d{1,6}(?:[.,]\d{2})|-?\d{1,6})\b/gi;
  const candidates: Array<{ raw: string; amountMinor: number; index: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = amountRegex.exec(line)) !== null) {
    // If preceded by colon e.g. 21:15, it's a timestamp, not a monetary amount
    if (m.index > 0 && line[m.index - 1] === ':') {
      continue;
    }

    const rawMatch = m[0];
    const cleaned = cleanNumericString(rawMatch);
    if (!cleaned) continue;

    const numVal = parseFloat(cleaned);
    // Ignore unreasonable amounts like 0 (unless explicit) or telephone numbers
    if (isNaN(numVal) || Math.abs(numVal) > 10000000) continue;

    // Reject standalone 4-digit numbers that match current or recent years (e.g. 2024, 2025, 2026)
    if (!cleaned.includes('.') && /^(?:19|20)\d{2}$/.test(cleaned) && m.index < line.length - 8) {
      continue;
    }

    try {
      const minor = parseMoney(cleaned, currency);
      candidates.push({
        raw: rawMatch,
        amountMinor: minor,
        index: m.index,
      });
    } catch {
      // ignore parse errors
    }
  }

  return candidates;
}

/**
 * Determines whether a line is purely metadata or informational.
 */
function isMetadataLine(line: string): boolean {
  if (SEPARATOR_RE.test(line)) return true;
  if (PHONE_RE.test(line)) return true;
  if (GSTIN_RE.test(line)) return true;
  if (INVOICE_NO_RE.test(line)) return true;
  if (PAYMENT_METHOD_RE.test(line)) return true;
  if (/\b(?:welcome|visit\s*again|thank\s*you|customer\s*copy|merchant\s*copy|duplicate)\b/i.test(line)) return true;
  if (/\b(?:server|cashier|waiter|steward|counter|station|pax|guests?)\b[:.\s]*\w+/i.test(line)) return true;
  if (/\b(?:wifi|password|fssai|tin|cin|pan)\b/i.test(line)) return true;
  if (/^\s*(?:date|time)\s*[:.\s]/i.test(line)) return true;
  if (DATE_RE.test(line) && (TIME_RE.test(line) || /\b(?:date|time|inv|bill)\b/i.test(line))) return true;
  return false;
}

/**
 * Checks if line is a header row (e.g. "Item Qty Price Amount").
 */
function isHeaderRow(line: string): boolean {
  return /\b(?:item|particulars|description|qty|quantity|rate|price|unit\s*price|amount|mrp)\b/i.test(line) &&
    /\b(?:qty|rate|amount|price)\b/i.test(line);
}

/**
 * Attempts to parse an item row from a line.
 * Handles formats like:
 * - Pizza 350.00
 * - 2 Coffee 200.00
 * - Coffee x 2 200.00
 * - Coffee 2 @ 100.00 200.00
 * - Butter Naan 4 40.00 160.00
 */
export function parseItemCandidate(
  line: string,
  currency: string,
  confidence: number = 80
): ReceiptItem | null {
  const norm = normalizeLine(line);
  if (!norm || norm.length < 3) return null;
  if (isMetadataLine(norm) || isHeaderRow(norm)) return null;

  // Total / charge words should not be parsed as items here
  if (
    GRAND_TOTAL_RE.test(norm) ||
    TOTAL_RE.test(norm) ||
    SUBTOTAL_RE.test(norm) ||
    TAX_RE.test(norm) ||
    DISCOUNT_RE.test(norm) ||
    SERVICE_CHARGE_RE.test(norm) ||
    TIP_RE.test(norm) ||
    ROUND_OFF_RE.test(norm)
  ) {
    return null;
  }

  // Find candidate amounts
  const candidates = extractCandidateAmounts(norm, currency);
  if (candidates.length === 0) return null;

  // The last candidate amount is almost always the line total
  const lastCandidate = candidates[candidates.length - 1];
  const lineTotalMinor = lastCandidate.amountMinor;

  if (lineTotalMinor <= 0) return null;

  // Text before the last candidate amount
  let textBefore = norm.slice(0, lastCandidate.index).trim();
  if (!textBefore) return null;

  let quantity = 1;
  let unitPriceMinor: number | null = null;
  let itemName = textBefore;

  // Pattern 1: Leading quantity: e.g. "2 Coffee" or "2x Coffee" or "2 x Coffee"
  const leadingQtyMatch = itemName.match(/^(\d{1,2})\s*(?:x|\*|\@)?\s+(.+)$/i);
  if (leadingQtyMatch) {
    const q = parseInt(leadingQtyMatch[1], 10);
    if (q > 0 && q <= 99) {
      quantity = q;
      itemName = leadingQtyMatch[2].trim();
    }
  }

  // Pattern 2: Trailing quantity with 'x' or '@': e.g. "Coffee x 2" or "Coffee 2x" or "Coffee @ 100.00"
  const trailingQtyMatch = itemName.match(/^(.+?)\s+(?:x|\*)\s*(\d{1,2})$/i);
  if (trailingQtyMatch) {
    const q = parseInt(trailingQtyMatch[2], 10);
    if (q > 0 && q <= 99) {
      quantity = q;
      itemName = trailingQtyMatch[1].trim();
    }
  }

  // Pattern 3: Explicit quantity and unit price: e.g. "Coffee 2 @ 100.00" or "Naan 4 40.00"
  const qtyAndRateMatch = itemName.match(/^(.+?)\s+(\d{1,2})\s+(?:@\s*)?([₹$€£]?\s*\d+(?:[.,]\d{2})?)$/i);
  if (qtyAndRateMatch) {
    const q = parseInt(qtyAndRateMatch[2], 10);
    const unitRateStr = cleanNumericString(qtyAndRateMatch[3]);
    if (q > 0 && q <= 99 && unitRateStr) {
      try {
        quantity = q;
        unitPriceMinor = parseMoney(unitRateStr, currency);
        itemName = qtyAndRateMatch[1].trim();
      } catch {
        // ignore
      }
    }
  }

  // If quantity > 1 and unitPrice is not set, compute unit price
  if (quantity > 1 && unitPriceMinor === null) {
    unitPriceMinor = Math.round(lineTotalMinor / quantity);
  } else if (quantity === 1) {
    unitPriceMinor = lineTotalMinor;
  }

  // Clean item name of stray punctuation
  itemName = itemName
    .replace(/^[-•*#\s]+/, '')
    .replace(/[-•*#\s.]+$/, '')
    .trim();

  // If item name is too short or purely numeric, it's not a valid item
  if (itemName.length < 2 || /^\d+$/.test(itemName)) return null;

  return {
    id: generateId(),
    name: itemName,
    quantity,
    unitPriceMinor,
    lineTotalMinor,
    rawText: norm,
    confidence,
    isUncertain: confidence < 60,
  };
}

/**
 * Parses raw OCR data into a structured receipt breakdown.
 */
export function parseReceipt(
  rawData: ReceiptRawData,
  fallbackCurrency: string = 'INR'
): ParsedReceipt {
  const fullText = rawData.text || '';
  const lines = rawData.lines || [];
  const detectedCurrency = detectCurrency(fullText, fallbackCurrency);

  let merchantName: string | undefined;
  let receiptDate: string | undefined;
  let detectedSubtotalMinor: number | undefined;
  let detectedGrandTotalMinor: number | undefined;
  let discountMinor = 0;
  let tipMinor = 0;
  let serviceChargeMinor = 0;
  const taxes: ReceiptTaxItem[] = [];

  const items: ReceiptItem[] = [];
  const unassignedLines: string[] = [];

  // 1. Detect Receipt Date from anywhere in text
  receiptDate = parseReceiptDate(fullText);

  // 2. Scan lines
  const parsedLineIndices = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const norm = normalizeLine(rawLine.text);
    if (!norm) continue;

    // Check for Grand Total line
    if (GRAND_TOTAL_RE.test(norm)) {
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        detectedGrandTotalMinor = amounts[amounts.length - 1].amountMinor;
        parsedLineIndices.add(i);
        continue;
      }
    }

    // Check for Subtotal line
    if (SUBTOTAL_RE.test(norm)) {
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        detectedSubtotalMinor = amounts[amounts.length - 1].amountMinor;
        parsedLineIndices.add(i);
        continue;
      }
    }

    // Check for Tax lines (CGST, SGST, IGST, GST, VAT)
    if (TAX_RE.test(norm)) {
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        const amt = amounts[amounts.length - 1].amountMinor;
        // Check for rate percentage e.g. "9%" or "18%"
        const rateMatch = norm.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
        const ratePercent = rateMatch ? parseFloat(rateMatch[1]) : undefined;

        // Clean tax label e.g. "CGST 9%" or "SGST" or "Tax"
        let taxName = norm.slice(0, amounts[amounts.length - 1].index).trim();
        if (!taxName) taxName = 'Tax';

        taxes.push({
          id: generateId(),
          name: taxName,
          ratePercent,
          amountMinor: amt,
        });
        parsedLineIndices.add(i);
        continue;
      }
    }

    // Check for Discount lines
    if (DISCOUNT_RE.test(norm)) {
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        discountMinor += Math.abs(amounts[amounts.length - 1].amountMinor);
        parsedLineIndices.add(i);
        continue;
      }
    }

    // Check for Service Charge lines
    if (SERVICE_CHARGE_RE.test(norm)) {
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        serviceChargeMinor += amounts[amounts.length - 1].amountMinor;
        parsedLineIndices.add(i);
        continue;
      }
    }

    // Check for Tip lines
    if (TIP_RE.test(norm)) {
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        tipMinor += amounts[amounts.length - 1].amountMinor;
        parsedLineIndices.add(i);
        continue;
      }
    }

    // Check for generic "Total" if Grand Total was not yet found
    if (TOTAL_RE.test(norm) && !detectedGrandTotalMinor && !SUBTOTAL_RE.test(norm)) {
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        detectedGrandTotalMinor = amounts[amounts.length - 1].amountMinor;
        parsedLineIndices.add(i);
        continue;
      }
    }

    // Try item candidate
    const item = parseItemCandidate(norm, detectedCurrency, rawLine.confidence);
    if (item) {
      items.push(item);
      parsedLineIndices.add(i);
      continue;
    }

    // If line has amounts but wasn't classified, keep as unassigned candidate
    if (!isMetadataLine(norm) && !isHeaderRow(norm) && extractCandidateAmounts(norm, detectedCurrency).length > 0) {
      unassignedLines.push(norm);
    }
  }

  // 3. Extract Merchant Name from the top 5 non-metadata lines
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const text = normalizeLine(lines[i].text);
    if (!text || text.length < 3) continue;
    if (isMetadataLine(text) || isHeaderRow(text)) continue;
    if (extractCandidateAmounts(text, detectedCurrency).length > 0) continue;
    if (DATE_RE.test(text) || TIME_RE.test(text)) continue;

    // Filter out common receipt header labels
    if (/^(?:tax\s*invoice|receipt|cash\s*bill|bill\s*of\s*supply|retail\s*invoice|welcome)$/i.test(text)) {
      continue;
    }

    merchantName = text;
    break;
  }

  // 4. Calculate Subtotals & Reconcile
  const itemSubtotalMinor = items.reduce((acc, it) => acc + it.lineTotalMinor, 0);
  const totalTaxMinor = taxes.reduce((acc, t) => acc + t.amountMinor, 0);

  const calculatedTotal = Math.max(
    0,
    itemSubtotalMinor + totalTaxMinor + serviceChargeMinor + tipMinor - discountMinor
  );

  let totalMinor = detectedGrandTotalMinor ?? (itemSubtotalMinor > 0 ? calculatedTotal : 0);
  let isTotalConfirmed = false;

  if (detectedGrandTotalMinor !== undefined) {
    // If detected total matches calculated within minor tolerance or exactly
    if (detectedGrandTotalMinor === calculatedTotal || (items.length > 0 && Math.abs(detectedGrandTotalMinor - calculatedTotal) <= 2)) {
      isTotalConfirmed = true;
    }
  } else if (items.length > 0 && calculatedTotal > 0) {
    totalMinor = calculatedTotal;
    isTotalConfirmed = false; // user should confirm calculated total
  }

  return {
    merchantName,
    date: receiptDate,
    currency: detectedCurrency,
    itemSubtotalMinor,
    taxes,
    taxMinor: totalTaxMinor,
    discountMinor,
    tipMinor,
    serviceChargeMinor,
    totalMinor,
    items,
    unassignedLines,
    rawConfidence: rawData.confidence || 0,
    isTotalConfirmed,
  };
}
