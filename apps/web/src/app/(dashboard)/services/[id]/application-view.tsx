"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Key } from "react-aria-components";
import { trpc } from "@/app/providers";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationConfigPanel } from "./application-config-panel";
import { ContainerLogsPanel } from "./container-logs-panel";
import { CronJobsPanel } from "./cron-jobs-panel";
import { DeploymentsPanel } from "./deployments-panel";
import { DomainsPanel } from "./domains-panel";
import { EnvVarsPanel } from "./env-vars-panel";

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
      <EmptyDescription>Set the repository and branch in the Source tab first.</EmptyDescription>
    </Empty>
  );
}

export function ApplicationServiceView({ serviceId }: { serviceId: string }) {
  const detail = trpc.services.getApplicationDetail.useQuery({ serviceId });
  const isConfigured =
    detail.data?.sourceType === "static" ||
    Boolean(detail.data?.sourceType === "repo" && detail.data?.repoOwner && detail.data?.repoName && detail.data?.branch);

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

      <TabsContent id="source">{detail.data && <ApplicationConfigPanel serviceId={serviceId} detail={detail.data} />}</TabsContent>
      <TabsContent id="env-vars">{isConfigured ? <EnvVarsPanel serviceId={serviceId} /> : <NotConfiguredYet />}</TabsContent>
      <TabsContent id="domains">{isConfigured ? <DomainsPanel serviceId={serviceId} /> : <NotConfiguredYet />}</TabsContent>
      <TabsContent id="deployments">
        {isConfigured ? (
          <DeploymentsPanel
            serviceId={serviceId}
            {...(detail.data?.sourceType === "static" ? { emptyCommitLabel: "Static file upload" } : {})}
          />
        ) : (
          <NotConfiguredYet />
        )}
      </TabsContent>
      <TabsContent id="logs">{isConfigured ? <ContainerLogsPanel serviceId={serviceId} /> : <NotConfiguredYet />}</TabsContent>
      <TabsContent id="cron-jobs">{isConfigured ? <CronJobsPanel serviceId={serviceId} /> : <NotConfiguredYet />}</TabsContent>
    </Tabs>
  );
}
