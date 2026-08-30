import { Skeleton } from "@/components/ui/skeleton";

// A loose scatter, not a grid - approximates the graph canvas's node
// clusters (see project-services-panel.tsx) rather than the old card-grid
// layout this page no longer uses.
const NODE_SKELETON_POSITIONS = [
  { top: "8%", left: "6%" },
  { top: "38%", left: "34%" },
  { top: "12%", left: "62%" },
  { top: "62%", left: "18%" },
  { top: "58%", left: "58%" },
];

export default function ProjectDetailLoading() {
  return (
    <div>
      <Skeleton className="mb-2 h-4 w-20" />
      <div className="mb-6 flex items-start justify-between">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-4xl" />
          <Skeleton className="h-9 w-24 rounded-4xl" />
        </div>
      </div>

      <div className="mb-3 flex items-center gap-4">
        <Skeleton className="h-4 w-4 rounded-sm" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-3xl border border-border bg-muted/30">
        {NODE_SKELETON_POSITIONS.map((pos, i) => (
          <div key={i} className="absolute flex w-[260px] flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm" style={pos}>
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
