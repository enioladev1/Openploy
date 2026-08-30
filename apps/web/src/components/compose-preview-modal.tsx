"use client";

import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ComposePreviewModalProps {
  title: string;
  content: string;
  onClose: () => void;
}

export function ComposePreviewModal({ title, content, onClose }: ComposePreviewModalProps) {
  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <pre className="max-h-[60vh] overflow-auto rounded-2xl bg-zinc-950 p-4 text-xs whitespace-pre-wrap text-zinc-100">
        {content}
      </pre>
    </Dialog>
  );
}
