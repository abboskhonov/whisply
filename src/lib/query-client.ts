import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dictation completion events explicitly invalidate affected data.
      staleTime: Infinity,
      gcTime: 30 * 60 * 1_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
