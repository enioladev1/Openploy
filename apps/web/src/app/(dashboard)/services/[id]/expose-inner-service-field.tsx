"use client";

import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { ComposePreviewModal } from "@/components/compose-preview-modal";
import { parseComposeServiceNames } from "@/lib/compose-client";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

interface ExposeInnerServiceFieldProps {
  serviceId: string;
  currentValue: string | null;
  sourceType: "repo" | "raw" | null;
  rawComposeContent: string | null;
  githubInstallationId: string | null;
  repoOwner: string | null;
  repoName: string | null;
  branch: string | null;
  composeFilePath: string | null;
}

/**
 * Not set at creation time is a common path (easy to skip on the create
 * form), and without this field a compose service can never get a domain -
 * DomainsPanel only renders once exposedInnerService is non-null. This is the
 * way out of that dead end after the fact, not just a creation-time choice.
 */
export function ExposeInnerServiceField({
  serviceId,
  currentValue,
  sourceType,
  rawComposeContent,
  githubInstallationId,
  repoOwner,
  repoName,
  branch,
  composeFilePath,
}: ExposeInnerServiceFieldProps) {
  const utils = trpc.useUtils();
  const [value, setValue] = useState(currentValue ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const setExposedInnerService = trpc.services.setExposedInnerService.useMutation({
    onSuccess: () => {
      toast.success("Exposed service updated");
      void utils.services.getComposeDetail.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const composeFile = trpc.github.getFileContent.useQuery(
    {
      installationId: githubInstallationId ?? "",
      owner: repoOwner ?? "",
      repo: repoName ?? "",
      path: composeFilePath ?? "",
      ref: branch ?? "",
    },
    {
      enabled:
        sourceType === "repo" &&
        Boolean(githubInstallationId && repoOwner && repoName && branch && composeFilePath),
      retry: false,
    },
  );

  const effectiveYaml = sourceType === "raw" ? (rawComposeContent ?? "") : (composeFile.data ?? "");
  const serviceNames = useMemo(() => parseComposeServiceNames(effectiveYaml), [effectiveYaml]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="w-auto min-w-48">
          <FieldLabel htmlFor="exposedInnerService">Service to expose on a domain</FieldLabel>
          <Select selectedKey={value} onSelectionChange={(key) => setValue(key as string)}>
            <SelectTrigger id="exposedInnerService">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="">None</SelectItem>
              {serviceNames.map((serviceName) => (
                <SelectItem key={serviceName} id={serviceName}>
                  {serviceName}
                </SelectItem>
              ))}
              {value && !serviceNames.includes(value) && <SelectItem id={value}>{value}</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
        <Button
          type="button"
          variant="outline"
          isDisabled={setExposedInnerService.isPending}
          onPress={() => setExposedInnerService.mutate({ serviceId, exposedInnerService: value.trim() || null })}
        >
          {setExposedInnerService.isPending && <Spinner className="size-4" />}
          {setExposedInnerService.isPending ? "Saving..." : "Save"}
        </Button>
        {sourceType === "repo" && composeFile.data && (
          <Button type="button" variant="outline" onPress={() => setShowPreview(true)}>
            <HugeiconsIcon icon={ViewIcon} size={16} strokeWidth={2} />
            Preview compose code
          </Button>
        )}
      </div>
      {composeFile.isError && (
        <p className="mt-1 text-xs text-destructive">Could not fetch compose file: {composeFile.error.message}</p>
      )}
      {showPreview && composeFile.data && (
        <ComposePreviewModal
          title={composeFilePath ?? "docker-compose.yml"}
          content={composeFile.data}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
