import { describe, it, expect, vi, beforeEach } from 'vitest';
import { groupService } from '../group-service';
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

describe('GroupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates group with owner atomically via RPC create_group_with_owner', async () => {
    vi.mocked(supabase.rpc as any).mockResolvedValue({
      data: {
        id: 'grp_new_1',
        name: 'Apartment Roommates',
        default_currency: 'EUR',
      },
      error: null,
    });

    const result = await groupService.createGroup({
      name: 'Apartment Roommates',
      description: 'Monthly bills',
      currency: 'EUR',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_group_with_owner', {
      p_name: 'Apartment Roommates',
      p_description: 'Monthly bills',
      p_currency: 'EUR',
      p_image_url: null,
    });

    expect(result.id).toBe('grp_new_1');
    expect(result.name).toBe('Apartment Roommates');
  });

  it('creates invitation in group_invitations table', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'usr_owner' } as any },
      error: null,
    });

    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'inv_1',
            group_id: 'grp_1',
            invited_email: 'charlie@example.com',
            token: 'hex_token_123',
          },
          error: null,
        }),
      }),
    });

    vi.mocked(supabase.from as any).mockReturnValue({
      insert: insertMock,
    });

    const invitation = await groupService.createInvitation('grp_1', 'charlie@example.com', 'member');

    expect(supabase.from).toHaveBeenCalledWith('group_invitations');
    expect(invitation.id).toBe('inv_1');
    expect(invitation.invited_email).toBe('charlie@example.com');
  });

  it('accepts invitation via RPC accept_group_invitation', async () => {
    vi.mocked(supabase.rpc as any).mockResolvedValue({
      data: { id: 'grp_1', name: 'Apartment' },
      error: null,
    });

    const acceptedGroup = await groupService.acceptInvitation('token_abc_123');

    expect(supabase.rpc).toHaveBeenCalledWith('accept_group_invitation', {
      p_token: 'token_abc_123',
    });
    expect(acceptedGroup.id).toBe('grp_1');
  });
});
