import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { BoxIcon, Database02Icon, Folder02Icon, Layers01Icon, PlayIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { getAuth } from "@/server/get-auth";
import { getDashboardStats, getRunningContainers } from "@/server/services/dashboard-service";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/format-duration";

interface StatCardProps {
  href: string;
  label: string;
  value: number;
  icon: IconSvgElement;
}

function StatCard({ href, label, value, icon }: StatCardProps) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-lg">
        <CardContent className="flex items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <HugeiconsIcon icon={icon} size={20} strokeWidth={2} className="text-foreground" />
          </div>
          <div>
            <p className="font-heading text-2xl font-semibold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DashboardPage() {
  const auth = await getAuth();
  if (!auth) return null;

  const [stats, runningContainers] = await Promise.all([
    getDashboardStats(auth.organizationId),
    getRunningContainers(auth.organizationId),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard href="/projects" label="Projects" value={stats.projectCount} icon={Folder02Icon} />
        <StatCard href="/projects" label="Applications" value={stats.applicationCount} icon={SourceCodeIcon} />
        <StatCard href="/projects" label="Databases" value={stats.databaseCount} icon={Database02Icon} />
        <StatCard href="/projects" label="Compose" value={stats.composeCount} icon={Layers01Icon} />
        <StatCard href="/projects" label="Running" value={stats.runningCount} icon={PlayIcon} />
      </div>

      <h2 className="mt-8 mb-4 text-sm font-medium text-muted-foreground">Running containers</h2>

      {runningContainers.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={BoxIcon} size={20} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Nothing running</EmptyTitle>
            <EmptyDescription>Deploy a service to see it here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableHead isRowHeader>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uptime</TableHead>
              </TableHeader>
              <TableBody>
                {runningContainers.map((container) => (
                  <TableRow key={container.id} id={container.id}>
                    <TableCell className="font-medium">{container.name}</TableCell>
                    <TableCell>
                      <StatusBadge status="running" />
                    </TableCell>
                    <TableCell>{formatDuration(Date.now() - container.since.getTime())}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
