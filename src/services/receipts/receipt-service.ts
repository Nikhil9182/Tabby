import { supabase } from '@/lib/supabase';
import { guestStore } from '@/services/guest/guest-store';
import { v4 as uuidv4 } from 'uuid';

export interface ReceiptAttachment {
  id: string;
  expenseId: string;
  storagePath: string;
  uploadedBy: string;
  originalFilename?: string | null;
  contentType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  signedUrl?: string;
}

export interface UploadReceiptInput {
  expenseId: string;
  file: File | Blob;
  originalFilename?: string;
}

const STORAGE_BUCKET = 'receipts';
const SIGNED_URL_DEFAULT_EXPIRY = 3600; // 1 hour

class ReceiptService {
  /**
   * Uploads a compressed storage receipt image and associates it with an expense.
   */
  async uploadReceiptAttachment(input: UploadReceiptInput): Promise<ReceiptAttachment> {
    const { expenseId, file, originalFilename } = input;

    // 1. Guest Mode support
    if (guestStore.isGuestMode()) {
      const guestRecord = await guestStore.saveReceipt({
        expenseId,
        file,
        originalFilename,
      });
      return {
        id: guestRecord.id,
        expenseId: guestRecord.expenseId,
        storagePath: guestRecord.storagePath,
        uploadedBy: guestRecord.uploadedBy,
        originalFilename: guestRecord.originalFilename,
        contentType: guestRecord.contentType,
        fileSize: guestRecord.fileSize,
        createdAt: guestRecord.createdAt,
        updatedAt: guestRecord.updatedAt,
        signedUrl: guestRecord.dataUrl,
      };
    }

    // 2. Authenticated Cloud Storage
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('You must be signed in to attach receipts.');
    }

    const receiptId = uuidv4();
    const contentType = file.type || 'image/jpeg';
    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
      ? 'webp'
      : 'jpg';

    // Predictable, user-scoped collision-resistant storage path: <userId>/<expenseId>/<receiptId>.<ext>
    const storagePath = `${user.id}/${expenseId}/${receiptId}.${ext}`;

    // Upload to private Supabase Storage bucket
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      throw new Error(`Failed to upload receipt image: ${uploadError.message}`);
    }

    // Insert database record into public.expense_receipts
    try {
      const { data: dbData, error: dbError } = await (supabase
        .from('expense_receipts') as any)
        .insert({
          id: receiptId,
          expense_id: expenseId,
          storage_path: storagePath,
          uploaded_by: user.id,
          original_filename:
            originalFilename || (file instanceof File ? file.name : `receipt.${ext}`),
          content_type: contentType,
          file_size: file.size,
        })
        .select()
        .single();

      if (dbError) {
        // Rollback uploaded file if DB association failed to prevent orphaned storage
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw new Error(`Failed to save receipt record: ${dbError.message}`);
      }

      // Generate initial signed URL for display
      const signedUrl = await this.getReceiptSignedUrl(storagePath);

      return {
        id: dbData.id,
        expenseId: dbData.expense_id,
        storagePath: dbData.storage_path,
        uploadedBy: dbData.uploaded_by,
        originalFilename: dbData.original_filename,
        contentType: dbData.content_type,
        fileSize: dbData.file_size,
        createdAt: dbData.created_at,
        updatedAt: dbData.updated_at,
        signedUrl,
      };
    } catch (err: any) {
      // Clean up orphaned storage object
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      throw err;
    }
  }

  /**
   * Retrieves the receipt attachment for a given expense if authorized.
   */
  async getReceiptForExpense(expenseId: string): Promise<ReceiptAttachment | null> {
    if (guestStore.isGuestMode()) {
      const guestRecord = await guestStore.getReceiptForExpense(expenseId);
      if (!guestRecord) return null;
      return {
        id: guestRecord.id,
        expenseId: guestRecord.expenseId,
        storagePath: guestRecord.storagePath,
        uploadedBy: guestRecord.uploadedBy,
        originalFilename: guestRecord.originalFilename,
        contentType: guestRecord.contentType,
        fileSize: guestRecord.fileSize,
        createdAt: guestRecord.createdAt,
        updatedAt: guestRecord.updatedAt,
        signedUrl: guestRecord.dataUrl,
      };
    }

    const { data, error } = await (supabase
      .from('expense_receipts') as any)
      .select('*')
      .eq('expense_id', expenseId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching receipt for expense:', error);
      return null;
    }

    if (!data) return null;

    let signedUrl: string | undefined;
    try {
      signedUrl = await this.getReceiptSignedUrl(data.storage_path);
    } catch (err) {
      console.warn('Failed to obtain signed URL for receipt:', err);
    }

    return {
      id: data.id,
      expenseId: data.expense_id,
      storagePath: data.storage_path,
      uploadedBy: data.uploaded_by,
      originalFilename: data.original_filename,
      contentType: data.content_type,
      fileSize: data.file_size,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      signedUrl,
    };
  }

  /**
   * Generates a temporary authorized signed URL to display a private receipt.
   */
  async getReceiptSignedUrl(
    storagePath: string,
    expiresInSeconds: number = SIGNED_URL_DEFAULT_EXPIRY
  ): Promise<string> {
    if (guestStore.isGuestMode() || storagePath.startsWith('guest/')) {
      // In guest mode, storagePath is either a dataUrl or handled by guest store
      return storagePath;
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Failed to create signed URL for receipt');
    }

    return data.signedUrl;
  }

  /**
   * Deletes a receipt attachment safely without touching the expense or splits.
   */
  async deleteReceiptAttachment(
    receiptId: string,
    storagePath: string
  ): Promise<void> {
    if (guestStore.isGuestMode()) {
      await guestStore.deleteReceipt(receiptId);
      return;
    }

    // Delete database record first
    const { error: dbError } = await (supabase
      .from('expense_receipts') as any)
      .delete()
      .eq('id', receiptId);

    if (dbError) {
      throw new Error(`Failed to delete receipt record: ${dbError.message}`);
    }

    // Delete storage object
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch (err) {
      console.warn('Failed to remove storage object after DB delete:', err);
    }
  }
}

export const receiptService = new ReceiptService();
