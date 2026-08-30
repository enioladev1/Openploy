"use client";

import { Fragment, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StopIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { DeploymentDuration } from "@/components/deployment-duration";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { LogViewer } from "./log-viewer";

const IN_FLIGHT_STATUSES = new Set(["queued", "building", "deploying"]);

interface DeploymentsPanelProps {
  serviceId: string;
  /** Shown in place of a commit message for deployments with none - application/compose default to a GitHub-flavored message, database provisioning needs its own since it was never triggered from a repo. */
  emptyCommitLabel?: string;
}

export function DeploymentsPanel({ serviceId, emptyCommitLabel = "Manual trigger, no commit info yet" }: DeploymentsPanelProps) {
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const deployments = trpc.deployments.list.useQuery({ serviceId }, { refetchInterval: 4000 });
  const cancel = trpc.deployments.cancel.useMutation({
    onSuccess: () => {
      toast.success("Deployment canceled");
      void utils.deployments.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployments</CardTitle>
      </CardHeader>
      <CardContent>
        {deployments.data?.length === 0 && <p className="text-sm text-muted-foreground">No deployments yet.</p>}

        {deployments.data && deployments.data.length > 0 && (
          <ItemGroup>
            {deployments.data.map((deployment) => (
              <Fragment key={deployment.id}>
                <Item
                  variant="outline"
                  size="sm"
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setSelectedDeploymentId((prev) => (prev === deployment.id ? null : deployment.id))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    setSelectedDeploymentId((prev) => (prev === deployment.id ? null : deployment.id));
                  }}
                >
                  <ItemContent>
                    <ItemTitle>
                      <StatusBadge status={deployment.status} />
                      {deployment.commitMessage ?? emptyCommitLabel}
                    </ItemTitle>
                    <ItemDescription>
                      {deployment.commitSha?.slice(0, 7) ?? ""} {deployment.commitAuthor ?? ""}
                    </ItemDescription>
                  </ItemContent>
                  {/* stopPropagation - this row's onClick toggles the log viewer, which a click inside these actions must not also trigger */}
                  <ItemActions onClick={(e) => e.stopPropagation()}>
                    {IN_FLIGHT_STATUSES.has(deployment.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        isDisabled={cancel.isPending && cancel.variables?.deploymentId === deployment.id}
                        onPress={() => cancel.mutate({ serviceId, deploymentId: deployment.id })}
                      >
                        {cancel.isPending && cancel.variables?.deploymentId === deployment.id ? (
                          <Spinner className="size-4" />
                        ) : (
                          <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />
                        )}
                        Cancel
                      </Button>
                    )}
                    {deployment.startedAt && (
                      <DeploymentDuration
                        status={deployment.status}
                        startedAt={deployment.startedAt}
                        finishedAt={deployment.finishedAt}
                      />
                    )}
                  </ItemActions>
                </Item>
                {selectedDeploymentId === deployment.id && <LogViewer deploymentId={deployment.id} serviceId={serviceId} />}
              </Fragment>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
