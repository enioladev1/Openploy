import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getOrgScopedService } from "@openploy/db";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { getAuth } from "@/server/get-auth";
import { getProject } from "@/server/services/project-service";
import { db } from "@/server/db";
import { LinkButton } from "@/components/ui/button";
import { ApplicationServiceView } from "./application-view";
import { DatabaseServiceView } from "./database-view";
import { ComposeServiceView } from "./compose-view";
import { DeleteServiceButton } from "./delete-service-button";
import { RenameServiceButton } from "./rename-service-button";
import { ServiceLifecycleControls } from "./service-lifecycle-controls";

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return null;

  const { id } = await params;
  const service = await getOrgScopedService(db, auth.organizationId, id);
  if (!service) notFound();

  const project = await getProject(auth.organizationId, service.projectId).catch(() => null);

  return (
    <div>
      <LinkButton variant="link" href={`/projects/${service.projectId}`} className="mb-2 h-auto p-0">
        <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} />
        {project?.name ?? "Project"}
      </LinkButton>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <RenameServiceButton serviceId={service.id} serviceName={service.name} />
          <ServiceLifecycleControls
            serviceId={service.id}
            initialRuntimeStatus={service.runtimeStatus}
            serviceType={service.type}
          />
        </div>
        <DeleteServiceButton
          serviceId={service.id}
          serviceName={service.name}
          serviceType={service.type}
          projectId={service.projectId}
        />
      </div>

      <Suspense fallback={null}>
        {service.type === "application" && <ApplicationServiceView serviceId={service.id} />}
        {service.type === "database" && <DatabaseServiceView serviceId={service.id} />}
        {service.type === "compose" && <ComposeServiceView serviceId={service.id} />}
      </Suspense>
    </div>
  );
}
