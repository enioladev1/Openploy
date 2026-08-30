"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit02Icon,
  Mail01Icon,
  Notification03Icon,
  PlusSignIcon,
  ReloadIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";
import { NotificationChannelDialog, type NotificationChannelRow } from "./notification-channel-dialog";

const TYPE_ICONS = { telegram: SentIcon, smtp: Mail01Icon, resend: Mail01Icon };
const TYPE_LABELS = { telegram: "Telegram", smtp: "SMTP email", resend: "Resend" };

const EVENT_BADGES: Array<{ key: keyof NotificationChannelRow; label: string }> = [
  { key: "notifyOnDeploymentSuccess", label: "Deploy success" },
  { key: "notifyOnDeploymentFailed", label: "Deploy failed" },
  { key: "notifyOnBackupSuccess", label: "Backup success" },
  { key: "notifyOnBackupFailed", label: "Backup failed" },
];

export function NotificationsPanel() {
  const utils = trpc.useUtils();
  const channels = trpc.notifications.list.useQuery();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannelRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const testSavedConnection = trpc.notifications.testSavedConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success("Connection successful");
      else toast.error(result.error ?? "Connection failed");
      void utils.notifications.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteChannel = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      toast.success("Notification channel removed");
      setDeleteTarget(null);
      void utils.notifications.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreateDialog() {
    setEditingChannel(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(channel: NotificationChannelRow) {
    setEditingChannel(channel);
    setIsDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button onPress={openCreateDialog}>
          <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />
          Create notification
        </Button>
      </div>

      {channels.data?.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Notification03Icon} size={20} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No notification channels yet</EmptyTitle>
            <EmptyDescription>Connect Telegram, SMTP email, or Resend to get alerted on deploys and backups.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup>
          {channels.data?.map((channel) => (
            <Item key={channel.id} variant="outline" size="sm">
              <ItemMedia variant="icon">
                <HugeiconsIcon icon={TYPE_ICONS[channel.type as keyof typeof TYPE_ICONS]} size={18} strokeWidth={2} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {channel.name}
                  {!channel.isEnabled && <Badge variant="secondary">Disabled</Badge>}
                  {channel.lastTestStatus && <StatusBadge status={channel.lastTestStatus} />}
                </ItemTitle>
                <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{TYPE_LABELS[channel.type as keyof typeof TYPE_LABELS]}</span>
                  {EVENT_BADGES.filter((event) => channel[event.key]).map((event) => (
                    <Badge key={event.key} variant="outline">
                      {event.label}
                    </Badge>
                  ))}
                </ItemDescription>
                {channel.lastTestError && <ItemDescription className="text-destructive">{channel.lastTestError}</ItemDescription>}
              </ItemContent>
              <ItemActions>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={testSavedConnection.isPending && testSavedConnection.variables?.id === channel.id}
                  onPress={() => testSavedConnection.mutate({ id: channel.id })}
                >
                  {testSavedConnection.isPending && testSavedConnection.variables?.id === channel.id ? (
                    <Spinner className="size-4" />
                  ) : (
                    <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
                  )}
                  Test
                </Button>
                <Button variant="outline" size="sm" onPress={() => openEditDialog(channel as NotificationChannelRow)}>
                  <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onPress={() => setDeleteTarget({ id: channel.id, name: channel.name })}>
                  <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                  Delete
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      {isDialogOpen && (
        <NotificationChannelDialog
          onOpenChange={setIsDialogOpen}
          editingChannel={editingChannel}
          onSaved={() => setIsDialogOpen(false)}
        />
      )}

      {deleteTarget && (
        <Dialog isOpen onOpenChange={(open) => !open && setDeleteTarget(null)} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete notification channel</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget.name}</strong>? It will stop receiving alerts immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={deleteChannel.isPending} onPress={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" isDisabled={deleteChannel.isPending} onPress={() => deleteChannel.mutate({ id: deleteTarget.id })}>
              {deleteChannel.isPending && <Spinner className="size-4" />}
              {deleteChannel.isPending ? "Removing..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
