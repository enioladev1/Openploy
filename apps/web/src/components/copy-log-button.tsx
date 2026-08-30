"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const COPIED_RESET_MS = 1500;

export function CopyLogButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = getText();
    if (!text) {
      toast.error("Nothing to copy yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toast.error("Couldn't copy - your browser blocked clipboard access");
    }
  }

  return (
    <Button variant="outline" size="sm" onPress={handleCopy}>
      <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={14} strokeWidth={2} />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
