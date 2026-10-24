import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  AlertCircle,
  HelpCircle,
  Receipt,
  Sparkles,
  Info,
  DollarSign,
  Calendar,
  Store,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CurrencySelector } from '@/components/currency/currency-selector';
import { generateId } from '@/lib/id';
import { toMajorUnits, toMinorUnits, formatMoney, parseMoney } from '@/domain/money/money';
import type { ParsedReceipt, ReceiptItem, ReceiptTaxItem } from '@/domain/receipts/types';

interface ReceiptReviewEditorProps {
  receipt: ParsedReceipt;
  onChange: (updated: ParsedReceipt) => void;
  onProceed: () => void;
  onBack: () => void;
}

export const ReceiptReviewEditor: React.FC<ReceiptReviewEditorProps> = ({
  receipt,
  onChange,
  onProceed,
  onBack,
}) => {
  const currency = receipt.currency;

  // Local state for adding a new item
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);

  // Computed subtotal of all items
  const calculatedItemsSubtotalMinor = useMemo(() => {
    return receipt.items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  }, [receipt.items]);

  // Expected bill total based on items and extra charges
  const calculatedExpectedTotalMinor = useMemo(() => {
    const itemSub = calculatedItemsSubtotalMinor;
    const tax = receipt.taxMinor || 0;
    const sc = receipt.serviceChargeMinor || 0;
    const tip = receipt.tipMinor || 0;
    const disc = receipt.discountMinor || 0;
    return Math.max(0, itemSub + tax + sc + tip - disc);
  }, [calculatedItemsSubtotalMinor, receipt.taxMinor, receipt.serviceChargeMinor, receipt.tipMinor, receipt.discountMinor]);

  const totalDiscrepancyMinor = receipt.totalMinor - calculatedExpectedTotalMinor;
  const hasDiscrepancy = Math.abs(totalDiscrepancyMinor) > 0;

  // Handlers for modifying receipt summary fields
  const handleMerchantChange = (name: string) => {
    onChange({ ...receipt, merchantName: name });
  };

  const handleDateChange = (date: string) => {
    onChange({ ...receipt, date });
  };

  const handleCurrencyChange = (newCurr: string) => {
    onChange({ ...receipt, currency: newCurr });
  };

  const handleTaxChange = (taxAmountMajorStr: string) => {
    const amtMinor = parseMoney(taxAmountMajorStr || '0', currency);
    onChange({ ...receipt, taxMinor: amtMinor });
  };

  const handleDiscountChange = (discAmountMajorStr: string) => {
    const amtMinor = parseMoney(discAmountMajorStr || '0', currency);
    onChange({ ...receipt, discountMinor: amtMinor });
  };

  const handleServiceChargeChange = (scAmountMajorStr: string) => {
    const amtMinor = parseMoney(scAmountMajorStr || '0', currency);
    onChange({ ...receipt, serviceChargeMinor: amtMinor });
  };

  const handleTipChange = (tipAmountMajorStr: string) => {
    const amtMinor = parseMoney(tipAmountMajorStr || '0', currency);
    onChange({ ...receipt, tipMinor: amtMinor });
  };

  const handleTotalChange = (totalMajorStr: string) => {
    const amtMinor = parseMoney(totalMajorStr || '0', currency);
    onChange({ ...receipt, totalMinor: amtMinor, isTotalConfirmed: true });
  };

  // Sync total to calculated total button
  const handleSyncTotal = () => {
    onChange({
      ...receipt,
      totalMinor: calculatedExpectedTotalMinor,
      itemSubtotalMinor: calculatedItemsSubtotalMinor,
      isTotalConfirmed: true,
    });
  };

  // Handlers for modifying individual items
  const handleItemUpdate = (itemId: string, patch: Partial<ReceiptItem>) => {
    const updatedItems = receipt.items.map((item) => {
      if (item.id !== itemId) return item;

      const merged = { ...item, ...patch };

      // If unit price or quantity changed, and line total wasn't explicitly patched,
      // update lineTotalMinor consistently
      if (
        (patch.quantity !== undefined || patch.unitPriceMinor !== undefined) &&
        patch.lineTotalMinor === undefined
      ) {
        if (merged.unitPriceMinor !== null && merged.quantity > 0) {
          merged.lineTotalMinor = merged.quantity * merged.unitPriceMinor;
        }
      }

      return merged;
    });

    onChange({
      ...receipt,
      items: updatedItems,
      itemSubtotalMinor: updatedItems.reduce((acc, it) => acc + it.lineTotalMinor, 0),
    });
  };

  const handleRemoveItem = (itemId: string) => {
    const updatedItems = receipt.items.filter((it) => it.id !== itemId);
    onChange({
      ...receipt,
      items: updatedItems,
      itemSubtotalMinor: updatedItems.reduce((acc, it) => acc + it.lineTotalMinor, 0),
    });
  };

  const handleAddNewItem = () => {
    const name = newItemName.trim();
    if (!name) return;

    const qty = parseInt(newItemQty, 10) || 1;
    const lineTotalMinor = parseMoney(newItemPrice || '0', currency);
    const unitPriceMinor = qty > 0 ? Math.round(lineTotalMinor / qty) : lineTotalMinor;

    const newItem: ReceiptItem = {
      id: generateId(),
      name,
      quantity: qty,
      unitPriceMinor,
      lineTotalMinor,
      confidence: 100,
    };

    const updatedItems = [...receipt.items, newItem];
    onChange({
      ...receipt,
      items: updatedItems,
      itemSubtotalMinor: updatedItems.reduce((acc, it) => acc + it.lineTotalMinor, 0),
    });

    // Reset inputs
    setNewItemName('');
    setNewItemQty('1');
    setNewItemPrice('');
    setShowAddItem(false);
  };

  const handleConvertUnassignedLineToItem = (lineText: string, index: number) => {
    // Try to extract amount from end
    const match = lineText.match(/(-?\d+(?:\.\d{2})?)\s*$/);
    const amountStr = match ? match[1] : '0';
    const name = match ? lineText.slice(0, match.index).trim() : lineText;

    const lineTotalMinor = parseMoney(amountStr, currency);
    const newItem: ReceiptItem = {
      id: generateId(),
      name: name || 'Scanned Item',
      quantity: 1,
      unitPriceMinor: lineTotalMinor,
      lineTotalMinor,
      rawText: lineText,
      confidence: 80,
    };

    const remainingLines = receipt.unassignedLines.filter((_, idx) => idx !== index);
    const updatedItems = [...receipt.items, newItem];

    onChange({
      ...receipt,
      items: updatedItems,
      unassignedLines: remainingLines,
      itemSubtotalMinor: updatedItems.reduce((acc, it) => acc + it.lineTotalMinor, 0),
    });
  };

  const handleDismissUnassignedLine = (index: number) => {
    const remainingLines = receipt.unassignedLines.filter((_, idx) => idx !== index);
    onChange({
      ...receipt,
      unassignedLines: remainingLines,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top summary card */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <span>Review Scanned Details</span>
              </CardTitle>
              <CardDescription>
                Confirm extracted merchant, charges, and itemized lines before choosing how to split.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge variant="secondary" className="text-xs font-mono">
                {receipt.items.length} {receipt.items.length === 1 ? 'item' : 'items'} detected
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-1 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Merchant */}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5" />
                <span>Merchant / Store</span>
              </label>
              <Input
                value={receipt.merchantName || ''}
                onChange={(e) => handleMerchantChange(e.target.value)}
                placeholder="e.g., Starbucks, Pizza Hut"
                className="h-9 text-sm"
              />
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Date</span>
              </label>
              <Input
                type="date"
                value={receipt.date || new Date().toISOString().slice(0, 10)}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Currency */}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Currency
              </label>
              <CurrencySelector
                value={currency}
                onChange={handleCurrencyChange}
              />
            </div>
          </div>

          {/* Breakdown & Totals */}
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/60 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Items Subtotal</span>
                <p className="font-semibold text-sm mt-0.5 font-mono">
                  {formatMoney(calculatedItemsSubtotalMinor, currency)}
                </p>
              </div>

              <div>
                <label className="text-muted-foreground block">Taxes (GST/VAT)</label>
                <Input
                  type="number"
                  step="any"
                  value={toMajorUnits(receipt.taxMinor || 0, currency)}
                  onChange={(e) => handleTaxChange(e.target.value)}
                  className="h-7 text-xs font-mono mt-0.5 bg-background"
                />
              </div>

              <div>
                <label className="text-muted-foreground block">Discount (-)</label>
                <Input
                  type="number"
                  step="any"
                  value={toMajorUnits(receipt.discountMinor || 0, currency)}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  className="h-7 text-xs font-mono mt-0.5 bg-background"
                />
              </div>

              <div>
                <label className="text-muted-foreground block">Tip / S.C.</label>
                <Input
                  type="number"
                  step="any"
                  value={toMajorUnits((receipt.tipMinor || 0) + (receipt.serviceChargeMinor || 0), currency)}
                  onChange={(e) => handleTipChange(e.target.value)}
                  className="h-7 text-xs font-mono mt-0.5 bg-background"
                />
              </div>
            </div>

            {/* Final Total Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Final Payable Total:
                </span>
                <div className="w-36">
                  <Input
                    type="number"
                    step="any"
                    value={toMajorUnits(receipt.totalMinor, currency)}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    className="h-8 font-bold text-base font-mono bg-background"
                  />
                </div>
              </div>

              {hasDiscrepancy ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {totalDiscrepancyMinor > 0 ? '+' : ''}
                    {formatMoney(totalDiscrepancyMinor, currency)} diff vs items & taxes
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleSyncTotal}
                    className="h-7 text-xs"
                    title="Set final total to match items + taxes - discount exactly"
                  >
                    Match Calculated ({formatMoney(calculatedExpectedTotalMinor, currency)})
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Items & charges match final total perfectly</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Itemized List Card */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Itemized Items</CardTitle>
              <CardDescription className="text-xs">
                Edit items, correct prices, or add items missed by OCR.
              </CardDescription>
            </div>
            {!showAddItem && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setShowAddItem(true)}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Item</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 pt-1 space-y-3">
          {/* Add Item form */}
          {showAddItem && (
            <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-primary">
                <span>Add Missing Item</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowAddItem(false)}
                  className="h-6 w-6 p-0"
                >
                  ✕
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                <div className="sm:col-span-3">
                  <Input
                    placeholder="Item name (e.g. Garlic Bread)"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    className="h-8 text-xs text-center bg-background"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    type="number"
                    step="any"
                    placeholder="Total price"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="h-8 text-xs font-mono text-right bg-background"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowAddItem(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  onClick={handleAddNewItem}
                  disabled={!newItemName.trim() || !newItemPrice}
                  className="text-xs"
                >
                  Add Item
                </Button>
              </div>
            </div>
          )}

          {/* Items list */}
          {receipt.items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground border rounded-xl border-dashed">
              No items detected. Click "Add Item" above to add items manually.
            </div>
          ) : (
            <div className="space-y-2">
              {receipt.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border border-border/80 bg-card hover:border-border transition-all text-xs"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-12 shrink-0">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemUpdate(item.id, {
                            quantity: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        className="h-7 text-xs text-center font-mono"
                        title="Quantity"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.name}
                        onChange={(e) => handleItemUpdate(item.id, { name: e.target.value })}
                        className="h-7 text-xs font-medium"
                        placeholder="Item name"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <div className="w-24">
                      <Input
                        type="number"
                        step="any"
                        value={toMajorUnits(item.lineTotalMinor, currency)}
                        onChange={(e) => {
                          const amtMinor = parseMoney(e.target.value || '0', currency);
                          handleItemUpdate(item.id, {
                            lineTotalMinor: amtMinor,
                            unitPriceMinor: item.quantity > 0 ? Math.round(amtMinor / item.quantity) : amtMinor,
                          });
                        }}
                        className="h-7 text-xs text-right font-mono font-semibold"
                        title="Line total"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRemoveItem(item.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                      title="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unassigned OCR candidates */}
          {receipt.unassignedLines.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                <span>Other Detected Lines ({receipt.unassignedLines.length})</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                These lines contained numbers or text that were not automatically classified as items.
              </p>

              <div className="space-y-1.5">
                {receipt.unassignedLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                  >
                    <span className="font-mono text-muted-foreground truncate">{line}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleConvertUnassignedLineToItem(line, idx)}
                        className="h-6 text-[11px]"
                      >
                        Add as item
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => handleDismissUnassignedLine(idx)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation footer */}
      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          Back to Photo
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onProceed}
          disabled={receipt.totalMinor <= 0}
          className="font-semibold"
        >
          Proceed to Split ({formatMoney(receipt.totalMinor, currency)})
        </Button>
      </div>
    </div>
  );
};
