'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from './client';
import superjson from 'superjson';

/**
 * tRPC Provider for React components
 * Wrap your app with this to enable tRPC queries/mutations/subscriptions
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
      },
    },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/trpc`,
            transformer: superjson,
          }),
          false: httpBatchLink({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/trpc`,
            transformer: superjson,
          }),
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
