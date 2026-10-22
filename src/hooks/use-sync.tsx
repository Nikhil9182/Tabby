import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';

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
  conflicts: any[];
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SYNC_QUEUE_EVENT = 'tabby:sync-queue-updated';

export function notifySyncQueueUpdated(): void {
  // No-op kept for backwards compatibility
}

export interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const queryClient = useQueryClient();
  const { authState } = useAuth();

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => new Date().toISOString());

  // Listen to network status changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      // Automatically refetch server queries when network reconnects
      void queryClient.invalidateQueries();
      setLastSyncedAt(new Date().toISOString());
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
  }, [queryClient]);

  const triggerSync = useCallback(async (): Promise<void> => {
    setIsSyncing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['settlements'] }),
        queryClient.invalidateQueries({ queryKey: ['current-user'] }),
      ]);
      setLastSyncedAt(new Date().toISOString());
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient]);

  const syncStatus: SyncStatus = {
    isOnline,
    isSyncing,
    pendingCount: 0, // No offline pending writes; writes are committed directly to Supabase
    lastSyncedAt,
    hasConflicts: false,
    authState,
  };

  const value: SyncContextType = {
    syncStatus,
    pendingCount: 0,
    lastSyncedAt,
    isSyncing,
    isOnline,
    hasConflicts: false,
    triggerSync,
    conflicts: [],
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
