"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpRight01Icon,
  Cancel01Icon,
  Database02Icon,
  Layers01Icon,
  PlayIcon,
  SourceCodeIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { TEMPLATE_CATALOG } from "@openploy/shared";
import { trpc } from "@/app/providers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { layoutWithDagre } from "@/lib/graph-layout";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  application: "Application",
  database: "Database",
  compose: "Compose",
};

const SERVICE_TYPE_ICONS: Record<string, typeof SourceCodeIcon> = {
  application: SourceCodeIcon,
  database: Database02Icon,
  compose: Layers01Icon,
};

// Same logos the database creation page offers per engine - reused here so a
// database node shows the actual engine mark instead of a generic icon.
const DATABASE_ENGINE_LOGOS: Record<string, string> = {
  postgres: "/logos/postgresql.png",
  mysql: "/logos/mysql.png",
  mariadb: "/logos/mariadb.png",
  redis: "/logos/redis.png",
  clickhouse: "/logos/clickhouse.png",
  mongodb: "/logos/mongodb.png",
};

// A compose service deployed from the template picker shows its template's
// own logo (e.g. n8n's) instead of the generic Compose icon.
const TEMPLATE_LOGOS: Record<string, string> = Object.fromEntries(TEMPLATE_CATALOG.map((t) => [t.id, t.logo]));

const NODE_WIDTH = 260;
const NODE_HEIGHT = 150;
const MAX_VISIBLE_DOMAINS = 2;

const STATUS_DOT_CLASSES: Record<string, string> = {
  running: "bg-emerald-500",
  success: "bg-emerald-500",
  pending: "bg-amber-500",
  queued: "bg-amber-500",
  building: "bg-amber-500",
  deploying: "bg-amber-500",
  failed: "bg-destructive",
  stopped: "bg-muted-foreground",
  unknown: "bg-muted-foreground",
};

const STATUS_TEXT: Record<string, string> = {
  running: "Running",
  pending: "Starting",
  building: "Building",
  deploying: "Deploying",
  failed: "Failed",
  stopped: "Stopped",
  unknown: "Unknown",
};

interface ServiceNodeData {
  id: string;
  name: string;
  type: string;
  runtimeStatus: string;
  isDeploying: boolean;
  engine: string | null;
  templateId: string | null;
  domains: { id: string; host: string; isIssued: boolean }[];
  selected: boolean;
  onToggle: (id: string) => void;
  [key: string]: unknown;
}

function ServiceGraphNode({ data }: NodeProps<Node<ServiceNodeData>>) {
  const Icon = SERVICE_TYPE_ICONS[data.type] ?? SourceCodeIcon;
  const engineLogo = data.type === "database" && data.engine ? DATABASE_ENGINE_LOGOS[data.engine] : undefined;
  const templateLogo = data.type === "compose" && data.templateId ? TEMPLATE_LOGOS[data.templateId] : undefined;
  // An in-flight deployment always wins over runtimeStatus - that column
  // only updates once a deploy finishes, so mid-deploy it's still "unknown"
  // (first-ever deploy) or stuck showing the previous "running" (a redeploy
  // of an already-running service), neither of which is what's true right now.
  const effectiveStatus = data.isDeploying ? "deploying" : data.runtimeStatus;
  const visibleDomains = data.domains.slice(0, MAX_VISIBLE_DOMAINS);
  const hiddenDomainCount = data.domains.length - visibleDomains.length;

  return (
    <div
      className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-border !bg-muted-foreground" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="!size-2 !border-border !bg-muted-foreground" isConnectable={false} />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {templateLogo ? (
              <Image src={templateLogo} alt={data.templateId ?? ""} width={32} height={32} className="object-cover" />
            ) : engineLogo ? (
              <Image src={engineLogo} alt={data.engine ?? ""} width={18} height={18} className="object-contain" />
            ) : (
              <HugeiconsIcon icon={Icon} size={16} strokeWidth={2} className="text-muted-foreground" />
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{data.name}</span>
            <span className="text-xs text-muted-foreground">{SERVICE_TYPE_LABELS[data.type]}</span>
          </div>
        </div>
        <Checkbox
          className="nodrag shrink-0"
          aria-label={`Select ${data.name}`}
          isSelected={data.selected}
          onChange={() => data.onToggle(data.id)}
        />
      </div>

      {visibleDomains.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleDomains.map((domain) => (
            <a
              key={domain.id}
              // https only once a certificate is actually issued - matches
              // domains-panel.tsx's rule exactly. Assuming https by default
              // sends the browser to a port nothing is listening on in any
              // environment without a working ACME setup (this dev instance
              // included - see the earlier Traefik static-config incident).
              href={`${domain.isIssued ? "https" : "http"}://${domain.host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="nodrag truncate rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              title={domain.host}
            >
              {domain.host}
            </a>
          ))}
          {hiddenDomainCount > 0 && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">+{hiddenDomainCount}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT_CLASSES[effectiveStatus] ?? STATUS_DOT_CLASSES.unknown)} />
          {STATUS_TEXT[effectiveStatus] ?? effectiveStatus}
        </div>
        <Link
          href={`/services/${data.id}`}
          className="nodrag flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open
          <HugeiconsIcon icon={ArrowUpRight01Icon} size={12} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

const nodeTypes = { service: ServiceGraphNode };

/**
 * Rendered as a child of <ReactFlow> (which provides the hook context to its
 * own children automatically, no <ReactFlowProvider> needed) - keeps the
 * whole graph fit to the viewport at all times, the same as clicking the
 * "fit view" control, instead of only on mount. `nodes` gets a new array
 * reference every 5s poll (even when nothing actually moved), which is what
 * keeps this re-firing continuously rather than once.
 */
function GraphAutoFit({ nodes }: { nodes: Node[] }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    fitView({ padding: 0.3, duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  return null;
}

interface BulkResult {
  serviceId: string;
  success: boolean;
  error?: string;
}

export function ProjectServicesPanel({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const services = trpc.projects.listServices.useQuery({ id: projectId }, { refetchInterval: 5000 });
  const links = trpc.projects.listServiceLinks.useQuery({ id: projectId }, { refetchInterval: 5000 });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteVolumes, setDeleteVolumes] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const invalidate = () => void utils.projects.listServices.invalidate({ id: projectId });

  function notifyBulkResult(action: string, data: BulkResult[]) {
    const succeeded = data.filter((r) => r.success).length;
    if (succeeded === data.length) {
      toast.success(`${action} ${succeeded} service${succeeded === 1 ? "" : "s"}`);
    } else {
      toast.error(`${action}: ${succeeded}/${data.length} succeeded`);
    }
  }

  const bulkDelete = trpc.services.bulkDelete.useMutation({
    onSuccess: (data) => {
      setResults(data);
      setSelected(new Set());
      setIsDeleteDialogOpen(false);
      notifyBulkResult("Deleted", data);
      invalidate();
    },
  });
  const bulkStop = trpc.services.bulkStop.useMutation({
    onSuccess: (data) => {
      setResults(data);
      notifyBulkResult("Stopped", data);
      invalidate();
    },
  });
  const bulkStart = trpc.services.bulkStart.useMutation({
    onSuccess: (data) => {
      setResults(data);
      notifyBulkResult("Started", data);
      invalidate();
    },
  });

  const isPending = bulkDelete.isPending || bulkStop.isPending || bulkStart.isPending;
  const list = useMemo(() => services.data ?? [], [services.data]);
  const linksData = links.data;
  const nameFor = (id: string) => list.find((s) => s.id === id)?.name ?? id;

  function toggle(id: string) {
    setResults(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setResults(null);
    setSelected((prev) => (prev.size === list.length ? new Set() : new Set(list.map((s) => s.id))));
  }

  // Recomputes the dagre layout (and re-fits the viewport, see GraphAutoFit
  // below) only when the graph's actual shape changes (a service or link
  // appears/disappears) - re-running either on every 5s data refresh would
  // undo the user's own manual dragging/pan/zoom for no reason, since most
  // refreshes only change a status field, not the topology.
  const linkPairsForSignature = linksData ?? [];
  const topologySignature = JSON.stringify([
    [...list.map((s) => s.id)].sort(),
    [...linkPairsForSignature.map((l) => `${l.from}>${l.to}`)].sort(),
  ]);
  const lastTopologyRef = useRef<string | null>(null);

  useEffect(() => {
    const linkPairs = linksData ?? [];
    const topologyChanged = lastTopologyRef.current !== topologySignature;
    lastTopologyRef.current = topologySignature;

    const layoutPositions = topologyChanged
      ? layoutWithDagre(list.map((s) => s.id), linkPairs, { width: NODE_WIDTH, height: NODE_HEIGHT })
      : null;

    setNodes((prevNodes) => {
      const prevById = new Map(prevNodes.map((n) => [n.id, n]));

      return list.map((service) => {
        const existing = prevById.get(service.id);
        // A node keeps wherever the user dragged it unless the topology just
        // changed, in which case everything gets a fresh auto-layout pass -
        // simpler and more honest than trying to patch a stale manual layout
        // around a graph shape it was never actually computed for.
        const position = layoutPositions?.get(service.id) ?? existing?.position ?? { x: 0, y: 0 };
        return {
          id: service.id,
          type: "service",
          position,
          data: {
            id: service.id,
            name: service.name,
            type: service.type,
            runtimeStatus: service.runtimeStatus,
            isDeploying: service.isDeploying,
            engine: service.engine,
            templateId: service.templateId,
            domains: service.domains,
            selected: selected.has(service.id),
            onToggle: toggle,
          },
        };
      });
    });

    // Real connections only - one service's env var actually linked to
    // another's connection info. No structural "belongs to this project"
    // edges - every node here already belongs to the project by definition.
    setEdges(
      linkPairs.map((link) => ({
        id: `link-${link.from}-${link.to}`,
        source: link.from,
        target: link.to,
        type: "smoothstep",
        animated: true,
        style: { stroke: "var(--color-primary)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-primary)", width: 16, height: 16 },
      })),
    );
    // Selection changes must update node checkboxes without disturbing drag position -
    // handled by the same effect since selected is read directly into node.data above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, selected, linksData]);

  if (list.length === 0 && !services.isLoading) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Layers01Icon} size={20} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No services yet</EmptyTitle>
          <EmptyDescription>Add an application, database, or compose service above.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <Field orientation="horizontal" className="w-auto gap-2">
          <Checkbox
            id="select-all"
            isSelected={list.length > 0 && selected.size === list.length}
            onChange={toggleAll}
          />
          <FieldLabel htmlFor="select-all" className="text-sm font-normal">
            Select all
          </FieldLabel>
        </Field>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button
              variant="outline"
              size="sm"
              isDisabled={isPending}
              onPress={() => {
                setResults(null);
                bulkStart.mutate({ ids: [...selected] });
              }}
            >
              {bulkStart.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />}
              Start
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={isPending}
              onPress={() => {
                setResults(null);
                bulkStop.mutate({ ids: [...selected] });
              }}
            >
              {bulkStop.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={StopIcon} size={14} strokeWidth={2} />}
              Stop
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={isPending}
              onPress={() => {
                setDeleteVolumes(false);
                setIsDeleteDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              Delete
            </Button>
          </div>
        )}
      </div>

      {isDeleteDialogOpen && (
        <Dialog isOpen onOpenChange={setIsDeleteDialogOpen} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selected.size} service{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>

          <Field orientation="horizontal" className="gap-2">
            <Checkbox id="bulk-delete-volumes" isSelected={deleteVolumes} onChange={setDeleteVolumes} />
            <FieldLabel htmlFor="bulk-delete-volumes" className="font-normal">
              Also delete their data volume(s) - this permanently deletes their data and cannot be recovered
            </FieldLabel>
          </Field>

          <DialogFooter>
            <Button variant="outline" isDisabled={bulkDelete.isPending} onPress={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isDisabled={bulkDelete.isPending}
              onPress={() => bulkDelete.mutate({ ids: [...selected], deleteVolumes })}
            >
              {bulkDelete.isPending && <Spinner className="size-4" />}
              {bulkDelete.isPending ? "Deleting..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {results && results.some((r) => !r.success) && (
        <div className="mb-3 flex flex-col gap-2">
          {results
            .filter((r) => !r.success)
            .map((r) => (
              <Alert key={r.serviceId} variant="destructive">
                <AlertDescription>
                  {nameFor(r.serviceId)}: {r.error}
                </AlertDescription>
              </Alert>
            ))}
        </div>
      )}

      <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-3xl border border-border bg-muted/30">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.3 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-transparent" color="var(--color-border)" />
          <Controls
            showInteractive={false}
            className="!rounded-2xl !border !border-border !bg-card !shadow-sm [&_button]:!border-border [&_button]:!bg-card [&_button]:!fill-foreground [&_button]:hover:!bg-muted"
          />
          <GraphAutoFit nodes={nodes} />
        </ReactFlow>
      </div>
    </div>
  );
}
