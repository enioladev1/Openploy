"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Key } from "react-aria-components";
import { trpc } from "@/app/providers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComposeSourcePanel } from "./compose-source-panel";
import { ContainerLogsPanel } from "./container-logs-panel";
import { CronJobsPanel } from "./cron-jobs-panel";
import { DeploymentsPanel } from "./deployments-panel";
import { DomainsPanel } from "./domains-panel";
import { EnvVarsPanel } from "./env-vars-panel";
import { ExposeInnerServiceField } from "./expose-inner-service-field";

const TABS = [
  { id: "source", label: "Source" },
  { id: "env-vars", label: "Environment variables" },
  { id: "domains", label: "Domains" },
  { id: "deployments", label: "Deployments" },
  { id: "logs", label: "Container logs" },
  { id: "cron-jobs", label: "Scheduled tasks" },
] as const;

function NotConfiguredYet() {
  return (
    <Empty>
      <EmptyTitle>Not configured yet</EmptyTitle>
      <EmptyDescription>Set the compose source in the Source tab first.</EmptyDescription>
    </Empty>
  );
}

export function ComposeServiceView({ serviceId }: { serviceId: string }) {
  const detail = trpc.services.getComposeDetail.useQuery({ serviceId });
  const isConfigured = Boolean(detail.data?.sourceType);
  const isExposed = Boolean(detail.data?.exposedInnerService);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedTab = TABS.some((tab) => tab.id === searchParams.get("tab")) ? searchParams.get("tab")! : "source";

  function handleSelectionChange(key: Key) {
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  return (
    <Tabs selectedKey={selectedTab} onSelectionChange={handleSelectionChange}>
      <TabsList aria-label="Service sections">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.id} id={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent id="source">{detail.data && <ComposeSourcePanel serviceId={serviceId} detail={detail.data} />}</TabsContent>

      <TabsContent id="env-vars">{isConfigured ? <EnvVarsPanel serviceId={serviceId} /> : <NotConfiguredYet />}</TabsContent>

      <TabsContent id="domains">
        {isConfigured ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Expose to a domain</CardTitle>
              </CardHeader>
              <CardContent>
                {detail.data && (
                  <ExposeInnerServiceField
                    serviceId={serviceId}
                    currentValue={detail.data.exposedInnerService}
                    sourceType={detail.data.sourceType}
                    rawComposeContent={detail.data.rawComposeContent}
                    githubInstallationId={detail.data.githubInstallationId}
                    repoOwner={detail.data.repoOwner}
                    repoName={detail.data.repoName}
                    branch={detail.data.branch}
                    composeFilePath={detail.data.composeFilePath}
                  />
                )}
                {!isExposed && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Set which inner compose service to expose, then a domain can be added for it here.
                  </p>
                )}
              </CardContent>
            </Card>
            {isExposed && <DomainsPanel serviceId={serviceId} />}
          </>
        ) : (
          <NotConfiguredYet />
        )}
      </TabsContent>

      <TabsContent id="deployments">
        {isConfigured ? (
          <DeploymentsPanel
            serviceId={serviceId}
            {...(detail.data?.sourceType === "raw" ? { emptyCommitLabel: "Pasted compose file" } : {})}
          />
        ) : (
          <NotConfiguredYet />
        )}
      </TabsContent>

      <TabsContent id="logs">
        {isConfigured && isExposed ? <ContainerLogsPanel serviceId={serviceId} /> : <NotConfiguredYet />}
      </TabsContent>

      <TabsContent id="cron-jobs">
        {isConfigured && isExposed ? <CronJobsPanel serviceId={serviceId} /> : <NotConfiguredYet />}
      </TabsContent>
    </Tabs>
  );
}
