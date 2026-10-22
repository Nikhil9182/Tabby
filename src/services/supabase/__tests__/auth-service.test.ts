import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseAuthService } from '@/services/auth/supabase-auth-service';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
      },
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      })),
    },
    checkSupabaseConfig: vi.fn(() => ({
      isConfigured: true,
      missingKeys: [],
    })),
  };
});

describe('SupabaseAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers signInWithOAuth with google provider and redirect URL', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2' },
      error: null,
    });

    const result = await supabaseAuthService.signInWithGoogle();

    expect(result.error).toBeNull();
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }),
      })
    );
  });

  it('handles signInWithOAuth errors gracefully', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'google', url: null },
      error: new Error('OAuth error') as any,
    });

    const result = await supabaseAuthService.signInWithGoogle();

    expect(result.error).not.toBeNull();
    expect(result.error?.message).toContain('OAuth error');
  });

  it('calls supabase.auth.signOut on signOut', async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

    await supabaseAuthService.signOut();

    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('synchronizes user profile to public.profiles table', async () => {
    const mockAuthUser = {
      id: 'usr_123_uuid',
      email: 'alex@example.com',
      user_metadata: {
        full_name: 'Alex Kumar',
        avatar_url: 'https://example.com/avatar.jpg',
      },
    } as any;

    const profile = await supabaseAuthService.syncUserProfile(mockAuthUser);

    expect(profile.id).toBe('usr_123_uuid');
    expect(profile.displayName).toBe('Alex Kumar');
    expect(profile.email).toBe('alex@example.com');
    expect(profile.avatarUrl).toBe('https://example.com/avatar.jpg');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
  });
});
