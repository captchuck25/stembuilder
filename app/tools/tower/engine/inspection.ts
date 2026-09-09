// Tower Builder — design inspection. The rules a tower must pass before it
// can be crush-tested. Shares the Bridge Builder's structural checks
// (non-triangulated bays, crossings without a junction, unstable joints,
// member length) and adds the tower's own: at least two footings on the
// ground line, a joint on the target-height line for the press to bear on,
// and everything connected back to the footings.
//
// Pure functions on the joint/member graph so the same code runs in the page
// and in tests (every wizard template is verified to pass inspection).

import {
  type Member,
  type Node,
  MEMBER_LIBRARY,
  getMemberStrengthIndex,
  normalizeMemberFamily,
} from "@/app/tools/bridge/engine/members";
import { distancePointToSegment, segmentIntersectionPoint } from "./geometry";
import { isGroundNode, isTopNode } from "./tower";

export type RiskyBay = { cycle: [string, string, string, string] };
export type Crossing = { pt: { x: number; y: number }; m1: string; m2: string };

export type TowerInspection = {
  footingIds: Set<string>;
  topNodeIds: string[];
  riskyBays: RiskyBay[];
  crossingMembers: Crossing[];
  unstableJointIds: Set<string>;
  longMemberIds: Set<string>;
  floatingNodeIds: string[];
  connectedFootingCount: number;
  reachesTop: boolean;
  towerConnected: boolean;
  failReasons: string[];
  warnings: { id: string; text: string; memberIds: string[] }[];
  pass: boolean;
};

function buildAdjacency(nodes: Node[], members: Member[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) adjacency.set(n.id, []);
  for (const m of members) {
    if (!adjacency.has(m.a)) adjacency.set(m.a, []);
    if (!adjacency.has(m.b)) adjacency.set(m.b, []);
    adjacency.get(m.a)?.push(m.b);
    adjacency.get(m.b)?.push(m.a);
  }
  return adjacency;
}

// Detect a simple 4-cycle A-B-C-D-A with no diagonals (A-C or B-D).
// Conservative: won't catch every possible "bay" pattern, but avoids spam.
export function findNonTriangulatedBays(nodes: Node[], members: Member[]): RiskyBay[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = buildAdjacency(nodes, members);
  const neighbors = (id: string) => adjacency.get(id) ?? [];
  const areConnected = (a: string, b: string) => neighbors(a).includes(b);
  const risky: RiskyBay[] = [];

  function keyOf(cycle: [string, string, string, string]) {
    return [...cycle].sort().join("|");
  }

  function hasDiagonalConnection(a: string, b: string) {
    if (areConnected(a, b)) return true;
    const aNode = nodeById.get(a);
    const bNode = nodeById.get(b);
    if (!aNode || !bNode) return false;
    for (const n of nodes) {
      if (n.id === a || n.id === b) continue;
      if (!areConnected(a, n.id) || !areConnected(n.id, b)) continue;
      const dist = distancePointToSegment(n.x, n.y, aNode.x, aNode.y, bNode.x, bNode.y);
      if (dist <= 2) return true;
    }
    return false;
  }

  function hasDiagonalIntersection(a: string, b: string) {
    const aNode = nodeById.get(a);
    const bNode = nodeById.get(b);
    if (!aNode || !bNode) return false;
    for (const m of members) {
      if (m.a === a || m.b === a || m.a === b || m.b === b) continue;
      const mA = nodeById.get(m.a);
      const mB = nodeById.get(m.b);
      if (!mA || !mB) continue;
      const pt = segmentIntersectionPoint(
        aNode.x, aNode.y, bNode.x, bNode.y, mA.x, mA.y, mB.x, mB.y
      );
      if (!pt) continue;
      const distToA = Math.hypot(pt.x - aNode.x, pt.y - aNode.y);
      const distToB = Math.hypot(pt.x - bNode.x, pt.y - bNode.y);
      if (distToA <= 2 || distToB <= 2) continue;
      return true;
    }
    return false;
  }

  for (const A of nodes.map((n) => n.id)) {
    for (const B of neighbors(A)) {
      if (B === A) continue;
      for (const C of neighbors(B)) {
        if (C === A || C === B) continue;
        for (const D of neighbors(C)) {
          if (D === A || D === B || D === C) continue;
          if (!areConnected(D, A)) continue;

          const hasDiagonal =
            hasDiagonalConnection(A, C) ||
            hasDiagonalConnection(B, D) ||
            hasDiagonalIntersection(A, C) ||
            hasDiagonalIntersection(B, D);
          if (hasDiagonal) continue;

          // Only flag bays that contain at least one rung-like edge (within
          // 20° of horizontal). Diamonds from zigzag bracing pass; the
          // ladder-rung rectangles of an unbraced tower get caught.
          const cycleNodes = [A, B, C, D];
          const hasChordEdge = cycleNodes.some((id, i) => {
            const nextId = cycleNodes[(i + 1) % 4];
            const na = nodeById.get(id);
            const nb = nodeById.get(nextId);
            if (!na || !nb) return false;
            const dx = nb.x - na.x;
            const dy = nb.y - na.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return false;
            const angleDeg = Math.abs((Math.asin(Math.abs(dy) / len) * 180) / Math.PI);
            return angleDeg <= 20;
          });
          if (!hasChordEdge) continue;

          const cycle: [string, string, string, string] = [A, B, C, D];
          const k = keyOf(cycle);
          if (!risky.some((r) => keyOf(r.cycle) === k)) risky.push({ cycle });
        }
      }
    }
  }

  return risky;
}

export function findCrossingMembersWithoutJunction(
  nodes: Node[],
  members: Member[]
): Crossing[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const crossings: Crossing[] = [];
  const nodeSet = new Set(nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`));
  for (let i = 0; i < members.length; i++) {
    const ma = members[i];
    const a1 = nodeById.get(ma.a);
    const b1 = nodeById.get(ma.b);
    if (!a1 || !b1) continue;
    for (let j = i + 1; j < members.length; j++) {
      const mb = members[j];
      // Skip members that share an endpoint (they always "meet" at the shared node)
      if (mb.a === ma.a || mb.a === ma.b || mb.b === ma.a || mb.b === ma.b) continue;
      const a2 = nodeById.get(mb.a);
      const b2 = nodeById.get(mb.b);
      if (!a2 || !b2) continue;
      const pt = segmentIntersectionPoint(a1.x, a1.y, b1.x, b1.y, a2.x, a2.y, b2.x, b2.y);
      if (!pt) continue;
      const nearEndpoint =
        Math.hypot(pt.x - a1.x, pt.y - a1.y) < 3 ||
        Math.hypot(pt.x - b1.x, pt.y - b1.y) < 3 ||
        Math.hypot(pt.x - a2.x, pt.y - a2.y) < 3 ||
        Math.hypot(pt.x - b2.x, pt.y - b2.y) < 3;
      if (nearEndpoint) continue;
      // If a node already exists at this crossing, it's properly joined — not a problem
      const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
      if (nodeSet.has(key)) continue;
      // Check neighbourhood: any node within 6px counts as a junction
      const hasNearbyNode = nodes.some((n) => Math.hypot(n.x - pt.x, n.y - pt.y) < 6);
      if (hasNearbyNode) continue;
      crossings.push({ pt, m1: ma.id, m2: mb.id });
    }
  }
  return crossings;
}

// A free joint with a single member, or exactly two collinear members, is a
// mechanism. Footings are pinned in both directions, so they are exempt.
export function findUnstableJointIds(
  nodes: Node[],
  members: Member[],
  footingIds: Set<string>
): Set<string> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Set<string>();
  const collinearTolerance = 1e-3;

  for (const node of nodes) {
    if (footingIds.has(node.id)) continue;
    const connected = members.filter((m) => m.a === node.id || m.b === node.id);
    if (connected.length === 0) continue;
    if (connected.length === 1) {
      ids.add(node.id);
      continue;
    }
    if (connected.length !== 2) continue;

    const neighbors = connected
      .map((m) => nodeById.get(m.a === node.id ? m.b : m.a))
      .filter((n): n is Node => Boolean(n));
    if (neighbors.length !== 2) continue;

    const v1x = neighbors[0].x - node.x;
    const v1y = neighbors[0].y - node.y;
    const v2x = neighbors[1].x - node.x;
    const v2y = neighbors[1].y - node.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-6 || len2 < 1e-6) {
      ids.add(node.id);
      continue;
    }

    const cross = Math.abs(v1x * v2y - v1y * v2x) / (len1 * len2);
    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    if (cross <= collinearTolerance && dot < -0.999) {
      ids.add(node.id);
    }
  }

  return ids;
}

// Same recommended-length rule as the bridge: 8 ft for the base box tube,
// growing with the square root of the section's area ratio.
export function recommendedMaxLengthFt(m: Member): number {
  const label = MEMBER_LIBRARY[m.type]?.label ?? "";
  const family = normalizeMemberFamily(label);
  const index = getMemberStrengthIndex(m);
  const base = family === "box" ? 8 : 12;
  return base * Math.sqrt(index);
}

export function findLongMemberIds(
  nodes: Node[],
  members: Member[],
  feetPerUnit: number
): Set<string> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Set<string>();
  for (const m of members) {
    const a = nodeById.get(m.a);
    const b = nodeById.get(m.b);
    if (!a || !b) continue;
    const ft = Math.hypot(a.x - b.x, a.y - b.y) * feetPerUnit;
    if (ft > recommendedMaxLengthFt(m) + 0.25) ids.add(m.id);
  }
  return ids;
}

export function inspectTower(input: {
  nodes: Node[];
  members: Member[];
  feetPerUnit: number;
  heightFeet: number;
}): TowerInspection {
  const { nodes, members, feetPerUnit, heightFeet } = input;
  const adjacency = buildAdjacency(nodes, members);
  const degree = (id: string) => adjacency.get(id)?.length ?? 0;

  const footingIds = new Set<string>();
  for (const n of nodes) if (isGroundNode(n)) footingIds.add(n.id);
  const topNodeIds = nodes.filter((n) => isTopNode(n)).map((n) => n.id);

  const riskyBays = findNonTriangulatedBays(nodes, members);
  const crossingMembers = findCrossingMembersWithoutJunction(nodes, members);
  const unstableJointIds = findUnstableJointIds(nodes, members, footingIds);
  const longMemberIds = findLongMemberIds(nodes, members, feetPerUnit);

  const floatingNodeIds = nodes.filter((n) => degree(n.id) === 0).map((n) => n.id);
  const connectedFootingCount = nodes.filter(
    (n) => footingIds.has(n.id) && degree(n.id) > 0
  ).length;
  const reachesTop = topNodeIds.some((id) => degree(id) > 0);

  // Every joint that carries a member must be reachable from a footing —
  // otherwise part of the tower is floating in mid-air.
  let towerConnected = false;
  const start = nodes.find((n) => footingIds.has(n.id) && degree(n.id) > 0);
  if (start) {
    const visited = new Set<string>([start.id]);
    const queue: string[] = [start.id];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const nId of adjacency.get(current) ?? []) {
        if (!visited.has(nId)) {
          visited.add(nId);
          queue.push(nId);
        }
      }
    }
    towerConnected = nodes.every((n) => degree(n.id) === 0 || visited.has(n.id));
  }

  const isTrussDesign = members.length > 1 && riskyBays.length === 0;
  const unstableJointsFail = unstableJointIds.size > 0;
  const longMembersFail = longMemberIds.size > 0;

  const failReasons = [
    floatingNodeIds.length > 0
      ? `Unconnected joint${floatingNodeIds.length > 1 ? "s" : ""} present. Every joint must connect to at least one member.`
      : null,
    connectedFootingCount < 2
      ? "The tower needs at least two footings — joints placed on the ground line."
      : null,
    !reachesTop
      ? `The tower doesn't reach the ${heightFeet} ft target line yet. The press plate needs a joint to push on.`
      : null,
    !towerConnected && connectedFootingCount >= 2
      ? "Part of the tower isn't connected to the footings."
      : null,
    riskyBays.length > 0
      ? "Non-triangulated panels present. Add a diagonal brace to each open rectangle."
      : null,
    crossingMembers.length > 0
      ? "Members intersect without a junction joint. Add a joint where members cross."
      : null,
    unstableJointsFail
      ? "Unstable joint present. Do not place a joint in the middle of a single member unless another member also connects there."
      : null,
    longMembersFail ? "Members exceed maximum length." : null,
  ].filter((reason): reason is string => Boolean(reason));

  const warnings = [
    isTrussDesign && longMemberIds.size > 0
      ? {
          id: "long-members",
          text: "Some members exceed recommended length for the selected size. Consider adding joints or using a larger section.",
          memberIds: Array.from(longMemberIds),
        }
      : null,
  ].filter(
    (w): w is { id: string; text: string; memberIds: string[] } => Boolean(w)
  );

  const pass =
    floatingNodeIds.length === 0 &&
    connectedFootingCount >= 2 &&
    reachesTop &&
    towerConnected &&
    riskyBays.length === 0 &&
    crossingMembers.length === 0 &&
    !unstableJointsFail &&
    !longMembersFail;

  return {
    footingIds,
    topNodeIds,
    riskyBays,
    crossingMembers,
    unstableJointIds,
    longMemberIds,
    floatingNodeIds,
    connectedFootingCount,
    reachesTop,
    towerConnected,
    failReasons,
    warnings,
    pass,
  };
}
