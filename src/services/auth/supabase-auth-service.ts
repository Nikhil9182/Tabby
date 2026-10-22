import { supabase, checkSupabaseConfig } from '@/lib/supabase';
import type { User as SupabaseAuthUser, Session } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

class SupabaseAuthService {
  /**
   * Triggers Supabase OAuth with Google
   */
  async signInWithGoogle(): Promise<{ error: Error | null }> {
    const config = checkSupabaseConfig();
    if (!config.isConfigured) {
      return {
        error: new Error(
          `Supabase is not configured. Missing: ${config.missingKeys.join(', ')}.`
        ),
      };
    }

    try {
      // Calculate callback redirect URL based on current origin and router base path
      const redirectUrl = new URL(
        `${import.meta.env.BASE_URL}auth/callback`,
        window.location.origin
      ).href;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? err : new Error('Failed to initiate Google sign in'),
      };
    }
  }

  /**
   * Signs out current authenticated user
   */
  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    }
  }

  /**
   * Gets current active session
   */
  async getSession(): Promise<Session | null> {
    const config = checkSupabaseConfig();
    if (!config.isConfigured) return null;

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('Error fetching session:', error.message);
        return null;
      }
      return data.session;
    } catch {
      return null;
    }
  }

  /**
   * Synchronizes or retrieves profile from public.profiles table
   */
  async syncUserProfile(authUser: SupabaseAuthUser): Promise<UserProfile> {
    const displayName =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      authUser.email?.split('@')[0] ||
      'User';

    const avatarUrl =
      authUser.user_metadata?.avatar_url ||
      authUser.user_metadata?.picture ||
      undefined;

    const email = authUser.email || '';

    const profile: UserProfile = {
      id: authUser.id,
      email,
      displayName,
      avatarUrl,
    };

    try {
      // Upsert profile in Supabase
      const { error } = await supabase.from('profiles').upsert({
        id: authUser.id,
        display_name: displayName,
        avatar_url: avatarUrl || null,
        email: email || null,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('[Tabby] Non-fatal: profile upsert warning:', error.message);
      }
    } catch (err) {
      console.warn('[Tabby] Failed to sync profile with database:', err);
    }

    return profile;
  }
}

export const supabaseAuthService = new SupabaseAuthService();
