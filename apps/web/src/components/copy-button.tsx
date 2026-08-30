"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, CopyCheckIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  /** A value already on hand - copied synchronously. */
  value?: string | undefined;
  /** For a value that isn't fetched yet (e.g. a masked secret) - copying works without requiring a reveal first. */
  getValue?: (() => Promise<string>) | undefined;
  className?: string;
  label?: string;
}

export function CopyButton({ value, getValue, className, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      isDisabled={pending}
      className={cn("shrink-0", className)}
      onPress={async () => {
        try {
          setPending(true);
          const resolved = value ?? (await getValue?.());
          if (resolved === undefined) return;
          await navigator.clipboard.writeText(resolved);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to copy");
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? <Spinner className="size-3.5" /> : <HugeiconsIcon icon={copied ? CopyCheckIcon : Copy01Icon} size={14} strokeWidth={2} />}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
