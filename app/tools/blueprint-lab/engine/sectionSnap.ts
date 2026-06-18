// Section drawing snap engine.
//
// Given a cursor position in world inches and the current primitive list,
// returns the best snap target within tolerance — endpoint, midpoint,
// on-edge nearest point, or grid (in priority order). Intersection snap
// will land in Phase F when we have richer editing interactions.
//
// The snap indicator drawer (`drawSnapIndicator`) renders the matching
// glyph in screen pixels: square (endpoint), triangle (midpoint), circle
// (on-edge), or plus (grid). Sizes are fixed pixels — the indicator is a
// UI element, not a drawing element, so it does NOT scale with zoom.

import { SectionPrimitive, Vec2 } from './types';

export type SnapKind = 'endpoint' | 'midpoint' | 'intersection' | 'on-edge' | 'grid';

export interface SnapResult {
  point: Vec2;        // world inches
  kind: SnapKind;
}

// Lower number = higher priority. When two candidates fall within the same
// tolerance, the higher-priority kind wins; ties within a kind go to the
// closer point.
const PRIORITY: Record<SnapKind, number> = {
  endpoint:     1,
  midpoint:     2,
  intersection: 3,
  'on-edge':    4,
  grid:         5,
};

export interface SnapOptions {
  grid?: { size: number; enabled: boolean };  // grid size in world inches
  // Infinite projection lines, already clipped to the view and converted to the
  // SAME coordinate frame as `primitives`. They participate in snapping like
  // real lines — you can slide along one (on-edge) and, crucially, land on the
  // INTERSECTION where a projection line crosses a drawing edge — but their
  // (arbitrary clip) endpoints/midpoints are NOT offered as snaps.
  guides?: Array<[Vec2, Vec2]>;
}

type BestSnap = { result: SnapResult; dist: number };

// Pure pick: returns the better of `current` and a candidate (point, kind, dist).
// Out-of-tolerance candidates are rejected by the caller before this is called.
function pickBetter(
  current: BestSnap | null,
  point: Vec2,
  kind: SnapKind,
  dist: number,
): BestSnap {
  if (!current) return { result: { point, kind }, dist };
  const cp = PRIORITY[current.result.kind];
  const tp = PRIORITY[kind];
  if (tp < cp || (tp === cp && dist < current.dist)) {
    return { result: { point, kind }, dist };
  }
  return current;
}

export function findSnap(
  cursor: Vec2,
  primitives: SectionPrimitive[],
  tolWorld: number,
  options?: SnapOptions,
): SnapResult | null {
  let best: BestSnap | null = null;

  const consider = (point: Vec2, kind: SnapKind) => {
    const dist = Math.hypot(point.x - cursor.x, point.y - cursor.y);
    if (dist > tolWorld) return;
    best = pickBetter(best, point, kind, dist);
  };

  // Segments that pass within tolerance of the cursor — collected here so we
  // can test their pairwise crossings for intersection snap (below). A
  // crossing lies on BOTH segments, so both must come near the cursor; that
  // prefilter keeps the pairwise pass tiny even with a large primitive list.
  const nearSegments: Array<[Vec2, Vec2]> = [];

  const considerSegment = (a: Vec2, b: Vec2) => {
    consider(a, 'endpoint');
    consider(b, 'endpoint');
    consider({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint');
    const np = nearestPointOnSegment(cursor, a, b);
    if (np) {
      consider(np, 'on-edge');
      if (Math.hypot(np.x - cursor.x, np.y - cursor.y) <= tolWorld) {
        nearSegments.push([a, b]);
      }
    }
  };

  for (const p of primitives) {
    switch (p.kind) {
      case 'line':
        considerSegment(p.a, p.b);
        break;
      case 'polyline': {
        for (let i = 0; i < p.verts.length - 1; i++) {
          considerSegment(p.verts[i], p.verts[i + 1]);
        }
        if (p.closed && p.verts.length > 1) {
          considerSegment(p.verts[p.verts.length - 1], p.verts[0]);
        }
        break;
      }
      case 'text':
        consider(p.at, 'endpoint');
        break;
      case 'toLine':
        considerSegment({ x: p.leftXIn, y: p.yIn }, { x: p.rightXIn, y: p.yIn });
        break;
      case 'dimChain':
        considerSegment({ x: p.xIn, y: p.y1In }, { x: p.xIn, y: p.y2In });
        break;
      case 'pitchSymbol':
        consider(p.anchor, 'endpoint');
        break;
    }
  }

  // Projection lines: snap to a point ON the line (slide along it) and feed it
  // into the pairwise crossing test below so the user can land exactly where a
  // projection line meets a drawing edge. No endpoint/midpoint (their ends are
  // arbitrary clip points, not real geometry).
  for (const [a, b] of options?.guides ?? []) {
    const np = nearestPointOnSegment(cursor, a, b);
    if (np) {
      consider(np, 'on-edge');
      if (Math.hypot(np.x - cursor.x, np.y - cursor.y) <= tolWorld) {
        nearSegments.push([a, b]);
      }
    }
  }

  // Intersection snap — where two segments cross near the cursor. This is
  // what lets a user land a clean point at, e.g., the floor-reference dashed
  // line meeting the wall edge (so the section below a door/window can be
  // boxed for a stone water-table, etc.). Test every pair of near segments;
  // proper crossings (within both segments) are offered as 'intersection'.
  for (let i = 0; i < nearSegments.length; i++) {
    for (let j = i + 1; j < nearSegments.length; j++) {
      const ip = segmentIntersection(
        nearSegments[i][0], nearSegments[i][1],
        nearSegments[j][0], nearSegments[j][1],
      );
      if (ip) consider(ip, 'intersection');
    }
  }

  // Grid snap is the lowest-priority fallback. Only fires when no higher-
  // priority candidate is in range.
  if (options?.grid?.enabled) {
    const g = options.grid.size;
    if (g > 0) {
      const gx = Math.round(cursor.x / g) * g;
      const gy = Math.round(cursor.y / g) * g;
      consider({ x: gx, y: gy }, 'grid');
    }
  }

  // Cast: TS narrows `best` to `null` through the closure mutations and
  // treats the optional chain as `never`. The closures DO reassign it.
  return (best as BestSnap | null)?.result ?? null;
}

// Projects a point onto a segment, clamped to the segment's endpoints. Used
// for on-edge snap. Returns null only if the segment has zero length.
function nearestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

// Proper intersection of two segments (a1→a2) and (b1→b2). Returns the
// crossing point only when it lies within BOTH segments; null for parallel,
// collinear, or out-of-span cases. Used for intersection snap.
function segmentIntersection(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y };
  const s = { x: b2.x - b1.x, y: b2.y - b1.y };
  const denom = r.x * s.y - r.y * s.x;
  if (denom === 0) return null;  // parallel or collinear
  const qp = { x: b1.x - a1.x, y: b1.y - a1.y };
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * r.x, y: a1.y + t * r.y };
}

// ── Indicator drawer ────────────────────────────────────────────────────────
// Draws the matching snap glyph at the snap point. Sizes are SCREEN pixels
// — the indicator is a UI affordance, not a drawing element, so it stays
// the same on-screen size at every zoom.

const SNAP_COLOR = '#22C55E';   // green-500
const SNAP_SIZE = 6;            // half-width / half-height in screen px

export function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  result: SnapResult,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const s = toScreen(result.point);
  ctx.save();
  ctx.strokeStyle = SNAP_COLOR;
  ctx.fillStyle   = SNAP_COLOR;
  ctx.lineWidth = 1.5;
  const { x, y } = s;
  const r = SNAP_SIZE;
  switch (result.kind) {
    case 'endpoint': {
      // Filled square — strongest visual weight for the highest-priority snap.
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      break;
    }
    case 'midpoint': {
      // Upward triangle.
      ctx.beginPath();
      ctx.moveTo(x,     y - r);
      ctx.lineTo(x + r, y + r * 0.7);
      ctx.lineTo(x - r, y + r * 0.7);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'intersection': {
      // Diagonal X.
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
      break;
    }
    case 'on-edge': {
      // Hollow circle.
      ctx.beginPath();
      ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'grid': {
      // Plus sign — weakest snap, lightest weight.
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
