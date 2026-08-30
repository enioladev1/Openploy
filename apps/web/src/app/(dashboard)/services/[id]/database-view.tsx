"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Key } from "react-aria-components";
import { buildDatabaseConnectionString } from "@openploy/shared";
import { trpc } from "@/app/providers";
import { CopyButton } from "@/components/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupSchedulePanel } from "./backup-schedule-panel";
import { ContainerLogsPanel } from "./container-logs-panel";
import { DeploymentsPanel } from "./deployments-panel";
import { SecretField } from "./secret-field";

const TABS = [
  { id: "connection", label: "Connection" },
  { id: "backup", label: "Backup" },
  { id: "deployments", label: "Deployments" },
  { id: "logs", label: "Container logs" },
] as const;

export function DatabaseServiceView({ serviceId }: { serviceId: string }) {
  const detail = trpc.services.getDatabaseDetail.useQuery({ serviceId });
  const reveal = trpc.services.revealDatabasePassword.useMutation();
  const revealRoot = trpc.services.revealDatabaseRootPassword.useMutation();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedTab = TABS.some((tab) => tab.id === searchParams.get("tab")) ? searchParams.get("tab")! : "connection";

  function handleSelectionChange(key: Key) {
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  if (!detail.data) return null;
  const { engine, internalHost, internalPort, databaseName, username, rootCredentialsSecretId } = detail.data;

  return (
    <Tabs selectedKey={selectedTab} onSelectionChange={handleSelectionChange}>
      <TabsList aria-label="Service sections">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.id} id={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent id="connection">
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
                {username && (
                  <Field>
                    <FieldLabel htmlFor="username">Username</FieldLabel>
                    <div className="flex gap-2">
                      <Input id="username" readOnly value={username} className="flex-1" />
                      <CopyButton value={username} label="Copy username" />
                    </div>
                  </Field>
                )}

                {engine !== "redis" && (
                  <Field>
                    <FieldLabel htmlFor="databaseName">Database name</FieldLabel>
                    <div className="flex gap-2">
                      <Input id="databaseName" readOnly value={databaseName} className="flex-1" />
                      <CopyButton value={databaseName} label="Copy database name" />
                    </div>
                  </Field>
                )}

                <Field>
                  <FieldLabel htmlFor="internalHost">Internal host</FieldLabel>
                  <div className="flex gap-2">
                    <Input id="internalHost" readOnly value={internalHost} className="flex-1" />
                    <CopyButton value={internalHost} label="Copy internal host" />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="internalPort">Port</FieldLabel>
                  <div className="flex gap-2">
                    <Input id="internalPort" readOnly value={internalPort} className="flex-1" />
                    <CopyButton value={String(internalPort)} label="Copy port" />
                  </div>
                </Field>

                <SecretField
                  id="password"
                  label="Password"
                  copyLabel="Copy password"
                  fetchSecret={() => reveal.mutateAsync({ serviceId })}
                />

                {rootCredentialsSecretId && (
                  <SecretField
                    id="rootPassword"
                    label="Root password"
                    copyLabel="Copy root password"
                    fetchSecret={() => revealRoot.mutateAsync({ serviceId })}
                  />
                )}

                <SecretField
                  id="connectionString"
                  label="Internal database URL"
                  copyLabel="Copy internal database URL"
                  maskedPlaceholder="••••••••••••••••••••••••••••"
                  fetchSecret={() => reveal.mutateAsync({ serviceId })}
                  formatValue={(password) => buildDatabaseConnectionString(engine, internalHost, internalPort, databaseName, username, password)}
                  className="sm:col-span-2"
                />
              </div>

              <FieldDescription>
                Only reachable from other services on this platform&apos;s internal network - no port is published to
                the internet.
              </FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent id="backup">
        <BackupSchedulePanel serviceId={serviceId} engine={engine} />
      </TabsContent>

      <TabsContent id="deployments">
        <DeploymentsPanel serviceId={serviceId} emptyCommitLabel="Database provisioning" />
      </TabsContent>

      <TabsContent id="logs">
        <ContainerLogsPanel serviceId={serviceId} />
      </TabsContent>
    </Tabs>
  );
}
