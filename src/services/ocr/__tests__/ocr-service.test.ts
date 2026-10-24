import { describe, it, expect } from 'vitest';
import {
  validateReceiptImageFile,
  MAX_IMAGE_FILE_SIZE_BYTES,
  OCRService,
} from '../ocr-service';

describe('OCR Service', () => {
  describe('validateReceiptImageFile', () => {
    it('accepts valid JPEG, PNG, and WebP images within 10MB', () => {
      const validJpeg = new File(['dummy content'], 'receipt.jpg', { type: 'image/jpeg' });
      expect(validateReceiptImageFile(validJpeg).valid).toBe(true);

      const validPng = new File(['dummy content'], 'receipt.png', { type: 'image/png' });
      expect(validateReceiptImageFile(validPng).valid).toBe(true);

      const validWebp = new File(['dummy content'], 'receipt.webp', { type: 'image/webp' });
      expect(validateReceiptImageFile(validWebp).valid).toBe(true);
    });

    it('rejects unsupported file formats with friendly message', () => {
      const pdfFile = new File(['dummy content'], 'receipt.pdf', { type: 'application/pdf' });
      const res = validateReceiptImageFile(pdfFile);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Unsupported image format/i);
    });

    it('rejects files exceeding the 10 MB limit with a clear error', () => {
      const largeFile = new File(['a'], 'giant.jpg', { type: 'image/jpeg' });
      Object.defineProperty(largeFile, 'size', {
        value: MAX_IMAGE_FILE_SIZE_BYTES + 1024,
      });

      const res = validateReceiptImageFile(largeFile);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/exceeds the 10 MB limit/i);
    });
  });

  describe('OCRService worker management and cancellation', () => {
    it('aborts immediately when AbortSignal is already cancelled', async () => {
      const service = new OCRService();
      const controller = new AbortController();
      controller.abort();

      const dummyFile = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
      await expect(
        service.recognize(dummyFile, undefined, controller.signal)
      ).rejects.toThrow(/cancelled/i);
    });

    it('terminates worker cleanly', async () => {
      const service = new OCRService();
      await expect(service.terminate()).resolves.toBeUndefined();
    });
  });
});
