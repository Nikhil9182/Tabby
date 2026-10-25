import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ReceiptItemsEditor, type ReceiptItemRowState } from '../receipt-items-editor';

describe('ReceiptItemsEditor Component', () => {
  const initialItems: ReceiptItemRowState[] = [
    {
      id: 'item_1',
      name: 'Tandoori chicken',
      quantity: 1,
      lineTotalStr: '309.75',
      assignedUserIds: ['user_nikhil'],
    },
    {
      id: 'item_2',
      name: 'Tandoori Roti',
      quantity: 2,
      lineTotalStr: '63.00',
      assignedUserIds: ['user_nikhil', 'user_neha'],
    },
  ];

  const participants = [
    { id: 'user_nikhil', name: 'Nikhil Bansal' },
    { id: 'user_neha', name: 'Neha Sharma' },
  ];

  it('renders all item rows with name, quantity, and price inputs', () => {
    render(
      <ReceiptItemsEditor
        items={initialItems}
        taxStr="51.78"
        discountStr="0"
        tipStr="0"
        currency="INR"
        participants={participants}
        currentUserId="user_nikhil"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('Tandoori chicken')).toBeTruthy();
    expect(screen.getByDisplayValue('309.75')).toBeTruthy();
    expect(screen.getByDisplayValue('Tandoori Roti')).toBeTruthy();
    expect(screen.getByDisplayValue('63.00')).toBeTruthy();
    expect(screen.getByDisplayValue('51.78')).toBeTruthy();
  });

  it('calls onChange when adding a new item', () => {
    const onChangeMock = vi.fn();

    render(
      <ReceiptItemsEditor
        items={initialItems}
        taxStr="51.78"
        discountStr="0"
        tipStr="0"
        currency="INR"
        participants={participants}
        currentUserId="user_nikhil"
        onChange={onChangeMock}
      />
    );

    const addBtn = screen.getByText('Add Item');
    fireEvent.click(addBtn);

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const updatedPayload = onChangeMock.mock.calls[0][0];
    expect(updatedPayload.items).toHaveLength(3);
  });

  it('calls onChange when removing an item', () => {
    const onChangeMock = vi.fn();

    render(
      <ReceiptItemsEditor
        items={initialItems}
        taxStr="51.78"
        discountStr="0"
        tipStr="0"
        currency="INR"
        participants={participants}
        currentUserId="user_nikhil"
        onChange={onChangeMock}
      />
    );

    const removeBtns = screen.getAllByTitle('Remove Item');
    fireEvent.click(removeBtns[0]);

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const updatedPayload = onChangeMock.mock.calls[0][0];
    expect(updatedPayload.items).toHaveLength(1);
    expect(updatedPayload.items[0].name).toBe('Tandoori Roti');
  });

  it('toggles participant assignment on an item', () => {
    const onChangeMock = vi.fn();

    render(
      <ReceiptItemsEditor
        items={initialItems}
        taxStr="51.78"
        discountStr="0"
        tipStr="0"
        currency="INR"
        participants={participants}
        currentUserId="user_nikhil"
        onChange={onChangeMock}
      />
    );

    // On item 1 ('Tandoori chicken'), Neha is not selected. Clicking her button should add her
    const nehaButtons = screen.getAllByText('Neha');
    fireEvent.click(nehaButtons[0]);

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const updatedPayload = onChangeMock.mock.calls[0][0];
    expect(updatedPayload.items[0].assignedUserIds).toContain('user_neha');
  });
});
