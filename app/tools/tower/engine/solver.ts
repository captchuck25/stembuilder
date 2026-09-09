// Tower Builder — static crush-test solver (direct stiffness method).
//
// A press plate pushes straight down on every joint sitting on the
// target-height line; every joint on the ground line is a footing pinned in
// both directions. The elastic solve is linear, so the animated "ramp the load
// up to 100%" test is the one solution scaled by the load fraction — that is
// exactly what the returned frames are.
//
// Sign conventions are inherited verbatim from the Bridge Builder solver so
// the shared color/deflection rendering behaves identically: loads are applied
// as negative y, a POSITIVE axial force means COMPRESSION, and the renderer
// draws y = node.y - dy * scale.

import {
  type Member,
  type MemberType,
  type Node,
  MEMBER_LIBRARY,
  getMemberGrade,
  getMaterialStrengthMultiplier,
  isBoxType,
  parseBoxTube,
} from "@/app/tools/bridge/engine/members";

export type StressTestResult = {
  memberForces: Record<string, number>;
  memberUtilizationById?: Record<string, number>;
  memberCapById?: Record<string, number>;
  nodeDisplacements?: Record<string, { dx: number; dy: number }>;
  maxTension: number;
  maxCompression: number;
  failedMemberIds: string[];
  maxUtilization: number;
  worstMembers: {
    id: string;
    force: number;
    utilization: number;
    cap: number;
    type: MemberType;
  }[];
};

export type CrushTestInput = {
  nodes: Node[];
  members: Member[];
  /** Joints pinned in x and y — the footings on the ground line. */
  supportIds: Set<string>;
  /** Joints the press plate bears on — everything on the target-height line. */
  loadNodeIds: string[];
  loadLb: number;
  feetPerUnit: number;
  unstableJointIds: Set<string>;
  longMemberIds: Set<string>;
};

export type CrushTestOutput =
  | { ok: true; frames: StressTestResult[]; envelope: StressTestResult }
  | { ok: false; error: string };

/** Number of load steps between 0% and 100% in the animated test. */
export const CRUSH_FRAME_COUNT = 60;

const STEEL_E_PSI = 29_000_000;
const CAPACITY_BOOST = 1.3;
const STRESS_TEST_PENALTY = 0.7;

function getMemberAreaIn2(member: Member): number {
  const props = MEMBER_LIBRARY[member.type];
  if (isBoxType(member.type)) {
    const parsed = parseBoxTube(props.label);
    if (!parsed) return 1;
    return 4 * parsed.t * (parsed.b - parsed.t);
  }
  return 1;
}

function getLengthCapacityDivisors(lengthFt: number): {
  compression: number;
  tension: number;
} {
  if (lengthFt <= 5) return { compression: 1.1, tension: 1.0 };
  if (lengthFt <= 10) return { compression: 1.6, tension: 1.0 };
  if (lengthFt <= 15) return { compression: 2.7, tension: 1.0 };
  if (lengthFt <= 20) return { compression: 4.2, tension: 1.0 };
  if (lengthFt <= 25) return { compression: 6.0, tension: 1.0 };
  return { compression: 8.0, tension: 1.0 };
}

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i += 1) {
    let maxRow = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
    }
    if (Math.abs(M[maxRow][i]) < 1e-10) return null;
    if (maxRow !== i) [M[i], M[maxRow]] = [M[maxRow], M[i]];
    const pivot = M[i][i];
    for (let c = i; c <= n; c += 1) M[i][c] /= pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const factor = M[r][i];
      for (let c = i; c <= n; c += 1) {
        M[r][c] -= factor * M[i][c];
      }
    }
  }
  return M.map((row) => row[n]);
}

export const UNSTABLE_STRUCTURE_ERROR =
  "Structure unstable - cannot run stress test. Every panel needs a diagonal brace so the tower can't fold sideways.";

export function runCrushStressTest(input: CrushTestInput): CrushTestOutput {
  const {
    nodes,
    members,
    supportIds,
    loadNodeIds,
    loadLb,
    feetPerUnit,
    unstableJointIds,
    longMemberIds,
  } = input;
  const nodeById = new Map<string, Node>();
  for (const n of nodes) nodeById.set(n.id, n);
  const inchesPerUnit = feetPerUnit * 12;

  const activeNodeIds = new Set<string>();
  for (const m of members) {
    if (!nodeById.has(m.a) || !nodeById.has(m.b)) continue;
    activeNodeIds.add(m.a);
    activeNodeIds.add(m.b);
  }
  const activeNodes = nodes.filter((n) => activeNodeIds.has(n.id));
  if (activeNodes.length === 0 || members.length === 0 || inchesPerUnit <= 0) {
    return { ok: false, error: "Structure unstable - cannot run stress test." };
  }
  if (unstableJointIds.size > 0) {
    return {
      ok: false,
      error:
        "Unstable joint detected. Remove joints placed in the middle of a single member or connect another member to that joint.",
    };
  }
  const activeSupports = activeNodes.filter((n) => supportIds.has(n.id));
  if (activeSupports.length < 2) {
    return {
      ok: false,
      error:
        "The tower needs at least two footings on the ground line, each connected to a member.",
    };
  }
  const activeLoadIds = loadNodeIds.filter((id) => activeNodeIds.has(id));
  if (activeLoadIds.length === 0) {
    return {
      ok: false,
      error:
        "The tower must reach the target height line so the press plate has something to push on.",
    };
  }

  const nodeIndex = new Map<string, number>();
  activeNodes.forEach((n, i) => nodeIndex.set(n.id, i));
  const dofCount = activeNodes.length * 2;
  const K: number[][] = Array.from({ length: dofCount }, () =>
    Array.from({ length: dofCount }, () => 0)
  );
  const addStiffness = (i: number, j: number, val: number) => {
    K[i][j] += val;
  };

  for (const m of members) {
    const a = nodeById.get(m.a);
    const b = nodeById.get(m.b);
    if (!a || !b) continue;
    const dxIn = (b.x - a.x) * inchesPerUnit;
    const dyIn = (b.y - a.y) * inchesPerUnit;
    const L_in = Math.hypot(dxIn, dyIn);
    if (L_in === 0) continue;
    const c = dxIn / L_in;
    const s = dyIn / L_in;
    const k = (STEEL_E_PSI * getMemberAreaIn2(m)) / L_in;
    const ia = (nodeIndex.get(m.a) ?? 0) * 2;
    const ib = (nodeIndex.get(m.b) ?? 0) * 2;
    const k11 = k * c * c;
    const k12 = k * c * s;
    const k22 = k * s * s;

    addStiffness(ia, ia, k11);
    addStiffness(ia, ia + 1, k12);
    addStiffness(ia + 1, ia, k12);
    addStiffness(ia + 1, ia + 1, k22);

    addStiffness(ia, ib, -k11);
    addStiffness(ia, ib + 1, -k12);
    addStiffness(ia + 1, ib, -k12);
    addStiffness(ia + 1, ib + 1, -k22);

    addStiffness(ib, ia, -k11);
    addStiffness(ib, ia + 1, -k12);
    addStiffness(ib + 1, ia, -k12);
    addStiffness(ib + 1, ia + 1, -k22);

    addStiffness(ib, ib, k11);
    addStiffness(ib, ib + 1, k12);
    addStiffness(ib + 1, ib, k12);
    addStiffness(ib + 1, ib + 1, k22);
  }

  const fixedDofs = new Set<number>();
  for (const s of activeSupports) {
    const idx = nodeIndex.get(s.id);
    if (idx === undefined) continue;
    fixedDofs.add(idx * 2);
    fixedDofs.add(idx * 2 + 1);
  }
  const freeDofs = Array.from({ length: dofCount }, (_, i) => i).filter(
    (i) => !fixedDofs.has(i)
  );
  if (freeDofs.length === 0) {
    return { ok: false, error: "Structure unstable - cannot run stress test." };
  }
  const Kff = freeDofs.map((r) => freeDofs.map((c) => K[r][c]));

  // The press plate shares the crush load equally across every joint it
  // touches on the target-height line.
  const F = Array.from({ length: dofCount }, () => 0);
  const perNode = -loadLb / activeLoadIds.length;
  for (const id of activeLoadIds) {
    const idx = nodeIndex.get(id);
    if (idx === undefined) continue;
    F[idx * 2 + 1] += perNode;
  }
  const Ff = freeDofs.map((i) => F[i]);
  const uf = solveLinearSystem(Kff, Ff);
  if (!uf) return { ok: false, error: UNSTABLE_STRUCTURE_ERROR };

  const U = Array.from({ length: dofCount }, () => 0);
  freeDofs.forEach((dof, i) => {
    U[dof] = uf[i];
  });

  const memberForces: Record<string, number> = {};
  const memberUtilizationById: Record<string, number> = {};
  const memberCapById: Record<string, number> = {};
  let maxTension = 0;
  let maxCompression = 0;
  let maxUtilization = 0;
  const worstMembers: StressTestResult["worstMembers"] = [];

  for (const m of members) {
    const a = nodeById.get(m.a);
    const b = nodeById.get(m.b);
    if (!a || !b) continue;
    const dxIn = (b.x - a.x) * inchesPerUnit;
    const dyIn = (b.y - a.y) * inchesPerUnit;
    const L_in = Math.hypot(dxIn, dyIn);
    if (L_in === 0) {
      memberForces[m.id] = 0;
      continue;
    }
    const c = dxIn / L_in;
    const s = dyIn / L_in;
    const ia = (nodeIndex.get(m.a) ?? 0) * 2;
    const ib = (nodeIndex.get(m.b) ?? 0) * 2;
    const u = [U[ia], U[ia + 1], U[ib], U[ib + 1]];
    const A_in2 = getMemberAreaIn2(m);
    const delta = -c * u[0] - s * u[1] + c * u[2] + s * u[3];
    const axial = ((STEEL_E_PSI * A_in2) / L_in) * delta;
    const props = MEMBER_LIBRARY[m.type];

    // Euler buckling from the tube's real moment of inertia — this is what
    // makes tall unbraced legs fail even under a perfectly vertical load.
    let I_in4 = 1;
    if (isBoxType(m.type)) {
      const parsed = parseBoxTube(props.label);
      if (parsed) {
        const bDim = parsed.b;
        const tDim = parsed.t;
        I_in4 = (bDim ** 4 - (bDim - 2 * tDim) ** 4) / 12;
      }
    }
    const Pcr = (Math.PI ** 2 * STEEL_E_PSI * I_in4) / (L_in ** 2);

    const lengthDivisors = getLengthCapacityDivisors(L_in / 12);
    const gradeMult = getMaterialStrengthMultiplier(getMemberGrade(m));
    const capTension =
      (props.maxTension * gradeMult * STRESS_TEST_PENALTY * CAPACITY_BOOST) /
      lengthDivisors.tension;
    const capCompression =
      (Math.min(props.maxCompression, Pcr) *
        gradeMult *
        STRESS_TEST_PENALTY *
        CAPACITY_BOOST) /
      lengthDivisors.compression;
    const cap = axial >= 0 ? capCompression : capTension;
    const utilization = longMemberIds.has(m.id)
      ? 1.01
      : cap > 0
      ? Math.abs(axial) / cap
      : 0;
    memberForces[m.id] = axial;
    memberUtilizationById[m.id] = utilization;
    memberCapById[m.id] = cap;
    worstMembers.push({ id: m.id, force: axial, utilization, cap, type: m.type });
    if (axial > maxTension) maxTension = axial;
    if (axial < maxCompression) maxCompression = axial;
    if (utilization > maxUtilization) maxUtilization = utilization;
  }

  worstMembers.sort((a, b) => b.utilization - a.utilization);
  const failedMemberIds = worstMembers
    .filter((m) => m.utilization > 1)
    .map((m) => m.id);

  const nodeDisplacements: Record<string, { dx: number; dy: number }> = {};
  for (const n of activeNodes) {
    const idx = nodeIndex.get(n.id);
    if (idx === undefined) continue;
    nodeDisplacements[n.id] = {
      dx: (U[idx * 2] ?? 0) / inchesPerUnit,
      dy: (U[idx * 2 + 1] ?? 0) / inchesPerUnit,
    };
  }

  const envelope: StressTestResult = {
    memberForces,
    memberUtilizationById,
    memberCapById,
    nodeDisplacements,
    maxTension,
    maxCompression,
    failedMemberIds,
    maxUtilization,
    worstMembers,
  };
  const frames: StressTestResult[] = Array.from(
    { length: CRUSH_FRAME_COUNT + 1 },
    (_, i) => scaleStressResult(envelope, i / CRUSH_FRAME_COUNT)
  );

  if (process.env.NODE_ENV !== "production") {
    const top = envelope.worstMembers.slice(0, 8).map((w) => ({
      id: w.id,
      type: w.type,
      force: Math.round(w.force),
      mode: w.force > 0 ? "COMPRESSION" : "TENSION",
      cap: Math.round(w.cap),
      utilization: Number(w.utilization.toFixed(3)),
    }));
    console.log("Crush test worst members (top 8):", top);
  }

  return { ok: true, frames, envelope };
}

/**
 * The elastic solve is linear in the load, so the state at load fraction k is
 * the full solution scaled by k. Capacities stay put; a member fails once its
 * scaled demand crosses its capacity. Long-member flags (utilization pinned at
 * 1.01) survive scaling only once the ramp actually reaches them.
 */
export function scaleStressResult(r: StressTestResult, k: number): StressTestResult {
  const memberForces: Record<string, number> = {};
  for (const [id, f] of Object.entries(r.memberForces)) memberForces[id] = f * k;
  const memberUtilizationById: Record<string, number> | undefined = r.memberUtilizationById
    ? Object.fromEntries(
        Object.entries(r.memberUtilizationById).map(([id, u]) => [id, u * k])
      )
    : undefined;
  const nodeDisplacements: Record<string, { dx: number; dy: number }> | undefined =
    r.nodeDisplacements
      ? Object.fromEntries(
          Object.entries(r.nodeDisplacements).map(([id, d]) => [
            id,
            { dx: d.dx * k, dy: d.dy * k },
          ])
        )
      : undefined;
  const worstMembers = r.worstMembers.map((w) => ({
    ...w,
    force: w.force * k,
    utilization: w.utilization * k,
  }));
  return {
    memberForces,
    memberUtilizationById,
    memberCapById: r.memberCapById,
    nodeDisplacements,
    maxTension: r.maxTension * k,
    maxCompression: r.maxCompression * k,
    failedMemberIds: worstMembers.filter((w) => w.utilization > 1).map((w) => w.id),
    maxUtilization: r.maxUtilization * k,
    worstMembers,
  };
}
