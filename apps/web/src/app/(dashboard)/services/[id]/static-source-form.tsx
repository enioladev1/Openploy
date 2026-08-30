"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon } from "@hugeicons/core-free-icons";
import { DropZone, FileTrigger } from "react-aria-components";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format-bytes";

export function StaticSourceForm({ serviceId }: { serviceId: string }) {
  const utils = trpc.useUtils();
  const uploadInfo = trpc.services.getStaticUploadInfo.useQuery({ serviceId });
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/services/${serviceId}/static-upload`, { method: "POST", body: formData });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Upload failed");
      }
      toast.success("Uploaded");
      void utils.services.getStaticUploadInfo.invalidate({ serviceId });
      void utils.services.getApplicationDetail.invalidate({ serviceId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Field>
      <FieldLabel>Zip file</FieldLabel>
      <FieldDescription>
        Files should be at the root of the archive (e.g. <code>index.html</code> at the top level).
      </FieldDescription>

      {uploadInfo.data && (
        <p className="text-sm text-muted-foreground">
          Current: {uploadInfo.data.filename} ({formatBytes(uploadInfo.data.sizeBytes)}), uploaded{" "}
          {new Date(uploadInfo.data.uploadedAt).toLocaleString()}
        </p>
      )}

      <DropZone
        className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center outline-none transition-colors data-[drop-target]:border-primary data-[drop-target]:bg-muted"
        onDrop={async (e) => {
          const fileItem = e.items.find((item) => item.kind === "file");
          if (fileItem?.kind === "file") void handleUpload(await fileItem.getFile());
        }}
      >
        <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
          <HugeiconsIcon icon={CloudUploadIcon} size={22} strokeWidth={2} />
        </div>
        <p className="font-heading text-sm font-medium">{isUploading ? "Uploading..." : "Upload zip file"}</p>
        <p className="mb-4 text-xs text-muted-foreground">Drag and drop, or browse</p>

        <FileTrigger
          acceptedFileTypes={["application/zip", "application/x-zip-compressed"]}
          onSelect={(files) => {
            const file = files?.[0];
            if (file) void handleUpload(file);
          }}
        >
          <Button type="button" variant="outline" size="sm" isDisabled={isUploading}>
            {isUploading && <Spinner className="size-4" />}
            Browse files
          </Button>
        </FileTrigger>
      </DropZone>
    </Field>
  );
}
