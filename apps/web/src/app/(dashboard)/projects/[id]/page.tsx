import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { getAuth } from "@/server/get-auth";
import { getProject } from "@/server/services/project-service";
import { LinkButton } from "@/components/ui/button";
import { CreateServiceDialog } from "./create-service-dialog";
import { DeleteProjectButton } from "./delete-project-button";
import { ProjectServicesPanel } from "./project-services-panel";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return null;

  const { id } = await params;
  const project = await getProject(auth.organizationId, id).catch(() => null);
  if (!project) notFound();

  return (
    <div>
      <LinkButton variant="link" href="/projects" className="mb-2 h-auto p-0">
        <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} />
        Projects
      </LinkButton>

      <div className="mb-6 flex items-start justify-between">
        <h1 className="text-xl font-heading font-semibold">{project.name}</h1>
        <div className="flex gap-2">
          <CreateServiceDialog projectId={project.id} />
          <DeleteProjectButton projectId={project.id} projectName={project.name} />
        </div>
      </div>

      <ProjectServicesPanel projectId={project.id} />
    </div>
  );
}
