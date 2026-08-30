"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";

/**
 * Shared by the deployment build-log viewer and the container-logs panel -
 * this component has no idea which kind of log it's debugging, the caller
 * supplies onDebug to run the right mutation (which re-fetches the log text
 * server-side rather than being passed it here).
 */
export function AiDebugButton({ onDebug }: { onDebug: (providerId: string) => Promise<{ analysis: string }> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"pick-provider" | "result">("pick-provider");
  const [analysis, setAnalysis] = useState("");
  const [isDebugging, setIsDebugging] = useState(false);

  const providers = trpc.aiProviders.listEnabled.useQuery(undefined, { enabled: isOpen });

  function open() {
    setStep("pick-provider");
    setAnalysis("");
    setIsOpen(true);
  }

  async function handlePick(providerId: string) {
    setIsDebugging(true);
    try {
      const result = await onDebug(providerId);
      setAnalysis(result.analysis);
      setStep("result");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Debug failed");
    } finally {
      setIsDebugging(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onPress={open}>
        <HugeiconsIcon icon={AiBrain01Icon} size={14} strokeWidth={2} />
        Debug
      </Button>

      {isOpen && (
        <Dialog isOpen onOpenChange={setIsOpen} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{step === "pick-provider" ? "Debug with AI" : "Analysis"}</DialogTitle>
            {step === "pick-provider" && <DialogDescription>Choose an AI provider to analyze this log.</DialogDescription>}
          </DialogHeader>

          {step === "pick-provider" ? (
            isDebugging ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                Analyzing...
              </div>
            ) : providers.data?.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={AiBrain01Icon} size={20} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>No AI providers connected</EmptyTitle>
                  <EmptyDescription>
                    <Link href="/settings/ai-providers" className="underline">
                      Connect one
                    </Link>{" "}
                    to debug logs with AI.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup>
                {providers.data?.map((provider) => (
                  <Item
                    key={provider.id}
                    variant="outline"
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => handlePick(provider.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handlePick(provider.id);
                    }}
                  >
                    <ItemMedia variant="icon">
                      <HugeiconsIcon icon={AiBrain01Icon} size={18} strokeWidth={2} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{provider.name}</ItemTitle>
                      <ItemDescription>{provider.provider}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            )
          ) : (
            <div className="max-h-96 overflow-auto rounded-2xl border p-4 text-sm whitespace-pre-wrap">{analysis}</div>
          )}
        </Dialog>
      )}
    </>
  );
}
