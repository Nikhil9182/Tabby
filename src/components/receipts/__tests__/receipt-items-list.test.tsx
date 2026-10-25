import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReceiptItemsList } from '../receipt-items-list';
import type { ParsedExpenseItem } from '@/domain/receipts/receipt-item-parser';

describe('ReceiptItemsList Component', () => {
  const sampleItems: ParsedExpenseItem[] = [
    {
      name: 'Tandoori chicken',
      quantity: 1,
      lineTotalMinor: 30975,
      unitPriceMinor: 30975,
      assignedUserIds: ['user_nikhil'],
    },
    {
      name: 'Lasooni Dal Tadka',
      quantity: 1,
      lineTotalMinor: 28875,
      unitPriceMinor: 28875,
      assignedUserIds: ['user_nikhil', 'user_neha'],
    },
    {
      name: 'Tandoori Roti all food less spicy',
      quantity: 2,
      lineTotalMinor: 6300,
      unitPriceMinor: 3150,
    },
  ];

  const mockUsers = [
    { id: 'user_nikhil', name: 'Nikhil Bansal' },
    { id: 'user_neha', name: 'Neha Sharma' },
  ];

  it('renders all receipt items with quantity badges and prices', () => {
    render(
      <ReceiptItemsList
        items={sampleItems}
        currency="INR"
        taxMinor={5178}
        users={mockUsers}
        currentUserId="user_nikhil"
      />
    );

    expect(screen.getByText(/Receipt Items \(3\)/i)).toBeTruthy();
    expect(screen.getByText('Tandoori chicken')).toBeTruthy();
    expect(screen.getByText('Lasooni Dal Tadka')).toBeTruthy();
    expect(screen.getByText('Tandoori Roti all food less spicy')).toBeTruthy();
    expect(screen.getByText('2×')).toBeTruthy();

    // Line totals
    expect(screen.getByText('₹309.75')).toBeTruthy();
    expect(screen.getByText('₹288.75')).toBeTruthy();
    expect(screen.getByText('₹63.00')).toBeTruthy();

    // Summary breakdown
    expect(screen.getByText('Taxes & GST')).toBeTruthy();
    expect(screen.getByText('+₹51.78')).toBeTruthy();
  });

  it('renders assigned user badges for items', () => {
    render(
      <ReceiptItemsList
        items={sampleItems}
        currency="INR"
        users={mockUsers}
        currentUserId="user_nikhil"
      />
    );

    // Current user gets resolved to "You"
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    // Other participant gets resolved
    expect(screen.getByText('Neha')).toBeTruthy();
  });

  it('allows collapsing and expanding items list', () => {
    render(
      <ReceiptItemsList
        items={sampleItems}
        currency="INR"
      />
    );

    const toggleBtn = screen.getByText('Collapse');
    fireEvent.click(toggleBtn);

    // Items should now be collapsed
    expect(screen.queryByText('Tandoori chicken')).toBeNull();
    expect(screen.getByText('Show Items')).toBeTruthy();

    // Expand again
    fireEvent.click(screen.getByText('Show Items'));
    expect(screen.getByText('Tandoori chicken')).toBeTruthy();
  });
});
