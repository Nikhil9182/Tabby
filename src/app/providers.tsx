import { useEffect, type ReactNode } from "react";
import { DELETION_STATE_KEY } from '@/services/account/deletion-state';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import { SyncProvider } from "@/hooks/use-sync";
import { ThemeProvider } from "@/hooks/use-theme";
import { Toaster } from "@/components/ui/sonner";

export interface ProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({
  children,
  queryClient = defaultQueryClient,
}: ProvidersProps) {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DELETION_STATE_KEY && event.newValue === 'erased') window.location.replace(`${import.meta.env.BASE_URL}welcome`);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return (
    <ThemeProvider defaultTheme="system" storageKey="tabby_theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SyncProvider>
            {children}
            <Toaster richColors closeButton position="top-right" />
          </SyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default Providers;
