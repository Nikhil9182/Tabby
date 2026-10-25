import { parseMoney } from '@/domain/money/money';

export interface ParsedExpenseItem {
  id?: string;
  name: string;
  quantity: number;
  lineTotalMinor: number;
  unitPriceMinor?: number;
  assignedUserIds?: string[];
}

export interface ParsedExpenseReceiptData {
  hasItems: boolean;
  items: ParsedExpenseItem[];
  subtotalMinor?: number;
  taxMinor?: number;
  discountMinor?: number;
  tipMinor?: number;
  serviceChargeMinor?: number;
  totalMinor?: number;
  currency?: string;
  userNotes?: string;
}

const EMBEDDED_TAG_REGEX = /<!--tabby_items:([\s\S]*?)-->/;

/**
 * Extracts structured receipt items, taxes, discounts, and tips from expense notes.
 * Supports:
 * 1. Embedded JSON metadata (<!--tabby_items:...-->)
 * 2. Legacy string format (Items: Pizza: ₹350.00, 2x Coke: ₹100.00 | Tax: ₹50.00)
 * 3. Plain user notes preservation
 */
export function extractReceiptItems(
  notes?: string | null,
  fallbackCurrency = 'INR'
): ParsedExpenseReceiptData {
  const emptyResult: ParsedExpenseReceiptData = {
    hasItems: false,
    items: [],
    userNotes: notes || undefined,
  };

  if (!notes || typeof notes !== 'string') {
    return emptyResult;
  }

  const trimmed = notes.trim();

  // 1. Check for embedded structured JSON tag
  const embeddedMatch = trimmed.match(EMBEDDED_TAG_REGEX);
  if (embeddedMatch) {
    try {
      const parsed = JSON.parse(embeddedMatch[1]);
      const userNotes = trimmed
        .replace(EMBEDDED_TAG_REGEX, '')
        .replace(/(?:^|\n+)Items:\s*[\s\S]*$/i, '')
        .trim();

      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        return {
          hasItems: true,
          items: parsed.items,
          subtotalMinor: parsed.subtotalMinor,
          taxMinor: parsed.taxMinor || 0,
          discountMinor: parsed.discountMinor || 0,
          tipMinor: parsed.tipMinor || 0,
          serviceChargeMinor: parsed.serviceChargeMinor || 0,
          totalMinor: parsed.totalMinor,
          currency: parsed.currency || fallbackCurrency,
          userNotes: userNotes || undefined,
        };
      }
    } catch {
      // Fallback to text parsing if JSON is corrupt
    }
  }

  // 2. Check for legacy text format: "Items: ... | Tax: ... | Discount: ... | Tip: ..."
  const itemsPrefixMatch = trimmed.match(/(?:^|\n|\s)Items:\s*/i);
  if (!itemsPrefixMatch || itemsPrefixMatch.index === undefined) {
    return emptyResult;
  }

  const beforeItems = trimmed.slice(0, itemsPrefixMatch.index).trim();
  const afterItemsPrefix = trimmed.slice(itemsPrefixMatch.index + itemsPrefixMatch[0].length);

  // Split metadata sections by " | " followed by known keywords (Tax:, Discount:, Tip:, Subtotal:)
  const parts = afterItemsPrefix.split(/\s+\|\s+(?=(?:Tax|Discount|Tip|Service Charge|Subtotal):)/i);
  const itemsText = parts[0]?.trim();

  if (!itemsText) {
    return emptyResult;
  }

  // Parse items
  // Pattern matches: [optional quantity e.g. "2x "] <Item Name>: <Price e.g. "₹309.75">
  const itemRegex = /(?:^|,\s*)(?:(\d+)\s*x\s+)?(.+?):\s*([^\d\s]*\s*[\d,]+(?:\.\d+)?)(?=$|,\s*(?:\d+\s*x\s+)?[^:]+:)/gi;

  const items: ParsedExpenseItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(itemsText)) !== null) {
    const rawQty = match[1] ? parseInt(match[1], 10) : 1;
    const quantity = isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty;
    // Clean trailing punctuation or stray pipe characters from OCR artifacts
    const name = match[2].trim().replace(/\s*\|\s*$/, '').trim();
    const priceStr = match[3].trim();
    const lineTotalMinor = parseMoney(priceStr, fallbackCurrency);

    if (name && lineTotalMinor > 0) {
      const unitPriceMinor = quantity > 1 ? Math.round(lineTotalMinor / quantity) : lineTotalMinor;
      items.push({
        name,
        quantity,
        lineTotalMinor,
        unitPriceMinor,
      });
    }
  }

  if (items.length === 0) {
    return emptyResult;
  }

  // Parse metadata from subsequent parts (Tax, Discount, Tip, Subtotal)
  let taxMinor = 0;
  let discountMinor = 0;
  let tipMinor = 0;
  let serviceChargeMinor = 0;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;

    const label = part.slice(0, colonIdx).trim().toLowerCase();
    const valueStr = part.slice(colonIdx + 1).trim();
    const valMinor = parseMoney(valueStr, fallbackCurrency);

    if (label.includes('tax')) {
      taxMinor += valMinor;
    } else if (label.includes('discount')) {
      discountMinor += valMinor;
    } else if (label.includes('tip')) {
      tipMinor += valMinor;
    } else if (label.includes('service')) {
      serviceChargeMinor += valMinor;
    }
  }

  const subtotalMinor = items.reduce((sum, it) => sum + it.lineTotalMinor, 0);
  const totalMinor = subtotalMinor + taxMinor + tipMinor + serviceChargeMinor - discountMinor;

  return {
    hasItems: true,
    items,
    subtotalMinor,
    taxMinor,
    discountMinor,
    tipMinor,
    serviceChargeMinor,
    totalMinor,
    currency: fallbackCurrency,
    userNotes: beforeItems || undefined,
  };
}

/**
 * Builds structured expense notes embedding JSON metadata along with a clean textual fallback.
 */
export function formatReceiptNotes(data: {
  items: ParsedExpenseItem[];
  taxMinor?: number;
  discountMinor?: number;
  tipMinor?: number;
  serviceChargeMinor?: number;
  subtotalMinor?: number;
  totalMinor?: number;
  currency: string;
  userNotes?: string;
}): string {
  const {
    items,
    taxMinor = 0,
    discountMinor = 0,
    tipMinor = 0,
    serviceChargeMinor = 0,
    currency,
    userNotes,
  } = data;

  const subtotalMinor =
    data.subtotalMinor ?? items.reduce((sum, it) => sum + it.lineTotalMinor, 0);
  const totalMinor =
    data.totalMinor ?? subtotalMinor + taxMinor + tipMinor + serviceChargeMinor - discountMinor;

  const structuredPayload = {
    items,
    subtotalMinor,
    taxMinor,
    discountMinor,
    tipMinor,
    serviceChargeMinor,
    totalMinor,
    currency,
  };

  const embeddedTag = `<!--tabby_items:${JSON.stringify(structuredPayload)}-->`;

  const itemLines = items
    .map((it) => `${it.quantity > 1 ? `${it.quantity}x ` : ''}${it.name}: ${it.lineTotalMinor / 100}`)
    .join(', ');

  const summaryParts = [
    itemLines ? `Items: ${itemLines}` : '',
    taxMinor > 0 ? `Tax: ${taxMinor / 100}` : '',
    discountMinor > 0 ? `Discount: ${discountMinor / 100}` : '',
    tipMinor > 0 ? `Tip: ${tipMinor / 100}` : '',
  ].filter(Boolean).join(' | ');

  const parts = [
    embeddedTag,
    userNotes ? userNotes.trim() : '',
    summaryParts,
  ].filter(Boolean);

  return parts.join('\n\n');
}
