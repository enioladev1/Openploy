"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function CreateProjectDialog() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");

  const create = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      toast.success(`"${project.name}" created`);
      void utils.projects.list.invalidate();
      setIsOpen(false);
      router.push(`/projects/${project.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <Button
        onPress={() => {
          setName("");
          setIsOpen(true);
        }}
      >
        <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />
        New project
      </Button>

      {isOpen && (
        <Dialog isOpen onOpenChange={setIsOpen} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ name });
            }}
          >
            <Field>
              <FieldLabel htmlFor="projectName">Name</FieldLabel>
              <Input id="projectName" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onPress={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isDisabled={create.isPending}>
                {create.isPending && <Spinner className="size-4" />}
                {create.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </>
  );
}
