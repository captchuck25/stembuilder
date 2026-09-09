// Tower Builder — collapse simulation. When the crush test fails, the truss
// hands off to this small verlet integrator: footings stay pinned, failed
// members sever into two dangling stubs, intact members act as rigid distance
// constraints, and the press plate keeps driving down on whatever is left of
// the top until everything lands on the ground. Deterministic, cheap (tens of
// points), and framework-free. Adapted from the Bridge Builder's collapse.ts
// (water → ground, truck → press plate).

import { type Member, type Node } from "@/app/tools/bridge/engine/members";

export type CollapsePoint = {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
};

export type CollapsePuff = { x: number; t0: number };

export type CollapseState = {
  points: Map<string, CollapsePoint>;
  bars: { a: string; b: string; rest: number }[];
  brokenIds: Set<string>;
  /** Joints the press plate was bearing on when the tower let go. */
  topIds: string[];
  /** Underside of the press plate (canvas y). Only ever moves down. */
  plateBottomY: number;
  puffs: CollapsePuff[];
  startedMs: number;
  lastMs: number;
  settled: boolean;
  groundY: number;
};

export function stubTipKey(memberId: string, end: "a" | "b"): string {
  return `stub:${memberId}:${end}`;
}

const GRAVITY = 1500; // px/s^2 — tuned for drama at canvas scale
const AIR_DAMP = 0.995;
const GROUND_FRICTION = 0.55; // fraction of horizontal velocity kept on contact
const CONSTRAINT_ITERATIONS = 5;
const PLATE_SPEED = 140; // px/s the press keeps driving once the tower fails
const PUFF_MIN_SPEED = 1.3; // px per step downward to count as an impact
const PUFF_MAX = 14;

export function initCollapse(params: {
  nodes: Node[];
  members: Member[];
  failedIds: Set<string>;
  posOf: (id: string) => { x: number; y: number };
  pinnedIds: Set<string>;
  topIds: string[];
  plateBottomY: number;
  groundY: number;
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
  for (const id of params.topIds) usedNodeIds.add(id);

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

  return {
    points,
    bars,
    brokenIds,
    topIds: [...params.topIds],
    plateBottomY: params.plateBottomY,
    puffs: [],
    startedMs: params.nowMs,
    lastMs: params.nowMs,
    settled: false,
    groundY: params.groundY,
  };
}

export function stepCollapse(state: CollapseState, nowMs: number): void {
  const dt = Math.min(0.032, Math.max(0.008, (nowMs - state.lastMs) / 1000));
  state.lastMs = nowMs;
  const gStep = GRAVITY * dt * dt;

  // The press never lets up: it keeps descending until it meets the ground,
  // and anything still under it gets shoved down with it.
  state.plateBottomY = Math.min(state.groundY, state.plateBottomY + PLATE_SPEED * dt);

  for (const p of state.points.values()) {
    if (p.pinned) continue;
    const vx = (p.x - p.px) * AIR_DAMP;
    const vy = (p.y - p.py) * AIR_DAMP;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + gStep;
  }

  for (const id of state.topIds) {
    const p = state.points.get(id);
    if (!p || p.pinned) continue;
    if (p.y < state.plateBottomY) p.y = state.plateBottomY;
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
    // Ground is solid: nothing passes below it, and sliding along it bleeds
    // off horizontal speed.
    for (const p of state.points.values()) {
      if (p.pinned) continue;
      if (p.y > state.groundY) {
        const vyDown = p.y - p.py;
        const wasAbove = p.py <= state.groundY;
        p.y = state.groundY;
        p.py = state.groundY;
        p.px = p.x - (p.x - p.px) * GROUND_FRICTION;
        if (wasAbove && vyDown > PUFF_MIN_SPEED) {
          const crowded = state.puffs.some(
            (s) => Math.abs(s.x - p.x) < 26 && nowMs - s.t0 < 500
          );
          if (!crowded && state.puffs.length < PUFF_MAX) {
            state.puffs.push({ x: p.x, t0: nowMs });
          }
        }
      }
    }
  }
}
