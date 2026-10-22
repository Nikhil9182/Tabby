import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Process OAuth callback from Supabase
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
      } else if (session) {
        navigate('/dashboard', { replace: true });
      } else {
        // If no session yet, listen once for auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe();
            navigate('/dashboard', { replace: true });
          }
        });

        // Timeout fallback after 8 seconds
        const timer = setTimeout(() => {
          subscription.unsubscribe();
          navigate('/welcome', { replace: true });
        }, 8000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timer);
        };
      }
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Authentication callback failed');
    });
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full p-6 rounded-2xl border bg-card text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-lg font-bold">Sign In Failed</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => navigate('/welcome')}>Return to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="text-center space-y-3">
        <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}

export default AuthCallbackPage;
