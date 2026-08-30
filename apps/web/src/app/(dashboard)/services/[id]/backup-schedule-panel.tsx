"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseBackupIcon, Delete02Icon, PlayIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";
import { Switch } from "@/components/ui/switch";

const FREQUENCY_LABELS: Record<string, string> = {
  hourly: "Every hour",
  every_6_hours: "Every 6 hours",
  every_12_hours: "Every 12 hours",
  daily: "Daily",
  weekly: "Weekly",
};

const BACKUPABLE_ENGINES = new Set(["postgres", "mysql", "redis", "mariadb", "mongodb"]);

function CreateBackupScheduleDialog({ serviceId, onClose }: { serviceId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const storageConfigs = trpc.backups.list.useQuery();

  const [name, setName] = useState("");
  const [backupStorageConfigId, setBackupStorageConfigId] = useState("");
  const [frequency, setFrequency] = useState<"hourly" | "every_6_hours" | "every_12_hours" | "daily" | "weekly">("daily");
  const [retentionCount, setRetentionCount] = useState("");

  const create = trpc.databaseBackups.create.useMutation({
    onSuccess: () => {
      toast.success("Backup schedule created");
      void utils.databaseBackups.list.invalidate({ serviceId });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Create backup schedule</DialogTitle>
        <DialogDescription>Automatically back this database up on a recurring schedule.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!backupStorageConfigId) {
            toast.error("Select a backup storage destination first");
            return;
          }
          create.mutate({
            serviceId,
            backupStorageConfigId,
            name,
            frequency,
            retentionCount: retentionCount.trim() ? Number(retentionCount) : null,
          });
        }}
      >
        <FieldGroup>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            <Field>
              <FieldLabel htmlFor="backupName">Name</FieldLabel>
              <Input id="backupName" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            <Field>
              <FieldLabel htmlFor="frequency">Duration</FieldLabel>
              <Select selectedKey={frequency} onSelectionChange={(key) => setFrequency(key as typeof frequency)}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} id={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="storage">Backup storage</FieldLabel>
              <Select
                placeholder={storageConfigs.data?.length === 0 ? "No storage connected yet" : "Select a destination"}
                selectedKey={backupStorageConfigId || null}
                onSelectionChange={(key) => setBackupStorageConfigId(key as string)}
                isRequired
              >
                <SelectTrigger id="storage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {storageConfigs.data?.map((config) => (
                    <SelectItem key={config.id} id={config.id}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {storageConfigs.data?.length === 0 && (
                <FieldDescription>
                  Connect a backup destination in <a href="/settings/backups">Settings &rsaquo; Backups</a> first.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="retentionCount">Retention (optional)</FieldLabel>
              <Input
                id="retentionCount"
                type="number"
                min={1}
                value={retentionCount}
                onChange={(e) => setRetentionCount(e.target.value)}
                placeholder="Keep forever"
              />
            </Field>
          </div>

          <FieldDescription>
            Backups upload to <code>openploy-{"<service name>"}/</code> in the chosen bucket. With retention set, older
            backups beyond that count are deleted automatically after each run.
          </FieldDescription>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" isDisabled={create.isPending} onPress={onClose}>
              Cancel
            </Button>
            <Button type="submit" isDisabled={create.isPending}>
              {create.isPending && <Spinner className="size-4" />}
              {create.isPending ? "Creating..." : "Create schedule"}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </Dialog>
  );
}

export function BackupSchedulePanel({ serviceId, engine }: { serviceId: string; engine: string }) {
  const utils = trpc.useUtils();
  const schedules = trpc.databaseBackups.list.useQuery({ serviceId }, { refetchInterval: 4000 });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const setEnabled = trpc.databaseBackups.setEnabled.useMutation({
    onSuccess: () => void utils.databaseBackups.list.invalidate({ serviceId }),
    onError: (err) => toast.error(err.message),
  });

  const deleteSchedule = trpc.databaseBackups.delete.useMutation({
    onSuccess: () => {
      toast.success("Backup schedule removed");
      setDeleteTarget(null);
      void utils.databaseBackups.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const runNow = trpc.databaseBackups.runNow.useMutation({
    onSuccess: () => {
      toast.success("Backup started");
      void utils.databaseBackups.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!BACKUPABLE_ENGINES.has(engine)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={DatabaseBackupIcon} size={20} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>Not supported yet</EmptyTitle>
              <EmptyDescription>Scheduled backups aren&apos;t available for {engine} yet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled backups</CardTitle>
          <CardAction>
            <Button size="sm" onPress={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
              Add schedule
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {schedules.data?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={DatabaseBackupIcon} size={20} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>No backup schedules yet</EmptyTitle>
                <EmptyDescription>Create one below to back this database up automatically.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {schedules.data?.map((schedule) => (
                <Item key={schedule.id} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>
                      {schedule.name}
                      {schedule.lastRunStatus && (
                        <StatusBadge
                          status={schedule.lastRunStatus}
                          // StatusBadge's shared map treats "running" as green (a live
                          // container/service) - here it means "backup in progress", so
                          // override to the same amber used for pending/building/deploying.
                          {...(schedule.lastRunStatus === "running"
                            ? { className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" }
                            : {})}
                        />
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      {FREQUENCY_LABELS[schedule.frequency]} to {schedule.backupStorageName}
                      {schedule.retentionCount ? ` - keeps last ${schedule.retentionCount}` : ""}
                      {schedule.lastRunAt && ` - last run ${new Date(schedule.lastRunAt).toLocaleString()}`}
                      {schedule.lastRunError && ` - ${schedule.lastRunError}`}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      aria-label={schedule.isEnabled ? "Disable schedule" : "Enable schedule"}
                      isSelected={schedule.isEnabled}
                      onChange={(isEnabled) => setEnabled.mutate({ id: schedule.id, isEnabled })}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={schedule.lastRunStatus === "running" || (runNow.isPending && runNow.variables?.id === schedule.id)}
                      onPress={() => runNow.mutate({ id: schedule.id })}
                    >
                      {runNow.isPending && runNow.variables?.id === schedule.id ? (
                        <Spinner className="size-4" />
                      ) : (
                        <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
                      )}
                      Backup now
                    </Button>
                    <Button variant="outline" size="sm" onPress={() => setDeleteTarget({ id: schedule.id, name: schedule.name })}>
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

      {createOpen && <CreateBackupScheduleDialog serviceId={serviceId} onClose={() => setCreateOpen(false)} />}

      {deleteTarget && (
        <Dialog isOpen onOpenChange={(open) => !open && setDeleteTarget(null)} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete backup schedule</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget.name}</strong>? This stops future runs - it does not delete backups already
              uploaded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={deleteSchedule.isPending} onPress={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isDisabled={deleteSchedule.isPending}
              onPress={() => deleteSchedule.mutate({ id: deleteTarget.id })}
            >
              {deleteSchedule.isPending && <Spinner className="size-4" />}
              {deleteSchedule.isPending ? "Removing..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
