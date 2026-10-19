import { QueryClient } from "@tanstack/react-query";
import { Providers } from "@/app/providers";
import { AppRouter } from "@/app/router";

// Configure production-grade React Query defaults for offline-first operation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes in cache
      retry: 1,
      refetchOnWindowFocus: false, // Prevent unneeded refetches during offline usage
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function App() {
  return (
    <Providers queryClient={queryClient}>
      <AppRouter />
    </Providers>
  );
}

export default App;
