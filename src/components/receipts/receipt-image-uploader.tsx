import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, RefreshCw, X, AlertCircle, FileImage, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { validateReceiptImageFile } from '@/services/ocr/ocr-service';
import type { OCRProgress } from '@/domain/receipts/types';

interface ReceiptImageUploaderProps {
  onImageSelected: (file: File) => void;
  isProcessing: boolean;
  progress: OCRProgress | null;
  error: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export const ReceiptImageUploader: React.FC<ReceiptImageUploaderProps> = ({
  onImageSelected,
  isProcessing,
  progress,
  error,
  onCancel,
  onRetry,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Clean up object URL on change or unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (file: File | null) => {
    if (!file) return;

    // Validate type and size (10MB limit)
    const validation = validateReceiptImageFile(file);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid file');
      return;
    }

    setValidationError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    onImageSelected(file);
  };

  const handleClear = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const displayError = validationError || error;

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          handleFileChange(file);
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          handleFileChange(file);
        }}
      />

      {!previewUrl ? (
        <div className="border-2 border-dashed border-border rounded-2xl p-6 sm:p-10 text-center bg-muted/20 hover:bg-muted/30 transition-all flex flex-col items-center justify-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
            <Camera className="h-7 w-7" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Upload Receipt Photo</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Take a clear, well-lit photo of your restaurant or store receipt. Supports JPEG, PNG, and WebP up to 10 MB.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              className="gap-2 shadow-xs"
            >
              <Camera className="h-4 w-4" />
              <span>Take Photo</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              <span>Browse Image</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Selected photo card */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/80 bg-card shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="relative h-12 w-12 rounded-lg overflow-hidden border border-border bg-muted cursor-pointer shrink-0 group"
                onClick={() => setIsPreviewOpen(true)}
                title="Click to view full photo"
              >
                <img
                  src={previewUrl}
                  alt="Receipt Preview"
                  className="h-full w-full object-cover group-hover:opacity-80 transition-opacity"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Eye className="h-4 w-4" />
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {selectedFile?.name || 'Receipt Photo'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB' : ''} • Click thumbnail to inspect
                </p>
              </div>
            </div>

            {!isProcessing && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => fileInputRef.current?.click()}
                  title="Replace photo"
                  className="h-8 gap-1 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Replace</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleClear}
                  title="Remove photo"
                  className="h-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Processing progress feedback */}
          {isProcessing && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{progress?.message || 'Extracting receipt details...'}</span>
                </div>
                <span className="text-muted-foreground font-mono">
                  {Math.round((progress?.progress ?? 0) * 100)}%
                </span>
              </div>

              <Progress value={(progress?.progress ?? 0) * 100} className="h-2" />

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-muted-foreground">
                  Running local OCR in browser. Your receipt photo never leaves your device.
                </p>
                {onCancel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onCancel}
                    className="text-xs text-muted-foreground hover:text-foreground h-7"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {displayError && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to process receipt photo</p>
              <p className="mt-0.5 opacity-90">{displayError}</p>
            </div>
          </div>
          {onRetry && selectedFile && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onRetry}
              className="shrink-0 h-7 text-xs border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              Try Again
            </Button>
          )}
        </div>
      )}

      {/* Full image preview modal */}
      {isPreviewOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="relative max-w-2xl max-h-[90vh] bg-card rounded-2xl overflow-hidden shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-2 border-b border-border/60">
              <span className="text-xs font-semibold text-foreground">Receipt Photo Preview</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setIsPreviewOpen(false)}
                className="h-7 w-7 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="overflow-auto max-h-[75vh] p-2 flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Full receipt photo"
                className="max-h-full max-w-full rounded-lg object-contain shadow-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
