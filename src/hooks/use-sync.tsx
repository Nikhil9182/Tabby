import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { SyncOperation, AuthState } from '@/domain/models/types';
import { syncRepository } from '@/storage/repositories/sync-repository';
import { useAuth } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { syncEngine } from '@/services/sync/sync-engine';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  hasConflicts: boolean;
  authState: string;
}

export interface SyncContextType {
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  isOnline: boolean;
  hasConflicts: boolean;
  triggerSync: () => Promise<void>;
  conflicts: SyncOperation[];
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const LAST_SYNCED_KEY = 'tabby_last_synced_at';
export const SYNC_QUEUE_EVENT = 'tabby:sync-queue-updated';

/**
 * Dispatches a global event notifying listeners that local outbox sync queue changed.
 */
export function notifySyncQueueUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_QUEUE_EVENT));
  }
}

export interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const queryClient = useQueryClient();
  // Use auth context for current auth state; fallback safely if used outside
  const { authState: currentAuthState } = useAuth();
  const syncInFlight = useRef(false);

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [conflicts, setConflicts] = useState<SyncOperation[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(LAST_SYNCED_KEY);
    }
    return null;
  });

  // Refresh counts from IndexedDB
  const refreshSyncData = useCallback(async () => {
    try {
      const [count, conflictList] = await Promise.all([
        syncRepository.getPendingCount(),
        syncRepository.getConflicts(),
      ]);
      setPendingCount(count);
      setConflicts(conflictList);
    } catch (err) {
      console.error('Failed to read sync repository counts:', err);
    }
  }, []);

  // Listen to network status changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      void refreshSyncData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshSyncData]);

  // Initial fetch and custom event subscriptions
  useEffect(() => {
    void refreshSyncData();

    if (typeof window === 'undefined') return;

    const handleQueueUpdated = () => {
      void refreshSyncData();
    };

    window.addEventListener(SYNC_QUEUE_EVENT, handleQueueUpdated);

    // Periodic check every 5 seconds
    const interval = setInterval(() => {
      void refreshSyncData();
    }, 5000);

    return () => {
      window.removeEventListener(SYNC_QUEUE_EVENT, handleQueueUpdated);
      clearInterval(interval);
    };
  }, [refreshSyncData]);

  // Trigger manual or automatic sync
  const triggerSync = useCallback(async (): Promise<void> => {
    if (syncInFlight.current) return;
    if (!isOnline) {
      console.warn('Cannot sync while offline');
      return;
    }

    syncInFlight.current = true;
    setIsSyncing(true);
    try {
      if (currentAuthState !== 'connected') return;
      await syncEngine.startSync();
      await queryClient.invalidateQueries();

      const now = new Date().toISOString();
      setLastSyncedAt(now);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_SYNCED_KEY, now);
      }
      await refreshSyncData();
    } catch (err) {
      console.error('Error during synchronization:', err);
      throw err;
    } finally {
      syncInFlight.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, refreshSyncData, currentAuthState, queryClient]);

  useEffect(() => {
    if (!isOnline || currentAuthState !== 'connected') return;
    const run = () => { void triggerSync().catch(console.error); };
    const initial = setTimeout(run, 1000);
    const interval = setInterval(run, 30000);
    return () => { clearTimeout(initial); clearInterval(interval); };
    // The engine serializes syncs; don't reset timers on every status transition.
  }, [isOnline, currentAuthState, triggerSync]);

  const hasConflicts = conflicts.length > 0;

  const syncStatus: SyncStatus = {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncedAt,
    hasConflicts,
    authState: currentAuthState,
  };

  const value: SyncContextType = {
    syncStatus,
    pendingCount,
    lastSyncedAt,
    isSyncing,
    isOnline,
    hasConflicts,
    triggerSync,
    conflicts,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextType {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

export function useSyncStatus(): SyncStatus {
  const { syncStatus } = useSync();
  return syncStatus;
}

export { SyncContext };
