import type { AuthState, GoogleUser } from '../../domain/models/types';
import { resumeAfterErasure } from '../account/deletion-state';

declare global {
  interface Window {
    google?: any;
  }
}

export type AuthStateChangeCallback = (state: AuthState, user: GoogleUser | null) => void;

export class GoogleAuthService {
  private clientId: string | null = null;
  private tokenClient: any = null;
  private accessToken: string | null = null; // In-memory only!
  private tokenExpiresAt: number = 0;
  private currentUser: GoogleUser | null = null;
  private authState: AuthState = 'disconnected';
  private listeners: Set<AuthStateChangeCallback> = new Set();
  private expiryTimer: any = null;

  private readonly scopes = [
    'https://www.googleapis.com/auth/drive.file',
    // Discover invitation spreadsheets shared by other Tabby users.
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');

  initialize(clientId: string): void {
    this.clientId = clientId;
    this.setupTokenClient();
  }

  private setupTokenClient(): boolean {
    if (!this.clientId) return false;
    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
      return false;
    }

    try {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scopes,
        callback: () => {}, // Replaced dynamically during signIn
      });
      return true;
    } catch (err) {
      console.error('Failed to initialize Google token client:', err);
      return false;
    }
  }

  async signIn(): Promise<GoogleUser> {
    resumeAfterErasure();
    if (!this.clientId) {
      throw new Error('GoogleAuthService has not been initialized with a client ID.');
    }

    if (!this.tokenClient) {
      const initialized = this.setupTokenClient();
      if (!initialized) {
        throw new Error('Google Identity Services script not loaded. Ensure Google GIS script is included in index.html.');
      }
    }

    this.setAuthState('connecting');

    return new Promise<GoogleUser>((resolve, reject) => {
      this.tokenClient.callback = async (tokenResponse: any) => {
        if (tokenResponse.error) {
          this.setAuthState('error');
          reject(new Error(`Google authentication failed: ${tokenResponse.error}`));
          return;
        }

        try {
          const token = tokenResponse.access_token;
          const expiresInSeconds = Number.parseInt(tokenResponse.expires_in, 10) || 3600;

          // Store token strictly in memory
          this.accessToken = token;
          this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

          // Schedule token expiration handler 30s before actual expiry
          if (this.expiryTimer) {
            clearTimeout(this.expiryTimer);
          }
          const expiryDelayMs = Math.max((expiresInSeconds - 30) * 1000, 1000);
          this.expiryTimer = setTimeout(() => {
            this.handleTokenExpiry();
          }, expiryDelayMs);

          // Fetch user profile from userinfo endpoint
          const user = await this.fetchUserInfo(token);
          this.currentUser = user;
          this.setAuthState('connected');
          resolve(user);
        } catch (fetchError) {
          this.setAuthState('error');
          reject(fetchError);
        }
      };

      try {
        this.tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        this.setAuthState('error');
        reject(err);
      }
    });
  }

  private async fetchUserInfo(token: string): Promise<GoogleUser> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      sub: data.sub,
      name: data.name || data.email,
      email: data.email,
      picture: data.picture,
    };
  }

  signOut(): void {
    if (this.accessToken && typeof window !== 'undefined' && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(this.accessToken, () => {});
      } catch (err) {
        console.warn('Error revoking Google token:', err);
      }
    }

    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }

    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.currentUser = null;
    this.setAuthState('disconnected');
  }

  getAccessToken(): string | null {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      return null;
    }
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return (
      this.authState === 'connected' &&
      this.accessToken !== null &&
      Date.now() < this.tokenExpiresAt
    );
  }

  handleTokenExpiry(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.setAuthState('expired');
  }

  getAuthState(): AuthState {
    return this.authState;
  }

  getCurrentUser(): GoogleUser | null {
    return this.currentUser;
  }

  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.listeners.add(callback);
    // Fire immediately with current state
    callback(this.authState, this.currentUser);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private setAuthState(newState: AuthState): void {
    this.authState = newState;
    for (const listener of this.listeners) {
      try {
        listener(this.authState, this.currentUser);
      } catch (err) {
        console.error('Error in auth state change listener:', err);
      }
    }
  }
}

export const googleAuthService = new GoogleAuthService();
