"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { CpuIcon, HardDriveIcon, RamMemoryIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/app/providers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format-bytes";

function severityClass(percent: number): string {
  if (percent >= 90) return "text-destructive";
  if (percent >= 75) return "text-amber-600 dark:text-amber-500";
  return "text-foreground";
}

interface StatCardProps {
  icon: IconSvgElement;
  title: string;
  percent: number;
  headline: string;
  caption: string;
}

function StatCard({ icon, title, percent, headline, caption }: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={icon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <p className="font-heading text-2xl font-semibold">{headline}</p>
          <p className={`text-sm font-medium tabular-nums ${severityClass(percent)}`}>{percent}%</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
        <Progress
          value={percent}
          minValue={0}
          maxValue={100}
          aria-label={`${title} usage`}
          className={`mt-4 ${percent >= 90 ? "[&_[data-slot=progress-indicator]]:bg-destructive" : percent >= 75 ? "[&_[data-slot=progress-indicator]]:bg-amber-500" : ""}`}
        />
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-16" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-32" />
        <Skeleton className="mt-4 h-3 w-full" />
      </CardContent>
    </Card>
  );
}

export function MonitoringPanel() {
  const stats = trpc.systemStats.get.useQuery(undefined, { refetchInterval: 4000 });

  if (!stats.data) {
    if (stats.isError) {
      return <p className="text-sm text-destructive">{stats.error.message}</p>;
    }
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  const { cpu, memory, disk } = stats.data;
  const memPercent = memory.totalBytes > 0 ? Math.round((memory.usedBytes / memory.totalBytes) * 100) : 0;
  const diskPercent = disk.totalBytes > 0 ? Math.round((disk.usedBytes / disk.totalBytes) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={CpuIcon}
          title="CPU"
          percent={cpu.percent}
          headline={`${cpu.percent}%`}
          caption="Current load across all cores"
        />
        <StatCard
          icon={RamMemoryIcon}
          title="Memory"
          percent={memPercent}
          headline={formatBytes(memory.usedBytes)}
          caption={`of ${formatBytes(memory.totalBytes)} used`}
        />
        <StatCard
          icon={HardDriveIcon}
          title="Disk space"
          percent={diskPercent}
          headline={formatBytes(disk.usedBytes)}
          caption={`of ${formatBytes(disk.totalBytes)} used`}
        />
      </div>
      <p className="text-xs text-muted-foreground">Updates automatically every few seconds.</p>
    </div>
  );
}
