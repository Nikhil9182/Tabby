export class OnlineDetector {
  private listeners: Set<(online: boolean) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleStatusChange(true));
      window.addEventListener('offline', () => this.handleStatusChange(false));
    }
  }

  isOnline(): boolean {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  }

  onOnlineChange(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    // Provide initial state
    callback(this.isOnline());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private handleStatusChange(online: boolean): void {
    for (const listener of this.listeners) {
      try {
        listener(online);
      } catch (err) {
        console.error('Error in online change listener:', err);
      }
    }
  }
}

export const onlineDetector = new OnlineDetector();
