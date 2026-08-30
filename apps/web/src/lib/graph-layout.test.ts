import { describe, expect, it } from "vitest";
import { layoutWithDagre } from "./graph-layout";

const SIZE = { width: 260, height: 150 };

describe("layoutWithDagre", () => {
  it("returns a position for every node, including ones with no edges", () => {
    const positions = layoutWithDagre(["a", "b", "c"], [], SIZE);
    expect(positions.size).toBe(3);
    for (const id of ["a", "b", "c"]) {
      expect(positions.get(id)).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    }
  });

  it("places a linked chain along increasing x (left to right, matching the target/source handle sides)", () => {
    const positions = layoutWithDagre(
      ["postgres", "backend", "redis"],
      [
        { from: "backend", to: "postgres" },
        { from: "backend", to: "redis" },
      ],
      SIZE,
    );

    const backendX = positions.get("backend")!.x;
    expect(positions.get("postgres")!.x).toBeGreaterThan(backendX);
    expect(positions.get("redis")!.x).toBeGreaterThan(backendX);
  });

  function boxesOverlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    return a.x < b.x + SIZE.width && a.x + SIZE.width > b.x && a.y < b.y + SIZE.height && a.y + SIZE.height > b.y;
  }

  // This is the actual reported bug: with every node sharing the same
  // (buggy, aliased) position object, they all rendered stacked exactly on
  // top of each other - an unrelated database directly overlapping the
  // service it happened to render nearest, making it look connected when it
  // wasn't. No two node bounding boxes may overlap, connected or not.
  it("never overlaps two nodes' bounding boxes, including an unlinked one dropped into a connected graph", () => {
    const positions = layoutWithDagre(
      ["postgres", "backend", "clickhouse", "redis"],
      [
        { from: "backend", to: "postgres" },
        { from: "backend", to: "redis" },
      ],
      SIZE,
    );

    const entries = [...positions.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, posA] = entries[i]!;
        const [idB, posB] = entries[j]!;
        expect(boxesOverlap(posA, posB), `${idA} and ${idB} overlap: ${JSON.stringify(posA)} vs ${JSON.stringify(posB)}`).toBe(false);
      }
    }
  });

  it("never overlaps two nodes at the exact same position", () => {
    const positions = layoutWithDagre(
      ["a", "b", "c", "d"],
      [{ from: "a", to: "b" }],
      SIZE,
    );
    const values = [...positions.values()].map((p) => `${p.x},${p.y}`);
    expect(new Set(values).size).toBe(values.length);
  });

  it("arranges fully unlinked nodes into a multi-column grid instead of one long column", () => {
    const positions = layoutWithDagre(["a", "b", "c", "d"], [], SIZE);
    const xValues = new Set([...positions.values()].map((p) => p.x));
    const yValues = new Set([...positions.values()].map((p) => p.y));
    // 4 unlinked nodes should spread across both an x and a y axis (a 2x2
    // grid), not all share the same x the way a single stacked column would.
    expect(xValues.size).toBeGreaterThan(1);
    expect(yValues.size).toBeGreaterThan(1);
  });

  it("keeps a connected cluster's own tree shape while packing unlinked nodes into their own grid alongside it", () => {
    const positions = layoutWithDagre(
      ["backend", "postgres", "redis", "orphan-1", "orphan-2"],
      [
        { from: "backend", to: "postgres" },
        { from: "backend", to: "redis" },
      ],
      SIZE,
    );

    const backendX = positions.get("backend")!.x;
    expect(positions.get("postgres")!.x).toBeGreaterThan(backendX);
    expect(positions.get("redis")!.x).toBeGreaterThan(backendX);

    // The two orphans must not land in a single shared column with each other.
    expect(positions.get("orphan-1")!.x).not.toBe(positions.get("orphan-2")!.x);
  });
});
