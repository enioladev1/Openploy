"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { CubeIcon, Database02Icon, Delete02Icon, Layers02Icon, PackageIcon, ReloadIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format-bytes";

interface CategoryCardProps {
  icon: IconSvgElement;
  title: string;
  totalCount: number;
  activeCount: number;
  totalBytes: number;
  reclaimableBytes: number;
  action?: React.ReactNode;
}

function CategoryCard({ icon, title, totalCount, activeCount, totalBytes, reclaimableBytes, action }: CategoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={icon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
          {title}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-semibold">{formatBytes(totalBytes)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeCount} active / {totalCount} total
          {reclaimableBytes > 0 && <span className="text-foreground"> - {formatBytes(reclaimableBytes)} reclaimable</span>}
        </p>
      </CardContent>
    </Card>
  );
}

export function DiskUsagePanel() {
  const utils = trpc.useUtils();
  const snapshot = trpc.diskUsage.getSnapshot.useQuery(undefined, { refetchInterval: 5000 });
  const [pruneAllImages, setPruneAllImages] = useState(false);
  const [volumeToDelete, setVolumeToDelete] = useState<string | null>(null);

  const invalidate = () => void utils.diskUsage.getSnapshot.invalidate();

  const check = trpc.diskUsage.check.useMutation({
    onSuccess: () => {
      toast.success("Checking disk usage...");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const pruneContainers = trpc.diskUsage.pruneContainers.useMutation({
    onSuccess: () => {
      toast.success("Pruning stopped containers...");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const pruneImages = trpc.diskUsage.pruneImages.useMutation({
    onSuccess: () => {
      toast.success("Pruning unused images...");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const pruneBuildCache = trpc.diskUsage.pruneBuildCache.useMutation({
    onSuccess: () => {
      toast.success("Pruning build cache...");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const removeVolume = trpc.diskUsage.removeOrphanedVolume.useMutation({
    onSuccess: () => {
      toast.success("Removing volume...");
      setVolumeToDelete(null);
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const summary = snapshot.data?.summary;
  const orphanedVolumes = snapshot.data?.orphanedVolumes ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {snapshot.data ? `Last checked ${new Date(snapshot.data.checkedAt).toLocaleString()}` : "Never checked yet"}
        </p>
        <Button variant="outline" size="sm" isDisabled={check.isPending} onPress={() => check.mutate()}>
          {check.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />}
          Refresh
        </Button>
      </div>

      {!summary ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Database02Icon} size={20} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No disk usage data yet</EmptyTitle>
            <EmptyDescription>Click Refresh above to check what&apos;s using space.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CategoryCard
              icon={PackageIcon}
              title="Images"
              totalCount={summary.images.totalCount}
              activeCount={summary.images.activeCount}
              totalBytes={summary.images.totalBytes}
              reclaimableBytes={summary.images.reclaimableBytes}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={pruneImages.isPending}
                  onPress={() => pruneImages.mutate({ all: pruneAllImages })}
                >
                  {pruneImages.isPending && <Spinner className="size-4" />}
                  Prune
                </Button>
              }
            />
            <CategoryCard
              icon={CubeIcon}
              title="Containers"
              totalCount={summary.containers.totalCount}
              activeCount={summary.containers.activeCount}
              totalBytes={summary.containers.totalBytes}
              reclaimableBytes={summary.containers.reclaimableBytes}
              action={
                <Button variant="outline" size="sm" isDisabled={pruneContainers.isPending} onPress={() => pruneContainers.mutate()}>
                  {pruneContainers.isPending && <Spinner className="size-4" />}
                  Prune
                </Button>
              }
            />
            <CategoryCard
              icon={Database02Icon}
              title="Volumes"
              totalCount={summary.volumes.totalCount}
              activeCount={summary.volumes.activeCount}
              totalBytes={summary.volumes.totalBytes}
              reclaimableBytes={summary.volumes.reclaimableBytes}
            />
            <CategoryCard
              icon={Layers02Icon}
              title="Build cache"
              totalCount={summary.buildCache.totalCount}
              activeCount={summary.buildCache.activeCount}
              totalBytes={summary.buildCache.totalBytes}
              reclaimableBytes={summary.buildCache.reclaimableBytes}
              action={
                <Button variant="outline" size="sm" isDisabled={pruneBuildCache.isPending} onPress={() => pruneBuildCache.mutate()}>
                  {pruneBuildCache.isPending && <Spinner className="size-4" />}
                  Prune
                </Button>
              }
            />
          </div>

          <Field orientation="horizontal" className="w-auto gap-2">
            <Checkbox id="prune-all-images" isSelected={pruneAllImages} onChange={setPruneAllImages} />
            <FieldLabel htmlFor="prune-all-images" className="font-normal">
              When pruning images, also remove old deployment images (not just untagged ones)
            </FieldLabel>
          </Field>

          <Card>
            <CardHeader>
              <CardTitle>Orphaned volumes</CardTitle>
            </CardHeader>
            <CardContent>
              {orphanedVolumes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None found - these are data volumes left behind by services that have since been deleted.
                </p>
              ) : (
                <ItemGroup>
                  {orphanedVolumes.map((volume) => (
                    <Item key={volume.name} variant="outline" size="sm">
                      <ItemMedia variant="icon">
                        <HugeiconsIcon icon={Database02Icon} size={16} strokeWidth={2} />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{volume.name}</ItemTitle>
                        <ItemDescription>
                          {formatBytes(volume.sizeBytes)}
                          {volume.formerServiceId && ` - from a deleted service (${volume.formerServiceId.slice(0, 8)})`}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Button variant="outline" size="sm" onPress={() => setVolumeToDelete(volume.name)}>
                          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                          Delete
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {volumeToDelete && (
        <Dialog isOpen onOpenChange={(open) => !open && setVolumeToDelete(null)} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete volume</DialogTitle>
            <DialogDescription>
              Delete <strong>{volumeToDelete}</strong>? This permanently deletes its data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={removeVolume.isPending} onPress={() => setVolumeToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isDisabled={removeVolume.isPending}
              onPress={() => removeVolume.mutate({ volumeName: volumeToDelete })}
            >
              {removeVolume.isPending && <Spinner className="size-4" />}
              {removeVolume.isPending ? "Deleting..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
