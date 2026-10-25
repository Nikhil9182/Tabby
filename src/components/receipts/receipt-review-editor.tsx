import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  HelpCircle,
  Receipt,
  Store,
  Calendar,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CurrencySelector } from '@/components/currency/currency-selector';
import { generateId } from '@/lib/id';
import { toMajorUnits, formatMoney, parseMoney } from '@/domain/money/money';
import type { ParsedReceipt, ReceiptItem } from '@/domain/receipts/types';

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

  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);

  const calculatedItemsSubtotalMinor = useMemo(() => {
    return receipt.items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  }, [receipt.items]);

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

  const handleMerchantChange = (name: string) => {
    onChange({ ...receipt, merchantName: name });
  };

  const handleDateChange = (date: string) => {
    onChange({ ...receipt, date });
  };

  const handleCurrencyChange = (newCurr: string) => {
    onChange({ ...receipt, currency: newCurr });
  };

  const handleTaxChange = (valStr: string) => {
    const amtMinor = parseMoney(valStr || '0', currency);
    onChange({ ...receipt, taxMinor: amtMinor });
  };

  const handleDiscountChange = (valStr: string) => {
    const amtMinor = parseMoney(valStr || '0', currency);
    onChange({ ...receipt, discountMinor: amtMinor });
  };

  const handleTipChange = (valStr: string) => {
    const amtMinor = parseMoney(valStr || '0', currency);
    onChange({ ...receipt, tipMinor: amtMinor });
  };

  const handleTotalChange = (totalMajorStr: string) => {
    const amtMinor = parseMoney(totalMajorStr || '0', currency);
    onChange({ ...receipt, totalMinor: amtMinor, isTotalConfirmed: true });
  };

  const handleSyncTotal = () => {
    onChange({
      ...receipt,
      totalMinor: calculatedExpectedTotalMinor,
      itemSubtotalMinor: calculatedItemsSubtotalMinor,
      isTotalConfirmed: true,
    });
  };

  const handleItemUpdate = (itemId: string, patch: Partial<ReceiptItem>) => {
    const updatedItems = receipt.items.map((item) => {
      if (item.id !== itemId) return item;
      const merged = { ...item, ...patch };

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

    setNewItemName('');
    setNewItemQty('1');
    setNewItemPrice('');
    setShowAddItem(false);
  };

  const handleConvertUnassignedLineToItem = (lineText: string, index: number) => {
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
    <div className="space-y-5 w-full min-w-0">
      {/* Receipt summary card */}
      <Card className="border-border/70 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 bg-muted/20 border-b border-border/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm sm:text-base font-bold">Review Scanned Details</CardTitle>
                <CardDescription className="text-xs">
                  Verify extracted merchant, charges, and item prices.
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs font-mono shrink-0">
              {receipt.items.length} {receipt.items.length === 1 ? 'item' : 'items'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Metadata Row: Merchant, Date, Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5" />
                <span>Store / Place</span>
              </label>
              <Input
                value={receipt.merchantName || ''}
                onChange={(e) => handleMerchantChange(e.target.value)}
                placeholder="e.g., Liquor Street, Pizzeria"
                className="h-9 text-xs sm:text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Date</span>
              </label>
              <Input
                type="date"
                value={receipt.date || new Date().toISOString().slice(0, 10)}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-9 text-xs sm:text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Currency
              </label>
              <CurrencySelector
                value={currency}
                onChange={handleCurrencyChange}
              />
            </div>
          </div>

          {/* Charges and Totals Box */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-muted/30 border border-border/70 space-y-3.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-background border border-border/60">
                <span className="text-[11px] text-muted-foreground font-medium block">Items Subtotal</span>
                <p className="font-bold text-sm sm:text-base mt-0.5 font-mono text-foreground truncate">
                  {formatMoney(calculatedItemsSubtotalMinor, currency)}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-background border border-border/60 space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium block">Taxes (GST/VAT)</label>
                <Input
                  type="number"
                  step="any"
                  value={toMajorUnits(receipt.taxMinor || 0, currency)}
                  onChange={(e) => handleTaxChange(e.target.value)}
                  className="h-7 text-xs font-mono font-semibold"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-background border border-border/60 space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium block">Discount (-)</label>
                <Input
                  type="number"
                  step="any"
                  value={toMajorUnits(receipt.discountMinor || 0, currency)}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  className="h-7 text-xs font-mono font-semibold"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-background border border-border/60 space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium block">Tip / S.C.</label>
                <Input
                  type="number"
                  step="any"
                  value={toMajorUnits((receipt.tipMinor || 0) + (receipt.serviceChargeMinor || 0), currency)}
                  onChange={(e) => handleTipChange(e.target.value)}
                  className="h-7 text-xs font-mono font-semibold"
                />
              </div>
            </div>

            {/* Final Total Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/60">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground shrink-0">
                  Bill Total:
                </span>
                <div className="w-32 sm:w-40">
                  <Input
                    type="number"
                    step="any"
                    value={toMajorUnits(receipt.totalMinor, currency)}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    className="h-9 font-bold text-sm sm:text-base font-mono bg-background rounded-xl"
                  />
                </div>
              </div>

              {hasDiscrepancy ? (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    {totalDiscrepancyMinor > 0 ? '+' : ''}
                    {formatMoney(totalDiscrepancyMinor, currency)} difference
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={handleSyncTotal}
                    className="h-7 text-xs gap-1.5 font-semibold border-amber-500/40 hover:bg-amber-500/10"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Match Items ({formatMoney(calculatedExpectedTotalMinor, currency)})</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Items & charges match total</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Itemized List Card */}
      <Card className="border-border/70 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 flex flex-row items-center justify-between gap-2 border-b border-border/50">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold">Itemized Items</CardTitle>
            <CardDescription className="text-xs">
              Check quantities and prices. Edit, remove, or add missing lines.
            </CardDescription>
          </div>
          {!showAddItem && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setShowAddItem(true)}
              className="gap-1.5 text-xs rounded-xl font-semibold shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Item</span>
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-3">
          {/* Add Item form */}
          {showAddItem && (
            <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-primary">
                <span>Add Missing Item</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowAddItem(false)}
                  className="h-6 w-6 p-0 rounded-full"
                >
                  ✕
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                <div className="sm:col-span-3">
                  <Input
                    placeholder="Item name (e.g. Cold Coffee)"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="h-8 text-xs bg-background rounded-lg"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    className="h-8 text-xs text-center font-mono bg-background rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    type="number"
                    step="any"
                    placeholder="Total price"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="h-8 text-xs font-mono text-right bg-background rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
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
                  className="text-xs font-semibold"
                >
                  Save Item
                </Button>
              </div>
            </div>
          )}

          {/* Items list */}
          {receipt.items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground border rounded-xl border-dashed">
              No items detected. Click "Add Item" above to add items manually.
            </div>
          ) : (
            <div className="space-y-2">
              {receipt.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl border border-border/70 bg-card hover:border-border transition-all text-xs"
                >
                  {/* Quantity and Name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-11 sm:w-12 shrink-0">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemUpdate(item.id, {
                            quantity: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        className="h-8 text-xs text-center font-mono font-medium px-1 rounded-lg"
                        title="Quantity"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.name}
                        onChange={(e) => handleItemUpdate(item.id, { name: e.target.value })}
                        className="h-8 text-xs font-medium rounded-lg truncate"
                        placeholder="Item name"
                      />
                    </div>
                  </div>

                  {/* Price and Delete */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <div className="w-20 sm:w-28">
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
                        className="h-8 text-xs text-right font-mono font-bold pr-2 rounded-lg"
                        title="Line total"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRemoveItem(item.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-lg shrink-0"
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

              <div className="space-y-1.5">
                {receipt.unassignedLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                  >
                    <span className="font-mono text-muted-foreground truncate text-[11px]">{line}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => handleConvertUnassignedLineToItem(line, idx)}
                        className="h-6 text-[10px] px-2 rounded-lg"
                      >
                        + Add item
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
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60 sticky bottom-0 bg-background/95 backdrop-blur-md pb-1 z-10">
        <Button type="button" variant="outline" size="sm" onClick={onBack} className="rounded-xl">
          Back to Photo
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onProceed}
          disabled={receipt.totalMinor <= 0}
          className="font-bold rounded-xl shadow-xs"
        >
          Proceed to Split ({formatMoney(receipt.totalMinor, currency)})
        </Button>
      </div>
    </div>
  );
};
