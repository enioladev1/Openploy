"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon, PlayIcon, ReloadIcon, StopIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";

interface ServiceLifecycleControlsProps {
  serviceId: string;
  initialRuntimeStatus: string;
  /** Database services have no "redeploy" action - Reload/Start cover that, so Deploy is hidden. */
  serviceType: "application" | "database" | "compose";
}

/**
 * Start is only offered from "stopped" - reload/stop only make sense for a
 * service that's actually running (or trying to), and start only makes sense
 * for one that isn't. A service reaches "stopped" only via the Stop action
 * below, which itself only applies to an already-deployed service, so Start
 * always has at least one prior deployment to bring back up.
 */
export function ServiceLifecycleControls({ serviceId, initialRuntimeStatus, serviceType }: ServiceLifecycleControlsProps) {
  const utils = trpc.useUtils();
  const service = trpc.services.get.useQuery({ id: serviceId }, { refetchInterval: 4000 });
  // isDeploying always wins over runtimeStatus - that column only updates
  // once a deploy finishes, so mid-deploy it's still "unknown" (first-ever
  // deploy) or stuck showing the previous status (a redeploy of an
  // already-running service), neither of which is what's true right now.
  const status = service.data?.isDeploying ? "deploying" : (service.data?.runtimeStatus ?? initialRuntimeStatus);

  const invalidate = () => void utils.services.get.invalidate({ id: serviceId });
  const reload = trpc.services.reload.useMutation({
    onSuccess: () => {
      toast.success("Service reloading");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const stop = trpc.services.stop.useMutation({
    onSuccess: () => {
      toast.success("Service stopped");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const start = trpc.services.start.useMutation({
    onSuccess: () => {
      toast.success("Service starting");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deploy = trpc.deployments.trigger.useMutation({
    onSuccess: () => {
      toast.success("Deployment started");
      void utils.deployments.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-2">
      <StatusBadge status={status} className="w-fit" />
      <div className="flex gap-2">
        {serviceType !== "database" && (
          <TooltipTrigger>
            <Button
              size="sm"
              isDisabled={deploy.isPending}
              onPress={() => deploy.mutate({ serviceId, idempotencyKey: crypto.randomUUID() })}
            >
              {deploy.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={CloudUploadIcon} size={14} strokeWidth={2} />}
              {deploy.isPending ? "Starting..." : "Deploy"}
            </Button>
            <Tooltip placement="bottom">Build and deploy the latest version</Tooltip>
          </TooltipTrigger>
        )}
        {status === "stopped" ? (
          <TooltipTrigger>
            <Button variant="outline" size="sm" isDisabled={start.isPending} onPress={() => start.mutate({ id: serviceId })}>
              {start.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />}
              {start.isPending ? "Starting..." : "Start"}
            </Button>
            <Tooltip placement="bottom">Start this stopped service</Tooltip>
          </TooltipTrigger>
        ) : (
          <>
            <TooltipTrigger>
              <Button variant="outline" size="sm" isDisabled={reload.isPending} onPress={() => reload.mutate({ id: serviceId })}>
                {reload.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />}
                {reload.isPending ? "Reloading..." : "Reload"}
              </Button>
              <Tooltip placement="bottom">Restart the container in place, no rebuild</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger>
              <Button variant="outline" size="sm" isDisabled={stop.isPending} onPress={() => stop.mutate({ id: serviceId })}>
                {stop.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />}
                {stop.isPending ? "Stopping..." : "Stop"}
              </Button>
              <Tooltip placement="bottom">Stop the container - config and volumes stay intact</Tooltip>
            </TooltipTrigger>
          </>
        )}
      </div>
    </div>
  );
}
