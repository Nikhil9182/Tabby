export interface ReceiptRawWord {
  text: string;
  confidence: number;
}

export interface ReceiptRawLine {
  text: string;
  confidence: number;
  words?: ReceiptRawWord[];
  lineNumber?: number;
}

export interface ReceiptRawData {
  text: string;
  lines: ReceiptRawLine[];
  confidence: number;
}

export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceMinor: number | null;
  lineTotalMinor: number;
  rawText?: string;
  confidence?: number;
  isUncertain?: boolean;
  warning?: string;
}

export interface ReceiptTaxItem {
  id: string;
  name: string;
  ratePercent?: number;
  amountMinor: number;
}

export interface ParsedReceipt {
  merchantName?: string;
  date?: string; // YYYY-MM-DD format if recognizable
  currency: string;
  itemSubtotalMinor: number;
  taxes: ReceiptTaxItem[];
  taxMinor: number;
  discountMinor: number;
  tipMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
  items: ReceiptItem[];
  unassignedLines: string[];
  rawConfidence: number;
  isTotalConfirmed: boolean;
}

export type ReceiptSplitMode = 'equal' | 'items';

export interface ParticipantShareBreakdown {
  userId: string;
  assignedItemsSubtotalMinor: number;
  taxShareMinor: number;
  discountShareMinor: number;
  tipShareMinor: number;
  serviceChargeShareMinor: number;
  discrepancyAdjustmentMinor: number;
  totalShareMinor: number;
  assignedItemIds: string[];
}

export interface ReceiptSplitResult {
  mode: ReceiptSplitMode;
  totalMinor: number;
  shares: ParticipantShareBreakdown[];
  unassignedItemIds: string[];
  isBalanced: boolean;
  discrepancyMinor: number;
  error?: string;
}

export interface OCRProgress {
  status: 'loading' | 'recognizing' | 'completed' | 'error';
  progress: number; // 0 to 1
  message: string;
}
