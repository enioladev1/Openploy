"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface RenameServiceButtonProps {
  serviceId: string;
  serviceName: string;
}

export function RenameServiceButton({ serviceId, serviceName }: RenameServiceButtonProps) {
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(serviceName);
  const [displayName, setDisplayName] = useState(serviceName);

  const rename = trpc.services.rename.useMutation({
    onSuccess: (updated) => {
      setDisplayName(updated.name);
      toast.success("Service renamed");
      void utils.services.get.invalidate({ id: serviceId });
      setIsOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mb-1 flex items-center gap-2">
      <h1 className="text-xl font-heading font-semibold">{displayName}</h1>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Rename service"
        onPress={() => {
          setName(displayName);
          setIsOpen(true);
        }}
      >
        <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} className="text-muted-foreground" />
      </Button>

      {isOpen && (
        <Dialog isOpen onOpenChange={setIsOpen} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename service</DialogTitle>
            <DialogDescription>Update the name shown for this service across the dashboard.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename.mutate({ serviceId, name: name.trim() });
            }}
          >
            <Field>
              <FieldLabel htmlFor="serviceName">Name</FieldLabel>
              <Input id="serviceName" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </Field>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onPress={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isDisabled={rename.isPending || !name.trim()}>
                {rename.isPending && <Spinner className="size-4" />}
                {rename.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
      )}
    </div>
  );
}
