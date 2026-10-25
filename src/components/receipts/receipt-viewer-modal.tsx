import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  Trash2,
  FileImage,
  ExternalLink,
  AlertCircle,
  Loader2,
  Maximize2,
} from 'lucide-react';
import type { ReceiptAttachment } from '@/services/receipts/receipt-service';

interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptAttachment | null;
  expenseDescription: string;
  onDeleteReceipt?: () => Promise<void>;
  isDeleting?: boolean;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  isOpen,
  onClose,
  receipt,
  expenseDescription,
  onDeleteReceipt,
  isDeleting = false,
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset transforms when opened
  React.useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setIsImageLoading(true);
      setImageError(false);
      setConfirmDelete(false);
    }
  }, [isOpen, receipt?.signedUrl]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  const formattedSize = receipt?.fileSize
    ? `${(receipt.fileSize / 1024).toFixed(1)} KB`
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92dvh] h-[92dvh] flex flex-col p-0 overflow-hidden rounded-2xl sm:rounded-3xl border-border/80 shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 border-b border-border/60 shrink-0 bg-muted/10">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileImage className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold truncate">
                  {receipt?.originalFilename || 'Attached Receipt'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground truncate">
                  {expenseDescription} {formattedSize && `• ${formattedSize}`}
                </DialogDescription>
              </div>
            </div>

            {/* Quick Zoom & Rotate Toolbar */}
            <div className="hidden sm:flex items-center gap-1 bg-card border border-border/70 rounded-xl p-1 shadow-2xs">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                title="Zoom Out"
                className="h-7 w-7 p-0"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] font-mono px-1 min-w-[42px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleZoomIn}
                disabled={scale >= 3}
                title="Zoom In"
                className="h-7 w-7 p-0"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <div className="h-4 w-px bg-border/60 mx-1" />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleRotate}
                title="Rotate 90°"
                className="h-7 w-7 p-0"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleReset}
                title="Reset View"
                className="h-7 px-2 text-[11px]"
              >
                Reset
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Image viewport */}
        <div className="flex-1 bg-black/90 relative overflow-hidden flex items-center justify-center p-4 select-none touch-none">
          {/* Loading state */}
          {isImageLoading && !imageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-2 bg-black/60 z-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-xs">Loading receipt image...</span>
            </div>
          )}

          {/* Error state */}
          {imageError && (
            <div className="p-6 text-center max-w-sm space-y-3 text-white">
              <div className="h-12 w-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h4 className="text-base font-semibold">Unable to display receipt</h4>
              <p className="text-xs text-white/70">
                The image may have expired, been removed, or access was denied.
              </p>
              {receipt?.signedUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setImageError(false);
                    setIsImageLoading(true);
                  }}
                  className="gap-1.5 text-xs text-black bg-white hover:bg-white/90"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </Button>
              )}
            </div>
          )}

          {/* Render image with transforms */}
          {receipt?.signedUrl && !imageError && (
            <div
              className="transition-transform duration-100 ease-out flex items-center justify-center"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
              }}
            >
              <img
                src={receipt.signedUrl}
                alt="Receipt Full View"
                onLoad={() => setIsImageLoading(false)}
                onError={() => {
                  setIsImageLoading(false);
                  setImageError(true);
                }}
                className="max-h-[75dvh] max-w-full object-contain rounded-lg shadow-2xl pointer-events-auto cursor-grab active:cursor-grabbing"
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="p-3.5 sm:p-4 border-t border-border/60 bg-muted/10 shrink-0 flex flex-row items-center justify-between sm:justify-between gap-2">
          {/* Delete action */}
          <div>
            {!confirmDelete ? (
              onDeleteReceipt && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isDeleting}
                  className="text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-600 gap-1.5 text-xs h-8"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Receipt</span>
                </Button>
              )
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Remove photo only?
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  onClick={async () => {
                    await onDeleteReceipt?.();
                    setConfirmDelete(false);
                    onClose();
                  }}
                  disabled={isDeleting}
                  className="h-8 text-xs font-semibold"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setConfirmDelete(false)}
                  disabled={isDeleting}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Mobile controls & Close */}
          <div className="flex items-center gap-2">
            {receipt?.signedUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-8 text-xs gap-1.5"
              >
                <a
                  href={receipt.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={receipt.originalFilename || 'receipt.jpg'}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Open Original</span>
                </a>
              </Button>
            )}

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs font-semibold rounded-xl"
            >
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
