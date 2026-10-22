import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase-types';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseKey = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  ''
).trim();

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  missingKeys: string[];
}

export function checkSupabaseConfig(): SupabaseConfigStatus {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY)');
  return {
    isConfigured: missing.length === 0,
    missingKeys: missing,
  };
}

const configStatus = checkSupabaseConfig();
if (!configStatus.isConfigured && import.meta.env.DEV) {
  console.warn(
    `[Tabby] Supabase configuration is missing: ${configStatus.missingKeys.join(', ')}.\n` +
    'Please set these environment variables in your .env file to enable cloud authentication and data persistence.'
  );
}

// Fallback placeholder client if keys not provided (e.g. during offline build or test)
const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseKey || 'placeholder-publishable-key';

export const supabase: SupabaseClient<Database> = createClient<Database>(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
