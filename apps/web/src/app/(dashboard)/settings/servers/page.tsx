import { HugeiconsIcon } from "@hugeicons/react";
import { Wrench01Icon } from "@hugeicons/core-free-icons";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function ServersPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-heading font-semibold">Servers</h1>

      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Wrench01Icon} size={20} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>In development</EmptyTitle>
          <EmptyDescription>Connecting additional servers isn&apos;t ready yet - check back later.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
