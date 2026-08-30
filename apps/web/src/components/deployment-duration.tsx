"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format-duration";

const TERMINAL_STATUSES = new Set(["success", "failed", "canceled"]);

interface DeploymentDurationProps {
  status: string;
  startedAt: string | Date | null;
  finishedAt: string | Date | null;
}

/** Ticks once a second while the deployment is in progress, then freezes at the real startedAt-to-finishedAt duration once it reaches a terminal status - independent of the parent list's own (slower) refetch interval, so the count doesn't visibly stall between polls. */
export function DeploymentDuration({ status, startedAt, finishedAt }: DeploymentDurationProps) {
  const isTerminal = TERMINAL_STATUSES.has(status);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isTerminal || !startedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isTerminal, startedAt]);

  if (!startedAt) return null;

  const start = new Date(startedAt).getTime();
  const end = isTerminal && finishedAt ? new Date(finishedAt).getTime() : now;

  return <span className="tabular-nums">{formatDuration(end - start)}</span>;
}
