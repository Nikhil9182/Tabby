import type { OCRProgress, ReceiptRawData, ReceiptRawLine } from '@/domain/receipts/types';

export const MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validateReceiptImageFile(file: File): ImageValidationResult {
  if (!file) {
    return { valid: false, error: 'No image file was provided.' };
  }

  // Check MIME type
  const mimeType = (file.type || '').toLowerCase();
  const fileName = (file.name || '').toLowerCase();
  const hasValidExt = /\.(jpe?g|png|webp)$/i.test(fileName);

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType) && !hasValidExt) {
    return {
      valid: false,
      error: 'Unsupported image format. Please select a JPEG, PNG, or WebP photo.',
    };
  }

  // Check file size
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `The selected photo (${sizeInMb} MB) exceeds the 10 MB limit. Please select a smaller or cropped image.`,
    };
  }

  return { valid: true };
}

type TesseractWorker = any;

export class OCRService {
  private worker: TesseractWorker | null = null;
  private currentLanguage: string = 'eng';
  private isProcessing: boolean = false;
  private isCancelled: boolean = false;

  /**
   * Initializes or reuses the OCR worker.
   * Loads Tesseract.js dynamically to avoid bundling it on initial page load.
   */
  async getWorker(lang = 'eng'): Promise<TesseractWorker> {
    if (this.worker && this.currentLanguage === lang) {
      return this.worker;
    }

    if (this.worker) {
      await this.terminate();
    }

    const { createWorker } = await import('tesseract.js');
    this.currentLanguage = lang;
    const worker = await createWorker(lang);
    this.worker = worker;
    return worker;
  }

  /**
   * Recognizes text from an image file, blob, or object URL.
   * Reports progress and respects cancellation.
   */
  async recognize(
    imageSource: File | Blob | string,
    onProgress?: (progress: OCRProgress) => void,
    signal?: AbortSignal
  ): Promise<ReceiptRawData> {
    if (this.isProcessing) {
      throw new Error('An OCR recognition job is already in progress. Please wait for it to finish.');
    }

    this.isProcessing = true;
    this.isCancelled = false;

    // Check if already aborted
    if (signal?.aborted) {
      this.isProcessing = false;
      throw new DOMException('OCR recognition was cancelled by user', 'AbortError');
    }

    const abortHandler = () => {
      this.isCancelled = true;
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    onProgress?.({
      status: 'loading',
      progress: 0.1,
      message: 'Preparing receipt scanner engine...',
    });

    try {
      const worker = await this.getWorker(this.currentLanguage);

      if (this.isCancelled || signal?.aborted) {
        throw new DOMException('OCR recognition was cancelled by user', 'AbortError');
      }

      onProgress?.({
        status: 'recognizing',
        progress: 0.25,
        message: 'Reading receipt text...',
      });

      // Tesseract recognize
      const result = await worker.recognize(imageSource);

      if (this.isCancelled || signal?.aborted) {
        throw new DOMException('OCR recognition was cancelled by user', 'AbortError');
      }

      const page = result.data;
      const rawText = page.text || '';

      const lines: ReceiptRawLine[] = (page.lines || []).map((line: any, idx: number) => ({
        text: (line.text || '').trim(),
        confidence: typeof line.confidence === 'number' ? line.confidence : 0,
        words: (line.words || []).map((w: any) => ({
          text: (w.text || '').trim(),
          confidence: typeof w.confidence === 'number' ? w.confidence : 0,
        })),
        lineNumber: idx + 1,
      })).filter((l: ReceiptRawLine) => l.text.length > 0);

      // Overall average confidence
      const confidence = typeof page.confidence === 'number' ? page.confidence : 0;

      onProgress?.({
        status: 'completed',
        progress: 1.0,
        message: 'Receipt text extracted successfully.',
      });

      return {
        text: rawText,
        lines,
        confidence,
      };
    } catch (err: any) {
      if (this.isCancelled || signal?.aborted || err?.name === 'AbortError') {
        throw new DOMException('OCR recognition was cancelled by user', 'AbortError');
      }

      const friendlyMessage =
        err instanceof Error
          ? err.message
          : 'Failed to read receipt image. Please ensure the image is clear and well-lit.';

      onProgress?.({
        status: 'error',
        progress: 0,
        message: friendlyMessage,
      });

      throw new Error(friendlyMessage);
    } finally {
      this.isProcessing = false;
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  /**
   * Terminates the background worker and frees resources.
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      try {
        await w.terminate();
      } catch {
        // Ignore termination errors during teardown
      }
    }
    this.isProcessing = false;
  }
}

// Global singleton instance for app-wide reuse
export const ocrService = new OCRService();
