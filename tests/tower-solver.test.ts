import { describe, expect, it } from "vitest";
import { type Member, type Node } from "../app/tools/bridge/engine/members";
import {
  runCrushStressTest,
  scaleStressResult,
  UNSTABLE_STRUCTURE_ERROR,
} from "../app/tools/tower/engine/solver";
import {
  GROUND_Y,
  TOP_Y,
  getFootprintBounds,
  getPxPerFt,
  isGroundNode,
  isTopNode,
} from "../app/tools/tower/engine/tower";
import { generateTower, type TowerStyle } from "../app/tools/tower/engine/towerTemplates";

// Build canvas nodes/members from a template exactly the way the on-canvas
// guide maps feet → pixels, so the test exercises the real geometry.
function buildFromTemplate(
  style: TowerStyle,
  heightFt: number,
  footprintFt: number,
  memberType: Member["type"] = "box_5"
): { nodes: Node[]; members: Member[] } {
  const tpl = generateTower(style, heightFt, footprintFt);
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
    type: memberType,
    grade: "mild",
  }));
  return { nodes, members };
}

function crush(
  built: { nodes: Node[]; members: Member[] },
  heightFt: number,
  loadLb: number
) {
  const supportIds = new Set(built.nodes.filter(isGroundNode).map((n) => n.id));
  const loadNodeIds = built.nodes.filter(isTopNode).map((n) => n.id);
  return runCrushStressTest({
    nodes: built.nodes,
    members: built.members,
    supportIds,
    loadNodeIds,
    loadLb,
    feetPerUnit: 1 / getPxPerFt(heightFt),
    unstableJointIds: new Set(),
    longMemberIds: new Set(),
  });
}

describe("tower templates", () => {
  it("land joints on the ground and target lines and stay inside the box", () => {
    for (const style of ["zigzag", "xbrace", "tapered", "taperedX"] as const) {
      const built = buildFromTemplate(style, 40, 20);
      expect(built.nodes.filter(isGroundNode).length).toBeGreaterThanOrEqual(2);
      expect(built.nodes.filter(isTopNode).length).toBeGreaterThanOrEqual(2);
      for (const n of built.nodes) {
        expect(n.y).toBeGreaterThanOrEqual(TOP_Y - 0.01);
        expect(n.y).toBeLessThanOrEqual(GROUND_Y + 0.01);
      }
    }
  });

  it("tapered styles never get narrower than 5 ft and never widen", () => {
    const tpl = generateTower("tapered", 60, 20);
    const byLevel = new Map<number, number[]>();
    for (const n of tpl.nodes) {
      if (!byLevel.has(n.y)) byLevel.set(n.y, []);
      byLevel.get(n.y)!.push(n.x);
    }
    let prevWidth = Number.POSITIVE_INFINITY;
    for (const y of [...byLevel.keys()].sort((a, b) => a - b)) {
      const xs = byLevel.get(y)!;
      const width = Math.max(...xs) - Math.min(...xs);
      expect(width).toBeGreaterThanOrEqual(5);
      expect(width).toBeLessThanOrEqual(prevWidth);
      prevWidth = width;
    }
  });
});

describe("crush solver", () => {
  it("rejects an unbraced ladder as unstable (singular stiffness)", () => {
    // Two posts + rungs, no diagonals: a mechanism in a pin-jointed truss.
    const h = 30;
    const px = getPxPerFt(h);
    const { left, right } = getFootprintBounds(h, 15);
    const nodes: Node[] = [];
    const members: Member[] = [];
    for (let i = 0; i <= 3; i++) {
      nodes.push({ id: `L${i}`, x: left, y: GROUND_Y - i * 10 * px });
      nodes.push({ id: `R${i}`, x: right, y: GROUND_Y - i * 10 * px });
    }
    for (let i = 0; i < 3; i++) {
      members.push({ id: `l${i}`, a: `L${i}`, b: `L${i + 1}`, type: "box_5" });
      members.push({ id: `r${i}`, a: `R${i}`, b: `R${i + 1}`, type: "box_5" });
    }
    for (let i = 1; i <= 3; i++) {
      members.push({ id: `g${i}`, a: `L${i}`, b: `R${i}`, type: "box_5" });
    }
    const out = crush({ nodes, members }, h, 16000);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(UNSTABLE_STRUCTURE_ERROR);
  });

  it("solves a braced lattice: legs in compression, footings carry the load", () => {
    const h = 30;
    const built = buildFromTemplate("xbrace", h, 15, "box_10");
    const out = crush(built, h, 16000);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // Legs are generated first (two per panel); every leg is in compression
    // (positive axial in this solver's convention).
    const legs = built.members.slice(0, 12);
    for (const leg of legs) {
      expect(out.envelope.memberForces[leg.id]).toBeGreaterThan(0);
    }
    // Vertical equilibrium: the members bearing on the footings push down
    // on them with a total equal to the applied load.
    const byId = new Map(built.nodes.map((n) => [n.id, n]));
    const footings = new Set(built.nodes.filter(isGroundNode).map((n) => n.id));
    let reaction = 0;
    for (const m of built.members) {
      const aFoot = footings.has(m.a);
      const bFoot = footings.has(m.b);
      if (aFoot === bFoot) continue;
      const foot = byId.get(aFoot ? m.a : m.b)!;
      const other = byId.get(aFoot ? m.b : m.a)!;
      const L = Math.hypot(foot.x - other.x, foot.y - other.y);
      reaction += out.envelope.memberForces[m.id] * ((foot.y - other.y) / L);
    }
    expect(reaction).toBeGreaterThan(16000 * 0.95);
    expect(reaction).toBeLessThan(16000 * 1.05);
    expect(out.frames.length).toBeGreaterThan(10);
  });

  it("heavier loads and thinner tubes push utilization up; scaling is linear", () => {
    const h = 40;
    const thin = crush(buildFromTemplate("zigzag", h, 15, "box_1"), h, 30000);
    const thick = crush(buildFromTemplate("zigzag", h, 15, "box_12"), h, 30000);
    expect(thin.ok && thick.ok).toBe(true);
    if (!thin.ok || !thick.ok) return;
    expect(thin.envelope.maxUtilization).toBeGreaterThan(thick.envelope.maxUtilization);
    expect(thin.envelope.failedMemberIds.length).toBeGreaterThan(0);

    const half = scaleStressResult(thin.envelope, 0.5);
    expect(half.maxUtilization).toBeCloseTo(thin.envelope.maxUtilization / 2, 6);
    const worstId = thin.envelope.worstMembers[0].id;
    expect(half.memberForces[worstId]).toBeCloseTo(
      thin.envelope.memberForces[worstId] / 2,
      6
    );
    // A member only fails once the ramp actually reaches its capacity.
    const kFail = 1 / thin.envelope.maxUtilization;
    expect(scaleStressResult(thin.envelope, kFail * 0.99).failedMemberIds.length).toBe(0);
    expect(scaleStressResult(thin.envelope, kFail * 1.01).failedMemberIds.length).toBeGreaterThan(0);
  });

  it("needs a joint on the target line to load", () => {
    const h = 30;
    const built = buildFromTemplate("xbrace", h, 15);
    // Drop the top joints off the target line by one pixel.
    const nodes = built.nodes.map((n) => (isTopNode(n) ? { ...n, y: n.y + 1 } : n));
    const out = crush({ nodes, members: built.members }, h, 16000);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/target height/);
  });
});
