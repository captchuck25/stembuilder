// DC circuit solver — Modified Nodal Analysis over resistive elements + ideal
// voltage sources. Wires are modeled as chains of tiny per-segment resistors,
// which (a) keeps every matrix non-singular once battery internal resistance is
// added, (b) yields a real current value for every wire segment (drives the
// flow animation), and (c) makes T-junctions connect naturally at shared grid
// points. Matrices stay tiny (< ~60 unknowns) so plain Gaussian elimination
// with partial pivoting is plenty.

import {
  BATTERY_R_INT, BATTERY_V, BULB_NOMINAL_P, BULB_R, CONTACT_R, CONTINUITY_MAX_R,
  LED_R, LIT_THRESHOLD, Part, Pt, PartResult, SHORT_CURRENT, SolveResult, WIRE_R,
  WireSegment, ptKey, wirePoints,
} from './types';

interface ResistorEl {
  n1: string;
  n2: string;
  r: number;
  partId: string;
  segIdx?: number; // for wire segments
}
interface SourceEl {
  nNeg: string; // battery terminal a
  nPos: string; // hidden internal node (real + terminal sits past R_INT)
  v: number;
  partId: string;
}

function buildElements(parts: Part[], blockedLeds: Set<string>): { resistors: ResistorEl[]; sources: SourceEl[]; extraR: ResistorEl[] } {
  const resistors: ResistorEl[] = [];
  const sources: SourceEl[] = [];
  const extraR: ResistorEl[] = []; // battery internal resistors
  for (const p of parts) {
    if (p.broken) continue; // hidden fault — conducts nothing
    const ka = ptKey(p.a);
    const kb = ptKey(p.b);
    switch (p.kind) {
      case 'wire': {
        if (p.jump) {
          // jumper: endpoint-to-endpoint only, arcs over everything in between
          resistors.push({ n1: ka, n2: kb, r: WIRE_R, partId: p.id, segIdx: 0 });
          break;
        }
        const pts = wirePoints(p.a, p.b);
        for (let i = 0; i + 1 < pts.length; i++) {
          resistors.push({ n1: ptKey(pts[i]), n2: ptKey(pts[i + 1]), r: WIRE_R, partId: p.id, segIdx: i });
        }
        break;
      }
      case 'led':
        if (!p.removed && !blockedLeds.has(p.id)) resistors.push({ n1: ka, n2: kb, r: LED_R, partId: p.id });
        break;
      case 'bulb':
        if (!p.removed) resistors.push({ n1: ka, n2: kb, r: BULB_R, partId: p.id });
        break;
      case 'resistor':
        resistors.push({ n1: ka, n2: kb, r: p.resistance ?? 100, partId: p.id });
        break;
      case 'switch':
        if (p.closed) resistors.push({ n1: ka, n2: kb, r: CONTACT_R, partId: p.id });
        break;
      case 'material':
        if (!p.removed && p.conductive) resistors.push({ n1: ka, n2: kb, r: CONTACT_R, partId: p.id });
        break;
      case 'battery': {
        const rInt = p.internalR ?? BATTERY_R_INT;
        if (rInt > 0) {
          const hidden = `__bat_${p.id}`;
          sources.push({ nNeg: ka, nPos: hidden, v: p.voltage ?? BATTERY_V, partId: p.id });
          extraR.push({ n1: hidden, n2: kb, r: rInt, partId: p.id });
        } else {
          // ideal source (Ohm's Law unit): meter readings match I = V/R exactly
          sources.push({ nNeg: ka, nPos: kb, v: p.voltage ?? BATTERY_V, partId: p.id });
        }
        break;
      }
    }
  }
  return { resistors, sources, extraR };
}

/** Gaussian elimination with partial pivoting. Near-zero pivots resolve to 0. */
function solveLinear(m: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const A = m.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-12) continue; // free variable → stays 0
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) x[i] = Math.abs(A[i][i]) > 1e-12 ? A[i][n] / A[i][i] : 0;
  return x;
}

/**
 * LEDs only conduct anode→cathode. Solve permitting every LED, then block any
 * carrying reverse current and re-solve until stable (a couple of passes at
 * most for these small circuits).
 */
export function solveCircuit(parts: Part[]): SolveResult {
  const blocked = new Set<string>();
  for (let iter = 0; iter < 3; iter++) {
    const result = solveOnce(parts, blocked);
    const newlyBlocked = parts.filter(p =>
      p.kind === 'led' && !blocked.has(p.id) && (result.parts[p.id]?.current ?? 0) < -1e-9);
    if (!newlyBlocked.length) return result;
    for (const p of newlyBlocked) blocked.add(p.id);
  }
  return solveOnce(parts, blocked);
}

function solveOnce(parts: Part[], blockedLeds: Set<string>): SolveResult {
  const { resistors, sources, extraR } = buildElements(parts, blockedLeds);
  const allR = [...resistors, ...extraR];

  // Connected components over the element graph, so each island gets its own
  // ground reference. Islands without a source are trivially all-zero.
  const adj = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const r of allR) touch(r.n1, r.n2);
  for (const s of sources) touch(s.nNeg, s.nPos);

  const compOf = new Map<string, number>();
  let compCount = 0;
  for (const start of adj.keys()) {
    if (compOf.has(start)) continue;
    const stack = [start];
    compOf.set(start, compCount);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!compOf.has(nb)) {
          compOf.set(nb, compCount);
          stack.push(nb);
        }
      }
    }
    compCount++;
  }

  const netVoltage: Record<string, number> = {};
  for (const k of adj.keys()) netVoltage[k] = 0;
  const sourceCurrent: Record<string, number> = {};

  for (let comp = 0; comp < compCount; comp++) {
    const compSources = sources.filter(s => compOf.get(s.nNeg) === comp);
    if (!compSources.length) continue;
    const compR = allR.filter(r => compOf.get(r.n1) === comp);

    const nets = [...new Set([...compR.flatMap(r => [r.n1, r.n2]), ...compSources.flatMap(s => [s.nNeg, s.nPos])])];
    const ground = nets[0];
    const idx = new Map<string, number>();
    let n = 0;
    for (const net of nets) if (net !== ground) idx.set(net, n++);
    const nSrc = compSources.length;
    const size = n + nSrc;
    const M: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
    const rhs = new Array(size).fill(0);

    for (const r of compR) {
      const g = 1 / r.r;
      const i1 = idx.get(r.n1);
      const i2 = idx.get(r.n2);
      if (i1 !== undefined) M[i1][i1] += g;
      if (i2 !== undefined) M[i2][i2] += g;
      if (i1 !== undefined && i2 !== undefined) {
        M[i1][i2] -= g;
        M[i2][i1] -= g;
      }
    }
    compSources.forEach((s, k) => {
      const row = n + k;
      const iPos = idx.get(s.nPos);
      const iNeg = idx.get(s.nNeg);
      if (iPos !== undefined) {
        M[iPos][row] += 1;
        M[row][iPos] += 1;
      }
      if (iNeg !== undefined) {
        M[iNeg][row] -= 1;
        M[row][iNeg] -= 1;
      }
      rhs[row] = s.v;
    });

    const x = solveLinear(M, rhs);
    for (const [net, i] of idx) netVoltage[net] = x[i];
    compSources.forEach((s, k) => {
      // MNA's current variable flows nPos→nNeg inside the source, so a battery
      // delivering power reads negative. Flip so positive = delivering.
      sourceCurrent[s.partId] = -x[n + k];
    });
  }

  // ── Per-part results ────────────────────────────────────────────────────────
  const partResults: Record<string, PartResult> = {};
  const wireSegments: Record<string, WireSegment[]> = {};
  const vAt = (p: Pt) => netVoltage[ptKey(p)] ?? 0;

  let maxBattery = 0;
  for (const p of parts) {
    switch (p.kind) {
      case 'battery': {
        const i = sourceCurrent[p.id] ?? 0;
        maxBattery = Math.max(maxBattery, Math.abs(i));
        partResults[p.id] = { current: i, voltage: vAt(p.a) - vAt(p.b), power: Math.abs(i * (p.voltage ?? BATTERY_V)) };
        break;
      }
      case 'wire': {
        if (p.jump) {
          const cur = p.broken ? 0 : (vAt(p.a) - vAt(p.b)) / WIRE_R;
          wireSegments[p.id] = [{ a: p.a, b: p.b, current: cur }];
          partResults[p.id] = { current: Math.abs(cur), voltage: vAt(p.a) - vAt(p.b), power: 0 };
          break;
        }
        const pts = wirePoints(p.a, p.b);
        const segs: WireSegment[] = [];
        let maxI = 0;
        for (let i = 0; i + 1 < pts.length; i++) {
          // A broken wire is excluded from the solve, so its endpoints sit in
          // different voltage islands — computing dv/R there would paint a
          // phantom "hot" flow right across the hidden fault. Force zero.
          const cur = p.broken ? 0 : (vAt(pts[i]) - vAt(pts[i + 1])) / WIRE_R;
          segs.push({ a: pts[i], b: pts[i + 1], current: cur });
          maxI = Math.max(maxI, Math.abs(cur));
        }
        wireSegments[p.id] = segs;
        partResults[p.id] = { current: maxI, voltage: vAt(p.a) - vAt(p.b), power: 0 };
        break;
      }
      default: {
        const r =
          p.broken ? Infinity
          : p.kind === 'bulb' ? (p.removed ? Infinity : BULB_R)
          : p.kind === 'led' ? (p.removed || blockedLeds.has(p.id) ? Infinity : LED_R)
          : p.kind === 'resistor' ? (p.resistance ?? 100)
          : p.kind === 'switch' ? (p.closed ? CONTACT_R : Infinity)
          : p.conductive && !p.removed ? CONTACT_R : Infinity;
        const dv = vAt(p.a) - vAt(p.b);
        const cur = isFinite(r) ? dv / r : 0;
        const power = Math.abs(dv * cur);
        const res: PartResult = { current: cur, voltage: dv, power };
        if (p.kind === 'bulb') res.brightness = p.removed ? 0 : power / BULB_NOMINAL_P;
        // LED brightness: full at 20 mA and above (until it burns — the UI
        // handles the 💥); reverse/blocked LEDs read 0.
        if (p.kind === 'led') res.brightness = cur > 0 ? Math.min(1, cur / 0.02) : 0;
        partResults[p.id] = res;
      }
    }
  }

  return {
    parts: partResults,
    wireSegments,
    netVoltage,
    shorted: maxBattery > SHORT_CURRENT,
    batteryCurrent: maxBattery,
  };
}

// ── Free-build spec checker ───────────────────────────────────────────────────

export interface FreeSpec {
  check: 'lit' | 'series' | 'redundant' | 'master-switch' | 'broken-branch';
  minBulbs: number;
  minBrightness?: number;
}

/**
 * Judges a from-scratch build against a spec instead of fixed part ids, so any
 * correct design passes. 'lit' = every placed bulb lit; 'series' = single-loop;
 * 'redundant' = survives losing any one bulb (forces parallel); 'master-switch'
 * = some switch darkens every bulb when opened (judged with switches closed
 * otherwise, like the guided switch challenges).
 */
export function evaluateFreeBuild(parts: Part[], spec: FreeSpec): boolean {
  const bulbs = parts.filter(p => p.kind === 'bulb');
  if (bulbs.length < spec.minBulbs) return false;
  if (!parts.some(p => p.kind === 'battery')) return false;
  const min = spec.minBrightness ?? 0.05;
  const allLit = (r: SolveResult) => bulbs.every(b => (r.parts[b.id]?.brightness ?? 0) > min);

  if (spec.check === 'master-switch') {
    const switches = parts.filter(p => p.kind === 'switch');
    if (!switches.length) return false;
    const withStates = (open: string | null) => parts.map(p =>
      p.kind === 'switch' ? { ...p, closed: p.id !== open } : p);
    const closed = solveCircuit(withStates(null));
    if (closed.shorted || !allLit(closed)) return false;
    return switches.some(s => {
      const r = solveCircuit(withStates(s.id));
      return !r.shorted && bulbs.every(b => (r.parts[b.id]?.brightness ?? 0) <= 0.05);
    });
  }

  if (spec.check === 'broken-branch') {
    // A parallel fault demo: at least one bulb bright, at least one dark, a
    // broken segment present — and repairing the break must light EVERY bulb
    // brightly, proving the dark branch was dark because of the break alone.
    const r = solveCircuit(parts);
    if (r.shorted) return false;
    const bright = bulbs.filter(b => (r.parts[b.id]?.brightness ?? 0) > min);
    const dark = bulbs.filter(b => (r.parts[b.id]?.brightness ?? 0) <= 0.05);
    if (!bright.length || !dark.length) return false;
    if (!parts.some(p => p.broken)) return false;
    const r2 = solveCircuit(parts.map(p => ({ ...p, broken: false })));
    if (r2.shorted) return false;
    return bulbs.every(b => (r2.parts[b.id]?.brightness ?? 0) > min);
  }

  const r = solveCircuit(parts);
  if (r.shorted || !allLit(r)) return false;
  if (spec.check === 'series') return isSeries(r, bulbs.map(b => b.id));
  if (spec.check === 'redundant') {
    return bulbs.every(victim => {
      const r2 = solveCircuit(parts.map(p => (p.id === victim.id ? { ...p, removed: true } : p)));
      return !r2.shorted && bulbs.filter(o => o.id !== victim.id).every(o => (r2.parts[o.id]?.brightness ?? 0) > min);
    });
  }
  return true; // 'lit'
}

// ── Wire-drawing helper ───────────────────────────────────────────────────────

/**
 * A wire covering both contacts of a switch would silently bypass it (wires
 * connect at every covered point), which is never what the student means. So
 * a switch acts as a barrier while drawing: the dragged wire is clipped just
 * before it would cover a switch's second contact. Connecting through a
 * switch is therefore always deliberate — one wire to each contact.
 * Only switches get this treatment: dragging across a bulb is a real short,
 * which Unit 1 teaches (with a warning banner).
 */
export function clipWireAtSwitches(a: Pt, b: Pt, parts: Part[]): Pt {
  const pts = wirePoints(a, b); // ordered a → b
  const idxOf = new Map(pts.map((p, i) => [ptKey(p), i]));
  let clipIdx = pts.length - 1;
  for (const p of parts) {
    if (p.kind !== 'switch') continue;
    const i = idxOf.get(ptKey(p.a));
    const j = idxOf.get(ptKey(p.b));
    if (i !== undefined && j !== undefined) clipIdx = Math.min(clipIdx, Math.max(i, j) - 1);
  }
  return pts[Math.max(0, clipIdx)];
}

// ── Derived checks used by challenge goals ────────────────────────────────────

export function isLit(result: SolveResult, bulbId: string, min = LIT_THRESHOLD): boolean {
  return (result.parts[bulbId]?.brightness ?? 0) > min;
}

/**
 * True when every listed bulb carries (approximately) the full battery current —
 * the signature of a single-loop series circuit. In parallel each branch only
 * carries a share, so this fails there.
 */
export function isSeries(result: SolveResult, bulbIds: string[]): boolean {
  const iBat = result.batteryCurrent;
  if (iBat < 1e-6) return false;
  return bulbIds.every(id => {
    const i = Math.abs(result.parts[id]?.current ?? 0);
    return Math.abs(i - iBat) / iBat < 0.05;
  });
}

/**
 * Continuity test: is there a conductive path (< CONTINUITY_MAX_R per element)
 * between the two probe points? Batteries never conduct the tester's signal;
 * bulb filaments and resistors under the threshold do. Returns the set of
 * reachable point-keys from `probeA` (for highlighting) plus the verdict.
 */
export function continuity(parts: Part[], probeA: Pt, probeB: Pt): { connected: boolean; reached: Set<string> } {
  const edges = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!edges.has(a)) edges.set(a, []);
    if (!edges.has(b)) edges.set(b, []);
    edges.get(a)!.push(b);
    edges.get(b)!.push(a);
  };
  for (const p of parts) {
    if (p.broken) continue; // a faulty part never passes the tester's signal
    const ka = ptKey(p.a);
    const kb = ptKey(p.b);
    switch (p.kind) {
      case 'wire': {
        if (p.jump) { add(ka, kb); break; } // jumpers connect endpoints only
        const pts = wirePoints(p.a, p.b);
        for (let i = 0; i + 1 < pts.length; i++) add(ptKey(pts[i]), ptKey(pts[i + 1]));
        break;
      }
      case 'bulb':
        if (!p.removed && BULB_R <= CONTINUITY_MAX_R) add(ka, kb);
        break;
      case 'led':
        break; // a diode blocks the tester's tiny signal (kid-simple model)
      case 'resistor':
        if ((p.resistance ?? 100) <= CONTINUITY_MAX_R) add(ka, kb);
        break;
      case 'switch':
        if (p.closed) add(ka, kb);
        break;
      case 'material':
        if (!p.removed && p.conductive) add(ka, kb);
        break;
      case 'battery':
        break; // never probe through a source
    }
  }
  const start = ptKey(probeA);
  const target = ptKey(probeB);
  const reached = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of edges.get(cur) ?? []) {
      if (!reached.has(nb)) {
        reached.add(nb);
        stack.push(nb);
      }
    }
  }
  return { connected: reached.has(target), reached };
}
