import { useAuth } from '@/hooks/use-auth';
import { checkSupabaseConfig } from '@/lib/supabase';

export interface UseAiScannerResult {
  isAvailable: boolean;
  isAuthenticated: boolean;
}

/**
 * Hook providing the availability status of the server-side AI receipt scanner.
 * AI scanning is handled via Supabase Edge Function with centralized server credentials.
 */
export function useAiScanner(): UseAiScannerResult {
  const { isAuthenticated, isGuest } = useAuth();
  const config = checkSupabaseConfig();

  const isAvailable = config.isConfigured && isAuthenticated && !isGuest;

  return {
    isAvailable,
    isAuthenticated: isAuthenticated && !isGuest,
  };
}

// Backward-compatible alias
export const useGeminiConfig = useAiScanner;
