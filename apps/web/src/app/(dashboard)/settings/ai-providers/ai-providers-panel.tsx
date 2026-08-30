"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiBrain01Icon, Delete02Icon, Edit02Icon, PlusSignIcon, ReloadIcon } from "@hugeicons/core-free-icons";
import type { AiProviderKind } from "@openploy/shared";
import { AI_PROVIDER_DEFAULTS } from "@openploy/shared";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";
import { AiProviderDialog, type AiProviderRow } from "./ai-provider-dialog";

export function AiProvidersPanel() {
  const utils = trpc.useUtils();
  const providers = trpc.aiProviders.list.useQuery();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProviderRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const testSavedConnection = trpc.aiProviders.testSavedConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success("Connection successful");
      else toast.error(result.error ?? "Connection failed");
      void utils.aiProviders.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteProvider = trpc.aiProviders.delete.useMutation({
    onSuccess: () => {
      toast.success("AI provider removed");
      setDeleteTarget(null);
      void utils.aiProviders.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreateDialog() {
    setEditingProvider(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(provider: AiProviderRow) {
    setEditingProvider(provider);
    setIsDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button onPress={openCreateDialog}>
          <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />
          Connect provider
        </Button>
      </div>

      {providers.data?.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={AiBrain01Icon} size={20} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No AI providers connected</EmptyTitle>
            <EmptyDescription>Connect OpenAI, Anthropic, or OpenRouter to debug deployment and container logs with AI.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup>
          {providers.data?.map((provider) => (
            <Item key={provider.id} variant="outline" size="sm">
              <ItemMedia variant="icon">
                <HugeiconsIcon icon={AiBrain01Icon} size={18} strokeWidth={2} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {provider.name}
                  {!provider.isEnabled && <Badge variant="secondary">Disabled</Badge>}
                  {provider.lastTestStatus && <StatusBadge status={provider.lastTestStatus} />}
                </ItemTitle>
                <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{AI_PROVIDER_DEFAULTS[provider.provider as AiProviderKind].label}</span>
                  <Badge variant="outline">{provider.model}</Badge>
                </ItemDescription>
                {provider.lastTestError && <ItemDescription className="text-destructive">{provider.lastTestError}</ItemDescription>}
              </ItemContent>
              <ItemActions>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={testSavedConnection.isPending && testSavedConnection.variables?.id === provider.id}
                  onPress={() => testSavedConnection.mutate({ id: provider.id })}
                >
                  {testSavedConnection.isPending && testSavedConnection.variables?.id === provider.id ? (
                    <Spinner className="size-4" />
                  ) : (
                    <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
                  )}
                  Test
                </Button>
                <Button variant="outline" size="sm" onPress={() => openEditDialog(provider as AiProviderRow)}>
                  <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onPress={() => setDeleteTarget({ id: provider.id, name: provider.name })}>
                  <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                  Delete
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}

      {isDialogOpen && (
        <AiProviderDialog onOpenChange={setIsDialogOpen} editingProvider={editingProvider} onSaved={() => setIsDialogOpen(false)} />
      )}

      {deleteTarget && (
        <Dialog isOpen onOpenChange={(open) => !open && setDeleteTarget(null)} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete AI provider</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget.name}</strong>? It will no longer be available for debugging logs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={deleteProvider.isPending} onPress={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" isDisabled={deleteProvider.isPending} onPress={() => deleteProvider.mutate({ id: deleteTarget.id })}>
              {deleteProvider.isPending && <Spinner className="size-4" />}
              {deleteProvider.isPending ? "Removing..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
