// Bridge Builder — collapse simulation. When the stress test fails, the truss
// hands off to this small verlet integrator: supports stay pinned, failed
// members sever into two dangling stubs, intact members act as rigid distance
// constraints, and everything (truck included) falls until it lands in the
// water. Deterministic, cheap (tens of points), and framework-free.

import { type Member, type Node } from "./members";

export type CollapsePoint = {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
};

export type CollapseSplash = { x: number; t0: number };

export type CollapseState = {
  points: Map<string, CollapsePoint>;
  bars: { a: string; b: string; rest: number }[];
  brokenIds: Set<string>;
  truckA: string;
  truckB: string;
  truckTravelAtBreak: number;
  roadwayIds: string[];
  splashes: CollapseSplash[];
  startedMs: number;
  lastMs: number;
  settled: boolean;
  waterY: number;
};

export function stubTipKey(memberId: string, end: "a" | "b"): string {
  return `stub:${memberId}:${end}`;
}

const GRAVITY = 1500; // px/s^2 — tuned for drama at canvas scale
const AIR_DAMP = 0.995;
const WATER_DAMP = 0.8;
const SINK_DEPTH = 26;
const CONSTRAINT_ITERATIONS = 5;
const TRUCK_KEY_A = "truck:rear";
const TRUCK_KEY_B = "truck:front";
const TRUCK_DECK_CLEARANCE = 18;
const SPLASH_MIN_SPEED = 1.3; // px per step downward to count as an impact
const SPLASH_MAX = 14;

export function initCollapse(params: {
  nodes: Node[];
  members: Member[];
  failedIds: Set<string>;
  posOf: (id: string) => { x: number; y: number };
  pinnedIds: Set<string>;
  roadwayIds: string[];
  truckX: number;
  truckY: number;
  axleHalf: number;
  truckSpeedPxPerSec: number;
  truckTravelAtBreak: number;
  waterY: number;
  nowMs: number;
}): CollapseState {
  const points = new Map<string, CollapsePoint>();
  const bars: CollapseState["bars"] = [];
  const brokenIds = new Set<string>();

  const usedNodeIds = new Set<string>();
  for (const m of params.members) {
    usedNodeIds.add(m.a);
    usedNodeIds.add(m.b);
  }
  for (const id of params.pinnedIds) usedNodeIds.add(id);
  for (const id of params.roadwayIds) usedNodeIds.add(id);

  for (const n of params.nodes) {
    if (!usedNodeIds.has(n.id)) continue;
    const p = params.posOf(n.id);
    points.set(n.id, {
      x: p.x,
      y: p.y,
      px: p.x,
      py: p.y,
      pinned: params.pinnedIds.has(n.id),
    });
  }

  for (const m of params.members) {
    const a = points.get(m.a);
    const b = points.get(m.b);
    if (!a || !b) continue;
    const rest = Math.hypot(b.x - a.x, b.y - a.y);
    if (rest <= 0) continue;
    if (params.failedIds.has(m.id)) {
      // Sever: two stubs, each a free tip constrained to its parent joint.
      brokenIds.add(m.id);
      const tipA = { x: a.x + (b.x - a.x) * 0.42, y: a.y + (b.y - a.y) * 0.42 };
      const tipB = { x: a.x + (b.x - a.x) * 0.58, y: a.y + (b.y - a.y) * 0.58 };
      const keyA = stubTipKey(m.id, "a");
      const keyB = stubTipKey(m.id, "b");
      points.set(keyA, { x: tipA.x, y: tipA.y, px: tipA.x, py: tipA.y, pinned: false });
      points.set(keyB, { x: tipB.x, y: tipB.y, px: tipB.x, py: tipB.y, pinned: false });
      bars.push({ a: m.a, b: keyA, rest: rest * 0.42 });
      bars.push({ a: m.b, b: keyB, rest: rest * 0.42 });
    } else {
      bars.push({ a: m.a, b: m.b, rest });
    }
  }

  // Truck: two axle particles joined rigidly, entering with its travel speed.
  const dt0 = 1 / 60;
  const vx0 = params.truckSpeedPxPerSec * dt0;
  const rear = { x: params.truckX - params.axleHalf, y: params.truckY };
  const front = { x: params.truckX + params.axleHalf, y: params.truckY };
  points.set(TRUCK_KEY_A, { x: rear.x, y: rear.y, px: rear.x - vx0, py: rear.y, pinned: false });
  points.set(TRUCK_KEY_B, { x: front.x, y: front.y, px: front.x - vx0, py: front.y, pinned: false });
  bars.push({ a: TRUCK_KEY_A, b: TRUCK_KEY_B, rest: params.axleHalf * 2 });

  return {
    points,
    bars,
    brokenIds,
    truckA: TRUCK_KEY_A,
    truckB: TRUCK_KEY_B,
    truckTravelAtBreak: params.truckTravelAtBreak,
    roadwayIds: [...params.roadwayIds],
    splashes: [],
    startedMs: params.nowMs,
    lastMs: params.nowMs,
    settled: false,
    waterY: params.waterY,
  };
}

function deckSurfaceY(state: CollapseState, x: number): number | null {
  const pts: { x: number; y: number }[] = [];
  for (const id of state.roadwayIds) {
    const p = state.points.get(id);
    if (p) pts.push({ x: p.x, y: p.y });
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.x - b.x);
  if (x <= pts[0].x || x >= pts[pts.length - 1].x) return null;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const l = pts[i];
    const r = pts[i + 1];
    if (x < l.x || x > r.x) continue;
    const span = r.x - l.x;
    if (span <= 0) continue;
    const t = (x - l.x) / span;
    return l.y + (r.y - l.y) * t;
  }
  return null;
}

export function stepCollapse(state: CollapseState, nowMs: number): void {
  const dt = Math.min(0.032, Math.max(0.008, (nowMs - state.lastMs) / 1000));
  state.lastMs = nowMs;
  const gStep = GRAVITY * dt * dt;

  for (const p of state.points.values()) {
    if (p.pinned) continue;
    const underwater = p.y > state.waterY;
    const damp = underwater ? WATER_DAMP : AIR_DAMP;
    const vx = (p.x - p.px) * damp;
    const vy = (p.y - p.py) * damp;
    const wasAbove = p.y <= state.waterY;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + (underwater ? gStep * 0.15 : gStep);
    if (p.y > state.waterY + SINK_DEPTH) {
      p.y = state.waterY + SINK_DEPTH;
    }
    // Splash on first energetic water entry.
    if (wasAbove && p.y > state.waterY && vy > SPLASH_MIN_SPEED) {
      const crowded = state.splashes.some(
        (s) => Math.abs(s.x - p.x) < 26 && nowMs - s.t0 < 500
      );
      if (!crowded && state.splashes.length < SPLASH_MAX) {
        state.splashes.push({ x: p.x, t0: nowMs });
      }
    }
  }

  for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter += 1) {
    for (const bar of state.bars) {
      const a = state.points.get(bar.a);
      const b = state.points.get(bar.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0) continue;
      const diff = (dist - bar.rest) / dist;
      const wA = a.pinned ? 0 : b.pinned ? 1 : 0.5;
      const wB = a.pinned ? 1 : b.pinned ? 0 : 0.5;
      a.x += dx * diff * wA;
      a.y += dy * diff * wA;
      b.x -= dx * diff * wB;
      b.y -= dy * diff * wB;
    }
  }

  // Truck rests on whatever is left of the deck under each axle.
  for (const key of [state.truckA, state.truckB]) {
    const p = state.points.get(key);
    if (!p) continue;
    const deckY = deckSurfaceY(state, p.x);
    if (deckY === null) continue;
    const target = deckY - TRUCK_DECK_CLEARANCE;
    if (p.y > target) {
      p.y = target;
      p.py = p.y - (p.y - p.py) * 0.3;
    }
  }
}
