"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * One query client for the browser session.
 *
 * Created inside state, never at module scope: a module-level client is shared between requests on
 * the server and between users in development, which is how one account ends up reading another's
 * cached answers.
 *
 * The defaults are the reason this library is here at all. `staleTime` is the window in which
 * revisiting a project costs nothing — Next's own client cache for dynamic segments has defaulted to
 * zero since v15, so moving between two projects refetches everything today.
 *
 * `refetchOnWindowFocus` is off. These queries fan out to a Management API that throttles at roughly
 * a minute's worth of calls, and a dashboard that refetches ten parts every time the window regains
 * focus is a way to rate-limit yourself by alt-tabbing.
 *
 * `retry: 1`, because a refusal — a missing OAuth scope, say — is an answer rather than a failure
 * and is delivered as data; what retries here is a genuine transport fault.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
