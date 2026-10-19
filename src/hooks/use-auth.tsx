import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { AuthState, GoogleUser } from '@/domain/models/types';
import { googleAuthService } from '@/services/auth/google-auth-service';

export type { AuthState, GoogleUser };

export interface AuthContextType {
  authState: AuthState;
  user: GoogleUser | null;
  accessToken: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GIS_SCRIPT_ID = 'google-identity-services-script';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  // Already loaded
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>('disconnected');
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

  // Initialize GIS and register auth state listener
  useEffect(() => {
    let isMounted = true;

    if (!clientId) {
      setAuthState('disconnected');
      return;
    }

    loadGsiScript()
      .then(() => {
        if (!isMounted) return;
        googleAuthService.initialize(clientId);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load Google Identity Services script';
        setError(msg);
        setAuthState('error');
      });

    const unsubscribe = googleAuthService.onAuthStateChange((state, newUser) => {
      if (!isMounted) return;
      setAuthState(state);
      setUser(newUser);
      setAccessToken(googleAuthService.getAccessToken());
      if (state !== 'error') {
        setError(null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [clientId]);

  const signIn = useCallback(async (): Promise<void> => {
    if (!clientId) {
      const msg = 'Google Client ID is not configured. Please set VITE_GOOGLE_CLIENT_ID in your environment.';
      setError(msg);
      setAuthState('disconnected');
      throw new Error(msg);
    }

    setError(null);

    try {
      await loadGsiScript();
      googleAuthService.initialize(clientId);
      const googleUser = await googleAuthService.signIn();
      setUser(googleUser);
      setAccessToken(googleAuthService.getAccessToken());
      setAuthState('connected');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(msg);
      setAuthState('error');
      throw err;
    }
  }, [clientId]);

  const signOut = useCallback((): void => {
    googleAuthService.signOut();
    setUser(null);
    setAccessToken(null);
    setError(null);
    setAuthState('disconnected');
  }, []);

  const isAuthenticated = authState === 'connected' && !!accessToken;

  const value: AuthContextType = {
    authState,
    user,
    accessToken,
    signIn,
    signOut,
    isAuthenticated,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthContext };
