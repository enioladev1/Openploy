"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";

/**
 * Purely client-side check (no server plumbing needed) - protocol is
 * something the browser itself already knows. Starts hidden and reveals
 * after mount rather than trying to detect this during SSR, same pattern
 * theme-toggle.tsx uses for its own client-only state.
 */
export function InsecureConnectionBanner() {
  const [insecure, setInsecure] = useState(false);

  useEffect(() => {
    setInsecure(window.location.protocol === "http:");
  }, []);

  if (!insecure) return null;

  // Fixed, not part of the document flow - stays layout-agnostic across every
  // page it's mounted on (the auth split-screen grid, the dashboard sidebar
  // layout) without needing special-cased placement in either.
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
      <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} className="shrink-0" />
      <span>
        This connection isn&apos;t encrypted. Anyone on your network could see this session, use your real HTTPS
        domain when you can.
      </span>
    </div>
  );
}
