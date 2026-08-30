"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/app/providers";
import { CopyLogButton } from "@/components/copy-log-button";
import { logLineColorClass } from "@/lib/log-line-color";
import { AiDebugButton } from "./ai-debug-button";

interface LogLine {
  id: string;
  stream: "build" | "runtime";
  sequence: number;
  content: string;
}

export function LogViewer({ deploymentId, serviceId }: { deploymentId: string; serviceId: string }) {
  const debugDeploymentLog = trpc.aiDebug.debugDeploymentLog.useMutation();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    setDone(false);
    const source = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);

    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as LogLine | { done: true };
      if ("done" in data) {
        setDone(true);
        source.close();
        return;
      }
      setLines((prev) => [...prev, data]);
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [deploymentId]);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight });
  }, [lines]);

  return (
    <div>
      <div className="mb-2 flex justify-end gap-2">
        <AiDebugButton onDebug={(providerId) => debugDeploymentLog.mutateAsync({ serviceId, deploymentId, providerId })} />
        <CopyLogButton getText={() => lines.map((line) => line.content).join("\n")} />
      </div>
      <div
        ref={containerRef}
        className="max-h-96 overflow-auto rounded-2xl bg-zinc-950 p-4 font-mono text-xs text-zinc-100"
      >
        {lines.length === 0 ? (
          <span className="opacity-60">Waiting for logs...</span>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={logLineColorClass(line.content)}>
              <span className="opacity-50">[{line.stream}]</span> {line.content}
            </div>
          ))
        )}
      </div>
      {done && <p className="mt-2 text-xs text-muted-foreground">Stream closed.</p>}
    </div>
  );
}
