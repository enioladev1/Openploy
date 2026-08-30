"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/app/providers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { EnvVarScopeEditor } from "./env-var-scope-editor";

export function EnvVarsPanel({ serviceId }: { serviceId: string }) {
  const service = trpc.services.get.useQuery({ id: serviceId });
  const hasDeployedBefore = Boolean(service.data?.currentDeploymentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Environment variables</CardTitle>
      </CardHeader>
      <CardContent>
        {hasDeployedBefore && (
          <Alert className="mb-4">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
            <AlertDescription>
              Changes here don&apos;t apply automatically - redeploy after making changes for them to take effect.
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <EnvVarScopeEditor serviceId={serviceId} scope="runtime" title="Runtime" />
          <Separator />
          <EnvVarScopeEditor serviceId={serviceId} scope="build" title="Build-time" />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
