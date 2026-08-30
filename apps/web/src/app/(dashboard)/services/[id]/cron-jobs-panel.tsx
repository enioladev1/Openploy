"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, ClockAddIcon, Delete02Icon, Edit02Icon, HistoryIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const SCHEDULE_PRESETS = [
  { value: "* * * * *", label: "Every minute" },
  { value: "*/5 * * * *", label: "Every 5 minutes" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 */12 * * *", label: "Every 12 hours" },
  { value: "0 0 * * *", label: "Every 24 hours" },
  { value: "manual", label: "Manual (custom cron expression)" },
] as const;

const PRESET_VALUES = new Set<string>(SCHEDULE_PRESETS.map((option) => option.value).filter((v) => v !== "manual"));

interface EditTarget {
  id: string;
  name: string;
  command: string;
  cronExpression: string;
}

function CronJobFormDialog({ serviceId, editTarget, onClose }: { serviceId: string; editTarget: EditTarget | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const isEditing = editTarget !== null;
  const startsManual = isEditing && !PRESET_VALUES.has(editTarget.cronExpression);

  const [name, setName] = useState(editTarget?.name ?? "");
  const [command, setCommand] = useState(editTarget?.command ?? "");
  const [preset, setPreset] = useState<string>(startsManual ? "manual" : (editTarget?.cronExpression ?? SCHEDULE_PRESETS[0].value));
  const [manualExpression, setManualExpression] = useState(startsManual ? editTarget.cronExpression : "");
  const isManual = preset === "manual";
  const cronExpression = isManual ? manualExpression : preset;

  const invalidate = () => {
    void utils.cronJobs.list.invalidate({ serviceId });
  };

  const create = trpc.cronJobs.create.useMutation({
    onSuccess: () => {
      toast.success("Scheduled task created");
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.cronJobs.update.useMutation({
    onSuccess: () => {
      toast.success("Scheduled task updated");
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Edit scheduled task" : "Create scheduled task"}</DialogTitle>
        <DialogDescription>Runs a command inside this service&apos;s container on a schedule.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isEditing) {
            update.mutate({ id: editTarget.id, name, command, cronExpression });
          } else {
            create.mutate({ serviceId, name, command, cronExpression });
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cronName">Name</FieldLabel>
            <Input id="cronName" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <Field>
            <FieldLabel htmlFor="cronPreset">Schedule</FieldLabel>
            <Select selectedKey={preset} onSelectionChange={(key) => setPreset(key as string)} className="w-full">
              <SelectTrigger id="cronPreset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_PRESETS.map((option) => (
                  <SelectItem key={option.value} id={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {isManual && (
            <Field>
              <FieldLabel htmlFor="manualCronExpression">Cron expression</FieldLabel>
              <Input
                id="manualCronExpression"
                value={manualExpression}
                onChange={(e) => setManualExpression(e.target.value)}
                placeholder="*/10 * * * *"
                className="font-mono"
                required
              />
              <FieldDescription>Standard 5-field cron syntax, e.g. &quot;0 3 * * *&quot; for daily at 3am.</FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="command">Command</FieldLabel>
            <Textarea
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="php artisan migrate"
              className="font-mono text-sm"
              rows={3}
              required
            />
            <FieldDescription>
              Runs inside this service&apos;s container via <code>sh -c</code>, exactly as typed.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onPress={onClose}>
            Cancel
          </Button>
          <Button type="submit" isDisabled={isPending}>
            {isPending && <Spinner className="size-4" />}
            {isPending ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save changes" : "Create scheduled task"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function CronJobHistoryDialog({ cronJobId, name, onClose }: { cronJobId: string; name: string; onClose: () => void }) {
  const runs = trpc.cronJobs.listRuns.useQuery({ cronJobId }, { refetchInterval: 4000 });
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Run history</DialogTitle>
        <DialogDescription>{name} - click a run to see its command and output.</DialogDescription>
      </DialogHeader>

      {!runs.data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : runs.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {runs.data.map((run) => {
            const isExpanded = expandedRunId === run.id;
            return (
              <div key={run.id} className="rounded-2xl border border-border">
                <button
                  type="button"
                  onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <StatusBadge status={run.status} />
                    <span className="text-sm text-muted-foreground">{new Date(run.startedAt).toLocaleString()}</span>
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-border px-3 py-2.5">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Command</p>
                    <pre className="mb-3 overflow-auto rounded-lg bg-muted p-2 text-xs whitespace-pre-wrap">{run.command}</pre>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Output</p>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-2 text-xs whitespace-pre-wrap">
                      {run.output || (run.status === "running" ? "Still running..." : "(no output)")}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DialogFooter className="mt-2">
        <Button variant="outline" onPress={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export function CronJobsPanel({ serviceId }: { serviceId: string }) {
  const utils = trpc.useUtils();
  const jobs = trpc.cronJobs.list.useQuery({ serviceId }, { refetchInterval: 4000 });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const invalidate = () => void utils.cronJobs.list.invalidate({ serviceId });

  const setEnabled = trpc.cronJobs.setEnabled.useMutation({
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  const deleteJob = trpc.cronJobs.delete.useMutation({
    onSuccess: () => {
      toast.success("Scheduled task removed");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const runNow = trpc.cronJobs.runNow.useMutation({
    onSuccess: () => {
      toast.success("Scheduled task started");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Scheduled tasks</CardTitle>
          <Button size="sm" onPress={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={ClockAddIcon} size={14} strokeWidth={2} />
            Create scheduled task
          </Button>
        </CardHeader>
        <CardContent>
          {jobs.data?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={Clock01Icon} size={20} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>No scheduled tasks yet</EmptyTitle>
                <EmptyDescription>Create one to run a command inside this container on a schedule.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {jobs.data?.map((job) => (
                <Item key={job.id} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>
                      {job.name}
                      {job.lastRunStatus && <StatusBadge status={job.lastRunStatus} />}
                    </ItemTitle>
                    <ItemDescription>
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">{job.cronExpression}</code>
                      {" - "}
                      <code className="text-xs">{job.command}</code>
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      aria-label={job.isEnabled ? "Disable scheduled task" : "Enable scheduled task"}
                      isSelected={job.isEnabled}
                      onChange={(isEnabled) => setEnabled.mutate({ id: job.id, isEnabled })}
                    />
                    <Button variant="outline" size="sm" onPress={() => setHistoryTarget({ id: job.id, name: job.name })}>
                      <HugeiconsIcon icon={HistoryIcon} size={14} strokeWidth={2} />
                      History
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={job.lastRunStatus === "running" || (runNow.isPending && runNow.variables?.id === job.id)}
                      onPress={() => runNow.mutate({ id: job.id })}
                    >
                      {runNow.isPending && runNow.variables?.id === job.id ? (
                        <Spinner className="size-4" />
                      ) : (
                        <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
                      )}
                      Run now
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${job.name}`}
                      onPress={() =>
                        setEditTarget({ id: job.id, name: job.name, command: job.command, cronExpression: job.cronExpression })
                      }
                    >
                      <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={2} className="text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${job.name}`}
                      onPress={() => setDeleteTarget({ id: job.id, name: job.name })}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={2} className="text-muted-foreground" />
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      {createOpen && <CronJobFormDialog serviceId={serviceId} editTarget={null} onClose={() => setCreateOpen(false)} />}

      {editTarget && <CronJobFormDialog serviceId={serviceId} editTarget={editTarget} onClose={() => setEditTarget(null)} />}

      {historyTarget && (
        <CronJobHistoryDialog cronJobId={historyTarget.id} name={historyTarget.name} onClose={() => setHistoryTarget(null)} />
      )}

      {deleteTarget && (
        <Dialog isOpen onOpenChange={(open) => !open && setDeleteTarget(null)} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete scheduled task</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget.name}</strong>? This stops future runs. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={deleteJob.isPending} onPress={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" isDisabled={deleteJob.isPending} onPress={() => deleteJob.mutate({ id: deleteTarget.id })}>
              {deleteJob.isPending && <Spinner className="size-4" />}
              {deleteJob.isPending ? "Removing..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
