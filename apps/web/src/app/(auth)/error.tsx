"use client";

import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { AuthCard } from "./auth-card";

const MAX_AUTO_RETRIES = 4;
const RETRY_DELAY_MS = 2000;

// Module-scoped, not state - state would reset every time reset() remounts
// this component, defeating the cap. Resets naturally on a real page reload.
let autoRetryCount = 0;

/**
 * Auth pages are the one place a transient connection failure is expected
 * behavior, not a bug - e.g. the first admin's signup restarts Traefik
 * (host-mode ports 80/443, no zero-downtime restart possible - see
 * signup/actions.ts), which can briefly refuse the very next request. Retry
 * quietly instead of showing Next's default crash screen for what's usually
 * a few-second blip.
 */
export default function AuthError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const canAutoRetry = autoRetryCount < MAX_AUTO_RETRIES;

  useEffect(() => {
    if (!canAutoRetry) return;
    autoRetryCount += 1;
    const timeout = setTimeout(reset, RETRY_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [canAutoRetry, reset]);

  return (
    <AuthCard title="Reconnecting" description="This can happen briefly right after setup or an update.">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        {canAutoRetry ? (
          <>
            <Spinner className="size-6" />
            <p className="text-sm text-muted-foreground">Trying again...</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Still having trouble.{" "}
            <button type="button" onClick={() => window.location.reload()} className="font-medium text-foreground underline">
              Reload the page
            </button>
            .
          </p>
        )}
      </div>
    </AuthCard>
  );
}
