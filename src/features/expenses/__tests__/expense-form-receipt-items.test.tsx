import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExpenseForm } from '../expense-form';
import { useExpense } from '@/hooks/use-expenses';
import { useReceipt } from '@/hooks/use-receipt';
import { receiptService } from '@/services/receipts/receipt-service';

vi.mock('@/hooks/use-users', () => ({
  useCurrentUser: () => ({
    user: { id: 'current_user', name: 'Current User', email: 'me@example.com' },
  }),
  useUsers: () => ({
    users: [
      { id: 'current_user', name: 'Current User', email: 'me@example.com' },
      { id: 'user_neha', name: 'Neha', email: 'neha@example.com' },
    ],
  }),
}));

vi.mock('@/hooks/use-friends', () => ({
  useFriends: () => ({
    friends: [
      { id: 'f1', userId: 'user_neha', friend: { id: 'user_neha', name: 'Neha', email: 'neha@example.com' } },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-groups', () => ({
  useGroups: () => ({
    groups: [],
    isLoading: false,
  }),
  useGroup: () => ({
    group: null,
    members: [],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-expenses', async () => {
  const actual = await vi.importActual<any>('@/hooks/use-expenses');
  return {
    ...actual,
    useExpense: vi.fn(),
    useExpenses: vi.fn(() => ({
      createExpense: vi.fn(),
      updateExpense: vi.fn().mockResolvedValue({ id: 'exp_liquor' }),
      isCreating: false,
      isUpdating: false,
    })),
  };
});

vi.mock('@/hooks/use-receipt', () => ({
  useReceipt: vi.fn(),
}));

vi.mock('@/services/receipts/receipt-service', () => ({
  receiptService: {
    saveReceiptItems: vi.fn().mockResolvedValue(undefined),
    uploadReceiptAttachment: vi.fn().mockResolvedValue({ id: 'rec_1' }),
    getReceiptForExpense: vi.fn(),
    getReceiptSignedUrl: vi.fn(),
    deleteReceiptAttachment: vi.fn(),
  },
}));

describe('ExpenseForm Receipt Items Editing Flow', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  const mockExistingExpense = {
    id: 'exp_liquor',
    description: 'Liquor Street (Receipt)',
    originalAmountMinor: 113853,
    originalCurrency: 'INR',
    currency: 'INR',
    expenseDate: '2018-05-20T00:00:00.000Z',
    groupId: undefined,
    friendId: 'user_neha',
    paidBy: 'current_user',
    splitType: 'exact' as const,
    participants: ['current_user', 'user_neha'],
    contextType: 'direct' as const,
    sourceType: 'direct' as const,
    // Legacy notes containing items from earlier OCR run
    notes:
      'Items: Tandoori chicken: ₹309.75, Lasooni Dal Tadka: ₹288.75, HYDERABADI MURG BIRYANI |: ₹393.75, 2x Tandoori Roti all food less spicy: ₹63.00, Tandoori Roti: ₹31.50 | Tax: ₹51.78',
  };

  const mockSplits = [
    { id: 's1', userId: 'current_user', shareMinor: 78652 },
    { id: 's2', userId: 'user_neha', shareMinor: 35201 },
  ];

  it('loads receipt items into the itemized editor and cleans the notes textarea', async () => {
    vi.mocked(useExpense).mockReturnValue({
      expense: mockExistingExpense,
      splits: mockSplits,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useReceipt).mockReturnValue({
      receipt: {
        id: 'rec_1',
        expenseId: 'exp_liquor',
        storagePath: 'user/path.jpg',
        uploadedBy: 'current_user',
        contentType: 'image/jpeg',
        fileSize: 1000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [
          { name: 'Tandoori chicken', quantity: 1, lineTotalMinor: 30975 },
          { name: 'Lasooni Dal Tadka', quantity: 1, lineTotalMinor: 28875 },
          { name: 'HYDERABADI MURG BIRYANI', quantity: 1, lineTotalMinor: 39375 },
          { name: 'Tandoori Roti all food less spicy', quantity: 2, lineTotalMinor: 6300 },
          { name: 'Tandoori Roti', quantity: 1, lineTotalMinor: 3150 },
        ],
        taxMinor: 5178,
      },
      signedUrl: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      uploadReceipt: vi.fn(),
      isUploading: false,
      deleteReceipt: vi.fn(),
      isDeleting: false,
      saveReceiptItems: vi.fn(),
      isSavingItems: false,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/expenses/exp_liquor/edit']}>
          <Routes>
            <Route path="/expenses/:id/edit" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // 1. Verify Itemized Receipt editor is visible
    expect(await screen.findByText('Receipt Items & Breakdown')).toBeTruthy();
    expect(screen.getByDisplayValue('Tandoori chicken')).toBeTruthy();
    expect(screen.getByDisplayValue('Lasooni Dal Tadka')).toBeTruthy();
    expect(screen.getByDisplayValue('HYDERABADI MURG BIRYANI')).toBeTruthy();
    expect(screen.getByDisplayValue('51.78')).toBeTruthy(); // Tax

    // 2. Verify Notes (Optional) textarea does NOT contain the raw items string
    const notesInput = screen.getByPlaceholderText('Add any remarks or personal notes...') as HTMLTextAreaElement;
    expect(notesInput.value).toBe('');
    expect(notesInput.value).not.toContain('Items: Tandoori chicken');
  });
});
