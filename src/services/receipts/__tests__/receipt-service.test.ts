import { describe, it, expect, vi, beforeEach } from 'vitest';
import { receiptService } from '../receipt-service';
import { guestStore } from '@/services/guest/guest-store';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  const mockStorage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test/path.jpg' }, error: null }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.mock/receipts/signed-url' },
        error: null,
      }),
    }),
  };

  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'rec_123',
        expense_id: 'exp_123',
        storage_path: 'user_1/exp_123/rec_123.jpg',
        uploaded_by: 'user_1',
        original_filename: 'receipt.jpg',
        content_type: 'image/jpeg',
        file_size: 1024,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'rec_123',
        expense_id: 'exp_123',
        storage_path: 'user_1/exp_123/rec_123.jpg',
        uploaded_by: 'user_1',
        original_filename: 'receipt.jpg',
        content_type: 'image/jpeg',
        file_size: 1024,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      error: null,
    }),
  });

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } }),
      },
      storage: mockStorage,
      from: mockFrom,
    },
  };
});

describe('ReceiptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Guest Mode', () => {
    beforeEach(() => {
      vi.spyOn(guestStore, 'isGuestMode').mockReturnValue(true);
    });

    it('saves, retrieves, and deletes receipt in guest store', async () => {
      const file = new File(['fake content'], 'guest-receipt.jpg', { type: 'image/jpeg' });
      vi.spyOn(guestStore, 'saveReceipt').mockResolvedValue({
        id: 'guest_rec_1',
        expenseId: 'exp_g1',
        storagePath: 'guest/user/exp_g1/guest_rec_1.jpg',
        uploadedBy: 'guest_user',
        originalFilename: 'guest-receipt.jpg',
        contentType: 'image/jpeg',
        fileSize: file.size,
        dataUrl: 'data:image/jpeg;base64,dummy',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.spyOn(guestStore, 'getReceiptForExpense').mockResolvedValue({
        id: 'guest_rec_1',
        expenseId: 'exp_g1',
        storagePath: 'guest/user/exp_g1/guest_rec_1.jpg',
        uploadedBy: 'guest_user',
        originalFilename: 'guest-receipt.jpg',
        contentType: 'image/jpeg',
        fileSize: file.size,
        dataUrl: 'data:image/jpeg;base64,dummy',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.spyOn(guestStore, 'deleteReceipt').mockResolvedValue(undefined);

      const uploaded = await receiptService.uploadReceiptAttachment({
        expenseId: 'exp_g1',
        file,
        originalFilename: 'guest-receipt.jpg',
      });

      expect(uploaded.id).toBe('guest_rec_1');
      expect(uploaded.signedUrl).toBe('data:image/jpeg;base64,dummy');

      const fetched = await receiptService.getReceiptForExpense('exp_g1');
      expect(fetched?.id).toBe('guest_rec_1');

      await receiptService.deleteReceiptAttachment('guest_rec_1', uploaded.storagePath);
      expect(guestStore.deleteReceipt).toHaveBeenCalledWith('guest_rec_1');
    });

    it('saves receipt items in guest store', async () => {
      vi.spyOn(guestStore, 'saveReceiptItems').mockResolvedValue({
        id: 'guest_rec_items',
        expenseId: 'exp_g2',
        storagePath: 'guest/user/exp_g2/items.jpg',
        uploadedBy: 'guest_user',
        contentType: 'application/json',
        fileSize: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [{ name: 'Pizza', quantity: 1, lineTotalMinor: 50000 }],
      });

      await receiptService.saveReceiptItems({
        expenseId: 'exp_g2',
        items: [{ name: 'Pizza', quantity: 1, lineTotalMinor: 50000 }],
        currency: 'INR',
      });

      expect(guestStore.saveReceiptItems).toHaveBeenCalledWith('exp_g2', expect.objectContaining({
        items: [{ name: 'Pizza', quantity: 1, lineTotalMinor: 50000 }],
      }));
    });
  });

  describe('Cloud Authenticated Mode', () => {
    beforeEach(() => {
      vi.spyOn(guestStore, 'isGuestMode').mockReturnValue(false);
    });

    it('saves receipt items to cloud storage as json payload', async () => {
      await receiptService.saveReceiptItems({
        expenseId: 'exp_123',
        items: [{ name: 'Biryani', quantity: 1, lineTotalMinor: 40000 }],
        taxMinor: 2000,
        currency: 'INR',
      });

      expect(supabase.storage.from).toHaveBeenCalledWith('receipts');
    });

    it('uploads receipt to storage and registers record in expense_receipts', async () => {
      const file = new File(['image data'], 'restaurant.jpg', { type: 'image/jpeg' });

      const receipt = await receiptService.uploadReceiptAttachment({
        expenseId: 'exp_123',
        file,
        originalFilename: 'restaurant.jpg',
      });

      expect(supabase.storage.from).toHaveBeenCalledWith('receipts');
      expect(receipt.id).toBe('rec_123');
      expect(receipt.storagePath).toContain('user_1/exp_123');
      expect(receipt.signedUrl).toBe('https://storage.mock/receipts/signed-url');
    });

    it('retrieves receipt and generates signed url', async () => {
      const receipt = await receiptService.getReceiptForExpense('exp_123');
      expect(receipt).not.toBeNull();
      expect(receipt?.id).toBe('rec_123');
      expect(receipt?.signedUrl).toBe('https://storage.mock/receipts/signed-url');
    });

    it('deletes receipt and cleans up storage object without deleting expense', async () => {
      await receiptService.deleteReceiptAttachment('rec_123', 'user_1/exp_123/rec_123.jpg');
      expect(supabase.from).toHaveBeenCalledWith('expense_receipts');
      expect(supabase.storage.from).toHaveBeenCalledWith('receipts');
    });
  });
});
