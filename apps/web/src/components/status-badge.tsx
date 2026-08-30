import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Covers every status enum in the app (runtime, deployment, certificate,
// server) - they don't overlap in confusing ways, so one mapping is simpler
// than one per enum. Unlisted values fall back to the neutral style rather
// than guessing a color for a status this doesn't know about.
const STATUS_STYLES: Record<string, string> = {
  running: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  issued: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  queued: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  building: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  deploying: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  connecting: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  failed: "bg-destructive/10 text-destructive",
  unreachable: "bg-destructive/10 text-destructive",
  expired: "bg-destructive/10 text-destructive",
  stopped: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
  canceled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", STATUS_STYLES[status] ?? STATUS_STYLES.unknown, className)}>
      {status}
    </Badge>
  );
}
