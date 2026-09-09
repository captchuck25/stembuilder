import { describe, expect, it } from "vitest";
import { type Member, type Node } from "../app/tools/bridge/engine/members";
import { initCollapse, stepCollapse, stubTipKey } from "../app/tools/tower/engine/collapse";
import { GROUND_Y, TOP_Y, getFootprintBounds, getPxPerFt, isGroundNode, isTopNode } from "../app/tools/tower/engine/tower";
import { generateTower } from "../app/tools/tower/engine/towerTemplates";

function build(heightFt: number, footprintFt: number) {
  const tpl = generateTower("zigzag", heightFt, footprintFt);
  const px = getPxPerFt(heightFt);
  const { left } = getFootprintBounds(heightFt, footprintFt);
  const nodes: Node[] = tpl.nodes.map((n, i) => ({
    id: `n${i}`,
    x: left + n.x * px,
    y: GROUND_Y - n.y * px,
  }));
  const members: Member[] = tpl.members.map(([a, b], i) => ({
    id: `m${i}`,
    a: `n${a}`,
    b: `n${b}`,
    type: "box_3",
  }));
  return { nodes, members };
}

describe("tower collapse sim", () => {
  it("keeps footings pinned, nothing below ground, plate only descends, no NaNs", () => {
    const { nodes, members } = build(30, 15);
    const footings = new Set(nodes.filter(isGroundNode).map((n) => n.id));
    const topIds = nodes.filter(isTopNode).map((n) => n.id);
    // Sever every diagonal so the tower is a mechanism and really falls.
    const failed = new Set(
      members
        .filter((m) => {
          const a = nodes.find((n) => n.id === m.a)!;
          const b = nodes.find((n) => n.id === m.b)!;
          return a.x !== b.x && a.y !== b.y;
        })
        .map((m) => m.id)
    );
    expect(failed.size).toBeGreaterThan(0);

    const state = initCollapse({
      nodes,
      members,
      failedIds: failed,
      posOf: (id) => {
        const n = nodes.find((nn) => nn.id === id)!;
        return { x: n.x, y: n.y };
      },
      pinnedIds: footings,
      topIds,
      plateBottomY: TOP_Y,
      groundY: GROUND_Y,
      nowMs: 0,
    });
    for (const id of failed) {
      expect(state.points.has(stubTipKey(id, "a"))).toBe(true);
      expect(state.points.has(stubTipKey(id, "b"))).toBe(true);
    }

    let prevPlate = state.plateBottomY;
    for (let t = 16; t <= 4000; t += 16) {
      stepCollapse(state, t);
      expect(state.plateBottomY).toBeGreaterThanOrEqual(prevPlate);
      expect(state.plateBottomY).toBeLessThanOrEqual(GROUND_Y);
      prevPlate = state.plateBottomY;
      for (const [id, p] of state.points) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(p.y).toBeLessThanOrEqual(GROUND_Y + 1e-6);
        if (footings.has(id)) {
          const orig = nodes.find((n) => n.id === id)!;
          expect(p.x).toBe(orig.x);
          expect(p.y).toBe(orig.y);
        }
      }
    }
    // After four seconds the top joints have come well down from the target line.
    for (const id of topIds) {
      expect(state.points.get(id)!.y).toBeGreaterThan(TOP_Y + 50);
    }
    // Landing raised at least one dust puff.
    expect(state.puffs.length).toBeGreaterThan(0);
  });
});
