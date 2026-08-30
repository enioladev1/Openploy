"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { ThemeProvider } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RouterProvider } from "react-aria-components";
import type { AppRouter } from "@/server/trpc/routers";
import { Toaster } from "@/components/ui/sonner";

export const trpc = createTRPCReact<AppRouter>();

declare module "react-aria-components" {
  interface RouterConfig {
    routerOptions: NonNullable<Parameters<ReturnType<typeof useRouter>["push"]>[1]>;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc" })] }),
  );

  return (
    // Every shadcn (--base aria) component that accepts an `href` - Sidebar's
    // SidebarMenuButton, Button's LinkButton - renders react-aria-components'
    // own <Link> for it, not next/link. Without this, that Link's clicks fall
    // through to a plain <a> and hard-reload the page instead of using Next's
    // client-side router.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <RouterProvider navigate={router.push} useHref={(href) => href}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            {children}
            <Toaster position="top-right" />
          </QueryClientProvider>
        </trpc.Provider>
      </RouterProvider>
    </ThemeProvider>
  );
}
