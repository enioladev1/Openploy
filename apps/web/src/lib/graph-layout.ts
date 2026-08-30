import dagre from "@dagrejs/dagre";

const GRID_GAP_X = 40;
const GRID_GAP_Y = 40;
const COMPONENT_GAP = 120;

type Position = { x: number; y: number };
type Edge = { from: string; to: string };
type NodeSize = { width: number; height: number };

/** Union-find over edges - two nodes are in the same component iff a chain of edges connects them, regardless of direction. */
function findConnectedComponents(nodeIds: string[], edges: Edge[]): string[][] {
  const parent = new Map<string, string>(nodeIds.map((id) => [id, id]));

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(id) !== root) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  }

  for (const edge of edges) {
    if (!parent.has(edge.from) || !parent.has(edge.to)) continue;
    const a = find(edge.from);
    const b = find(edge.to);
    if (a !== b) parent.set(a, b);
  }

  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = find(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()];
}

/** Lays out one connected component with dagre, then normalizes positions so the component's own bounding box starts at (0, 0) - callers place components side by side by offsetting x from there. */
function layoutComponent(nodeIds: string[], edges: Edge[], nodeSize: NodeSize): { positions: Map<string, Position>; width: number } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 100 });

  // A fresh object per node, not the same nodeSize reference reused - dagre
  // mutates each node's data object in place to store its computed x/y, so
  // sharing one object across every setNode call meant every node ended up
  // reading back whichever node's position happened to be written last.
  for (const id of nodeIds) graph.setNode(id, { ...nodeSize });
  for (const edge of edges) graph.setEdge(edge.from, edge.to);

  dagre.layout(graph);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  const raw = new Map<string, Position>();
  for (const id of nodeIds) {
    const { x, y } = graph.node(id);
    // dagre positions are node centers - React Flow positions are top-left corners.
    const left = x - nodeSize.width / 2;
    const top = y - nodeSize.height / 2;
    raw.set(id, { x: left, y: top });
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + nodeSize.width);
  }

  const positions = new Map<string, Position>();
  for (const [id, pos] of raw) positions.set(id, { x: pos.x - minX, y: pos.y - minY });
  return { positions, width: maxX - minX };
}

/**
 * A single stacked column (the previous project-graph layout) put every node
 * in the exact same vertical line regardless of whether they were actually
 * linked - an edge routing past an unrelated node in between looked
 * identical to that node being part of the chain, and reloading the page
 * reproduced the same misleading stack every time.
 *
 * Handing the whole graph to dagre in one pass doesn't fully fix that: with
 * no edges to place them at different ranks, unlinked nodes still all land
 * in a single rank, which dagre renders as one long vertical column - not a
 * stack on the SAME spot, but still a stack. Instead: nodes that are
 * actually linked (by an edge chain, direction doesn't matter) are grouped
 * into their own connected component and laid out by dagre as before,
 * preserving the real dependency tree shape; nodes with no links at all are
 * packed into a compact grid instead of a single column. Every component
 * (grid included) gets its own non-overlapping horizontal slot.
 */
export function layoutWithDagre(nodeIds: string[], edges: Edge[], nodeSize: NodeSize): Map<string, Position> {
  const components = findConnectedComponents(nodeIds, edges);
  const isolated = components.filter((c) => c.length === 1).map((c) => c[0]!);
  const clusters = components.filter((c) => c.length > 1);

  const positions = new Map<string, Position>();
  let xCursor = 0;

  if (isolated.length > 0) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(isolated.length)));
    isolated.forEach((id, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      positions.set(id, {
        x: col * (nodeSize.width + GRID_GAP_X),
        y: row * (nodeSize.height + GRID_GAP_Y),
      });
    });
    xCursor = columns * (nodeSize.width + GRID_GAP_X) - GRID_GAP_X + COMPONENT_GAP;
  }

  for (const cluster of clusters) {
    const clusterEdges = edges.filter((edge) => cluster.includes(edge.from) && cluster.includes(edge.to));
    const { positions: clusterPositions, width } = layoutComponent(cluster, clusterEdges, nodeSize);
    for (const [id, pos] of clusterPositions) positions.set(id, { x: pos.x + xCursor, y: pos.y });
    xCursor += width + COMPONENT_GAP;
  }

  return positions;
}
