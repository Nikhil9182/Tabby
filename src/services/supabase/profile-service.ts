import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';

export type DbProfile = Database['public']['Tables']['profiles']['Row'];

class ProfileService {
  /**
   * Fetches the current user profile from public.profiles
   */
  async getCurrentProfile(): Promise<DbProfile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await (supabase
      .from('profiles') as any)
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not created yet; auto-initialize
        return this.upsertProfile({
          id: user.id,
          display_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'User',
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          email: user.email || null,
        });
      }
      console.warn('Error fetching current profile:', error.message);
      return null;
    }

    return data as DbProfile;
  }

  /**
   * Upserts a profile
   */
  async upsertProfile(profile: Partial<DbProfile> & { id: string; display_name: string }): Promise<DbProfile> {
    const { data, error } = await (supabase
      .from('profiles') as any)
      .upsert({
        id: profile.id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url || null,
        email: profile.email || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting profile:', error);
      throw new Error(error.message);
    }

    return data as DbProfile;
  }

  /**
   * Updates current user's profile
   */
  async updateCurrentProfile(updates: { displayName?: string; avatarUrl?: string }): Promise<DbProfile> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const updatePayload: any = {
      updated_at: new Date().toISOString(),
    };
    if (updates.displayName !== undefined) updatePayload.display_name = updates.displayName.trim();
    if (updates.avatarUrl !== undefined) updatePayload.avatar_url = updates.avatarUrl || null;

    const { data, error } = await (supabase
      .from('profiles') as any)
      .update(updatePayload)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as DbProfile;
  }

  /**
   * Fetches multiple profiles by ID list
   */
  async getProfiles(ids: string[]): Promise<Record<string, DbProfile>> {
    if (ids.length === 0) return {};

    const uniqueIds = Array.from(new Set(ids));
    const { data, error } = await (supabase
      .from('profiles') as any)
      .select('*')
      .in('id', uniqueIds);

    if (error) {
      console.error('Error fetching profiles:', error);
      return {};
    }

    const map: Record<string, DbProfile> = {};
    for (const p of (data || []) as DbProfile[]) {
      map[p.id] = p;
    }
    return map;
  }
}

export const profileService = new ProfileService();
