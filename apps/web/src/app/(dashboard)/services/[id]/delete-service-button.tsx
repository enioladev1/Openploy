"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

interface DeleteServiceButtonProps {
  serviceId: string;
  serviceName: string;
  serviceType: "application" | "database" | "compose";
  projectId: string;
}

export function DeleteServiceButton({ serviceId, serviceName, serviceType, projectId }: DeleteServiceButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [deleteVolumes, setDeleteVolumes] = useState(false);

  const deleteMutation = trpc.services.delete.useMutation({
    onSuccess: () => {
      toast.success(`"${serviceName}" deleted`);
      router.push(`/projects/${projectId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <Button
        variant="outline"
        onPress={() => {
          setDeleteVolumes(false);
          setIsOpen(true);
        }}
      >
        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
        Delete service
      </Button>

      {isOpen && (
        <Dialog isOpen onOpenChange={setIsOpen} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete service</DialogTitle>
            <DialogDescription>
              Delete <strong>{serviceName}</strong>? This removes its deployments, env vars, and domains, and tears
              down its running containers. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {serviceType !== "application" && (
            <Field orientation="horizontal" className="gap-2">
              <Checkbox id="delete-volumes" isSelected={deleteVolumes} onChange={setDeleteVolumes} />
              <FieldLabel htmlFor="delete-volumes" className="font-normal">
                Also delete its data volume(s) - this permanently deletes its data and cannot be recovered
              </FieldLabel>
            </Field>
          )}

          <DialogFooter>
            <Button variant="outline" isDisabled={deleteMutation.isPending} onPress={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isDisabled={deleteMutation.isPending}
              onPress={() => deleteMutation.mutate({ id: serviceId, deleteVolumes })}
            >
              {deleteMutation.isPending && <Spinner className="size-4" />}
              {deleteMutation.isPending ? "Deleting..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
}
