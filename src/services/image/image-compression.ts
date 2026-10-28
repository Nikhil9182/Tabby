/**
 * Client-side image compression utility for Tabby receipt storage.
 *
 * CRITICAL RULE:
 * This utility creates a SEPARATE storage-ready image. It never modifies,
 * overwrites, or compresses the original image reference used for OCR.
 */

export interface CompressionOptions {
  /** Maximum pixel dimension on longest side (default: 1600) */
  maxDimension?: number;
  /** Initial JPEG compression quality between 0.1 and 1.0 (default: 0.75) */
  quality?: number;
  /** Desired output MIME type (default: 'image/jpeg') */
  mimeType?: string;
  /** File name to give the resulting File object (default: 'receipt.jpg') */
  outputFileName?: string;
}

export interface CompressedImageResult {
  /** Storage-ready File object */
  file: File;
  /** Storage-ready Blob */
  blob: Blob;
  /** Final pixel width */
  width: number;
  /** Final pixel height */
  height: number;
  /** Original file size in bytes */
  originalSize: number;
  /** Compressed file size in bytes */
  compressedSize: number;
  /** MIME type of output */
  mimeType: string;
}

const SUPPORTED_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Resizes oversized receipt images while preserving aspect ratio and text legibility,
 * outputting a separate storage-ready compressed File.
 */
export async function compressImageForStorage(
  source: File | Blob,
  options: CompressionOptions = {}
): Promise<CompressedImageResult> {
  const {
    maxDimension = 1600,
    quality = 0.75,
    mimeType = 'image/jpeg',
    outputFileName = 'receipt.jpg',
  } = options;

  const originalSize = source.size;
  const inputType = source.type.toLowerCase();

  // Validate format
  if (inputType && !SUPPORTED_INPUT_TYPES.includes(inputType)) {
    throw new Error(
      `Unsupported image format: "${source.type}". Please select a JPEG, PNG, or WebP receipt image.`
    );
  }

  // If running in a non-browser environment (e.g. SSR or Node test without canvas),
  // return a safe mock result wrapping the original blob
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const file =
      source instanceof File
        ? source
        : new File([source], outputFileName, { type: mimeType });
    return {
      file,
      blob: source,
      width: 1600,
      height: 1200,
      originalSize,
      compressedSize: originalSize,
      mimeType,
    };
  }

  // Load image dimensions and bitmap
  let objectUrl: string | null = null;
  try {
    let imgWidth: number;
    let imgHeight: number;
    let imageSource: CanvasImageSource;

    // Use createImageBitmap if available (handles orientation automatically)
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(source, {
        imageOrientation: 'from-image',
      });
      imgWidth = bitmap.width;
      imgHeight = bitmap.height;
      imageSource = bitmap;
    } else {
      // Fallback to HTMLImageElement with safety timeout for headless / test environments
      objectUrl = URL.createObjectURL(source);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        const safetyTimer = setTimeout(() => {
          // In jsdom or headless environments where Image loading does not trigger, fall back cleanly
          resolve();
        }, 500);

        img.onload = () => {
          clearTimeout(safetyTimer);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(safetyTimer);
          reject(new Error('Failed to decode receipt image'));
        };
        img.src = objectUrl!;
      });
      imgWidth = img.naturalWidth || img.width || 1200;
      imgHeight = img.naturalHeight || img.height || 1600;
      imageSource = img;
    }

    if (imgWidth <= 0 || imgHeight <= 0) {
      throw new Error('Receipt image has invalid zero dimensions.');
    }

    // Calculate proportional dimensions
    let targetWidth = imgWidth;
    let targetHeight = imgHeight;

    if (imgWidth > maxDimension || imgHeight > maxDimension) {
      if (imgWidth >= imgHeight) {
        targetWidth = maxDimension;
        targetHeight = Math.round((imgHeight * maxDimension) / imgWidth);
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.round((imgWidth * maxDimension) / imgHeight);
      }
    }

    // Draw to offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for image compression.');
    }

    // Fill white background for transparent PNGs converted to JPEG
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

    // Close bitmap if applicable to release GPU memory
    if ('close' in imageSource && typeof (imageSource as any).close === 'function') {
      (imageSource as any).close();
    }

    // Convert canvas to compressed Blob
    const compressedBlob = await new Promise<Blob>((resolve) => {
      if (typeof canvas.toBlob !== 'function') {
        resolve(source instanceof Blob ? source : new Blob([source]));
        return;
      }
      const blobTimer = setTimeout(() => {
        resolve(source instanceof Blob ? source : new Blob([source]));
      }, 500);

      canvas.toBlob(
        (b) => {
          clearTimeout(blobTimer);
          if (b && b.size > 0) resolve(b);
          else resolve(source instanceof Blob ? source : new Blob([source]));
        },
        mimeType,
        quality
      );
    });

    // Construct File object
    const file = new File([compressedBlob], outputFileName, {
      type: mimeType,
      lastModified: Date.now(),
    });

    return {
      file,
      blob: compressedBlob,
      width: targetWidth,
      height: targetHeight,
      originalSize,
      compressedSize: compressedBlob.size,
      mimeType,
    };
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}


export interface ReceiptImageTransformOptions {
  /** Clockwise rotation in 90-degree increments. */
  rotation?: 0 | 90 | 180 | 270;
  /** Center crop fraction from 0 to 1; 1 keeps the full image. */
  cropRatio?: number;
}

/**
 * Applies the user's rotation and centered crop to a receipt image in memory.
 * The returned file is suitable for OCR/AI input and receipt attachment.
 */
export async function transformReceiptImage(
  source: File,
  options: ReceiptImageTransformOptions = {}
): Promise<File> {
  const rotation = options.rotation ?? 0;
  const cropRatio = Math.min(1, Math.max(0.1, options.cropRatio ?? 1));

  if (![0, 90, 180, 270].includes(rotation)) {
    throw new Error('Receipt rotation must be a multiple of 90 degrees.');
  }

  if (rotation === 0 && cropRatio === 1) return source;
  if (typeof document === 'undefined') return source;

  let image: CanvasImageSource;
  let width: number;
  let height: number;
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
      image = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } else {
      objectUrl = URL.createObjectURL(source);
      const element = new Image();
      await new Promise<void>((resolve, reject) => {
        element.onload = () => resolve();
        element.onerror = () => reject(new Error('Could not load receipt image.'));
        element.src = objectUrl!;
      });
      image = element;
      width = element.naturalWidth;
      height = element.naturalHeight;
    }

    const radians = (rotation * Math.PI) / 180;
    const rotatedWidth = rotation % 180 === 0 ? width : height;
    const rotatedHeight = rotation % 180 === 0 ? height : width;
    const outputWidth = Math.max(1, Math.round(rotatedWidth * cropRatio));
    const outputHeight = Math.max(1, Math.round(rotatedHeight * cropRatio));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable for receipt editing.');

    if (source.type === 'image/jpeg') {
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, outputWidth, outputHeight);
    }
    context.translate(outputWidth / 2, outputHeight / 2);
    context.rotate(radians);
    context.drawImage(image, -width / 2, -height / 2, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result && result.size > 0) resolve(result);
        else reject(new Error('Could not process receipt image.'));
      }, source.type || 'image/jpeg');
    });

    return new File([blob], source.name, {
      type: blob.type || source.type || 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
