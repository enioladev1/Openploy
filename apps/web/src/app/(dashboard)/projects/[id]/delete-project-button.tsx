"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
}

export function DeleteProjectButton({ projectId, projectName }: DeleteProjectButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success(`"${projectName}" deleted`);
      router.push("/projects");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <Button variant="outline" onPress={() => setIsOpen(true)}>
        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
        Delete project
      </Button>

      {isOpen && (
        <Dialog isOpen onOpenChange={setIsOpen} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              Delete <strong>{projectName}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={deleteMutation.isPending} onPress={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isDisabled={deleteMutation.isPending}
              onPress={() => deleteMutation.mutate({ id: projectId })}
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
