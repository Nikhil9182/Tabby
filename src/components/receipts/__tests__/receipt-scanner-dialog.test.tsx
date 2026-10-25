import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceiptScannerDialog } from '../receipt-scanner-dialog';
import { ocrService } from '@/services/ocr/ocr-service';
import { geminiReceiptService } from '@/services/ai/gemini-receipt-service';
import { useGeminiConfig } from '@/hooks/use-gemini-config';
import type { ParsedReceipt } from '@/domain/receipts/types';
import { useExpenses } from '@/hooks/use-expenses';

vi.mock('@/hooks/use-gemini-config', () => ({
  useGeminiConfig: vi.fn(() => ({
    isAvailable: false,
    isAuthenticated: false,
  })),
  useAiScanner: vi.fn(() => ({
    isAvailable: false,
    isAuthenticated: false,
  })),
}));

vi.mock('@/services/ocr/ocr-service', () => ({
  ocrService: {
    recognize: vi.fn(),
  },
  validateReceiptImageFile: vi.fn(() => ({ valid: true })),
}));

vi.mock('@/hooks/use-expenses', () => ({
  useExpenses: vi.fn(),
}));

vi.mock('@/services/image/image-compression', () => ({
  compressImageForStorage: vi.fn().mockResolvedValue({
    file: new File(['compressed'], 'receipt.jpg', { type: 'image/jpeg' }),
    blob: new Blob(['compressed'], { type: 'image/jpeg' }),
    width: 800,
    height: 600,
    originalSize: 1000,
    compressedSize: 500,
    mimeType: 'image/jpeg',
  }),
}));

vi.mock('@/services/receipts/receipt-service', () => ({
  receiptService: {
    uploadReceiptAttachment: vi.fn().mockResolvedValue({ id: 'rec_1', storagePath: 'test/path.jpg' }),
    saveReceiptItems: vi.fn().mockResolvedValue(undefined),
    getReceiptForExpense: vi.fn(),
    getReceiptSignedUrl: vi.fn(),
    deleteReceiptAttachment: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ReceiptScannerDialog Integration Flow', () => {
  let queryClient: QueryClient;
  const mockCreateExpense = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.mocked(useExpenses).mockReturnValue({
      createExpense: mockCreateExpense,
      isCreating: false,
    } as any);

    mockCreateExpense.mockResolvedValue({ id: 'exp_123', description: 'Test' });
  });

  const participants = [
    { id: 'user_alice', name: 'Alice' },
    { id: 'user_bob', name: 'Bob' },
  ];

  const renderComponent = (props: Partial<React.ComponentProps<typeof ReceiptScannerDialog>> = {}) =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceiptScannerDialog
            isOpen={true}
            onClose={vi.fn()}
            contextType="direct"
            friendId="user_bob"
            defaultCurrency="INR"
            contextCurrency="INR"
            participants={participants}
            currentUserId="user_alice"
            paidBy="user_alice"
            {...props}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('renders step 1 (upload) initially and triggers OCR on file selection', async () => {
    const fixtureText = `
      DOMINOS PIZZA
      Date: 2026-10-24
      Margherita Pizza 350.00
      Garlic Bread 150.00
      Total 500.00
    `;

    vi.mocked(ocrService.recognize).mockResolvedValue({
      text: fixtureText,
      lines: fixtureText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 95, lineNumber: idx + 1 })),
      confidence: 95,
    });

    renderComponent();

    expect(screen.getByText(/Upload Receipt Photo/i)).toBeTruthy();

    // Find hidden file input and simulate uploading photo
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const file = new File(['dummy'], 'receipt.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    // Should transition to Step 2: Review Scanned Receipt
    await waitFor(() => {
      expect(screen.getByText(/Review Scanned Details/i)).toBeTruthy();
    });

    expect(screen.getByDisplayValue(/DOMINOS PIZZA/i)).toBeTruthy();
    expect(screen.getByDisplayValue(/Margherita Pizza/i)).toBeTruthy();
    expect(screen.getByDisplayValue(/Garlic Bread/i)).toBeTruthy();
  });

  it('allows user to review and edit extracted details and proceed to split', async () => {
    const fixtureText = `
      BURGER KING
      Date: 2026-10-24
      Veg Whopper 200.00
      Fries 100.00
      Total 300.00
    `;

    vi.mocked(ocrService.recognize).mockResolvedValue({
      text: fixtureText,
      lines: fixtureText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 95, lineNumber: idx + 1 })),
      confidence: 95,
    });

    renderComponent();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'receipt.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/Review Scanned Details/i)).toBeTruthy();
    });

    // Click Proceed to Split
    const proceedBtn = screen.getByRole('button', { name: /Proceed to Split/i });
    await userEvent.click(proceedBtn);

    // Should transition to Step 3: Split
    expect(screen.getByText(/Who is sharing this bill/i)).toBeTruthy();
    expect(screen.getByText(/Split Equally/i)).toBeTruthy();
    expect(screen.getByText(/Assign Items/i)).toBeTruthy();
  });

  it('supports Item Assignment mode, warns on unassigned items, and saves confirmed expense', async () => {
    const fixtureText = `
      CAFE
      Date: 2026-10-24
      Coffee 100.00
      Cookie 50.00
      Total 150.00
    `;

    vi.mocked(ocrService.recognize).mockResolvedValue({
      text: fixtureText,
      lines: fixtureText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 95, lineNumber: idx + 1 })),
      confidence: 95,
    });

    renderComponent();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'receipt.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/Review Scanned Details/i)).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: /Proceed to Split/i }));

    // Switch to Assign Items tab
    const assignItemsTab = screen.getByRole('button', { name: /Assign Items/i });
    await userEvent.click(assignItemsTab);

    // Check warning for unassigned items initially
    expect(screen.getAllByText(/unassigned/i).length).toBeGreaterThan(0);

    // Assign items using "Split all items with everyone" button
    const splitAllBtn = screen.getByRole('button', { name: /Split all items with everyone/i });
    await userEvent.click(splitAllBtn);

    // Save Scanned Expense button should now be enabled
    const saveBtn = screen.getByRole('button', { name: /Save Scanned Expense/i });
    expect(saveBtn.hasAttribute('disabled')).toBe(false);

    await userEvent.click(saveBtn);

    // Should call createExpense
    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledTimes(1);
    });

    const callArg = mockCreateExpense.mock.calls[0][0];
    expect(callArg.amountMinor).toBe(15000);
    expect(callArg.sourceType).toBe('direct');
    expect(callArg.friendId).toBe('user_bob');
    expect(callArg.splits.length).toBe(2);
    // 75 + 75 = 150
    expect(callArg.splits[0].shareMinor + callArg.splits[1].shareMinor).toBe(15000);

    expect(mockNavigate).toHaveBeenCalledWith('/friends?friendId=user_bob');
  });

  it('supports group context and creates group expense correctly', async () => {
    const fixtureText = `
      RESTAURANT
      Date: 2026-10-24
      Pasta 300.00
      Total 300.00
    `;

    vi.mocked(ocrService.recognize).mockResolvedValue({
      text: fixtureText,
      lines: fixtureText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 95, lineNumber: idx + 1 })),
      confidence: 95,
    });

    renderComponent({
      contextType: 'group',
      groupId: 'group_lunch',
      friendId: undefined,
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'receipt.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText(/Review Scanned Details/i)).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: /Proceed to Split/i }));

    const saveBtn = screen.getByRole('button', { name: /Save Scanned Expense/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledTimes(1);
    });

    const callArg = mockCreateExpense.mock.calls[0][0];
    expect(callArg.amountMinor).toBe(30000);
    expect(callArg.sourceType).toBe('group');
    expect(callArg.groupId).toBe('group_lunch');
    expect(mockNavigate).toHaveBeenCalledWith('/groups/group_lunch');
  });

  it('supports cloud scanning when user is authenticated with cloud AI available', async () => {
    vi.mocked(useGeminiConfig).mockReturnValue({
      isAvailable: true,
      isAuthenticated: true,
    });

    const mockParsedReceipt: ParsedReceipt = {
      merchantName: 'AI Bistro',
      date: '2026-10-24',
      currency: 'INR',
      itemSubtotalMinor: 45000,
      taxes: [],
      taxMinor: 0,
      discountMinor: 0,
      tipMinor: 0,
      serviceChargeMinor: 0,
      totalMinor: 45000,
      items: [
        { id: 'item_1', name: 'Pizza', quantity: 1, unitPriceMinor: 45000, lineTotalMinor: 45000 },
      ],
      unassignedLines: [],
      rawConfidence: 99,
      isTotalConfirmed: true,
    };

    vi.spyOn(geminiReceiptService, 'parseReceipt').mockResolvedValue(mockParsedReceipt);

    renderComponent();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'receipt.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(geminiReceiptService.parseReceipt).toHaveBeenCalled();
      expect(screen.getByDisplayValue('AI Bistro')).toBeTruthy();
      expect(screen.getByDisplayValue('Pizza')).toBeTruthy();
    });
  });

  it('provides seamless automatic fallback to Local OCR when cloud scanning encounters an error or timeout', async () => {
    vi.mocked(useGeminiConfig).mockReturnValue({
      isAvailable: true,
      isAuthenticated: true,
    });

    vi.spyOn(geminiReceiptService, 'parseReceipt').mockRejectedValue(
      new Error('AI rate limit reached or high demand')
    );

    const fixtureText = `
      DOMINOS PIZZA
      Date: 2026-10-24
      Margherita Pizza 350.00
      Total 350.00
    `;

    vi.mocked(ocrService.recognize).mockResolvedValue({
      text: fixtureText,
      lines: fixtureText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text, idx) => ({ text, confidence: 90, lineNumber: idx + 1 })),
      confidence: 90,
    });

    renderComponent();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'receipt.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    // Verify OCR was automatically triggered without requiring any user click
    await waitFor(() => {
      expect(ocrService.recognize).toHaveBeenCalled();
      expect(screen.getByText(/Review Scanned Details/i)).toBeTruthy();
      expect(screen.getByDisplayValue('Margherita Pizza')).toBeTruthy();
    });
  });
});
