import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Database02Icon, Folder02Icon, Layers01Icon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { TEMPLATE_CATALOG } from "@openploy/shared";
import { getAuth } from "@/server/get-auth";
import { groupServiceIcons } from "@/lib/group-service-icons";
import { listProjects } from "@/server/services/project-service";
import { LinkButton } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CreateProjectDialog } from "./create-project-dialog";

const SERVICE_TYPE_ICONS: Record<string, IconSvgElement> = {
  application: SourceCodeIcon,
  database: Database02Icon,
  compose: Layers01Icon,
};

const ENGINE_LOGOS: Record<string, string> = {
  postgres: "/logos/postgresql.png",
  mysql: "/logos/mysql.png",
  mariadb: "/logos/mariadb.png",
  redis: "/logos/redis.png",
  clickhouse: "/logos/clickhouse.png",
  mongodb: "/logos/mongodb.png",
};

const TEMPLATE_LOGOS: Record<string, string> = Object.fromEntries(TEMPLATE_CATALOG.map((t) => [t.id, t.logo]));

export default async function ProjectsPage() {
  const auth = await getAuth();
  if (!auth) return null; // layout already redirects; this satisfies the type checker

  const projects = await listProjects(auth.organizationId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold">Projects</h1>
        <CreateProjectDialog />
      </div>
      {projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Folder02Icon} size={20} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>Create a project above to start deploying services.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="overflow-hidden">
              <div className="-mt-(--card-spacing) flex h-28 flex-wrap items-center justify-center gap-2 overflow-hidden rounded-t-4xl bg-gradient-to-br from-foreground/[0.07] to-foreground/[0.02] p-3">
                {project.services.length === 0 ? (
                  <HugeiconsIcon icon={Folder02Icon} size={26} strokeWidth={1.5} className="text-foreground/20" />
                ) : (
                  groupServiceIcons(project.services).map((group) => {
                    const logo = group.templateId
                      ? TEMPLATE_LOGOS[group.templateId]
                      : group.engine
                        ? ENGINE_LOGOS[group.engine]
                        : undefined;
                    return (
                      <div key={group.templateId ?? group.engine ?? group.type} className="relative shrink-0">
                        <div className="flex size-11 items-center justify-center overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-foreground/10">
                          {logo ? (
                            <Image
                              src={logo}
                              alt={group.templateId ?? group.engine ?? group.type}
                              width={group.templateId ? 44 : 22}
                              height={group.templateId ? 44 : 22}
                              className="object-cover"
                            />
                          ) : (
                            <HugeiconsIcon
                              icon={SERVICE_TYPE_ICONS[group.type] ?? SourceCodeIcon}
                              size={18}
                              strokeWidth={1.75}
                              className="text-foreground/70"
                            />
                          )}
                        </div>
                        {group.count > 1 && (
                          <span className="absolute -right-1.5 -bottom-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background ring-2 ring-card">
                            {group.count}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>
                  {project.serviceCount} service{project.serviceCount === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <LinkButton href={`/projects/${project.id}`} variant="outline" className="w-full">
                  View project
                </LinkButton>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
