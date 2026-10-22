import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';

export type DbGroup = Database['public']['Tables']['groups']['Row'];
export type DbGroupMember = Database['public']['Tables']['group_members']['Row'];
export type DbGroupInvitation = Database['public']['Tables']['group_invitations']['Row'];

export interface GroupWithMembers extends DbGroup {
  members: Array<{
    id: string;
    userId: string;
    role: 'owner' | 'admin' | 'member';
    status: 'active' | 'invited' | 'removed';
    joinedAt: string;
    profile: {
      id: string;
      displayName: string;
      avatarUrl: string | null;
      email: string | null;
    } | null;
  }>;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  currency?: string;
  imageUrl?: string;
}

export interface UpdateGroupInput {
  id: string;
  name?: string;
  description?: string;
  currency?: string;
  imageUrl?: string;
}

class GroupService {
  /**
   * Fetches all active groups that the current user belongs to
   */
  async getUserGroups(): Promise<DbGroup[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get group IDs where current user is an active member
    const { data: memberships, error: memberError } = await (supabase
      .from('group_members') as any)
      .select('group_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (memberError) {
      console.error('Error fetching group memberships:', memberError);
      throw new Error(memberError.message);
    }

    if (!memberships || memberships.length === 0) return [];

    const groupIds = (memberships as any[]).map((m) => m.group_id);

    const { data: groups, error: groupsError } = await (supabase
      .from('groups') as any)
      .select('*')
      .in('id', groupIds)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (groupsError) {
      console.error('Error fetching groups:', groupsError);
      throw new Error(groupsError.message);
    }

    return (groups || []) as DbGroup[];
  }

  /**
   * Fetches full group details including member profiles
   */
  async getGroupById(groupId: string): Promise<GroupWithMembers | null> {
    const { data: group, error: groupError } = await (supabase
      .from('groups') as any)
      .select('*')
      .eq('id', groupId)
      .single();

    if (groupError) {
      if (groupError.code === 'PGRST116') return null; // Not found or no access
      throw new Error(groupError.message);
    }

    // Fetch members with profiles
    const { data: members, error: membersError } = await (supabase
      .from('group_members') as any)
      .select(`
        id,
        user_id,
        role,
        status,
        joined_at,
        profiles (
          id,
          display_name,
          avatar_url,
          email
        )
      `)
      .eq('group_id', groupId)
      .eq('status', 'active');

    if (membersError) {
      throw new Error(membersError.message);
    }

    const formattedMembers = ((members || []) as any[]).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      status: m.status,
      joinedAt: m.joined_at,
      profile: m.profiles
        ? {
            id: m.profiles.id,
            displayName: m.profiles.display_name,
            avatarUrl: m.profiles.avatar_url,
            email: m.profiles.email,
          }
        : null,
    }));

    return {
      ...(group as DbGroup),
      members: formattedMembers,
    };
  }

  /**
   * Creates a new group atomically with creator as owner via RPC
   */
  async createGroup(input: CreateGroupInput): Promise<DbGroup> {
    const { data, error } = await (supabase.rpc as any)('create_group_with_owner', {
      p_name: input.name.trim(),
      p_description: input.description?.trim() || null,
      p_currency: (input.currency || 'USD').toUpperCase(),
      p_image_url: input.imageUrl || null,
    });

    if (error) {
      console.error('Error creating group:', error);
      throw new Error(error.message);
    }

    return data as DbGroup;
  }

  /**
   * Updates group settings
   */
  async updateGroup(input: UpdateGroupInput): Promise<DbGroup> {
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.description !== undefined) updates.description = input.description.trim() || null;
    if (input.currency !== undefined) updates.default_currency = input.currency.toUpperCase();
    if (input.imageUrl !== undefined) updates.image_url = input.imageUrl || null;

    const { data, error } = await (supabase
      .from('groups') as any)
      .update(updates)
      .eq('id', input.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as DbGroup;
  }

  /**
   * Soft-archives a group
   */
  async archiveGroup(groupId: string): Promise<void> {
    const { error } = await (supabase
      .from('groups') as any)
      .update({ archived_at: new Date().toISOString() })
      .eq('id', groupId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Creates a shareable invitation for a group
   */
  async createInvitation(
    groupId: string,
    invitedEmail: string,
    role: 'admin' | 'member' = 'member'
  ): Promise<DbGroupInvitation> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await (supabase
      .from('group_invitations') as any)
      .insert({
        group_id: groupId,
        invited_email: invitedEmail.trim().toLowerCase(),
        invited_by: user.id,
        role,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as DbGroupInvitation;
  }

  /**
   * Accepts an invitation by token via RPC
   */
  async acceptInvitation(token: string): Promise<DbGroup> {
    const { data, error } = await (supabase.rpc as any)('accept_group_invitation', {
      p_token: token.trim(),
    });

    if (error) {
      throw new Error(error.message);
    }

    return data as DbGroup;
  }

  /**
   * Removes a member from group (or user leaves group)
   */
  async removeMember(groupId: string, userId: string): Promise<void> {
    const { error } = await (supabase
      .from('group_members') as any)
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export const groupService = new GroupService();
