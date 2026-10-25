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
const PHONE_RE = /\b(?:ph(?:\.?\s*no\.?)?|phone|tel|mobile|call|contact|fax)[:.\s]*[+]?\d[\d\s,-]{6,}/i;
const GSTIN_RE = /\b(?:gstin|gst\s*no|gst|tin|vat\s*tin|pan|fssai)[:.\s]*[0-9a-z]{8,}/i;
const INVOICE_NO_RE = /\b(?:inv(?:oice)?|bill|receipt|order|token|check|chk|creck|table|pos)(?:\s*(?:no\.?|number|id|#))?[:.\s]*[a-z0-9\-_/]+/i;
const COMPANY_ENTITY_RE = /\b(?:pvt\.?\s*ltd\.?|private\s*limited|ltd\.?|limited|llp|inc\.?|corp\.?|co\.?)\b/i;
const ADDRESS_RE = /\b(?:sector|road|street|nagar|marg|lane|block|floor|bldg|building|complex|plaza|colony|enclave|opp|opposite|near|behind|pin|pincode|post)\b/i;
const PINCODE_RE = /\b[a-z\s]+[-]\s*\d{6}\b/i;
const TABLE_PERSON_RE = /\b(?:table|person|pax|server|waiter|steward|station|counter)\b[:.\s#]*\w+/i;
const NAME_FIELD_RE = /^\s*name\s*[:]/i;
const TOTAL_QTY_RE = /\b(?:total\s*qty|tot\s*qty|qty\s*total)\b/i;

const DATE_RE = /\b(?:\d{1,2}[-/.](?:[0-9]{1,2}|[a-z]{3})[-/.]\d{2,4}|\d{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/i;
const PAYMENT_METHOD_RE = /\b(?:cash\s*tendered|change\s*due|paid\s*via|upi|paytm|gpay|phonepe|visa|mastercard|amex|card\s*ending|debit\s*card|credit\s*card|net\s*banking)\b/i;

// Totals and charge patterns
const GRAND_TOTAL_RE = /\b(?:grand\s*total|net\s*payable|net\s*amount|amount\s*due|bill\s*total|final\s*total|total\s*payable|total\s*due)\b/i;
const TOTAL_RE = /\b(?:total|amount|tot)\b/i;
const SUBTOTAL_RE = /\b(?:sub\s*total|subtotal|sub-total|s[u3b]b?\s*total|item\s*total|food\s*total|gross\s*amount|gross\s*total)\b/i;
const TAX_RE = /\b(cgst|sgst|igst|gst|vat|sales\s*tax|service\s*tax|s\.?\s*tax|tax)\b/i;
const DISCOUNT_RE = /\b(?:discount|disc|promo|coupon|offer|voucher|special\s*discount|comp|birthday\s*comp)\b/i;
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

  // Handle comma as decimal separator if followed by 1 or 2 digits at end e.g. 350,00 -> 350.00
  // ONLY if there are no dots elsewhere in the number
  if (/,\d{1,2}$/.test(cleaned) && !cleaned.includes('.')) {
    cleaned = cleaned.replace(/,(\d{1,2})$/, '.$1');
  } else {
    // Comma as thousands separator e.g. 1,035.00 -> 1035.00
    cleaned = cleaned.replace(/,/g, '');
  }

  // Fix common OCR mistakes inside numeric sequences
  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (digitCount >= 1 && cleaned.length <= 12) {
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
  if (/\b(?:gstin|cgst|sgst|igst|fssai)\b/i.test(text)) return 'INR';
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

    // 2. Format: DD-MM-YYYY or DD/MM/YYYY or DD-Mon-YY
    const dmyMatch = rawDate.match(/^(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2]|[a-z]{3})[-/.](\d{2,4})$/i);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const rawMonth = dmyMatch[2];
      let monthStr = '';
      if (/^\d+$/.test(rawMonth)) {
        monthStr = rawMonth.padStart(2, '0');
      } else {
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const mIdx = monthNames.indexOf(rawMonth.toLowerCase());
        if (mIdx !== -1) {
          monthStr = String(mIdx + 1).padStart(2, '0');
        }
      }

      let year = dmyMatch[3];
      if (year.length === 2) year = `20${year}`;

      if (monthStr) {
        return `${year}-${monthStr}-${day}`;
      }
    }

    // 3. Format: MM/DD/YYYY
    const mdyMatch = rawDate.match(/^(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](\d{2,4})$/);
    if (mdyMatch) {
      const month = mdyMatch[1].padStart(2, '0');
      const day = mdyMatch[2].padStart(2, '0');
      let year = mdyMatch[3];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }

    // 4. Native parse fallback
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
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
  // Matches monetary amounts with optional thousands separator: e.g. 1,035.00, 1139.00, 18.00, 3.0, -10.00
  const amountRegex = /(?:[₹$€£]|(?:rs\.?|inr|usd|eur|gbp)\.?\s*)?\s*(-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?|-?\d+,\d{2})\b/gi;
  const candidates: Array<{ raw: string; amountMinor: number; index: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = amountRegex.exec(line)) !== null) {
    // If preceded by digit + colon e.g. 21:15 or 7:05:53, it's a timestamp, not a monetary amount
    if (m.index > 0 && line[m.index - 1] === ':' && /\d:$/.test(line.slice(0, m.index))) {
      continue;
    }

    const rawMatch = m[0];
    const cleaned = cleanNumericString(rawMatch);
    if (!cleaned) continue;

    const numVal = parseFloat(cleaned);
    if (isNaN(numVal) || Math.abs(numVal) > 100000000) continue;

    // Reject standalone 4-digit numbers that match recent years e.g. 2023, 2024, 2025, 2026
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
export function isMetadataLine(line: string): boolean {
  if (SEPARATOR_RE.test(line)) return true;
  if (PHONE_RE.test(line)) return true;
  if (GSTIN_RE.test(line)) return true;
  if (INVOICE_NO_RE.test(line)) return true;
  if (COMPANY_ENTITY_RE.test(line)) return true;
  if (ADDRESS_RE.test(line) && /\d/.test(line)) return true;
  if (PINCODE_RE.test(line)) return true;
  if (TABLE_PERSON_RE.test(line)) return true;
  if (NAME_FIELD_RE.test(line)) return true;
  if (TOTAL_QTY_RE.test(line)) return true;
  if (PAYMENT_METHOD_RE.test(line)) return true;
  if (/\b(?:welcome|visit\s*again|thank\s*you|thanks\s*for\s*visit|customer\s*copy|merchant\s*copy|duplicate)\b/i.test(line)) return true;
  if (/\b(?:wifi|password|fssai|tin|cin|pan)\b/i.test(line)) return true;
  if (/^\s*(?:date|time)\s*[:.\s]/i.test(line)) return true;
  if (DATE_RE.test(line) && (TIME_RE.test(line) || /\b(?:date|time|inv|bill)\b/i.test(line))) return true;
  return false;
}

/**
 * Checks if line is a header row (e.g. "Item Qty Rate Total").
 */
export function isHeaderRow(line: string): boolean {
  return /\b(?:item|particulars|description)\b/i.test(line) &&
    /\b(?:qty|rate|amount|price|total)\b/i.test(line);
}

/**
 * Attempts to parse an item row from a line.
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

  // Pattern 1: Leading quantity: e.g. "1 FRIZD CHICKEN TIT" or "2 Coffee" or "2x Coffee"
  const leadingQtyMatch = itemName.match(/^(\d{1,2})\s*(?:x|\*|\@)?\s+(.+)$/i);
  if (leadingQtyMatch) {
    const q = parseInt(leadingQtyMatch[1], 10);
    if (q > 0 && q <= 99) {
      quantity = q;
      itemName = leadingQtyMatch[2].trim();
      // Remove any residual duplicate leading digits (e.g. OCR artifacts like "1 1 CARBONARA")
      itemName = itemName.replace(/^\d{1,2}\s+/, '').trim();
    }
  }

  // Pattern 2: Explicit quantity and rate: e.g. "Tandoori chicken 1 295.00" or "Naan 4 40.00"
  const qtyAndRateMatch = itemName.match(/^(.+?)\s+(\d{1,2})\s+(?:@\s*)?([₹$€£]?\s*\d+(?:[.,]\d{1,2})?)$/i);
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

  // Pattern 3: Trailing quantity with 'x' or '@': e.g. "Coffee x 2" or "Coffee 2x"
  const trailingQtyMatch = itemName.match(/^(.+?)\s+(?:x|\*)\s*(\d{1,2})$/i);
  if (trailingQtyMatch) {
    const q = parseInt(trailingQtyMatch[2], 10);
    if (q > 0 && q <= 99) {
      quantity = q;
      itemName = trailingQtyMatch[1].trim();
    }
  }

  // If quantity > 1 and unitPrice is not set, compute unit price
  if (quantity > 1 && unitPriceMinor === null) {
    unitPriceMinor = Math.round(lineTotalMinor / quantity);
  } else if (quantity === 1 && unitPriceMinor === null) {
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
  // Fall back to splitting rawText by newlines if lines is not populated
  const rawLines = rawData.lines && rawData.lines.length > 0
    ? rawData.lines
    : fullText.split('\n').map((t, idx) => ({ text: t.trim(), confidence: rawData.confidence || 80, lineNumber: idx + 1 }));

  const lines = rawLines.filter((l) => l.text.length > 0);
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

  // 2. Scan lines with multi-line item tracking
  let pendingItemPrefix: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const norm = normalizeLine(rawLine.text);
    if (!norm) continue;

    // Check for Grand Total line
    if (GRAND_TOTAL_RE.test(norm)) {
      pendingItemPrefix = null;
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        detectedGrandTotalMinor = amounts[amounts.length - 1].amountMinor;
        continue;
      }
    }

    // Check for Subtotal line
    if (SUBTOTAL_RE.test(norm)) {
      pendingItemPrefix = null;
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        detectedSubtotalMinor = amounts[amounts.length - 1].amountMinor;
        continue;
      }
    }

    // Check for Tax lines (CGST, SGST, IGST, GST, VAT, S.Tax)
    if (TAX_RE.test(norm)) {
      pendingItemPrefix = null;
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        const amt = amounts[amounts.length - 1].amountMinor;
        const rateMatch = norm.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
        const ratePercent = rateMatch ? parseFloat(rateMatch[1]) : undefined;

        let taxName = norm.slice(0, amounts[amounts.length - 1].index).trim();
        if (!taxName) taxName = 'Tax';

        taxes.push({
          id: generateId(),
          name: taxName,
          ratePercent,
          amountMinor: amt,
        });
        continue;
      }
    }

    // Check for Discount lines
    if (DISCOUNT_RE.test(norm)) {
      pendingItemPrefix = null;
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        discountMinor += Math.abs(amounts[amounts.length - 1].amountMinor);
        continue;
      }
    }

    // Check for Service Charge lines
    if (SERVICE_CHARGE_RE.test(norm)) {
      pendingItemPrefix = null;
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        serviceChargeMinor += amounts[amounts.length - 1].amountMinor;
        continue;
      }
    }

    // Check for Tip lines
    if (TIP_RE.test(norm)) {
      pendingItemPrefix = null;
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        tipMinor += amounts[amounts.length - 1].amountMinor;
        continue;
      }
    }

    // Check for generic "Total" if Grand Total was not yet found
    if (TOTAL_RE.test(norm) && !detectedGrandTotalMinor && !SUBTOTAL_RE.test(norm) && !TOTAL_QTY_RE.test(norm)) {
      pendingItemPrefix = null;
      const amounts = extractCandidateAmounts(norm, detectedCurrency);
      if (amounts.length > 0) {
        detectedGrandTotalMinor = amounts[amounts.length - 1].amountMinor;
        continue;
      }
    }

    // Try item candidate
    const item = parseItemCandidate(norm, detectedCurrency, rawLine.confidence);
    if (item) {
      if (pendingItemPrefix) {
        item.name = `${pendingItemPrefix} ${item.name}`;
        pendingItemPrefix = null;
      }
      items.push(item);
      continue;
    }

    // If this line has NO candidate amounts, is not metadata, and not header row,
    // it could be a multi-line item description prefix (e.g. "HYDERABADI MURG" before "BIRYANI 1 375.00")
    if (
      !isMetadataLine(norm) &&
      !isHeaderRow(norm) &&
      extractCandidateAmounts(norm, detectedCurrency).length === 0 &&
      norm.length >= 3 &&
      /[a-zA-Z]/.test(norm)
    ) {
      pendingItemPrefix = norm;
      continue;
    }

    // Reset pending prefix
    pendingItemPrefix = null;

    // If line has amounts but wasn't classified, keep as unassigned candidate
    if (!isMetadataLine(norm) && !isHeaderRow(norm) && extractCandidateAmounts(norm, detectedCurrency).length > 0) {
      unassignedLines.push(norm);
    }
  }

  // 3. Extract Merchant Name from the top non-metadata lines
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const text = normalizeLine(lines[i].text);
    if (!text || text.length < 3) continue;
    if (isMetadataLine(text) || isHeaderRow(text)) continue;
    if (extractCandidateAmounts(text, detectedCurrency).length > 0) continue;
    if (DATE_RE.test(text) || TIME_RE.test(text)) continue;

    // Filter out common receipt header labels and customer name fields
    if (/^(?:tax\s*invoice|receipt|cash\s*bill|bill\s*of\s*supply|retail\s*invoice|welcome)$/i.test(text)) {
      continue;
    }
    if (/^\s*(?:name|customer|guest|table|server|waiter|check|creck|order)\b/i.test(text)) {
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
    // If detected total is less than item subtotal (and no discount exists),
    // the OCR almost certainly captured a subtotal, partial amount, or noise instead of the real total.
    // In that case, default to calculatedTotal from items to avoid undercounting expenses.
    if (itemSubtotalMinor > 0 && detectedGrandTotalMinor < itemSubtotalMinor && discountMinor === 0) {
      totalMinor = calculatedTotal;
      isTotalConfirmed = false;
    } else {
      totalMinor = detectedGrandTotalMinor;
      isTotalConfirmed = true;
    }
  } else if (items.length > 0 && calculatedTotal > 0) {
    totalMinor = calculatedTotal;
    isTotalConfirmed = false;
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
