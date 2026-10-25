import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ReceiptViewerModal } from '../receipt-viewer-modal';
import type { ReceiptAttachment } from '@/services/receipts/receipt-service';

describe('ReceiptViewerModal', () => {
  const mockReceipt: ReceiptAttachment = {
    id: 'rec_1',
    expenseId: 'exp_1',
    storagePath: 'user1/exp_1/rec_1.jpg',
    uploadedBy: 'user1',
    originalFilename: 'dinner_receipt.jpg',
    contentType: 'image/jpeg',
    fileSize: 1024 * 350, // 350 KB
    createdAt: '2026-10-25T12:00:00.000Z',
    updatedAt: '2026-10-25T12:00:00.000Z',
    signedUrl: 'https://supabase.co/storage/v1/object/sign/receipts/user1/exp_1/rec_1.jpg?token=abc',
  };

  it('renders modal with receipt filename and file size', () => {
    render(
      <ReceiptViewerModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        expenseDescription="Team Dinner"
      />
    );

    expect(screen.getByText('dinner_receipt.jpg')).toBeTruthy();
    expect(screen.getByText(/350.0 KB/i)).toBeTruthy();
    expect(screen.getByText(/Team Dinner/i)).toBeTruthy();
  });

  it('handles zoom, rotate, and reset actions', () => {
    render(
      <ReceiptViewerModal
        isOpen={true}
        onClose={vi.fn()}
        receipt={mockReceipt}
        expenseDescription="Team Dinner"
      />
    );

    // Zoom in
    const zoomInBtn = screen.getByTitle('Zoom In');
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('125%')).toBeTruthy();

    // Zoom out
    const zoomOutBtn = screen.getByTitle('Zoom Out');
    fireEvent.click(zoomOutBtn);
    expect(screen.getByText('100%')).toBeTruthy();

    // Rotate
    const rotateBtn = screen.getByTitle('Rotate 90°');
    fireEvent.click(rotateBtn);

    // Reset
    const resetBtn = screen.getByTitle('Reset View');
    fireEvent.click(resetBtn);
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('requires confirmation before executing deletion', async () => {
    const onDeleteMock = vi.fn().mockResolvedValue(undefined);
    const onCloseMock = vi.fn();

    render(
      <ReceiptViewerModal
        isOpen={true}
        onClose={onCloseMock}
        receipt={mockReceipt}
        expenseDescription="Team Dinner"
        onDeleteReceipt={onDeleteMock}
      />
    );

    // Click "Delete Receipt" button
    const deleteBtn = screen.getByText('Delete Receipt');
    fireEvent.click(deleteBtn);

    // Now confirmation buttons should appear
    expect(screen.getByText('Confirm Delete')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();

    // Clicking Confirm Delete executes onDeleteReceipt
    fireEvent.click(screen.getByText('Confirm Delete'));

    await waitFor(() => {
      expect(onDeleteMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
