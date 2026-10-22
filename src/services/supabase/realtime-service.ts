import { supabase } from '@/lib/supabase';
import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

class RealtimeService {
  private activeChannels: Map<string, RealtimeChannel> = new Map();

  /**
   * Subscribes to Realtime table events for a specific group or global user events,
   * invalidating TanStack Query keys on database changes so the UI stays up-to-date.
   */
  subscribeToGroup(groupId: string, queryClient: QueryClient): () => void {
    const channelKey = `group-${groupId}`;

    if (this.activeChannels.has(channelKey)) {
      return () => {
        // Shared subscription cleanup handled if count reaches zero
      };
    }

    const channel = supabase
      .channel(channelKey)
      // Group expenses updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_expenses',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['expenses'] });
          void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
          void queryClient.invalidateQueries({ queryKey: ['balances'] });
        }
      )
      // Settlements updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settlements',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['settlements'] });
          void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
          void queryClient.invalidateQueries({ queryKey: ['balances'] });
        }
      )
      // Group membership updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['groups'] });
          void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
        }
      )
      // Group metadata updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups',
          filter: `id=eq.${groupId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['groups'] });
          void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Connected safely
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Subscription state: ${status}. Refetching current data.`);
          void queryClient.invalidateQueries({ queryKey: ['expenses'] });
          void queryClient.invalidateQueries({ queryKey: ['settlements'] });
        }
      });

    this.activeChannels.set(channelKey, channel);

    return () => {
      channel.unsubscribe();
      this.activeChannels.delete(channelKey);
    };
  }

  /**
   * Cleans up all active subscriptions
   */
  cleanup(): void {
    for (const [, channel] of this.activeChannels) {
      channel.unsubscribe();
    }
    this.activeChannels.clear();
  }
}

export const realtimeService = new RealtimeService();
