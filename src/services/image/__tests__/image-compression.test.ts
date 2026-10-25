import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressImageForStorage } from '../image-compression';

describe('Image Compression Utility', () => {
  beforeEach(() => {
    // Mock createImageBitmap for jsdom
    (globalThis as any).createImageBitmap = vi.fn().mockImplementation(async () => ({
      width: 2400,
      height: 1800,
      close: vi.fn(),
    }));

    // Mock HTMLCanvasElement for jsdom
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    }) as any;

    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback, type) {
      const blob = new Blob(['compressed content'], { type: type || 'image/jpeg' });
      callback(blob);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws for unsupported file formats', async () => {
    const invalidFile = new File(['text content'], 'receipt.txt', { type: 'text/plain' });
    await expect(compressImageForStorage(invalidFile)).rejects.toThrow(/unsupported image format/i);
  });

  it('preserves the original input reference without modifying it', async () => {
    const originalContent = new Uint8Array([1, 2, 3, 4, 5]);
    const originalFile = new File([originalContent], 'original-receipt.png', {
      type: 'image/png',
    });

    const initialSize = originalFile.size;
    const initialName = originalFile.name;
    const initialType = originalFile.type;

    // Run compression
    const result = await compressImageForStorage(originalFile);

    // Verify original was not mutated
    expect(originalFile.size).toBe(initialSize);
    expect(originalFile.name).toBe(initialName);
    expect(originalFile.type).toBe(initialType);

    // Verify result is a distinct File
    expect(result.file).not.toBe(originalFile);
    expect(result.originalSize).toBe(initialSize);
  });

  it('resizes image to target maxDimension while preserving aspect ratio', async () => {
    const file = new File(['dummy jpeg content'], 'receipt.jpg', { type: 'image/jpeg' });
    const result = await compressImageForStorage(file, {
      maxDimension: 1600,
      quality: 0.75,
      outputFileName: 'storage-receipt.jpg',
    });

    expect(result.file.name).toBe('storage-receipt.jpg');
    expect(result.file.type).toBe('image/jpeg');
    // 2400x1800 scaled down with max 1600 -> 1600x1200
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.compressedSize).toBeGreaterThan(0);
  });
});
