import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { AuthState, GoogleUser } from '@/domain/models/types';
import { supabase, checkSupabaseConfig } from '@/lib/supabase';
import { supabaseAuthService } from '@/services/auth/supabase-auth-service';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

export type { AuthState, GoogleUser };

export interface AuthContextType {
  authState: AuthState;
  user: (GoogleUser & { id: string; displayName?: string; avatarUrl?: string }) | null;
  accessToken: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUserToAuthUser(
  sbUser: SupabaseUser
): GoogleUser & { id: string; displayName?: string; avatarUrl?: string } {
  const name =
    sbUser.user_metadata?.full_name ||
    sbUser.user_metadata?.name ||
    sbUser.email?.split('@')[0] ||
    'User';

  const picture =
    sbUser.user_metadata?.avatar_url ||
    sbUser.user_metadata?.picture ||
    undefined;

  return {
    id: sbUser.id,
    sub: sbUser.id,
    name,
    displayName: name,
    email: sbUser.email || '',
    picture,
    avatarUrl: picture,
  };
}

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>('connecting');
  const [user, setUser] = useState<(GoogleUser & { id: string; displayName?: string; avatarUrl?: string }) | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleSession = useCallback(async (session: Session | null) => {
    if (session?.user) {
      const mapped = mapSupabaseUserToAuthUser(session.user);
      setUser(mapped);
      setAccessToken(session.access_token);
      setAuthState('connected');
      setError(null);
      // Sync profile asynchronously in background
      void supabaseAuthService.syncUserProfile(session.user);
    } else {
      setUser(null);
      setAccessToken(null);
      setAuthState('disconnected');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const config = checkSupabaseConfig();

    if (!config.isConfigured) {
      setAuthState('disconnected');
      setIsLoading(false);
      return;
    }

    // 1. Initial session restoration
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!isMounted) return;
      if (sessionError) {
        console.warn('[Tabby Auth] Session error:', sessionError.message);
        setError(sessionError.message);
        setAuthState('disconnected');
        setIsLoading(false);
      } else {
        void handleSession(session);
      }
    }).catch((err) => {
      if (!isMounted) return;
      console.warn('[Tabby Auth] Failed to restore session:', err);
      setAuthState('disconnected');
      setIsLoading(false);
    });

    // 2. Subscribe to auth state changes (OAuth redirects, tokens, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setAccessToken(null);
          setAuthState('disconnected');
          setIsLoading(false);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await handleSession(session);
        } else if (event === 'USER_UPDATED') {
          if (session) await handleSession(session);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [handleSession]);

  const signIn = useCallback(async (): Promise<void> => {
    setError(null);
    setAuthState('connecting');

    const result = await supabaseAuthService.signInWithGoogle();
    if (result.error) {
      setError(result.error.message);
      setAuthState('error');
      throw result.error;
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await supabaseAuthService.signOut();
      setUser(null);
      setAccessToken(null);
      setError(null);
      setAuthState('disconnected');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  const isAuthenticated = authState === 'connected' && !!user;

  const value: AuthContextType = {
    authState,
    user,
    accessToken,
    signIn,
    signOut,
    isAuthenticated,
    isLoading,
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
