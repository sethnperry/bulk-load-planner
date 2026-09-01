"use client";
// app/providers/QueryProvider.tsx
//
// Root-level React Query cache, mounted once in app/layout.tsx so it
// covers the whole app -- both the /planner/* tree (which already has its
// own CalculatorShellProvider for shell-specific state) and /admin, which
// sits outside that tree entirely and has its own independent fetches.
// This is deliberately the FIRST and ONLY QueryClientProvider in the app
// -- see CLAUDE.md's "Performance pass #1"/"#3" history for why this
// exists (zero fetch caching/dedup anywhere before this).
//
// QueryClient is created inside useState's lazy initializer, not at
// module scope -- the standard Next.js App Router pattern. A module-level
// singleton would be fine for a pure SPA, but this component can in
// principle be re-mounted (e.g. React Strict Mode double-invoke in dev),
// and useState's lazy initializer guarantees exactly one instance per
// actual mount without needing extra guards.
//
// Defaults are deliberately conservative and app-specific:
// - refetchOnWindowFocus: false -- this is a PWA that gets backgrounded/
//   foregrounded constantly (switching apps, locking the phone); the
//   library default (true) would cause frequent, surprising refetches
//   that have nothing to do with the data actually going stale.
// - retry: 1 -- a single retry is enough for a transient network blip
//   without hammering Supabase on a real outage.
// - No global staleTime override. Individual queries (see
//   lib/queries/useProductsCatalog.ts) set their own staleTime
//   explicitly for near-static reference data; leaving the global
//   default (0 -- always considered stale, refetch on every mount)
//   means any future useQuery call that doesn't opt in stays exactly as
//   fresh as a plain useEffect fetch would have been, so adding this
//   provider can't silently change behavior for code that hasn't been
//   migrated to use it yet.

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
