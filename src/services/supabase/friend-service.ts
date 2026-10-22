import { supabase } from '@/lib/supabase';
import type { Friendship, FriendSummary } from '@/domain/models/types';
import type { DbProfile } from './profile-service';

export interface AddFriendResult {
  friendship: Friendship;
  friendProfile: DbProfile;
  isNewUser: boolean;
}

export type DbFriendProfile = DbProfile & {
  friendshipId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  picture?: string;
};

export class FriendService {
  /**
   * Fetches all accepted friends for the current user
   */
  async getFriends(userId: string): Promise<DbFriendProfile[]> {
    // Query friendships involving this user
    const { data: friendships, error: friendError } = await (supabase
      .from('friendships') as any)
      .select('*')
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
      .eq('status', 'accepted');

    if (friendError) {
      // Table might not exist yet if migration pending; return graceful fallback
      console.warn('Error fetching friendships:', friendError.message);
      return [];
    }

    if (!friendships || friendships.length === 0) {
      return [];
    }

    // Collect the friend's user ID for each friendship
    const friendIdToFriendshipMap = new Map<string, string>();
    const friendIds: string[] = [];

    for (const f of friendships) {
      const otherId = f.user_id_1 === userId ? f.user_id_2 : f.user_id_1;
      friendIdToFriendshipMap.set(otherId, f.id);
      friendIds.push(otherId);
    }

    // Fetch friend profiles
    const { data: profiles, error: profileError } = await (supabase
      .from('profiles') as any)
      .select('*')
      .in('id', friendIds);

    if (profileError) {
      console.error('Error fetching friend profiles:', profileError.message);
      return [];
    }

    return (profiles || []).map((p: DbProfile) => ({
      ...p,
      friendshipId: friendIdToFriendshipMap.get(p.id) || '',
      name: p.display_name || p.email || 'Friend',
      email: p.email || '',
      avatarUrl: p.avatar_url || undefined,
      picture: p.avatar_url || undefined,
    }));
  }

  /**
   * Adds a friend by email.
   * If the user already exists in profiles, creates an accepted friendship immediately.
   * Does NOT create a group.
   */
  async addFriendByEmail(email: string): Promise<AddFriendResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail === user.email?.toLowerCase()) {
      throw new Error('You cannot add yourself as a friend.');
    }

    // 1. Exact email lookup (RPC bypasses profiles RLS, which hides non-connected users)
    const { data: profiles, error: searchError } = await (supabase as any)
      .rpc('find_profile_by_email', { p_email: cleanEmail });

    if (searchError) {
      throw new Error(`Failed to search users: ${searchError.message}`);
    }

    const targetUser = profiles && profiles.length > 0 ? (profiles[0] as DbProfile) : null;
    if (!targetUser) {
      throw new Error(
        `No Tabby account found with email "${cleanEmail}". Ask them to sign in to Tabby first!`
      );
    }

    // 2. Canonical friendship ordering: user_id_1 < user_id_2
    const u1 = user.id < targetUser.id ? user.id : targetUser.id;
    const u2 = user.id < targetUser.id ? targetUser.id : user.id;

    // 3. Upsert canonical friendship record
    const { data: friendshipData, error: insertError } = await (supabase
      .from('friendships') as any)
      .upsert(
        {
          user_id_1: u1,
          user_id_2: u2,
          status: 'accepted',
          action_user_id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id_1,user_id_2' }
      )
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create friendship: ${insertError.message}`);
    }

    return {
      friendship: {
        id: friendshipData.id,
        userId1: friendshipData.user_id_1,
        userId2: friendshipData.user_id_2,
        status: friendshipData.status,
        actionUserId: friendshipData.action_user_id,
        createdAt: friendshipData.created_at,
        updatedAt: friendshipData.updated_at,
      },
      friendProfile: targetUser,
      isNewUser: false,
    };
  }

  /**
   * Resolves or creates a canonical friendship between two users
   */
  async getOrCreateFriendship(userA: string, userB: string): Promise<string> {
    if (userA === userB) throw new Error('Cannot create friendship with oneself');
    const u1 = userA < userB ? userA : userB;
    const u2 = userA < userB ? userB : userA;

    // Check existing
    const { data: existing } = await (supabase
      .from('friendships') as any)
      .select('id')
      .eq('user_id_1', u1)
      .eq('user_id_2', u2)
      .single();

    if (existing?.id) return existing.id;

    // Insert canonical
    const { data: created, error } = await (supabase
      .from('friendships') as any)
      .insert({
        user_id_1: u1,
        user_id_2: u2,
        status: 'accepted',
        action_user_id: userA,
      })
      .select('id')
      .single();

    if (error) {
      // Might have been inserted concurrently
      const { data: retry } = await (supabase
        .from('friendships') as any)
        .select('id')
        .eq('user_id_1', u1)
        .eq('user_id_2', u2)
        .single();
      if (retry?.id) return retry.id;
      throw new Error(error.message);
    }

    return created.id;
  }
}

export const friendService = new FriendService();
