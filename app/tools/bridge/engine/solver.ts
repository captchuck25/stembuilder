// Bridge Builder — truss FEA solver (direct stiffness method) with moving-load
// envelope analysis. Extracted verbatim from page.tsx's runStressTest (no
// behavior change): the state updates were replaced by a returned result.

import {
  type Member,
  type MemberType,
  type Node,
  MEMBER_LIBRARY,
  SUPPORT_A_ID,
  SUPPORT_B_ID,
  ROADWAY_Y,
  getMemberGrade,
  getMaterialStrengthMultiplier,
  isBoxType,
  parseBoxTube,
} from "./members";

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

export type StressAnalysisInput = {
  nodes: Node[];
  members: Member[];
  supportA: Node;
  supportB: Node;
  feetPerUnit: number;
  loadLb: number;
  unstableJointIds: Set<string>;
  longMemberIds: Set<string>;
};

export type StressAnalysisOutput =
  | { ok: true; frames: StressTestResult[]; envelope: StressTestResult }
  | { ok: false; error: string };

export function runMovingLoadStressTest(input: StressAnalysisInput): StressAnalysisOutput {
  const {
    nodes,
    members,
    supportA,
    supportB,
    feetPerUnit,
    loadLb,
    unstableJointIds,
    longMemberIds,
  } = input;
  const nodeById = new Map<string, Node>();
  for (const n of nodes) nodeById.set(n.id, n);

  const STEEL_E_PSI = 29_000_000;
  const CAPACITY_BOOST = 1.3;
  const STRESS_TEST_PENALTY = 0.70; // tweakable near the stress test code.
  const inchesPerUnit = feetPerUnit * 12;
  const axleSpacingFt = 8;
  function getMemberAreaIn2(member: Member): number {
    const props = MEMBER_LIBRARY[member.type];
    if (isBoxType(member.type)) {
      const parsed = parseBoxTube(props.label);
      if (!parsed) return 1;
      return 4 * parsed.t * (parsed.b - parsed.t);
    }
    return 1;
  }

  const activeNodeIds = new Set<string>([SUPPORT_A_ID, SUPPORT_B_ID]);
  for (const m of members) {
    activeNodeIds.add(m.a);
    activeNodeIds.add(m.b);
  }
  const activeNodes = nodes.filter((n) => activeNodeIds.has(n.id));
  const nodeCount = activeNodes.length;
  if (nodeCount === 0 || members.length === 0) {
    return { ok: false, error: "Structure unstable - cannot run stress test." };
  }
  if (unstableJointIds.size > 0) {
    return {
      ok: false,
      error:
        "Unstable joint detected. Remove joints placed in the middle of a single member or connect another member to that joint.",
    };
  }

  const nodeIndex = new Map<string, number>();
  activeNodes.forEach((n, i) => nodeIndex.set(n.id, i));
  const dofCount = nodeCount * 2;
  const K: number[][] = Array.from({ length: dofCount }, () =>
    Array.from({ length: dofCount }, () => 0)
  );

  function addStiffness(i: number, j: number, val: number) {
    K[i][j] += val;
  }

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
      const A_in2 = getMemberAreaIn2(m);
      const k = (STEEL_E_PSI * A_in2) / L_in;

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
    const idxA = nodeIndex.get(SUPPORT_A_ID);
    const idxB = nodeIndex.get(SUPPORT_B_ID);
    if (idxA !== undefined) {
      fixedDofs.add(idxA * 2);
      fixedDofs.add(idxA * 2 + 1);
    }
    if (idxB !== undefined) {
      fixedDofs.add(idxB * 2 + 1);
    }

    const supportIds = new Set([SUPPORT_A_ID, SUPPORT_B_ID]);

    // IMPORTANT: only choose load nodes that are actually in the solved system
    const roadwayNodes = activeNodes.filter(
      (n) => Math.abs(n.y - ROADWAY_Y) < 0.5 && !supportIds.has(n.id)
    );
    const nonSupportNodes = activeNodes.filter((n) => !supportIds.has(n.id));

    if (nonSupportNodes.length === 0) {
      return {
        ok: false,
        error: "Add at least one joint between the supports to run the stress test.",
      };
    }
  const freeDofs = Array.from({ length: dofCount }, (_, i) => i).filter(
    (i) => !fixedDofs.has(i)
  );

  const Kff = freeDofs.map((r) => freeDofs.map((c) => K[r][c]));
  function solveLinearSystem(A: number[][], b: number[]) {
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
  const computeResultForLoads = (
    loadNodeIds: string[],
    loadValues: number[]
  ): StressTestResult | null => {
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

    const F = Array.from({ length: dofCount }, () => 0);
    for (let i = 0; i < loadNodeIds.length; i += 1) {
      const nodeId = loadNodeIds[i];
      const load = loadValues[i] ?? 0;
      const idx = nodeIndex.get(nodeId);
      if (idx === undefined) continue;
      const dof = idx * 2 + 1;
      F[dof] += load;
    }
    const Ff = freeDofs.map((i) => F[i]);
    const uf = solveLinearSystem(Kff, Ff);
    if (!uf) return null;

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
    const worstMembers: {
      id: string;
      force: number;
      utilization: number;
      cap: number;
      type: MemberType;
    }[] = [];

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
      const axial = (STEEL_E_PSI * A_in2 / L_in) * delta;
      const props = MEMBER_LIBRARY[m.type];

      // Proper Euler buckling using moment of inertia, not area
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

      const L_ft = L_in / 12;
      const lengthDivisors = getLengthCapacityDivisors(L_ft);
      const capTension =
        props.maxTension *
        getMaterialStrengthMultiplier(getMemberGrade(m)) *
        STRESS_TEST_PENALTY *
        CAPACITY_BOOST /
        lengthDivisors.tension;
      const capCompression =
        Math.min(props.maxCompression, Pcr) *
        getMaterialStrengthMultiplier(getMemberGrade(m)) *
        STRESS_TEST_PENALTY *
        CAPACITY_BOOST /
        lengthDivisors.compression;
      const cap = axial >= 0 ? capCompression : capTension;
      const lengthFail = longMemberIds.has(m.id);
      const utilization = lengthFail
        ? 1.01
        : cap > 0
        ? Math.abs(axial) / cap
        : 0;
      memberForces[m.id] = axial;
      memberUtilizationById[m.id] = utilization;
      memberCapById[m.id] = cap;
      worstMembers.push({
        id: m.id,
        force: axial,
        utilization,
        cap,
        type: m.type,
      });
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
      const uxIn = U[idx * 2] ?? 0;
      const uyIn = U[idx * 2 + 1] ?? 0;
      nodeDisplacements[n.id] = {
        dx: inchesPerUnit > 0 ? uxIn / inchesPerUnit : 0,
        dy: inchesPerUnit > 0 ? uyIn / inchesPerUnit : 0,
      };
    }

    return {
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
  };

  const axleSpacingUnits =
    feetPerUnit > 0 ? axleSpacingFt / feetPerUnit : 0;
  const loadPositions =
    roadwayNodes.length > 0 ? [...roadwayNodes] : [...nonSupportNodes];
  loadPositions.sort((a, b) => a.x - b.x);
  const centerX = (supportA.x + supportB.x) / 2;

  if (loadPositions.length === 0 || axleSpacingUnits <= 0) {
    return { ok: false, error: "Structure unstable - cannot run stress test." };
  }

  const frames: StressTestResult[] = [];
  const envelopeByMember = new Map<
    string,
    { utilization: number; force: number; cap: number; type: MemberType }
  >();
  const maxAbsForceByMember = new Map<string, { force: number; cap: number }>();

  if (process.env.NODE_ENV !== "production") {
    const tol = 0.5;
    const nodeByIdLocal = new Map(nodes.map((n) => [n.id, n]));
    const mirrorKey = (x: number, y: number) =>
      `${Math.round((centerX * 2 - x) / tol) * tol},${Math.round(y / tol) * tol}`;
    const nodeKey = (x: number, y: number) =>
      `${Math.round(x / tol) * tol},${Math.round(y / tol) * tol}`;

    const roadwayLogs = loadPositions.map((n) => {
      const mirror = loadPositions.reduce<{
        id: string;
        x: number;
        y: number;
        dx: number;
        dy: number;
      } | null>((best, cand) => {
        const dx = Math.abs(cand.x - (centerX * 2 - n.x));
        const dy = Math.abs(cand.y - n.y);
        const dist = dx + dy;
        if (!best || dist < best.dx + best.dy) {
          return { id: cand.id, x: cand.x, y: cand.y, dx, dy };
        }
        return best;
      }, null);
      return {
        id: n.id,
        x: n.x,
        y: n.y,
        mirrorId: mirror?.id,
        mirrorX: mirror?.x,
        mirrorY: mirror?.y,
        dx: mirror?.dx,
        dy: mirror?.dy,
      };
    });

    const memberMirrorMap = new Map<string, string>();
    const memberKeyToId = new Map<string, string>();
    for (const m of members) {
      const a = nodeByIdLocal.get(m.a);
      const b = nodeByIdLocal.get(m.b);
      if (!a || !b) continue;
      const k1 = `${nodeKey(a.x, a.y)}|${nodeKey(b.x, b.y)}`;
      const k2 = `${nodeKey(b.x, b.y)}|${nodeKey(a.x, a.y)}`;
      memberKeyToId.set(k1, m.id);
      memberKeyToId.set(k2, m.id);
    }
    for (const m of members) {
      const a = nodeByIdLocal.get(m.a);
      const b = nodeByIdLocal.get(m.b);
      if (!a || !b) continue;
      const ma = mirrorKey(a.x, a.y);
      const mb = mirrorKey(b.x, b.y);
      const mk1 = `${ma}|${mb}`;
      const mk2 = `${mb}|${ma}`;
      const mirrorId = memberKeyToId.get(mk1) ?? memberKeyToId.get(mk2) ?? "none";
      memberMirrorMap.set(m.id, mirrorId);
    }

    console.log("Stress test symmetry debug: roadway nodes", roadwayLogs);
    console.log(
      "Stress test symmetry debug: member mirror map",
      Array.from(memberMirrorMap.entries())
    );
  }

    const runSweep = (positions: Node[], collectFrames: boolean) => {
      let anySuccess = false;
      const evaluateAtLeadNode = (leadNode: Node) => {
        const rearTargetX = leadNode.x + axleSpacingUnits;
        let rearNode = leadNode;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const n of positions) {
          const d = Math.abs(n.x - rearTargetX);
          if (d < bestDist) {
            bestDist = d;
            rearNode = n;
          }
        }
        const loadNodeIds = [leadNode.id, rearNode.id];
        const loadValues = [-loadLb * 0.5, -loadLb * 0.5];
        const result = computeResultForLoads(loadNodeIds, loadValues);
        if (!result) return;
        anySuccess = true;
      if (collectFrames) frames.push(result);
      for (const [id, force] of Object.entries(result.memberForces)) {
        const prevForce = maxAbsForceByMember.get(id);
        if (!prevForce || Math.abs(force) > Math.abs(prevForce.force)) {
          const cap = result.memberCapById?.[id] ?? 0;
          maxAbsForceByMember.set(id, { force, cap });
        }
      }
      for (const w of result.worstMembers) {
        const prev = envelopeByMember.get(w.id);
        if (!prev || w.utilization > prev.utilization) {
          envelopeByMember.set(w.id, {
            utilization: w.utilization,
              force: w.force,
              cap: w.cap,
              type: w.type,
            });
          }
        }
      };

      for (const leadNode of positions) {
        evaluateAtLeadNode(leadNode);
      }
      return anySuccess;
    };

  if (!runSweep(loadPositions, true)) {
    return { ok: false, error: "Structure unstable - cannot run stress test." };
  }

  const findClosestByX = (targetX: number) => {
    let best: Node | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const n of loadPositions) {
      const d = Math.abs(n.x - targetX);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  };
  const mirroredPositions: Node[] = [];
  const mirroredSeen = new Set<string>();
  for (const lead of loadPositions) {
    const mirrorX = centerX * 2 - lead.x;
    const mirror = findClosestByX(mirrorX);
    if (mirror && !mirroredSeen.has(mirror.id)) {
      mirroredSeen.add(mirror.id);
      mirroredPositions.push(mirror);
    }
  }
  if (mirroredPositions.length > 0) {
    mirroredPositions.sort((a, b) => a.x - b.x);
    runSweep(mirroredPositions, false);
  }
  if (frames.length === 0) {
    return { ok: false, error: "Structure unstable - cannot run stress test." };
  }

  const envelopeWorstMembers = Array.from(envelopeByMember.entries()).map(
    ([id, rec]) => {
      const force = maxAbsForceByMember.get(id)?.force ?? rec.force;
      const cap = maxAbsForceByMember.get(id)?.cap ?? rec.cap;
      const utilization = cap > 0 ? Math.abs(force) / cap : 0;
      return {
        id,
        force,
        utilization,
        cap,
        type: rec.type,
      };
    }
  );

  const nodeByIdLocal = new Map(nodes.map((n) => [n.id, n]));
  const mirrorKey = (x: number, y: number) => {
    const tol = 0.5;
    const mx = Math.round((centerX * 2 - x) / tol) * tol;
    const my = Math.round(y / tol) * tol;
    return `${mx},${my}`;
  };
  const nodeKey = (x: number, y: number) => {
    const tol = 0.5;
    const kx = Math.round(x / tol) * tol;
    const ky = Math.round(y / tol) * tol;
    return `${kx},${ky}`;
  };
  const memberKeyToId = new Map<string, string>();
  for (const m of members) {
    const a = nodeByIdLocal.get(m.a);
    const b = nodeByIdLocal.get(m.b);
    if (!a || !b) continue;
    const k1 = `${nodeKey(a.x, a.y)}|${nodeKey(b.x, b.y)}`;
    const k2 = `${nodeKey(b.x, b.y)}|${nodeKey(a.x, a.y)}`;
    memberKeyToId.set(k1, m.id);
    memberKeyToId.set(k2, m.id);
  }
  const mirrorMap = new Map<string, string>();
  for (const m of members) {
    const a = nodeByIdLocal.get(m.a);
    const b = nodeByIdLocal.get(m.b);
    if (!a || !b) continue;
    const ma = mirrorKey(a.x, a.y);
    const mb = mirrorKey(b.x, b.y);
    const mk1 = `${ma}|${mb}`;
    const mk2 = `${mb}|${ma}`;
    const mirrorId = memberKeyToId.get(mk1) ?? memberKeyToId.get(mk2);
    if (mirrorId) mirrorMap.set(m.id, mirrorId);
  }

  const envelopeById = new Map(
    envelopeWorstMembers.map((m) => [m.id, m])
  );
  for (const [id, mirrorId] of mirrorMap.entries()) {
    if (id === mirrorId) continue;
    const a = envelopeById.get(id);
    const b = envelopeById.get(mirrorId);
    if (!a || !b) continue;
    if (b.utilization > a.utilization) {
      a.utilization = b.utilization;
      a.force = b.force;
      a.cap = b.cap;
      a.type = b.type;
    } else if (a.utilization > b.utilization) {
      b.utilization = a.utilization;
      b.force = a.force;
      b.cap = a.cap;
      b.type = a.type;
    }
  }
  envelopeWorstMembers.sort((a, b) => b.utilization - a.utilization);
  const envelopeMaxUtilization =
    envelopeWorstMembers[0]?.utilization ?? 0;
  const envelopeMaxTension = Math.max(
    0,
    ...envelopeWorstMembers.map((m) => m.force)
  );
  const envelopeMaxCompression = Math.min(
    0,
    ...envelopeWorstMembers.map((m) => m.force)
  );
  const failedMemberIds = envelopeWorstMembers
    .filter((m) => m.utilization > 1)
    .map((m) => m.id);
  const envelopeMemberForces: Record<string, number> = {};
  for (const m of envelopeWorstMembers) {
    envelopeMemberForces[m.id] = m.force;
  }

  const envelopeResult: StressTestResult = {
    memberForces: envelopeMemberForces,
    maxTension: envelopeMaxTension,
    maxCompression: envelopeMaxCompression,
    failedMemberIds,
    maxUtilization: envelopeMaxUtilization,
    worstMembers: envelopeWorstMembers,
  };

  const logCount = Math.min(8, envelopeWorstMembers.length);
  const topWorst = envelopeWorstMembers.slice(0, logCount).map((m) => {
    const member = members.find((mm) => mm.id === m.id);
    let lengthFt = 0;
    if (member) {
      const a = nodeById.get(member.a);
      const b = nodeById.get(member.b);
      if (a && b) {
        lengthFt = Math.hypot(a.x - b.x, a.y - b.y) * feetPerUnit;
      }
    }
    return {
      id: m.id,
      type: m.type,
      force: m.force,
      mode: m.force > 0 ? "COMPRESSION" : "TENSION",
      cap: m.cap,
      utilization: m.utilization,
      lengthFt,
    };
  });
  console.log("Stress test worst members (top 8):", topWorst);
  console.log("Stress test fixed DOFs:", Array.from(fixedDofs).sort((a, b) => a - b));

  if (process.env.NODE_ENV !== "production") {
    const centerDiagnostics = members
      .map((m) => {
        const a = nodeById.get(m.a);
        const b = nodeById.get(m.b);
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const slope = dx !== 0 ? Math.abs(dy / dx) : Number.POSITIVE_INFINITY;
        const midX = (a.x + b.x) / 2;
        return { id: m.id, midX, slope };
      })
      .filter(
        (m): m is { id: string; midX: number; slope: number } =>
          m !== null && m.slope > 0.2 && m.slope < 5
      )
      .sort((a, b) => Math.abs(a.midX - centerX) - Math.abs(b.midX - centerX))
      .slice(0, 4)
      .map((m) => ({
        id: m.id,
        midX: m.midX,
        force: envelopeResult.memberForces[m.id] ?? 0,
      }));
    console.log("Stress test center member forces:", centerDiagnostics);
  }

  return { ok: true, frames, envelope: envelopeResult };
}
