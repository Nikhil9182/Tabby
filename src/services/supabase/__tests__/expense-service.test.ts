import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expenseService } from '../expense-service';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      rpc: vi.fn(),
      from: vi.fn(),
    },
  };
});

describe('ExpenseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates group expense atomically via RPC create_group_expense_with_splits', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'usr_alice' } as any },
      error: null,
    });

    vi.mocked(supabase.rpc as any).mockResolvedValue({
      data: {
        expense: { id: 'exp_1', description: 'Team Dinner' },
        splits: [],
      },
      error: null,
    });

    const result = await expenseService.createExpense({
      groupId: 'grp_trip',
      description: 'Team Dinner',
      amountMinor: 3000,
      currency: 'USD',
      paidBy: 'usr_alice',
      sourceType: 'group',
      splitType: 'equal',
      splits: [
        { userId: 'usr_alice', shareMinor: 1500 },
        { userId: 'usr_bob', shareMinor: 1500 },
      ],
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_group_expense_with_splits', expect.objectContaining({
      p_group_id: 'grp_trip',
      p_description: 'Team Dinner',
      p_amount_minor: 3000,
      p_currency: 'USD',
      p_paid_by: 'usr_alice',
    }));

    expect(result.id).toBe('exp_1');
    expect(result.description).toBe('Team Dinner');
  });

  it('creates personal expense in personal_expenses table', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'usr_alice' } as any },
      error: null,
    });

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'pers_1', description: 'Coffee' },
          error: null,
        }),
      }),
    });

    vi.mocked(supabase.from as any).mockReturnValue({
      insert: insertMock,
    });

    const result = await expenseService.createExpense({
      description: 'Coffee',
      amountMinor: 450,
      currency: 'USD',
      paidBy: 'usr_alice',
      sourceType: 'personal',
      splits: [{ userId: 'usr_alice', shareMinor: 450 }],
    });

    expect(supabase.from).toHaveBeenCalledWith('personal_expenses');
    expect(result.id).toBe('pers_1');
    expect(result.description).toBe('Coffee');
  });

  it('fetches and maps splits by expense ID', async () => {
    const mockSplits = [
      { id: 's1', group_expense_id: 'exp_1', user_id: 'u1', share_minor: 500 },
      { id: 's2', group_expense_id: 'exp_1', user_id: 'u2', share_minor: 500 },
    ];

    vi.mocked(supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: mockSplits, error: null }),
      }),
    });

    const splitsMap = await expenseService.getSplitsForExpenses(['exp_1']);

    expect(splitsMap['exp_1']).toHaveLength(2);
    expect(splitsMap['exp_1'][0].share_minor).toBe(500);
  });
});
