"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon, ReloadIcon, Rocket01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

function displayVersion(version: string | null): string {
  return version ?? "unknown";
}

export function PlatformUpdateDialog({ onOpenChange, isOwner }: { onOpenChange: (open: boolean) => void; isOwner: boolean }) {
  const utils = trpc.useUtils();

  // Tracks an in-flight on-demand check (checkNow), separate from the
  // mutation's own isPending - enqueueing the job resolves almost instantly,
  // but the actual GHCR check runs async agent-side afterward. Cleared once
  // a fresher updateCheckedAt than this arrives, or after 30s as a safety
  // net if the agent-side check errors and never writes one.
  const [checkStartedAt, setCheckStartedAt] = useState<number | null>(null);

  const status = trpc.platformUpdate.status.useQuery(undefined, {
    // Faster poll while a run or an on-demand check is actually in flight,
    // so the dialog reflects the result without the user needing to reopen it.
    refetchInterval: (query) => {
      if (query.state.data?.updateStatus === "running") return 3000;
      if (checkStartedAt !== null) return 1500;
      return 60_000;
    },
  });

  const data = status.data;

  useEffect(() => {
    if (checkStartedAt === null || !data?.updateCheckedAt) return;
    if (new Date(data.updateCheckedAt).getTime() >= checkStartedAt) setCheckStartedAt(null);
  }, [data?.updateCheckedAt, checkStartedAt]);

  useEffect(() => {
    if (checkStartedAt === null) return;
    const timeout = setTimeout(() => setCheckStartedAt(null), 30_000);
    return () => clearTimeout(timeout);
  }, [checkStartedAt]);

  const trigger = trpc.platformUpdate.trigger.useMutation({
    onSuccess: () => {
      toast.success("Update started");
      void utils.platformUpdate.status.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const checkNow = trpc.platformUpdate.checkNow.useMutation({
    onSuccess: () => setCheckStartedAt(Date.now()),
    onError: (err) => toast.error(err.message),
  });

  const isRunning = data?.updateStatus === "running";
  const isChecking = checkStartedAt !== null;

  return (
    <Dialog isOpen onOpenChange={onOpenChange} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Platform update</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {isRunning ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Spinner className="size-6" />
            <div>
              <p className="text-sm font-medium">Updating...</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pulling images, running migrations, and restarting services. The dashboard will be briefly
                unreachable while it restarts - your data and running services aren&apos;t affected.
              </p>
            </div>
          </div>
        ) : isChecking ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Spinner className="size-6" />
            <p className="text-sm font-medium">Checking for updates...</p>
          </div>
        ) : !data?.updateCheckedAt ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Never checked yet - click Check now below.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">web</span>
              <span className="font-mono text-xs">
                {displayVersion(data?.currentWebVersion ?? null)} → {displayVersion(data?.latestVersion ?? null)}
              </span>
              <span className="text-muted-foreground">agent</span>
              <span className="font-mono text-xs">
                {displayVersion(data?.currentAgentVersion ?? null)} → {displayVersion(data?.latestVersion ?? null)}
              </span>
            </div>

            {data?.updateStatus === "failed" && data.updateError && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                <span>Last attempt failed: {data.updateError}</span>
              </div>
            )}

            {!data?.updateAvailable && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} />
                <span>Up to date.</span>
              </div>
            )}

            {!isOwner && <p className="text-sm text-muted-foreground">Only an organization owner can start an update.</p>}
          </>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        {!isRunning && !isChecking && isOwner && !data?.updateAvailable && (
          <Button variant="outline" onClick={() => checkNow.mutate()} isDisabled={checkNow.isPending}>
            {checkNow.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={ReloadIcon} size={16} strokeWidth={2} />}
            Check now
          </Button>
        )}
        {!isRunning && !isChecking && data?.updateAvailable && isOwner && (
          <Button onClick={() => trigger.mutate()} isDisabled={trigger.isPending}>
            {trigger.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={Rocket01Icon} size={16} strokeWidth={2} />}
            Start update
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
