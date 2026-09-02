"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { AppStoreIcon, ArrowLeft02Icon, Database02Icon, Layers01Icon, PlusSignIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { TemplateId } from "@openploy/shared";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";

type ServiceType = "application" | "database" | "compose" | "template";

const SERVICE_TYPES: Array<{ type: ServiceType; label: string; description: string; icon: IconSvgElement }> = [
  { type: "application", label: "Application", description: "Deploy from a GitHub repository", icon: SourceCodeIcon },
  { type: "database", label: "Database", description: "Postgres, MySQL, Clickhouse or Redis", icon: Database02Icon },
  { type: "compose", label: "Compose", description: "From a docker-compose.yml", icon: Layers01Icon },
  { type: "template", label: "Template", description: "One-click app deploys", icon: AppStoreIcon },
];

export function CreateServiceDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ServiceType | null>(null);
  const [name, setName] = useState("");
  const [deployingTemplate, setDeployingTemplate] = useState<TemplateId | null>(null);

  const templates = trpc.templates.list.useQuery(undefined, { enabled: selectedType === "template" });

  const createApplication = trpc.services.createApplicationShell.useMutation({
    onSuccess: (service) => router.push(`/services/${service.id}`),
    onError: (err) => toast.error(err.message),
  });
  const createCompose = trpc.services.createComposeShell.useMutation({
    onSuccess: (service) => router.push(`/services/${service.id}`),
    onError: (err) => toast.error(err.message),
  });
  const deployTemplate = trpc.templates.deploy.useMutation({
    onSuccess: (service) => router.push(`/services/${service.id}`),
    onError: (err) => {
      toast.error(err.message);
      setDeployingTemplate(null);
    },
  });
  const create = selectedType === "application" ? createApplication : createCompose;

  function reset() {
    setSelectedType(null);
    setName("");
    setDeployingTemplate(null);
  }

  const activeType = SERVICE_TYPES.find((t) => t.type === selectedType);

  return (
    <>
      <Button
        onPress={() => {
          reset();
          setIsOpen(true);
        }}
      >
        <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />
        New service
      </Button>

      {isOpen && (
        <Dialog isOpen onOpenChange={setIsOpen} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{activeType ? `New ${activeType.label.toLowerCase()}` : "New service"}</DialogTitle>
          </DialogHeader>

          {!activeType ? (
            <ItemGroup>
              {SERVICE_TYPES.map((option) => (
                <Item
                  key={option.type}
                  variant="outline"
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setSelectedType(option.type)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedType(option.type);
                  }}
                >
                  <ItemMedia variant="icon">
                    <HugeiconsIcon icon={option.icon} size={18} strokeWidth={2} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{option.label}</ItemTitle>
                    <ItemDescription>{option.description}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : selectedType === "template" ? (
            <>
              <ItemGroup>
                {templates.isLoading && (
                  <div className="flex justify-center py-6">
                    <Spinner className="size-5" />
                  </div>
                )}
                {templates.data?.map((tpl) => (
                  <Item
                    key={tpl.id}
                    variant="outline"
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => {
                      if (deployTemplate.isPending) return;
                      setDeployingTemplate(tpl.id);
                      deployTemplate.mutate({ projectId, templateId: tpl.id });
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !deployTemplate.isPending) {
                        setDeployingTemplate(tpl.id);
                        deployTemplate.mutate({ projectId, templateId: tpl.id });
                      }
                    }}
                  >
                    <ItemMedia>
                      <div className="relative size-8 overflow-hidden rounded-md">
                        <Image src={tpl.logo} alt="" fill className="object-cover" />
                      </div>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{tpl.name}</ItemTitle>
                      <ItemDescription>{tpl.description}</ItemDescription>
                    </ItemContent>
                    {deployingTemplate === tpl.id && deployTemplate.isPending && <Spinner className="size-4" />}
                  </Item>
                ))}
              </ItemGroup>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onPress={() => setSelectedType(null)} isDisabled={deployTemplate.isPending}>
                  <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} />
                  Back
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedType === "database") {
                  setIsOpen(false);
                  router.push(`/projects/${projectId}/services/new/database?name=${encodeURIComponent(name)}`);
                  return;
                }
                create.mutate({ projectId, name });
              }}
            >
              <Field>
                <FieldLabel htmlFor="serviceName">Name</FieldLabel>
                <Input id="serviceName" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onPress={() => setSelectedType(null)}>
                  <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} />
                  Back
                </Button>
                <Button type="submit" isDisabled={create.isPending}>
                  {create.isPending && <Spinner className="size-4" />}
                  {create.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
