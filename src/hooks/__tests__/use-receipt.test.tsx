import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReceipt } from '../use-receipt';
import { receiptService } from '@/services/receipts/receipt-service';

vi.mock('@/services/receipts/receipt-service', () => ({
  receiptService: {
    getReceiptForExpense: vi.fn(),
    getReceiptSignedUrl: vi.fn(),
    uploadReceiptAttachment: vi.fn(),
    deleteReceiptAttachment: vi.fn(),
    saveReceiptItems: vi.fn(),
  },
}));

describe('useReceipt hook', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('loads receipt and signs URL for an expense', async () => {
    const mockReceipt = {
      id: 'rec_100',
      expenseId: 'exp_100',
      storagePath: 'user1/exp_100/rec_100.jpg',
      uploadedBy: 'user1',
      originalFilename: 'bill.jpg',
      contentType: 'image/jpeg',
      fileSize: 2048,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      signedUrl: 'https://example.com/signed-bill.jpg',
    };

    vi.mocked(receiptService.getReceiptForExpense).mockResolvedValue(mockReceipt);
    vi.mocked(receiptService.getReceiptSignedUrl).mockResolvedValue('https://example.com/signed-bill.jpg');

    const { result } = renderHook(() => useReceipt('exp_100'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.receipt).toEqual(mockReceipt);
    expect(result.current.signedUrl).toBe('https://example.com/signed-bill.jpg');
    expect(receiptService.getReceiptForExpense).toHaveBeenCalledWith('exp_100');
  });

  it('handles uploading a receipt and refetches receipt data', async () => {
    vi.mocked(receiptService.getReceiptForExpense).mockResolvedValue(null);
    vi.mocked(receiptService.uploadReceiptAttachment).mockResolvedValue({
      id: 'rec_200',
      expenseId: 'exp_200',
      storagePath: 'user1/exp_200/rec_200.jpg',
      uploadedBy: 'user1',
      originalFilename: 'new-bill.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useReceipt('exp_200'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const file = new File(['data'], 'new-bill.jpg', { type: 'image/jpeg' });
    await act(async () => {
      await result.current.uploadReceipt({
        file,
        originalFilename: 'new-bill.jpg',
      });
    });

    expect(receiptService.uploadReceiptAttachment).toHaveBeenCalledWith({
      expenseId: 'exp_200',
      file,
      originalFilename: 'new-bill.jpg',
    });
  });

  it('handles deleting a receipt attachment', async () => {
    vi.mocked(receiptService.getReceiptForExpense).mockResolvedValue({
      id: 'rec_300',
      expenseId: 'exp_300',
      storagePath: 'user1/exp_300/rec_300.jpg',
      uploadedBy: 'user1',
      contentType: 'image/jpeg',
      fileSize: 1024,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(receiptService.deleteReceiptAttachment).mockResolvedValue();

    const { result } = renderHook(() => useReceipt('exp_300'), { wrapper });

    await waitFor(() => {
      expect(result.current.receipt).not.toBeNull();
    });

    await act(async () => {
      await result.current.deleteReceipt({
        receiptId: 'rec_300',
        storagePath: 'user1/exp_300/rec_300.jpg',
      });
    });

    expect(receiptService.deleteReceiptAttachment).toHaveBeenCalledWith(
      'rec_300',
      'user1/exp_300/rec_300.jpg'
    );
  });

  it('handles saving receipt items', async () => {
    vi.mocked(receiptService.saveReceiptItems).mockResolvedValue();

    const { result } = renderHook(() => useReceipt('exp_400'), { wrapper });

    await act(async () => {
      await result.current.saveReceiptItems({
        items: [{ name: 'Salad', quantity: 1, lineTotalMinor: 25000 }],
        currency: 'INR',
      });
    });

    expect(receiptService.saveReceiptItems).toHaveBeenCalledWith({
      expenseId: 'exp_400',
      items: [{ name: 'Salad', quantity: 1, lineTotalMinor: 25000 }],
      currency: 'INR',
    });
  });
});
