"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/app/providers";
import { CopyLogButton } from "@/components/copy-log-button";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logLineColorClass } from "@/lib/log-line-color";
import { AiDebugButton } from "./ai-debug-button";

interface RuntimeLogLine {
  id: string;
  sequence: number;
  content: string;
}

const RECONNECT_DELAY_MS = 2000;

/**
 * Always tails whatever the service's current deployment is - unlike the
 * per-deployment build log viewer, this never "finishes": a container can run
 * for days, so the connection is expected to drop and reconnect repeatedly
 * (server caps each session), and reconnects carry the last-seen sequence via
 * ?since= so history never replays twice.
 *
 * The stream connection itself only opens once runtimeStatus is "running" -
 * connecting earlier (mid-build/mid-deploy, before any container exists yet)
 * just produced a noisy connect/404/reconnect loop with nothing useful to show.
 */
export function ContainerLogsPanel({ serviceId }: { serviceId: string }) {
  const service = trpc.services.get.useQuery({ id: serviceId }, { refetchInterval: 4000 });
  const isRunning = service.data?.runtimeStatus === "running";
  const currentDeploymentId = service.data?.currentDeploymentId ?? null;
  const debugContainerLog = trpc.aiDebug.debugContainerLog.useMutation();

  const [lines, setLines] = useState<RuntimeLogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const lastSequenceRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reconnecting on currentDeploymentId (not just isRunning) matters because a
  // redeploy of an already-running service flips runtimeStatus straight from
  // "running" to "running" - only currentDeploymentId actually changes, and
  // sequence numbers are scoped per-deployment so stale ones must be dropped.
  useEffect(() => {
    lastSequenceRef.current = 0;
    setLines([]);

    if (!isRunning) {
      setConnected(false);
      return;
    }

    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      source = new EventSource(`/api/services/${serviceId}/container-logs/stream?since=${lastSequenceRef.current}`);

      source.onopen = () => setConnected(true);

      source.onmessage = (event) => {
        const data = JSON.parse(event.data) as RuntimeLogLine;
        lastSequenceRef.current = data.sequence;
        setLines((prev) => [...prev, data]);
      };

      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (!cancelled) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [serviceId, isRunning, currentDeploymentId]);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight });
  }, [lines]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Container logs</CardTitle>
        <CardAction className="flex items-center gap-2">
          <StatusBadge status={!isRunning ? "pending" : connected ? "live" : "connecting"} />
          {isRunning && <AiDebugButton onDebug={(providerId) => debugContainerLog.mutateAsync({ serviceId, providerId })} />}
          <CopyLogButton getText={() => lines.map((line) => line.content).join("\n")} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="max-h-96 overflow-auto rounded-2xl bg-zinc-950 p-4 font-mono text-xs text-zinc-100"
        >
          {!isRunning ? (
            <span className="opacity-60">Container logs will appear once the service is running.</span>
          ) : lines.length === 0 ? (
            <span className="opacity-60">Waiting for container output...</span>
          ) : (
            lines.map((line) => (
              <div key={line.id} className={logLineColorClass(line.content)}>
                {line.content}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
