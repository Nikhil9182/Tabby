import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ReceiptImageUploader } from './receipt-image-uploader';
import { ReceiptReviewEditor } from './receipt-review-editor';
import { ReceiptSplitAssigner, type ParticipantOption } from './receipt-split-assigner';
import { ocrService } from '@/services/ocr/ocr-service';
import { parseReceipt } from '@/domain/receipts/receipt-parser';
import { formatReceiptNotes, type ParsedExpenseItem } from '@/domain/receipts/receipt-item-parser';
import { currencyService } from '@/services/currency/currency-service';
import { useExpenses } from '@/hooks/use-expenses';
import { toMajorUnits, formatMoney } from '@/domain/money/money';
import type {
  OCRProgress,
  ParsedReceipt,
  ReceiptSplitResult,
} from '@/domain/receipts/types';
import { Checkbox } from '@/components/ui/checkbox';
import { compressImageForStorage } from '@/services/image/image-compression';
import { receiptService } from '@/services/receipts/receipt-service';
import { Sparkles, Camera, CheckCircle2, AlertCircle } from 'lucide-react';

export type ReceiptFlowStep = 'upload' | 'review' | 'split';

interface ReceiptScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contextType: 'direct' | 'group';
  friendId?: string;
  groupId?: string;
  defaultCurrency: string;
  contextCurrency?: string;
  participants: ParticipantOption[];
  currentUserId: string;
  paidBy: string;
  categoryId?: string;
  onExpenseSaved?: (expenseId: string) => void;
}

export const ReceiptScannerDialog: React.FC<ReceiptScannerDialogProps> = ({
  isOpen,
  onClose,
  contextType,
  friendId,
  groupId,
  defaultCurrency,
  contextCurrency,
  participants,
  currentUserId,
  paidBy,
  categoryId,
  onExpenseSaved,
}) => {
  const navigate = useNavigate();
  const { createExpense, isCreating } = useExpenses();

  const [step, setStep] = useState<ReceiptFlowStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [attachReceipt, setAttachReceipt] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OCRProgress | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStep('upload');
      setSelectedFile(null);
      setOriginalFile(null);
      setAttachReceipt(true);
      setIsProcessing(false);
      setOcrProgress(null);
      setOcrError(null);
      setParsedReceipt(null);
      setSaveError(null);
      setIsSaving(false);
    }
  }, [isOpen]);

  // Handle OCR recognition when file is selected
  const handleImageSelected = async (file: File) => {
    setSelectedFile(file);
    setOriginalFile(file);
    setOcrError(null);
    setIsProcessing(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const rawData = await ocrService.recognize(
        file,
        (p) => setOcrProgress(p),
        abortController.signal
      );

      const parsed = parseReceipt(rawData, contextCurrency || defaultCurrency);
      setParsedReceipt(parsed);
      setStep('review');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User cancelled
        return;
      }
      const msg = err instanceof Error ? err.message : 'OCR failed to extract receipt text';
      setOcrError(msg);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelOcr = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setOcrProgress(null);
  };

  const handleRetryOcr = () => {
    if (selectedFile) {
      handleImageSelected(selectedFile);
    }
  };

  /**
   * Helper to build rate snapshot matching Tabby's multi-currency policy
   */
  const buildRateSnapshot = async (amountMinor: number, currency: string, expenseDay: string) => {
    const reportingTarget = (contextCurrency || defaultCurrency).toUpperCase();
    const sourceCurr = currency.toUpperCase();

    if (sourceCurr === reportingTarget) {
      return {
        reportingCurrency: sourceCurr,
        exchangeRate: 1,
        exchangeRateDate: expenseDay,
        exchangeRateSource: 'identity',
        reportingAmountMinor: amountMinor,
      };
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const converted = await currencyService.convertAmount(
        amountMinor,
        sourceCurr,
        reportingTarget,
        expenseDay < today ? expenseDay : undefined
      );
      return {
        reportingCurrency: reportingTarget,
        exchangeRate: converted.quote.rate,
        exchangeRateDate: converted.quote.effectiveDate,
        exchangeRateSource: converted.quote.source === 'cache' ? 'cache' : 'frankfurter',
        reportingAmountMinor: converted.amountMinor,
      };
    } catch {
      return {
        reportingCurrency: sourceCurr,
        exchangeRate: 1,
        exchangeRateDate: expenseDay,
        exchangeRateSource: 'unavailable',
        reportingAmountMinor: amountMinor,
      };
    }
  };

  // Confirm and save expense into existing Tabby database via createExpense
  const handleConfirmAndSave = async (splitResult: ReceiptSplitResult) => {
    if (!parsedReceipt) return;
    setSaveError(null);
    setIsSaving(true);

    try {
      const totalAmountMinor = parsedReceipt.totalMinor;
      const receiptCurrency = parsedReceipt.currency;
      const expenseDate = parsedReceipt.date || new Date().toISOString().slice(0, 10);
      const expenseDateISO = new Date(expenseDate).toISOString();

      const description = parsedReceipt.merchantName
        ? `${parsedReceipt.merchantName} (Receipt)`
        : 'Scanned Receipt Expense';

      // Map item assignments to each item if available
      const itemAssignmentsMap: Record<string, string[]> = {};
      if (splitResult.mode === 'items') {
        splitResult.shares.forEach((share) => {
          share.assignedItemIds?.forEach((itemId) => {
            if (!itemAssignmentsMap[itemId]) {
              itemAssignmentsMap[itemId] = [];
            }
            itemAssignmentsMap[itemId].push(share.userId);
          });
        });
      }

      const itemsPayload: ParsedExpenseItem[] = parsedReceipt.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        lineTotalMinor: it.lineTotalMinor,
        unitPriceMinor: it.unitPriceMinor ?? undefined,
        assignedUserIds: itemAssignmentsMap[it.id],
      }));

      // Items are stored directly in receipt storage, not dumped into user notes
      const notes = undefined;

      const rateSnapshot = await buildRateSnapshot(totalAmountMinor, receiptCurrency, expenseDate);

      // Map splits
      const finalSplits = splitResult.shares.map((s) => ({
        userId: s.userId,
        shareMinor: s.totalShareMinor,
      }));

      // Determine splitType: if equal, save as 'equal', otherwise 'exact'
      const splitType = splitResult.mode === 'equal' ? 'equal' : 'exact';
      let createdExpenseId: string | null = null;

      if (contextType === 'direct') {
        if (!friendId) {
          throw new Error('A friend must be selected for this direct expense.');
        }

        const directParticipants = [currentUserId, friendId];

        const created = await createExpense({
          description,
          amountMinor: totalAmountMinor,
          originalAmountMinor: totalAmountMinor,
          currency: receiptCurrency,
          originalCurrency: receiptCurrency,
          ...rateSnapshot,
          paidBy: paidBy || currentUserId,
          sourceType: 'direct',
          contextType: 'direct',
          friendId,
          categoryId,
          notes: notes || undefined,
          expenseDate: expenseDateISO,
          splitType,
          participants: directParticipants,
          splits: finalSplits,
          createdBy: currentUserId,
        });

        createdExpenseId = created.id;
      } else {
        // Group context
        if (!groupId || groupId === 'personal') {
          throw new Error('A valid group must be selected for this group expense.');
        }

        const groupParticipantIds = participants.map((p) => p.id);

        const created = await createExpense({
          description,
          amountMinor: totalAmountMinor,
          originalAmountMinor: totalAmountMinor,
          currency: receiptCurrency,
          originalCurrency: receiptCurrency,
          ...rateSnapshot,
          paidBy: paidBy || currentUserId,
          sourceType: 'group',
          contextType: 'group',
          groupId,
          categoryId,
          notes: notes || undefined,
          expenseDate: expenseDateISO,
          splitType,
          participants: groupParticipantIds,
          splits: finalSplits,
          createdBy: currentUserId,
        });

        createdExpenseId = created.id;
      }

      // Save structured itemized receipt data
      if (createdExpenseId) {
        try {
          await receiptService.saveReceiptItems({
            expenseId: createdExpenseId,
            items: itemsPayload,
            taxMinor: parsedReceipt.taxMinor,
            discountMinor: parsedReceipt.discountMinor,
            tipMinor: parsedReceipt.tipMinor,
            serviceChargeMinor: parsedReceipt.serviceChargeMinor,
            subtotalMinor: parsedReceipt.itemSubtotalMinor,
            totalMinor: totalAmountMinor,
            currency: receiptCurrency,
          });
        } catch (itemSaveErr) {
          console.error('Failed to save structured receipt items:', itemSaveErr);
        }
      }

      // Attach compressed storage receipt if enabled
      if (attachReceipt && originalFile && createdExpenseId) {
        try {
          const compressed = await compressImageForStorage(originalFile, {
            maxDimension: 1600,
            quality: 0.75,
            outputFileName: originalFile.name,
          });

          await receiptService.uploadReceiptAttachment({
            expenseId: createdExpenseId,
            file: compressed.file,
            originalFilename: originalFile.name,
          });
        } catch (uploadErr) {
          console.error('Failed to attach receipt to saved expense:', uploadErr);
        }
      }

      if (createdExpenseId) {
        onExpenseSaved?.(createdExpenseId);
      }
      onClose();

      if (contextType === 'direct') {
        navigate(`/friends?friendId=${friendId}`);
      } else {
        navigate(`/groups/${groupId}`);
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to save expense';
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col gap-0 p-0 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-3xl lg:max-w-4xl max-h-[92dvh] h-[92dvh] sm:h-auto sm:max-h-[88vh] overflow-hidden rounded-2xl sm:rounded-3xl border-border/80 shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-border/60 shrink-0 space-y-3 bg-muted/10">
          <div className="flex items-center gap-3 pr-8">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold">
                {step === 'upload' && 'Scan Receipt'}
                {step === 'review' && 'Review Scanned Receipt'}
                {step === 'split' && 'Split Bill'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {step === 'upload' && 'Upload or take a photo of your receipt to automatically parse items and prices.'}
                {step === 'review' && 'Verify the extracted store name, prices, and taxes.'}
                {step === 'split' && 'Choose equal splitting or assign dishes to specific people.'}
              </DialogDescription>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'upload'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                1
              </span>
              <span className={step === 'upload' ? 'font-semibold text-foreground' : ''}>Upload</span>
            </div>

            <span className="text-border">⎯⎯</span>

            <div className="flex items-center gap-1.5">
              <span
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'review'
                    ? 'bg-primary text-primary-foreground'
                    : parsedReceipt
                    ? 'bg-muted text-foreground'
                    : 'bg-muted/40 text-muted-foreground'
                }`}
              >
                2
              </span>
              <span className={step === 'review' ? 'font-semibold text-foreground' : ''}>Review</span>
            </div>

            <span className="text-border">⎯⎯</span>

            <div className="flex items-center gap-1.5">
              <span
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'split'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/40 text-muted-foreground'
                }`}
              >
                3
              </span>
              <span className={step === 'split' ? 'font-semibold text-foreground' : ''}>Split</span>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable body with no horizontal overflow */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 overscroll-contain">
          {step === 'upload' && (
            <ReceiptImageUploader
              onImageSelected={handleImageSelected}
              isProcessing={isProcessing}
              progress={ocrProgress}
              error={ocrError}
              onCancel={handleCancelOcr}
              onRetry={handleRetryOcr}
            />
          )}

          {step === 'review' && parsedReceipt && (
            <ReceiptReviewEditor
              receipt={parsedReceipt}
              onChange={(updated) => setParsedReceipt(updated)}
              onProceed={() => setStep('split')}
              onBack={() => setStep('upload')}
            />
          )}

          {step === 'split' && parsedReceipt && (
            <div className="space-y-4">
              {/* Optional Attach Receipt Toggle */}
              {originalFile && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="attach-receipt-checkbox"
                      checked={attachReceipt}
                      onCheckedChange={(checked) => setAttachReceipt(Boolean(checked))}
                    />
                    <label
                      htmlFor="attach-receipt-checkbox"
                      className="text-xs font-semibold text-foreground cursor-pointer select-none"
                    >
                      Attach receipt image to this expense
                    </label>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {(originalFile.size / 1024).toFixed(0)} KB original
                  </span>
                </div>
              )}

              <ReceiptSplitAssigner
                receipt={parsedReceipt}
                participants={participants}
                currentUserId={currentUserId}
                onConfirm={handleConfirmAndSave}
                onBack={() => setStep('review')}
                isSaving={isSaving || isCreating}
              />

              {saveError && (
                <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
