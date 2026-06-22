import {
  DEFAULT_SIDE_PANEL_WIDTH, DimAnchor, Dimension, Door, FurnitureItem, Level, LineEntity, RoomLabel,
  SectionCut, SelectionKind, Stair, TextLabel, Vec2, Wall, Window,
} from './types';

// ─── Door opening cut ────────────────────────────────────────────────────────
// The "opening" the wall is cut for. For entry doors with sidelites, the cut
// extends past the door panel by the sidelite widths and the cut's center
// shifts away from the door toward the sidelite side(s).

// Windows cut the wall at exactly their width (no sidelites equivalent).
// Bay windows project OUTSIDE the wall, so the wall cut is still just width.
export function windowOpeningCut(w: Window): { positionAlong: number; width: number } {
  return { positionAlong: w.positionAlong, width: w.width };
}

// Render-time opening cuts. A double-hung "double" unit is two windows
// flanking a 1.5" mullion, so it cuts TWO openings and leaves a short wall
// pier between them (the wall's top/bottom edge lines bridge the two units)
// instead of one continuous hole. Every other window is a single full cut.
export function windowOpeningCuts(w: Window): { positionAlong: number; width: number }[] {
  if (w.windowType === 'double-hung' && w.panels === 'double') {
    const mullionIn = 1.5; // keep in sync with drawWindow()
    const unitW = (w.width - mullionIn) / 2;
    if (unitW > 0) {
      const offset = (unitW + mullionIn) / 2;
      return [
        { positionAlong: w.positionAlong - offset, width: unitW },
        { positionAlong: w.positionAlong + offset, width: unitW },
      ];
    }
  }
  return [windowOpeningCut(w)];
}

export function doorOpeningCut(d: Door): { positionAlong: number; width: number } {
  if (d.doorType !== 'entry' || !d.sidePanels || d.sidePanels === 'none') {
    return { positionAlong: d.positionAlong, width: d.width };
  }
  const sw = d.sidePanelWidth ?? DEFAULT_SIDE_PANEL_WIDTH;
  // "left" of the opening = -u direction (toward wall.start) in the door's
  // local frame. "right" = +u direction.
  const left = (d.sidePanels === 'left' || d.sidePanels === 'both') ? sw : 0;
  const right = (d.sidePanels === 'right' || d.sidePanels === 'both') ? sw : 0;
  return {
    positionAlong: d.positionAlong + (right - left) / 2,
    width: d.width + left + right,
  };
}

// ─── Wall polygon (basic rectangle, no mitering) ─────────────────────────────
// Lives here because both renderer and hit-test code need it.
// CCW order: start-left, end-left, end-right, start-right.
export function wallPolygon(w: Wall): Vec2[] {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return [w.start, w.start, w.start, w.start];
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const h = w.thickness / 2;
  return [
    { x: w.start.x + nx * h, y: w.start.y + ny * h },
    { x: w.end.x   + nx * h, y: w.end.y   + ny * h },
    { x: w.end.x   - nx * h, y: w.end.y   - ny * h },
    { x: w.start.x - nx * h, y: w.start.y - ny * h },
  ];
}

// ─── Box selection ────────────────────────────────────────────────────────────

export interface Box {
  x0: number; y0: number; x1: number; y1: number;
}

export function normalizeBox(a: Vec2, b: Vec2): Box {
  return {
    x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y),
  };
}

const pointInBox = (p: Vec2, b: Box) =>
  p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

function pointInConvexQuad(p: Vec2, quad: Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i], b = quad[(i + 1) % quad.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = c > 0 ? 1 : -1;
    else if (sign * c < 0) return false;
  }
  return true;
}

function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const side = (A: Vec2, B: Vec2, C: Vec2) =>
    (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
  const d1 = side(b1, b2, a1);
  const d2 = side(b1, b2, a2);
  const d3 = side(a1, a2, b1);
  const d4 = side(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// "Window" select (L→R drag): wall must be ENTIRELY inside the box.
export function wallFullyInsideBox(w: Wall, box: Box): boolean {
  const corners = wallPolygon(w);
  return corners.every(p => pointInBox(p, box));
}

// "Crossing" select (R→L drag): wall just needs to touch or overlap the box.
export function wallTouchesBox(w: Wall, box: Box): boolean {
  const corners = wallPolygon(w);
  for (const p of corners) if (pointInBox(p, box)) return true;
  const boxCorners: Vec2[] = [
    { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 },
  ];
  for (const p of boxCorners) if (pointInConvexQuad(p, corners)) return true;
  for (let i = 0; i < 4; i++) {
    const wa = corners[i], wb = corners[(i + 1) % 4];
    for (let j = 0; j < 4; j++) {
      const ba = boxCorners[j], bb = boxCorners[(j + 1) % 4];
      if (segmentsIntersect(wa, wb, ba, bb)) return true;
    }
  }
  return false;
}

// ─── Annotation line snap (CAD-style endpoint / midpoint / edge) ─────────────
// While drawing with the line tool, the cursor snaps to features of existing
// lines so chains/intersections come out clean. Returns the closest feature
// within tolerance, or null. Endpoints take a small priority bonus over
// midpoints, which take priority over on-edge perpendicular projections.
export type LineSnapKind = 'endpoint' | 'midpoint' | 'edge';
export interface LineSnapHit {
  point: Vec2;
  kind: LineSnapKind;
  lineId: string;
}

export function snapToLineFeatures(
  lines: LineEntity[], p: Vec2, toleranceIn: number,
  walls: Wall[] = [],
  polylines: Vec2[][] = [],
): LineSnapHit | null {
  let best: LineSnapHit | null = null;
  let bestScore = toleranceIn;

  const considerPoint = (pt: Vec2, kind: LineSnapKind, id: string, biasMul: number) => {
    const d = dist(p, pt);
    const score = d * biasMul;
    if (score < bestScore) { bestScore = score; best = { point: pt, kind, lineId: id }; }
  };
  const considerEdge = (a: Vec2, b: Vec2, id: string) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 <= 0) return;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
    if (t <= 0.02 || t >= 0.98) return; // near-endpoint handled separately
    const proj: Vec2 = { x: a.x + t * dx, y: a.y + t * dy };
    const d = dist(p, proj);
    if (d < bestScore) { bestScore = d; best = { point: proj, kind: 'edge', lineId: id }; }
  };

  // Annotation lines — endpoints, midpoint, perpendicular projection.
  for (const l of lines) {
    considerPoint(l.start, 'endpoint', l.id, 0.6);
    considerPoint(l.end,   'endpoint', l.id, 0.6);
    const mid: Vec2 = { x: (l.start.x + l.end.x) / 2, y: (l.start.y + l.end.y) / 2 };
    considerPoint(mid, 'midpoint', l.id, 0.75);
    considerEdge(l.start, l.end, l.id);
  }

  // Walls — snap to the VISIBLE polygon (the black outline), not the
  // centerline. Each wall contributes its 4 polygon corners, the 2 long-face
  // midpoints, and the 2 long-face edges for perpendicular projection.
  // Mitered room corners (where two walls meet) are added too so the user
  // can snap to the inside/outside corner of an L-junction.
  const JOIN_EPS = 1.0;
  const isShared = (pt: Vec2, selfId: string): boolean =>
    walls.some(w => w.id !== selfId &&
      (Math.hypot(w.start.x - pt.x, w.start.y - pt.y) < JOIN_EPS ||
       Math.hypot(w.end.x   - pt.x, w.end.y   - pt.y) < JOIN_EPS));

  // Helper: does point `pt` lie strictly inside ANY OTHER wall's polygon?
  // (Used to suppress polygon corners that stick through a perpendicular
  // wall in a T-junction — the visible architectural corners are added
  // below as face-line intersections.)
  const pointInsideOtherWall = (pt: Vec2, selfId: string): boolean => {
    for (const other of walls) {
      if (other.id === selfId) continue;
      if (pointInPolygon(pt, wallPolygon(other))) return true;
    }
    return false;
  };

  for (const w of walls) {
    const corners = wallPolygon(w); // [start+n, end+n, end-n, start-n]
    const startShared = isShared(w.start, w.id);
    const endShared   = isShared(w.end,   w.id);
    // Skip polygon corners at SHARED endpoints (mitered room corner wins) or
    // when they sit INSIDE another wall's body (T-junction — the visible
    // inside corners come from face-line intersection below).
    if (!startShared) {
      if (!pointInsideOtherWall(corners[0], w.id)) considerPoint(corners[0], 'endpoint', w.id, 0.6);
      if (!pointInsideOtherWall(corners[3], w.id)) considerPoint(corners[3], 'endpoint', w.id, 0.6);
    }
    if (!endShared) {
      if (!pointInsideOtherWall(corners[1], w.id)) considerPoint(corners[1], 'endpoint', w.id, 0.6);
      if (!pointInsideOtherWall(corners[2], w.id)) considerPoint(corners[2], 'endpoint', w.id, 0.6);
    }
    // Midpoints of each long face.
    const midPlus:  Vec2 = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    const midMinus: Vec2 = { x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2 };
    considerPoint(midPlus,  'midpoint', w.id, 0.75);
    considerPoint(midMinus, 'midpoint', w.id, 0.75);
    // Long-face edges for perpendicular projection (silent snap — no marker).
    considerEdge(corners[0], corners[1], w.id);
    considerEdge(corners[3], corners[2], w.id);
  }

  // Mitered junction corners between pairs of walls. Filter to the
  // architecturally real corners (same sign-of-projection rule as the dim
  // snap) so only inside/outside room corners surface, not the in-the-wall
  // intersection artefacts.
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const A = walls[i], B = walls[j];
      for (const sA of [1, -1] as const) {
        for (const sB of [1, -1] as const) {
          if (!isArchitecturalJunction(A, B, sA, sB, walls)) continue;
          const pt = mitredJunctionPoint(A, B, sA, sB);
          if (!pt) continue;
          considerPoint(pt, 'endpoint', `${A.id}~${B.id}`, 0.55);
        }
      }
    }
  }

  // T-junction inside corners — wall A's endpoint lies strictly inside wall
  // B's body (not at a shared endpoint). The visible architectural corners
  // are where A's two face lines meet B's NEAR face (the face on the side
  // A's body came from). Adds those two points as 'endpoint' snaps so the
  // line tool lands on what the user perceives as the corner, not on A's
  // polygon corner that punched through B.
  for (const A of walls) {
    for (const B of walls) {
      if (A.id === B.id) continue;
      const polyB = wallPolygon(B);
      const tryEnd = (endPt: Vec2) => {
        if (!pointInPolygon(endPt, polyB)) return;
        // Skip when endPt coincides with B's endpoint (wall-junction case).
        if (Math.hypot(endPt.x - B.start.x, endPt.y - B.start.y) < JOIN_EPS) return;
        if (Math.hypot(endPt.x - B.end.x,   endPt.y - B.end.y)   < JOIN_EPS) return;
        // B's normal — used to pick the NEAR face (same side as A's body).
        const dxB = B.end.x - B.start.x, dyB = B.end.y - B.start.y;
        const LB = Math.hypot(dxB, dyB);
        if (LB === 0) return;
        const nxB = -dyB / LB, nyB = dxB / LB;
        // Pick which face of B is on A's body side by projecting A's
        // OTHER endpoint (the one that's not inside B) onto B's normal.
        const otherEnd = (endPt === A.start) ? A.end : A.start;
        const sideDot = (otherEnd.x - B.start.x) * nxB + (otherEnd.y - B.start.y) * nyB;
        const sideB: 1 | -1 = sideDot >= 0 ? 1 : -1;
        for (const sA of [1, -1] as const) {
          const pt = faceLineIntersection(A, B, sA, sideB);
          if (!pt) continue;
          considerPoint(pt, 'endpoint', `${A.id}>${B.id}:${sA}`, 0.55);
        }
      };
      tryEnd(A.start);
      tryEnd(A.end);
    }
  }

  // Arbitrary polylines (e.g. already-measured room boundaries). Each vertex is
  // a corner, each segment contributes a midpoint and an on-edge projection —
  // so a new room boundary can lock exactly onto an adjacent room's outline
  // when no wall separates them. Treated as closed loops: the last→first
  // segment is included too.
  for (let pi = 0; pi < polylines.length; pi++) {
    const poly = polylines[pi];
    if (!poly || poly.length < 2) continue;
    const id = `poly${pi}`;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      considerPoint(a, 'endpoint', id, 0.6);
      const mid: Vec2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      considerPoint(mid, 'midpoint', id, 0.75);
      considerEdge(a, b, id);
    }
  }

  return best;
}

// Auto-detect a rectangular room footprint from the walls around a seed point
// (the room label's position). Shoots four axis-aligned rays (+x,-x,+y,-y) and
// stops each at the FIRST wall face it hits — that face is the room's interior
// face in that direction. The four hits define a rectangle measured to the
// inside of the surrounding walls, exactly what you'd click by hand for an
// "obvious 4-wall" room. Returns the 4 corners (CW), or null when any side is
// open (no wall within reach) or the result is degenerate — i.e. the room
// isn't clearly enclosed and the user should draw it manually.
export function autoDetectRoomBoundary(
  seed: Vec2, walls: Wall[], maxReachIn = 5000,
): Vec2[] | null {
  // Distance from `o` along unit direction `d` to the nearest wall-polygon
  // edge, or null if none within maxReachIn.
  const rayHit = (d: Vec2): number | null => {
    let best: number | null = null;
    for (const w of walls) {
      const poly = wallPolygon(w);
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const ex = b.x - a.x, ey = b.y - a.y;
        const det = ex * d.y - ey * d.x;        // cross(e, d)
        if (Math.abs(det) < 1e-9) continue;     // ray parallel to edge
        const wx = a.x - seed.x, wy = a.y - seed.y;
        const t = (-wx * ey + ex * wy) / det;   // distance along ray
        const u = (d.x * wy - d.y * wx) / det;  // param along edge [0,1]
        if (t > 1e-6 && t <= maxReachIn && u >= -1e-6 && u <= 1 + 1e-6) {
          if (best == null || t < best) best = t;
        }
      }
    }
    return best;
  };

  const right = rayHit({ x: 1, y: 0 });
  const left  = rayHit({ x: -1, y: 0 });
  const down  = rayHit({ x: 0, y: 1 });
  const up    = rayHit({ x: 0, y: -1 });
  if (right == null || left == null || down == null || up == null) return null;

  const minX = seed.x - left;
  const maxX = seed.x + right;
  const minY = seed.y - up;
  const maxY = seed.y + down;
  // Reject slivers (mis-detection) — require at least 6" each way.
  if (maxX - minX < 6 || maxY - minY < 6) return null;

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

// Segment-segment intersection. Returns the intersection point if both
// segments cross (strictly inside both, with a small epsilon to allow
// near-endpoint hits), else null.
export function segmentIntersection(
  a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2,
): Vec2 | null {
  const rX = a2.x - a1.x, rY = a2.y - a1.y;
  const sX = b2.x - b1.x, sY = b2.y - b1.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const t = ((b1.x - a1.x) * sY - (b1.y - a1.y) * sX) / denom;
  const u = ((b1.x - a1.x) * rY - (b1.y - a1.y) * rX) / denom;
  const EPS = 1e-4;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: a1.x + t * rX, y: a1.y + t * rY };
}

// ─── Annotation line hit/box tests ────────────────────────────────────────────
export function hitLine(lines: LineEntity[], p: Vec2, toleranceIn: number): string | null {
  let best: string | null = null;
  let bestD = toleranceIn;
  for (const l of lines) {
    const d = distPointToSegment(p, l.start, l.end);
    if (d < bestD) { bestD = d; best = l.id; }
  }
  return best;
}

// Hit-test a click against the dashed cut line of any SectionCut. Returns
// the topmost (last-drawn) cut whose dashed line is within `toleranceIn`
// of the click, or null. Orthogonal cuts only — the cut renders as a
// horizontal or vertical segment from start→end at fixed position.
export function hitSectionCut(cuts: SectionCut[], p: Vec2, toleranceIn: number): string | null {
  for (let i = cuts.length - 1; i >= 0; i--) {
    const c = cuts[i];
    const a: Vec2 = c.axis === 'x' ? { x: c.start, y: c.position } : { x: c.position, y: c.start };
    const b: Vec2 = c.axis === 'x' ? { x: c.end,   y: c.position } : { x: c.position, y: c.end   };
    if (distPointToSegment(p, a, b) <= toleranceIn) return c.id;
  }
  return null;
}

export function lineFullyInsideBox(l: LineEntity, box: Box): boolean {
  return pointInBox(l.start, box) && pointInBox(l.end, box);
}

export function lineTouchesBox(l: LineEntity, box: Box): boolean {
  if (pointInBox(l.start, box) || pointInBox(l.end, box)) return true;
  const boxCorners: Vec2[] = [
    { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 },
  ];
  for (let j = 0; j < 4; j++) {
    if (segmentsIntersect(l.start, l.end, boxCorners[j], boxCorners[(j + 1) % 4])) return true;
  }
  return false;
}

// ─── Rotated-rect box tests (doors/windows/furniture/stairs) ──────────────────
// Same window/crossing semantics as walls, generalized to any rect with a
// center, half-extents and a plan rotation.
function rotatedRectCorners(cx: number, cy: number, halfW: number, halfH: number, rot: number): Vec2[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const local: Vec2[] = [
    { x: -halfW, y: -halfH }, { x:  halfW, y: -halfH },
    { x:  halfW, y:  halfH }, { x: -halfW, y:  halfH },
  ];
  return local.map(p => ({ x: cx + c * p.x - s * p.y, y: cy + s * p.x + c * p.y }));
}

export function rotatedRectFullyInsideBox(
  cx: number, cy: number, halfW: number, halfH: number, rot: number, box: Box,
): boolean {
  return rotatedRectCorners(cx, cy, halfW, halfH, rot).every(p => pointInBox(p, box));
}

export function rotatedRectTouchesBox(
  cx: number, cy: number, halfW: number, halfH: number, rot: number, box: Box,
): boolean {
  const corners = rotatedRectCorners(cx, cy, halfW, halfH, rot);
  for (const p of corners) if (pointInBox(p, box)) return true;
  const boxCorners: Vec2[] = [
    { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 },
  ];
  for (const p of boxCorners) if (pointInConvexQuad(p, corners)) return true;
  for (let i = 0; i < 4; i++) {
    const wa = corners[i], wb = corners[(i + 1) % 4];
    for (let j = 0; j < 4; j++) {
      const ba = boxCorners[j], bb = boxCorners[(j + 1) % 4];
      if (segmentsIntersect(wa, wb, ba, bb)) return true;
    }
  }
  return false;
}

export function pointInsideBox(p: Vec2, box: Box): boolean {
  return pointInBox(p, box);
}

// Compute the wall-aligned plan rect for an opening (door or window) — the
// rectangle the wall is cut for, useful for box selection.
export function openingRect(
  op: { positionAlong: number; width: number; wallId: string },
  walls: Wall[],
): { cx: number; cy: number; halfW: number; halfH: number; rot: number } | null {
  const wall = walls.find(w => w.id === op.wallId);
  if (!wall) return null;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return null;
  const ux = dx / L, uy = dy / L;
  return {
    cx: wall.start.x + ux * op.positionAlong,
    cy: wall.start.y + uy * op.positionAlong,
    halfW: op.width / 2,
    halfH: wall.thickness / 2,
    rot: Math.atan2(uy, ux),
  };
}

// ─── Vector math ──────────────────────────────────────────────────────────────

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

// ─── Snap helpers ─────────────────────────────────────────────────────────────

export function snapToGrid(p: Vec2, gridInches: number): Vec2 {
  return {
    x: Math.round(p.x / gridInches) * gridInches,
    y: Math.round(p.y / gridInches) * gridInches,
  };
}

// Base editing resolution. Free placement (a wall endpoint, an opening, a move
// delta — anything not locked to existing geometry by a feature snap) is
// quantized to this increment so coordinates never land on raw 1/100" decimals.
// 1/8" is exactly representable in binary, so quantizing never reintroduces
// hundredths. Feature snaps (endpoint/corner) stay EXACT — rounding them would
// open hairline gaps at wall joins.
export const BASE_SNAP_IN = 0.125;

export function quantizeInches(v: number): number {
  return Math.round(v / BASE_SNAP_IN) * BASE_SNAP_IN;
}

export function quantizeToBase(p: Vec2): Vec2 {
  return { x: quantizeInches(p.x), y: quantizeInches(p.y) };
}

// Orthographic snap: collapse the shorter axis to the start point.
export function snapOrtho(start: Vec2, current: Vec2): Vec2 {
  const dx = Math.abs(current.x - start.x);
  const dy = Math.abs(current.y - start.y);
  return dx > dy ? { x: current.x, y: start.y } : { x: start.x, y: current.y };
}

// ─── Hit testing ──────────────────────────────────────────────────────────────

// Shortest distance from point p to segment ab.
export function distPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const abLen2 = dot(ab, ab);
  if (abLen2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(ap, ab) / abLen2));
  const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return dist(p, proj);
}

// Project a point onto a wall's centerline. Returns parameter t (inches from
// wall.start), clamped to [0, L], plus perpendicular distance and the
// projected point in world coords.
export function projectOnWall(p: Vec2, w: Wall): { t: number; distance: number; point: Vec2 } {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return { t: 0, distance: dist(p, w.start), point: w.start };
  const ux = dx / L, uy = dy / L;
  const raw = (p.x - w.start.x) * ux + (p.y - w.start.y) * uy;
  const t = Math.max(0, Math.min(L, raw));
  const point = { x: w.start.x + ux * t, y: w.start.y + uy * t };
  return { t, distance: dist(p, point), point };
}

// Find the nearest wall to a point, projecting onto its centerline. Returns
// null if no wall is within toleranceIn perpendicular distance. Used for
// snapping a ghost door/window to a wall.
export function hitWallForOpening(
  walls: Wall[], p: Vec2, toleranceIn: number,
): { wall: Wall; t: number; point: Vec2 } | null {
  let best: { wall: Wall; t: number; point: Vec2; d: number } | null = null;
  for (const w of walls) {
    const proj = projectOnWall(p, w);
    const tol = Math.max(toleranceIn, w.thickness / 2 + 4);
    if (proj.distance < tol && (!best || proj.distance < best.d)) {
      best = { wall: w, t: proj.t, point: proj.point, d: proj.distance };
    }
  }
  return best ? { wall: best.wall, t: best.t, point: best.point } : null;
}

// Given a wall and the openings on it (doors / windows that cut the wall),
// produce wall SEGMENTS — virtual sub-walls covering the parts of the wall
// NOT occupied by openings. The original wall data is preserved; segments
// are a rendering-time construct.
//
// A small visual gap is left between each segment and the opening so the
// segment end-caps render as door/window jambs.
export interface OpeningCut {
  positionAlong: number;  // along the wall, inches
  width: number;          // inches
}

export function wallSegmentsWithCuts(wall: Wall, cuts: OpeningCut[]): Wall[] {
  if (cuts.length === 0) return [wall];
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return [wall];
  const ux = dx / L, uy = dy / L;

  // The opening cut is EXACTLY the door/window width — no slop. A previous
  // 0.05"-per-side gap left the rough opening ~0.1" wider than the unit, which
  // showed up in CAD/DXF export as a hairline gap between the symbol and the
  // jamb. The door/window symbols are drawn at the true width, so the jamb caps
  // must land at ±width/2 for the export (and the wall fill) to be precise.
  const ranges = cuts
    .map(c => ({
      start: Math.max(0, c.positionAlong - c.width / 2),
      end:   Math.min(L, c.positionAlong + c.width / 2),
    }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  // Merge overlapping ranges so doors that overlap (shouldn't happen in
  // practice) don't produce zero-length segments.
  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }

  const segments: Wall[] = [];
  let cursor = 0;
  let i = 0;
  const pointAt = (t: number): Vec2 => ({ x: wall.start.x + ux * t, y: wall.start.y + uy * t });
  for (const r of merged) {
    if (r.start > cursor + 0.001) {
      segments.push({
        ...wall,
        id: `${wall.id}_seg_${i++}`,
        start: cursor === 0 ? wall.start : pointAt(cursor),
        end:   pointAt(r.start),
      });
    }
    cursor = r.end;
  }
  if (cursor < L - 0.001) {
    segments.push({
      ...wall,
      id: `${wall.id}_seg_${i++}`,
      start: cursor === 0 ? wall.start : pointAt(cursor),
      end:   wall.end,
    });
  }
  return segments;
}

// Find wall under cursor within tolerance (world inches).
export function hitWall(walls: Wall[], p: Vec2, toleranceIn: number): Wall | null {
  let best: Wall | null = null;
  let bestD = toleranceIn;
  for (const w of walls) {
    const tol = Math.max(toleranceIn, w.thickness / 2 + 1);
    const d = distPointToSegment(p, w.start, w.end);
    if (d < tol && d < bestD) { best = w; bestD = d; }
  }
  return best;
}

// ─── Door hit-test ───────────────────────────────────────────────────────────
//
// Each door type has different visible extent outside the wall. The hit
// area is a per-type axis-aligned rectangle in the wall's local (u, v) frame
// that covers the door's full visible footprint, plus a tolerance.

export function hitDoor(
  doors: Door[],
  wallById: Map<string, Wall>,
  p: Vec2,
  toleranceIn: number,
): string | null {
  let bestId: string | null = null;
  let bestD = Infinity;
  for (const d of doors) {
    const wall = wallById.get(d.wallId);
    if (!wall) continue;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const L = Math.hypot(dx, dy);
    if (L === 0) continue;
    const ux = dx / L, uy = dy / L;
    const nx = -uy, ny = ux;
    const tu = (p.x - wall.start.x) * ux + (p.y - wall.start.y) * uy;
    const tv = (p.x - wall.start.x) * nx + (p.y - wall.start.y) * ny;

    // u extent: from door panel center, optionally including side panels.
    const cut = doorOpeningCut(d);
    const uMin = cut.positionAlong - cut.width / 2 - toleranceIn;
    const uMax = cut.positionAlong + cut.width / 2 + toleranceIn;

    // v extent: depends on door type.
    const halfT = wall.thickness / 2;
    let vMin = -halfT - toleranceIn, vMax = halfT + toleranceIn;
    switch (d.doorType) {
      case 'room':
      case 'entry': {
        const reach = d.width;
        if (d.flipped) vMin -= reach;
        else vMax += reach;
        break;
      }
      case 'bifold': {
        const reach = d.width * 0.30 + 2;
        if (d.flipped) vMin -= reach;
        else vMax += reach;
        break;
      }
      case 'barn': {
        const panelT = Math.max(2, wall.thickness * 0.5);
        const reach = wall.thickness / 2 + panelT + 2;
        if (d.flipped) vMin -= reach;
        else vMax += reach;
        break;
      }
      // sliding/pocket are within the wall thickness; defaults already cover.
    }

    if (tu >= uMin && tu <= uMax && tv >= vMin && tv <= vMax) {
      const dToCenter = Math.abs(tv);
      if (dToCenter < bestD) { bestD = dToCenter; bestId = d.id; }
    }
  }
  return bestId;
}

// ─── Window hit-test ─────────────────────────────────────────────────────────
// Hit area extends past the wall for casement (swing arc) and bay
// (projection), otherwise stays within the wall thickness.

export function hitWindow(
  windows: Window[],
  wallById: Map<string, Wall>,
  p: Vec2,
  toleranceIn: number,
): string | null {
  let bestId: string | null = null;
  let bestD = Infinity;
  for (const w of windows) {
    const wall = wallById.get(w.wallId);
    if (!wall) continue;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const L = Math.hypot(dx, dy);
    if (L === 0) continue;
    const ux = dx / L, uy = dy / L;
    const nx = -uy, ny = ux;
    const tu = (p.x - wall.start.x) * ux + (p.y - wall.start.y) * uy;
    const tv = (p.x - wall.start.x) * nx + (p.y - wall.start.y) * ny;

    const half = w.width / 2;
    const halfT = wall.thickness / 2;
    const uMin = w.positionAlong - half - toleranceIn;
    const uMax = w.positionAlong + half + toleranceIn;

    let vMin = -halfT - toleranceIn;
    let vMax = halfT + toleranceIn;
    if (w.windowType === 'casement') {
      const reach = w.width * 0.5;
      if (w.flipped) vMin -= reach; else vMax += reach;
    } else if (w.windowType === 'bay') {
      const proj = w.bayProjection ?? 18;
      if (w.flipped) vMin -= proj; else vMax += proj;
    } else if (w.windowType === 'awning') {
      const reach = 6;
      if (w.flipped) vMin -= reach; else vMax += reach;
    }

    if (tu >= uMin && tu <= uMax && tv >= vMin && tv <= vMax) {
      const dToCenter = Math.abs(tv);
      if (dToCenter < bestD) { bestD = dToCenter; bestId = w.id; }
    }
  }
  return bestId;
}

// ─── Hit-tests for placed entities ───────────────────────────────────────────

// Rotated-rectangle hit-test centered on `center`, with half-extents (hx, hy)
// before rotation, and rotation in radians (CCW). Tolerance grows the rect.
function hitRotatedRect(
  p: Vec2, center: Vec2, hx: number, hy: number, rotation: number, tol: number,
): boolean {
  const c = Math.cos(-rotation), s = Math.sin(-rotation);
  const dx = p.x - center.x, dy = p.y - center.y;
  const lx =  c * dx - s * dy;
  const ly =  s * dx + c * dy;
  return Math.abs(lx) <= hx + tol && Math.abs(ly) <= hy + tol;
}

// Resolve a dimension anchor to a world point given the current level state.
// Returns null if the anchored object no longer exists.
export function resolveDimAnchor(a: DimAnchor, level: Level): Vec2 | null {
  switch (a.kind) {
    case 'free':
      return a.point;
    case 'wall-corner': {
      const w = level.walls.find(x => x.id === a.wallId);
      if (!w) return null;
      return wallPolygon(w)[a.cornerIndex] ?? null;
    }
    case 'furniture-corner': {
      const f = level.furniture.find(x => x.id === a.furnitureId);
      if (!f) return null;
      const hw = f.width / 2, hd = f.depth / 2;
      const lc = [
        { x: -hw, y: -hd }, { x:  hw, y: -hd },
        { x:  hw, y:  hd }, { x: -hw, y:  hd },
      ][a.cornerIndex];
      const cs = Math.cos(f.rotation), si = Math.sin(f.rotation);
      return {
        x: f.position.x + cs * lc.x - si * lc.y,
        y: f.position.y + si * lc.x + cs * lc.y,
      };
    }
    case 'stair-corner': {
      const s = level.stairs.find(x => x.id === a.stairId);
      if (!s) return null;
      const shape = s.shape ?? 'straight';
      let hx: number, hy: number;
      if (shape === 'straight') { hx = s.width / 2; hy = s.length / 2; }
      else if (shape === 'U')   { hx = s.width;     hy = (s.length + s.width) / 2; }
      else                      { hx = (s.length + s.width) / 2; hy = (s.length + s.width) / 2; }
      const lc = [
        { x: -hx, y: -hy }, { x:  hx, y: -hy },
        { x:  hx, y:  hy }, { x: -hx, y:  hy },
      ][a.cornerIndex];
      const cs = Math.cos(s.rotation), si = Math.sin(s.rotation);
      return {
        x: s.position.x + cs * lc.x - si * lc.y,
        y: s.position.y + si * lc.x + cs * lc.y,
      };
    }
    case 'opening-jamb': {
      const op = a.openingKind === 'door'
        ? level.doors.find(x => x.id === a.openingId)
        : level.windows.find(x => x.id === a.openingId);
      if (!op) return null;
      const w = level.walls.find(x => x.id === op.wallId);
      if (!w) return null;
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
      const L = Math.hypot(dx, dy);
      if (L === 0) return null;
      const ux = dx / L, uy = dy / L;
      const nx = -uy, ny = ux;
      const u = op.positionAlong + (a.side === 'start' ? -op.width / 2 : op.width / 2);
      const v = (a.face === 'left' ? 1 : -1) * (w.thickness / 2);
      return {
        x: w.start.x + ux * u + nx * v,
        y: w.start.y + uy * u + ny * v,
      };
    }
    case 'wall-junction': {
      const a_ = level.walls.find(x => x.id === a.wallAId);
      const b_ = level.walls.find(x => x.id === a.wallBId);
      if (!a_ || !b_) return null;
      return mitredJunctionPoint(a_, b_, a.sideA, a.sideB);
    }
    case 'wall-cross': {
      const A = level.walls.find(x => x.id === a.wallAId);
      const B = level.walls.find(x => x.id === a.wallBId);
      if (!A || !B) return null;
      return faceLineIntersection(A, B, a.sideA, a.sideB);
    }
    case 'wall-edge-mid': {
      const w = level.walls.find(x => x.id === a.wallId);
      if (!w) return null;
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
      const L = Math.hypot(dx, dy);
      if (L === 0) return null;
      const nx = -dy / L, ny = dx / L;
      const cx = (w.start.x + w.end.x) / 2;
      const cy = (w.start.y + w.end.y) / 2;
      return { x: cx + nx * a.side * w.thickness / 2, y: cy + ny * a.side * w.thickness / 2 };
    }
    case 'opening-mid': {
      const op = a.openingKind === 'door'
        ? level.doors.find(x => x.id === a.openingId)
        : level.windows.find(x => x.id === a.openingId);
      if (!op) return null;
      const w = level.walls.find(x => x.id === op.wallId);
      if (!w) return null;
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
      const L = Math.hypot(dx, dy);
      if (L === 0) return null;
      const ux = dx / L, uy = dy / L;
      const nx = -uy, ny = ux;
      const v = (a.face === 'left' ? 1 : -1) * (w.thickness / 2);
      return {
        x: w.start.x + ux * op.positionAlong + nx * v,
        y: w.start.y + uy * op.positionAlong + ny * v,
      };
    }
    case 'furniture-edge-mid': {
      const f = level.furniture.find(x => x.id === a.furnitureId);
      if (!f) return null;
      const hw = f.width / 2, hd = f.depth / 2;
      // edge midpoints in local (unrotated) coords: top, right, bottom, left
      const lc = [
        { x:  0, y: -hd }, { x:  hw, y:  0 },
        { x:  0, y:  hd }, { x: -hw, y:  0 },
      ][a.edgeIndex];
      const cs = Math.cos(f.rotation), si = Math.sin(f.rotation);
      return {
        x: f.position.x + cs * lc.x - si * lc.y,
        y: f.position.y + si * lc.x + cs * lc.y,
      };
    }
  }
}

// The entity a dimension endpoint is tied to — used by "driving dimensions"
// (edit a dim's measured value to move the element it touches). Returns null for
// raw `free` points and for the two-wall anchors (wall-junction / wall-cross),
// which reference two walls and so can't be driven by moving a single element.
export function dimAnchorOwner(a: DimAnchor): { kind: SelectionKind; id: string } | null {
  switch (a.kind) {
    case 'wall-corner':
    case 'wall-edge-mid':
      return { kind: 'wall', id: a.wallId };
    case 'opening-jamb':
    case 'opening-mid':
      return { kind: a.openingKind, id: a.openingId };
    case 'furniture-corner':
    case 'furniture-edge-mid':
      return { kind: 'furniture', id: a.furnitureId };
    case 'stair-corner':
      return { kind: 'stair', id: a.stairId };
    default:
      return null; // 'free', 'wall-junction', 'wall-cross'
  }
}

// For "driving dimensions": given a movable anchor point and the fixed anchor it
// is measured against, find how far to shift the moving anchor ALONG `dir` (a
// unit vector) so the new distance to `fixed` equals `targetLen`. Solves
//   |(anchor − fixed) + s·dir|² = targetLen²
//   ⇒ s² + 2(A·dir)s + (|A|² − targetLen²) = 0,   A = anchor − fixed
// (the s² coefficient is dir·dir = 1 since dir is unit) and returns the root
// nearest 0 — the smallest move that satisfies the target. Returns null when
// there's no real solution (target shorter than the perpendicular distance from
// `fixed` to the motion line).
export function solveAnchorShift(
  anchor: Vec2, fixed: Vec2, dir: Vec2, targetLen: number,
): number | null {
  const ax = anchor.x - fixed.x, ay = anchor.y - fixed.y;
  const b = ax * dir.x + ay * dir.y;                     // A·dir
  const c = ax * ax + ay * ay - targetLen * targetLen;   // |A|² − Lt²
  const disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const s1 = -b + root, s2 = -b - root;
  return Math.abs(s1) <= Math.abs(s2) ? s1 : s2;
}

// Every snap-feature anchor that belongs to a single element. Used by driving
// dimensions to (re)attach a loosely-drawn dim endpoint to the element the user
// selected, so the dim follows it after the move.
export function elementDimAnchors(owner: { kind: SelectionKind; id: string }): DimAnchor[] {
  switch (owner.kind) {
    case 'wall':
      return [
        { kind: 'wall-corner', wallId: owner.id, cornerIndex: 0 },
        { kind: 'wall-corner', wallId: owner.id, cornerIndex: 1 },
        { kind: 'wall-corner', wallId: owner.id, cornerIndex: 2 },
        { kind: 'wall-corner', wallId: owner.id, cornerIndex: 3 },
        { kind: 'wall-edge-mid', wallId: owner.id, side: 1 },
        { kind: 'wall-edge-mid', wallId: owner.id, side: -1 },
      ];
    case 'door':
    case 'window': {
      const out: DimAnchor[] = [];
      for (const side of ['start', 'end'] as const)
        for (const face of ['left', 'right'] as const)
          out.push({ kind: 'opening-jamb', openingKind: owner.kind, openingId: owner.id, side, face });
      for (const face of ['left', 'right'] as const)
        out.push({ kind: 'opening-mid', openingKind: owner.kind, openingId: owner.id, face });
      return out;
    }
    case 'furniture': {
      const out: DimAnchor[] = [];
      for (let i = 0; i < 4; i++) out.push({ kind: 'furniture-corner', furnitureId: owner.id, cornerIndex: i as 0 | 1 | 2 | 3 });
      for (let i = 0; i < 4; i++) out.push({ kind: 'furniture-edge-mid', furnitureId: owner.id, edgeIndex: i as 0 | 1 | 2 | 3 });
      return out;
    }
    case 'stair': {
      const out: DimAnchor[] = [];
      for (let i = 0; i < 4; i++) out.push({ kind: 'stair-corner', stairId: owner.id, cornerIndex: i as 0 | 1 | 2 | 3 });
      return out;
    }
    default:
      return [];
  }
}

// The element's snap feature nearest a world point (with its resolved point and
// distance). Returns null if the element has no resolvable features.
export function nearestElementAnchor(
  owner: { kind: SelectionKind; id: string }, p: Vec2, level: Level,
): { anchor: DimAnchor; point: Vec2; dist: number } | null {
  let best: { anchor: DimAnchor; point: Vec2; dist: number } | null = null;
  for (const a of elementDimAnchors(owner)) {
    const pt = resolveDimAnchor(a, level);
    if (!pt) continue;
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (!best || d < best.dist) best = { anchor: a, point: pt, dist: d };
  }
  return best;
}

// Drive a dimension: move `owner` (a wall/door/window/furniture/stair) so the
// dimension's measured length becomes `targetLen`, keeping the OTHER endpoint
// fixed. Openings slide along their host wall; everything else translates along
// the measurement line. If the endpoint nearest the element isn't anchored to
// it, that endpoint is re-anchored so the dim tracks the element afterward.
// Returns a NEW Level with the dim (re)anchored and the element moved, or null
// if the dimension can't be driven from this element.
export function driveDimension(
  level: Level, dim: Dimension, owner: { kind: SelectionKind; id: string }, targetLen: number,
): Level | null {
  if (!['wall', 'door', 'window', 'furniture', 'stair'].includes(owner.kind)) return null;
  const A = resolveDimAnchor(dim.start, level);
  const B = resolveDimAnchor(dim.end, level);
  if (!A || !B) return null;

  const ownedBy = (a: DimAnchor) => {
    const o = dimAnchorOwner(a);
    return !!o && o.kind === owner.kind && o.id === owner.id;
  };
  const startOwned = ownedBy(dim.start);
  const endOwned = ownedBy(dim.end);

  let movingIsStart: boolean;
  let reAnchor: DimAnchor | null = null;
  let M: Vec2;
  if (startOwned !== endOwned) {
    movingIsStart = startOwned;
    M = movingIsStart ? A : B;
  } else if (!startOwned && !endOwned) {
    // Neither endpoint anchored to the element — re-attach the nearer one.
    const nearA = nearestElementAnchor(owner, A, level);
    const nearB = nearestElementAnchor(owner, B, level);
    if (!nearA || !nearB) return null;
    movingIsStart = nearA.dist <= nearB.dist;
    const mover = movingIsStart ? nearA : nearB;
    const other = movingIsStart ? nearB : nearA;
    if (other.dist < 3) return null; // both ends sit on the element → can't drive
    reAnchor = mover.anchor;
    M = mover.point;
  } else {
    return null; // both endpoints anchored to the element
  }

  const F = movingIsStart ? B : A;
  const L0 = Math.hypot(M.x - F.x, M.y - F.y);
  if (L0 < 1e-6) return null;

  let dir: Vec2;
  if (owner.kind === 'door' || owner.kind === 'window') {
    const op = owner.kind === 'door'
      ? level.doors.find(d => d.id === owner.id)
      : level.windows.find(w => w.id === owner.id);
    const wall = op && level.walls.find(w => w.id === op.wallId);
    if (!op || !wall) return null;
    const wdx = wall.end.x - wall.start.x, wdy = wall.end.y - wall.start.y;
    const wl = Math.hypot(wdx, wdy);
    if (wl < 1e-6) return null;
    dir = { x: wdx / wl, y: wdy / wl };
  } else {
    dir = { x: (M.x - F.x) / L0, y: (M.y - F.y) / L0 };
  }

  const s = solveAnchorShift(M, F, dir, targetLen);
  if (s == null) return null;

  // Re-anchor the moving endpoint (if needed) so the dim follows the element.
  const dimensions = reAnchor
    ? level.dimensions.map(d => d.id !== dim.id ? d
        : (movingIsStart ? { ...d, start: reAnchor! } : { ...d, end: reAnchor! }))
    : level.dimensions;

  const move = { x: dir.x * s, y: dir.y * s };
  if (owner.kind === 'door' || owner.kind === 'window') {
    const op = (owner.kind === 'door'
      ? level.doors.find(d => d.id === owner.id)
      : level.windows.find(w => w.id === owner.id))!;
    const wall = level.walls.find(w => w.id === op.wallId)!;
    const wlen = dist(wall.start, wall.end);
    let clearance = op.width / 2;
    if (owner.kind === 'door') {
      const door = op as Door;
      if (door.doorType === 'entry' && door.sidePanels && door.sidePanels !== 'none') {
        const sw = door.sidePanelWidth ?? DEFAULT_SIDE_PANEL_WIDTH;
        const left = (door.sidePanels === 'left' || door.sidePanels === 'both') ? sw : 0;
        const right = (door.sidePanels === 'right' || door.sidePanels === 'both') ? sw : 0;
        clearance = Math.max(door.width / 2 + left, door.width / 2 + right);
      }
    }
    const newPos = Math.max(clearance, Math.min(wlen - clearance, op.positionAlong + s));
    if (owner.kind === 'door') {
      return { ...level, dimensions, doors: level.doors.map(d => d.id === owner.id ? { ...d, positionAlong: newPos } : d) };
    }
    return { ...level, dimensions, windows: level.windows.map(w => w.id === owner.id ? { ...w, positionAlong: newPos } : w) };
  }
  if (owner.kind === 'furniture') {
    return { ...level, dimensions, furniture: level.furniture.map(f => f.id === owner.id ? { ...f, position: { x: f.position.x + move.x, y: f.position.y + move.y } } : f) };
  }
  if (owner.kind === 'stair') {
    return { ...level, dimensions, stairs: level.stairs.map(st => st.id === owner.id ? { ...st, position: { x: st.position.x + move.x, y: st.position.y + move.y } } : st) };
  }
  // wall
  return { ...level, dimensions, walls: level.walls.map(w => w.id === owner.id
    ? { ...w, start: { x: w.start.x + move.x, y: w.start.y + move.y }, end: { x: w.end.x + move.x, y: w.end.y + move.y } }
    : w) };
}

// When the first dim click snaps to a "wrong" face/wall and the second
// click then snaps to a different face, the resulting dim is crooked. This
// refines the first anchor to live on the SAME wall + SAME face as the
// second, so the dim line stays parallel to the measured wall.
//
// Two cases handled:
//   1. Same wall, opposite face — swap to the matching-face corner at the
//      same end of the wall (distances up to ~1 wall thickness apart).
//   2. Different walls that meet at a junction — swap to the second's
//      matching-face corner at the shared junction endpoint.
//
// If neither applies (user is genuinely dimensioning between two
// unrelated walls), the first anchor is left alone.
export function refineFirstAnchorToSecondsWall(
  first: DimAnchor, second: DimAnchor, level: Level,
): DimAnchor {
  const secondFace = extractWallFace(second, level);
  if (!secondFace) return first;
  // Already aligned — handles wall-junction anchors that match via wallB too.
  if (anchorMatchesFace(first, level, secondFace)) return first;

  const wallY = level.walls.find(w => w.id === secondFace.wallId);
  if (!wallY) return first;
  const firstPt = resolveDimAnchor(first, level);
  if (!firstPt) return first;

  const firstFace = extractWallFace(first, level);

  // Case 1: first is on wall_Y already (just wrong face). Look for a
  // matching-face corner on wall_Y near the first point. Tolerance scales
  // with wall thickness because the opposite-face corner sits ~thickness
  // away perpendicular to the wall axis.
  const sideIndices: (0|1|2|3)[] = secondFace.side === 1 ? [0, 1] : [2, 3];
  const sameWallTol = Math.max(1.5, wallY.thickness * 1.5);
  for (const idx of sideIndices) {
    const candidate: DimAnchor = { kind: 'wall-corner', wallId: wallY.id, cornerIndex: idx };
    const pt = resolveDimAnchor(candidate, level);
    if (pt && dist(pt, firstPt) < sameWallTol) return candidate;
  }

  // Case 2: first is on a different wall (wall_X) that joins wall_Y at a
  // shared endpoint. Swap to a wall-junction anchor (the mitered room
  // corner) so the dim ends at the proper architectural point instead of
  // one wall's polygon corner.
  if (firstFace && firstFace.wallId !== wallY.id) {
    const wallX = level.walls.find(w => w.id === firstFace.wallId);
    if (wallX) {
      const sharesJunction =
        Math.hypot(wallX.start.x - wallY.start.x, wallX.start.y - wallY.start.y) < 2 ||
        Math.hypot(wallX.start.x - wallY.end.x,   wallX.start.y - wallY.end.y)   < 2 ||
        Math.hypot(wallX.end.x   - wallY.start.x, wallX.end.y   - wallY.start.y) < 2 ||
        Math.hypot(wallX.end.x   - wallY.end.x,   wallX.end.y   - wallY.end.y)   < 2;
      if (sharesJunction) {
        const junctionTol = Math.max(12, wallX.thickness + wallY.thickness);
        let best: { d: number; anchor: DimAnchor } | null = null;
        for (const sA of [1, -1] as const) {
          const candidate: DimAnchor = {
            kind: 'wall-junction',
            wallAId: wallX.id, wallBId: wallY.id,
            sideA: sA, sideB: secondFace.side,
          };
          const pt = resolveDimAnchor(candidate, level);
          if (!pt) continue;
          const d = dist(pt, firstPt);
          if (d < junctionTol && (!best || d < best.d)) best = { d, anchor: candidate };
        }
        if (best) return best.anchor;
      }
    }
  }

  return first;
}

// For dim anchors that live on a wall (corner or opening-jamb), report which
// wall + which face (relative to the wall's +n normal) the anchor sits on.
// Returns null for anchors that aren't wall-attached (furniture, stairs,
// free). Used to bias the second snap of a dimension toward the same face
// as the first snap, so dims along a wall come out parallel to that wall
// instead of being tilted by the wall thickness.
//
// For 'wall-junction' anchors (which live on TWO walls simultaneously),
// returns one of the two; the bias logic compares against this and the other
// via extractWallFaceMatches below.
export function extractWallFace(a: DimAnchor, level: Level): { wallId: string; side: 1 | -1 } | null {
  if (a.kind === 'wall-corner') {
    // wallPolygon indices: 0/1 are on +n side, 2/3 are on -n side.
    return { wallId: a.wallId, side: (a.cornerIndex <= 1) ? 1 : -1 };
  }
  if (a.kind === 'opening-jamb') {
    const op = a.openingKind === 'door'
      ? level.doors.find(x => x.id === a.openingId)
      : level.windows.find(x => x.id === a.openingId);
    if (!op) return null;
    // opening-jamb face='left' uses v = +h/2 (+n side); 'right' = -h/2 (-n side).
    return { wallId: op.wallId, side: a.face === 'left' ? 1 : -1 };
  }
  if (a.kind === 'wall-junction') {
    // Return wallA's face; the bias logic also checks wallB via the matches
    // helper below.
    return { wallId: a.wallAId, side: a.sideA };
  }
  if (a.kind === 'wall-cross') {
    return { wallId: a.wallAId, side: a.sideA };
  }
  if (a.kind === 'wall-edge-mid') {
    return { wallId: a.wallId, side: a.side };
  }
  if (a.kind === 'opening-mid') {
    const op = a.openingKind === 'door'
      ? level.doors.find(x => x.id === a.openingId)
      : level.windows.find(x => x.id === a.openingId);
    if (!op) return null;
    return { wallId: op.wallId, side: a.face === 'left' ? 1 : -1 };
  }
  return null;
}

// Whether a candidate anchor "belongs to" the (wallId, side) face — handles
// wall-junction anchors that straddle two walls.
function anchorMatchesFace(
  candidate: DimAnchor, level: Level, target: { wallId: string; side: 1 | -1 },
): boolean {
  if (candidate.kind === 'wall-junction' || candidate.kind === 'wall-cross') {
    if (candidate.wallAId === target.wallId && candidate.sideA === target.side) return true;
    if (candidate.wallBId === target.wallId && candidate.sideB === target.side) return true;
    return false;
  }
  const f = extractWallFace(candidate, level);
  return !!f && f.wallId === target.wallId && f.side === target.side;
}

// Intersect two walls' face lines to get the mitered junction point.
// wall_A's `sideA` face = the line through (wall.endpointShared + nA*sideA*hA/2)
// with direction uA. Same for B. Returns null if the lines are parallel.
function mitredJunctionPoint(
  wallA: Wall, wallB: Wall, sideA: 1 | -1, sideB: 1 | -1,
): Vec2 | null {
  const dxA = wallA.end.x - wallA.start.x;
  const dyA = wallA.end.y - wallA.start.y;
  const LA = Math.hypot(dxA, dyA);
  const dxB = wallB.end.x - wallB.start.x;
  const dyB = wallB.end.y - wallB.start.y;
  const LB = Math.hypot(dxB, dyB);
  if (LA === 0 || LB === 0) return null;
  const uAx = dxA / LA, uAy = dyA / LA;
  const uBx = dxB / LB, uBy = dyB / LB;
  const nAx = -uAy, nAy = uAx;
  const nBx = -uBy, nBy = uBx;
  // The shared junction point (one endpoint of each wall must coincide;
  // pick whichever pair is closest).
  const EPS = 1.0;
  const pairs: [Vec2, Vec2][] = [
    [wallA.start, wallB.start], [wallA.start, wallB.end],
    [wallA.end,   wallB.start], [wallA.end,   wallB.end],
  ];
  let bestPair: [Vec2, Vec2] | null = null;
  let bestD = Infinity;
  for (const p of pairs) {
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    if (d < bestD) { bestD = d; bestPair = p; }
  }
  if (!bestPair || bestD > EPS) return null;
  const [pA, pB] = bestPair;
  // Face line A passes through (pA + nA*sideA*hA/2), direction uA.
  const aPx = pA.x + nAx * sideA * wallA.thickness / 2;
  const aPy = pA.y + nAy * sideA * wallA.thickness / 2;
  const bPx = pB.x + nBx * sideB * wallB.thickness / 2;
  const bPy = pB.y + nBy * sideB * wallB.thickness / 2;
  // Solve: aP + t*uA = bP + s*uB  →  t*uA - s*uB = (bP - aP)
  const rhsX = bPx - aPx;
  const rhsY = bPy - aPy;
  const det = uAx * (-uBy) - uAy * (-uBx);
  if (Math.abs(det) < 1e-6) return null; // parallel
  const t = (rhsX * (-uBy) - rhsY * (-uBx)) / det;
  return { x: aPx + t * uAx, y: aPy + t * uAy };
}

// Face-line intersection between two walls without requiring shared
// endpoints — used for wall-cross anchors at T/X intersections of
// centerlines. Same math as mitredJunctionPoint but with no endpoint
// matching: faces are defined as lines through start ± n*side*h/2 along u.
function faceLineIntersection(
  wallA: Wall, wallB: Wall, sideA: 1 | -1, sideB: 1 | -1,
): Vec2 | null {
  const dxA = wallA.end.x - wallA.start.x;
  const dyA = wallA.end.y - wallA.start.y;
  const LA = Math.hypot(dxA, dyA);
  const dxB = wallB.end.x - wallB.start.x;
  const dyB = wallB.end.y - wallB.start.y;
  const LB = Math.hypot(dxB, dyB);
  if (LA === 0 || LB === 0) return null;
  const uAx = dxA / LA, uAy = dyA / LA;
  const uBx = dxB / LB, uBy = dyB / LB;
  const nAx = -uAy, nAy = uAx;
  const nBx = -uBy, nBy = uBx;
  const aPx = wallA.start.x + nAx * sideA * wallA.thickness / 2;
  const aPy = wallA.start.y + nAy * sideA * wallA.thickness / 2;
  const bPx = wallB.start.x + nBx * sideB * wallB.thickness / 2;
  const bPy = wallB.start.y + nBy * sideB * wallB.thickness / 2;
  const rhsX = bPx - aPx;
  const rhsY = bPy - aPy;
  const det = uAx * (-uBy) - uAy * (-uBx);
  if (Math.abs(det) < 1e-6) return null;
  const t = (rhsX * (-uBy) - rhsY * (-uBx)) / det;
  return { x: aPx + t * uAx, y: aPy + t * uAy };
}

// At a junction, 4 (sideA, sideB) combinations produce 4 intersection points,
// but only 2 are architecturally real (the room's inside and outside mitered
// corners). The other 2 sit inside the wall material — where one wall's
// outside face crosses the other wall's inside face — and aren't anything
// the user can see in the drawing. Filter them out so snap candidates are
// deterministic per corner.
//
// Test: at the shared corner P, compute outgoing directions of both walls
// (away from P, toward each wall's other endpoint). A valid mitered corner
// J sits in a quadrant where (J − P) projects with the SAME SIGN onto both
// outgoing directions. Mixed signs = the junction lies inside the wedge
// between the two wall axes = not architectural.
function isArchitecturalJunction(
  wallA: Wall, wallB: Wall, sideA: 1 | -1, sideB: 1 | -1,
  allWalls?: Wall[],
): boolean {
  const J = mitredJunctionPoint(wallA, wallB, sideA, sideB);
  if (!J) return false;
  // Find the shared corner P and each wall's outgoing direction.
  const EPS = 1.0;
  const pairs: [Vec2, Vec2, Vec2, Vec2][] = [
    [wallA.start, wallB.start, wallA.end,   wallB.end],
    [wallA.start, wallB.end,   wallA.end,   wallB.start],
    [wallA.end,   wallB.start, wallA.start, wallB.end],
    [wallA.end,   wallB.end,   wallA.start, wallB.start],
  ];
  let best: [Vec2, Vec2, Vec2, Vec2] | null = null;
  let bestD = Infinity;
  for (const p of pairs) {
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (!best || bestD > EPS) return false;
  const [pA, pB, otherA, otherB] = best;
  // Outgoing directions from the shared corner.
  const uAx = otherA.x - pA.x, uAy = otherA.y - pA.y;
  const uBx = otherB.x - pB.x, uBy = otherB.y - pB.y;
  // (J − P) · u for each wall.
  const vAx = J.x - pA.x, vAy = J.y - pA.y;
  const vBx = J.x - pB.x, vBy = J.y - pB.y;
  const dotA = vAx * uAx + vAy * uAy;
  const dotB = vBx * uBx + vBy * uBy;
  // Same sign = architectural. Treat ~0 as not architectural (degenerate).
  const TINY = 1e-6;
  if (Math.abs(dotA) < TINY || Math.abs(dotB) < TINY) return false;
  if ((dotA > 0) !== (dotB > 0)) return false;
  // Final guard: at T-junctions a "same-sign" point can still be a phantom —
  // sitting where one wall's face line would meet the other's IF the walls
  // extended, but actually inside a THIRD wall's material. Reject any
  // candidate that sits within another wall (excluding A and B themselves).
  if (allWalls) {
    for (const C of allWalls) {
      if (C.id === wallA.id || C.id === wallB.id) continue;
      const cdx = C.end.x - C.start.x, cdy = C.end.y - C.start.y;
      const cL = Math.hypot(cdx, cdy);
      if (cL === 0) continue;
      const cux = cdx / cL, cuy = cdy / cL;
      const cnx = -cuy, cny = cux;
      const t = (J.x - C.start.x) * cux + (J.y - C.start.y) * cuy;
      const perp = (J.x - C.start.x) * cnx + (J.y - C.start.y) * cny;
      const TOL = 0.01;
      // Inside C's centerline extent (strict, with tiny tolerance), AND
      // within OR ON the perpendicular face boundary (≤ thickness/2).
      if (t > TOL && t < cL - TOL && Math.abs(perp) <= C.thickness / 2 + TOL) {
        return false;
      }
    }
  }
  return true;
}

// Find the best dim snap target near `p` within tolerance. Returns a
// 'free' anchor pointing at `p` if no snap target is close enough.
//
// `prefer` biases the result toward candidates on the same wall+face as a
// previously-snapped anchor — this is what keeps a dim along a wall from
// landing with one endpoint on the wall's outside face and the other on the
// inside face (the visual crookedness this guards against equals the wall
// thickness).
export function snapToDimAnchor(
  p: Vec2, level: Level, toleranceIn: number,
  prefer?: { wallId: string; side: 1 | -1 } | null,
): DimAnchor {
  // HARD bias: when `prefer` is set, we do two passes. Pass 1 ONLY considers
  // candidates that match prefer's wall+face, with a 3× generous tolerance
  // — so dims along a single wall always lock to that wall's faces, even
  // when a stray corner of a nearby wall happens to be closer to the
  // cursor. Pass 2 is a normal unbiased search, used only if pass 1 found
  // nothing. This guarantees straight dims along a wall while keeping the
  // tool useful when dimensioning between two unrelated walls.
  let best: DimAnchor | null = null;
  let bestScore = toleranceIn;
  let restrictToMatching = false;
  const consider = (a: DimAnchor) => {
    if (restrictToMatching) {
      if (!prefer || !anchorMatchesFace(a, level, prefer)) return;
    }
    const pt = resolveDimAnchor(a, level);
    if (!pt) return;
    const d = dist(p, pt);
    if (d < bestScore) { bestScore = d; best = a; }
  };
  // For each wall endpoint that's SHARED with another wall, the visible
  // architectural points are the mitered room corners (wall-junction below),
  // not the individual rectangle corners of either wall. Skip wall-corner
  // candidates at shared endpoints — they don't sit at anything the user
  // sees as a corner. Keep them at FREE wall ends (partition tip etc.) so
  // those remain snappable.
  const JOIN_EPS = 1.0;
  const isShared = (p: Vec2, selfId: string): boolean => {
    for (const other of level.walls) {
      if (other.id === selfId) continue;
      if (Math.hypot(other.start.x - p.x, other.start.y - p.y) < JOIN_EPS) return true;
      if (Math.hypot(other.end.x   - p.x, other.end.y   - p.y) < JOIN_EPS) return true;
    }
    return false;
  };
  const enumerateAll = () => {
    for (const w of level.walls) {
      const startShared = isShared(w.start, w.id);
      const endShared   = isShared(w.end,   w.id);
      // Corner indices: 0/3 sit on the START endpoint; 1/2 on the END endpoint.
      if (!startShared) {
        consider({ kind: 'wall-corner', wallId: w.id, cornerIndex: 0 });
        consider({ kind: 'wall-corner', wallId: w.id, cornerIndex: 3 });
      }
      if (!endShared) {
        consider({ kind: 'wall-corner', wallId: w.id, cornerIndex: 1 });
        consider({ kind: 'wall-corner', wallId: w.id, cornerIndex: 2 });
      }
      // Midpoint of each long face (the visible centerline of the wall edge).
      consider({ kind: 'wall-edge-mid', wallId: w.id, side: 1 });
      consider({ kind: 'wall-edge-mid', wallId: w.id, side: -1 });
    }
    // Wall junction (mitered) corners — the inside/outside corners of a room
    // where two walls meet. Filtered to architecturally-real (room) corners.
    for (let i = 0; i < level.walls.length; i++) {
      for (let j = i + 1; j < level.walls.length; j++) {
        const A = level.walls[i], B = level.walls[j];
        for (const sA of [1, -1] as const) for (const sB of [1, -1] as const) {
          if (!isArchitecturalJunction(A, B, sA, sB, level.walls)) continue;
          consider({ kind: 'wall-junction', wallAId: A.id, wallBId: B.id, sideA: sA, sideB: sB });
        }
      }
    }
    // Wall CROSSINGS — where two walls' centerlines intersect strictly
    // inside both segments (not at endpoints). At each such crossing, the 4
    // face-line corners (small rectangle around the centerline-cross) are
    // visible architectural points — the corners of a T or X joint.
    for (let i = 0; i < level.walls.length; i++) {
      for (let j = i + 1; j < level.walls.length; j++) {
        const A = level.walls[i], B = level.walls[j];
        const cx = segmentIntersection(A.start, A.end, B.start, B.end);
        if (!cx) continue;
        // Require the intersection to be inside BOTH walls' centerline
        // extents (not at the very endpoints — that's a wall-junction case).
        const dxA = A.end.x - A.start.x, dyA = A.end.y - A.start.y;
        const LA = Math.hypot(dxA, dyA);
        const dxB = B.end.x - B.start.x, dyB = B.end.y - B.start.y;
        const LB = Math.hypot(dxB, dyB);
        if (LA === 0 || LB === 0) continue;
        const tA = ((cx.x - A.start.x) * dxA + (cx.y - A.start.y) * dyA) / (LA * LA);
        const tB = ((cx.x - B.start.x) * dxB + (cx.y - B.start.y) * dyB) / (LB * LB);
        const INSIDE_EPS = 0.001;
        const insideA = tA > INSIDE_EPS && tA < 1 - INSIDE_EPS;
        const insideB = tB > INSIDE_EPS && tB < 1 - INSIDE_EPS;
        // At least one wall must be CROSSED strictly inside; otherwise this
        // is just an endpoint touch already handled by wall-junction.
        if (!insideA && !insideB) continue;
        for (const sA of [1, -1] as const) for (const sB of [1, -1] as const) {
          consider({ kind: 'wall-cross', wallAId: A.id, wallBId: B.id, sideA: sA, sideB: sB });
        }
      }
    }
    for (const door of level.doors) {
      for (const side of ['start', 'end'] as const)
        for (const face of ['left', 'right'] as const)
          consider({ kind: 'opening-jamb', openingKind: 'door', openingId: door.id, side, face });
      for (const face of ['left', 'right'] as const)
        consider({ kind: 'opening-mid', openingKind: 'door', openingId: door.id, face });
    }
    for (const win of level.windows) {
      for (const side of ['start', 'end'] as const)
        for (const face of ['left', 'right'] as const)
          consider({ kind: 'opening-jamb', openingKind: 'window', openingId: win.id, side, face });
      for (const face of ['left', 'right'] as const)
        consider({ kind: 'opening-mid', openingKind: 'window', openingId: win.id, face });
    }
    for (const f of level.furniture) {
      for (let i = 0; i < 4; i++) consider({ kind: 'furniture-corner', furnitureId: f.id, cornerIndex: i as 0|1|2|3 });
      for (let i = 0; i < 4; i++) consider({ kind: 'furniture-edge-mid', furnitureId: f.id, edgeIndex: i as 0|1|2|3 });
    }
    for (const s of level.stairs) {
      for (let i = 0; i < 4; i++) consider({ kind: 'stair-corner', stairId: s.id, cornerIndex: i as 0|1|2|3 });
    }
  };

  // Pass 1 — matching-only, 3× tolerance. If anything matches the first
  // anchor's wall+face, take it and we're done.
  if (prefer) {
    restrictToMatching = true;
    bestScore = toleranceIn * 3;
    enumerateAll();
    if (best) return best;
  }
  // Pass 2 — anything within normal tolerance.
  restrictToMatching = false;
  bestScore = toleranceIn;
  enumerateAll();
  return best ?? { kind: 'free', point: p };
}

// When placing a new dim's offset (the 3rd click), if the cursor is near
// the dim-line of an existing PARALLEL dimension, snap the new offset so
// the two dim lines coincide in world space. Returns the snapped offset
// (or the original candidate if nothing's close enough).
export function snapDimOffsetToParallel(
  startPt: Vec2, endPt: Vec2, candidateOffset: number,
  existingDims: Dimension[], level: Level, toleranceIn: number,
): number {
  const dx = endPt.x - startPt.x;
  const dy = endPt.y - startPt.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return candidateOffset;
  const nx = -dy / L, ny = dx / L;
  // "Parallel" = unit-vector cross product near zero. 0.05 ≈ ~3° from parallel.
  const PARALLEL_TOL = 0.05;
  let bestOffset = candidateOffset;
  let bestDelta = toleranceIn;
  for (const d of existingDims) {
    const ea = resolveDimAnchor(d.start, level);
    const eb = resolveDimAnchor(d.end, level);
    if (!ea || !eb) continue;
    const edx = eb.x - ea.x, edy = eb.y - ea.y;
    const eL = Math.hypot(edx, edy);
    if (eL === 0) continue;
    const cross = (dx * edy - dy * edx) / (L * eL);
    if (Math.abs(cross) > PARALLEL_TOL) continue;
    // Existing dim's dim-line passes through (ea + en * d.offset).
    const enx = -edy / eL, eny = edx / eL;
    const exLineX = ea.x + enx * d.offset;
    const exLineY = ea.y + eny * d.offset;
    // Project that point onto the NEW dim's normal — that's the offset
    // that would make the new dim's line coincide with the existing one.
    const aligned = (exLineX - startPt.x) * nx + (exLineY - startPt.y) * ny;
    const delta = Math.abs(aligned - candidateOffset);
    if (delta < bestDelta) { bestDelta = delta; bestOffset = aligned; }
  }
  return bestOffset;
}

export function hitDimension(dims: Dimension[], level: Level, p: Vec2, toleranceIn: number): string | null {
  let best: string | null = null;
  let bestD = toleranceIn;
  for (const d of dims) {
    const a = resolveDimAnchor(d.start, level);
    const b = resolveDimAnchor(d.end, level);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L === 0) continue;
    const ux = dx / L, uy = dy / L;
    const nx = -uy, ny = ux;
    const dimStart = { x: a.x + nx * d.offset, y: a.y + ny * d.offset };
    const dimEnd   = { x: b.x + nx * d.offset, y: b.y + ny * d.offset };
    const dd = distPointToSegment(p, dimStart, dimEnd);
    if (dd < bestD) { best = d.id; bestD = dd; }
  }
  return best;
}

export function hitRoomLabel(labels: RoomLabel[], p: Vec2, toleranceIn: number): string | null {
  // Generous hit area — labels are small text. ~12" radius default.
  const halfW = 36, halfH = 12;
  let best: string | null = null;
  let bestD = Infinity;
  for (const r of labels) {
    if (hitRotatedRect(p, r.position, halfW, halfH, 0, toleranceIn)) {
      const d = Math.hypot(p.x - r.position.x, p.y - r.position.y);
      if (d < bestD) { bestD = d; best = r.id; }
    }
  }
  return best;
}

export function hitText(texts: TextLabel[], p: Vec2, toleranceIn: number): string | null {
  const halfW = 30, halfH = 10;
  let best: string | null = null;
  let bestD = Infinity;
  for (const t of texts) {
    if (hitRotatedRect(p, t.position, halfW, halfH, 0, toleranceIn)) {
      const d = Math.hypot(p.x - t.position.x, p.y - t.position.y);
      if (d < bestD) { bestD = d; best = t.id; }
    }
  }
  return best;
}

// Per-shape bounding half-extents (in stair-local coordinates, before rotation).
export function stairHalfExtents(s: Stair): { hx: number; hy: number } {
  const shape = s.shape ?? 'straight';
  if (shape === 'straight') return { hx: s.width / 2, hy: s.length / 2 };
  if (shape === 'U') return { hx: s.width, hy: (s.length + s.width) / 2 };
  // L-left / L-right
  return { hx: (s.length + s.width) / 2, hy: (s.length + s.width) / 2 };
}

export function hitStair(stairs: Stair[], p: Vec2, toleranceIn: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const s of stairs) {
    const { hx, hy } = stairHalfExtents(s);
    if (hitRotatedRect(p, s.position, hx, hy, s.rotation, toleranceIn)) {
      const d = Math.hypot(p.x - s.position.x, p.y - s.position.y);
      if (d < bestD) { bestD = d; best = s.id; }
    }
  }
  return best;
}

// Bounding-box corner hit-test for stair handles.
export interface StairCornerHit { stairId: string; cornerIndex: number; localCorner: Vec2 }
export function hitStairCorner(stairs: Stair[], p: Vec2, toleranceIn: number): StairCornerHit | null {
  let best: StairCornerHit | null = null;
  let bestD = toleranceIn;
  for (const s of stairs) {
    const { hx, hy } = stairHalfExtents(s);
    const localCorners: Vec2[] = [
      { x: -hx, y: -hy }, { x:  hx, y: -hy },
      { x:  hx, y:  hy }, { x: -hx, y:  hy },
    ];
    const c = Math.cos(s.rotation), si = Math.sin(s.rotation);
    for (let i = 0; i < 4; i++) {
      const lc = localCorners[i];
      const wx = s.position.x + c * lc.x - si * lc.y;
      const wy = s.position.y + si * lc.x + c * lc.y;
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < bestD) {
        bestD = d;
        best = { stairId: s.id, cornerIndex: i, localCorner: lc };
      }
    }
  }
  return best;
}

export function hitFurniture(items: FurnitureItem[], p: Vec2, toleranceIn: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const f of items) {
    if (hitRotatedRect(p, f.position, f.width / 2, f.depth / 2, f.rotation, toleranceIn)) {
      const d = Math.hypot(p.x - f.position.x, p.y - f.position.y);
      if (d < bestD) { bestD = d; best = f.id; }
    }
  }
  return best;
}

// ─── Endpoint grip hit-test ──────────────────────────────────────────────────
export type WallEnd = 'start' | 'end';
export interface HandleHit { wallId: string; end: WallEnd; position: Vec2; }

export function hitHandle(
  walls: Wall[], selectedIds: Set<string>, p: Vec2, toleranceIn: number,
): HandleHit | null {
  let best: HandleHit | null = null;
  let bestD = toleranceIn;
  for (const w of walls) {
    if (!selectedIds.has(w.id)) continue;
    for (const end of ['start', 'end'] as const) {
      const pt = end === 'start' ? w.start : w.end;
      const d = dist(p, pt);
      if (d < bestD) { bestD = d; best = { wallId: w.id, end, position: pt }; }
    }
  }
  return best;
}

// ─── Wall endpoint snapping ───────────────────────────────────────────────────

// While drawing, if the cursor is near an existing wall endpoint, snap to it.
// This is what makes corners read cleanly.
export function snapToWallEndpoint(p: Vec2, walls: Wall[], toleranceIn: number): Vec2 {
  let best: Vec2 | null = null;
  let bestD = toleranceIn;
  for (const w of walls) {
    for (const e of [w.start, w.end]) {
      const d = dist(p, e);
      if (d < bestD) { best = e; bestD = d; }
    }
  }
  return best ?? p;
}

// While drawing, if the cursor is near the MIDPOINT of an existing wall's
// centerline, snap to it. Endpoint snapping takes priority (caller checks it
// first); this catches the case of starting/ending a wall at the middle of a
// run, e.g. a partition wall meeting the center of an exterior wall.
export function snapToWallMidpoint(p: Vec2, walls: Wall[], toleranceIn: number): Vec2 {
  let best: Vec2 | null = null;
  let bestD = toleranceIn;
  for (const w of walls) {
    const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
    const d = dist(p, mid);
    if (d < bestD) { best = mid; bestD = d; }
  }
  return best ?? p;
}

// Dimensioning snap: snap to the nearest WALL POLYGON CORNER — i.e., one of
// the 4 corners of a wall's rendered rectangle (start-left, end-left,
// end-right, start-right). This lets the user dimension to the INSIDE or
// OUTSIDE face of a wall depending on which side they click — the
// centerline is never an option. Returns the input point unchanged if no
// corner is within tolerance.
export function snapToWallCorner(p: Vec2, walls: Wall[], toleranceIn: number): Vec2 {
  let best: Vec2 | null = null;
  let bestD = toleranceIn;
  for (const w of walls) {
    for (const c of wallPolygon(w)) {
      const d = dist(p, c);
      if (d < bestD) { best = c; bestD = d; }
    }
  }
  return best ?? p;
}

// Corner + edge-midpoint "grab handles" of a rotated rectangle (an object's
// own snap points). Returns 4 corners then 4 edge midpoints, all in world
// coords. Used by the Move tool so the user can pick up a stair/furniture by
// its corner or the middle of a side.
export function rectHandlePoints(center: Vec2, hx: number, hy: number, rotation: number): Vec2[] {
  const locals: Vec2[] = [
    { x: -hx, y: -hy }, { x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy },  // corners
    { x: 0, y: -hy }, { x: hx, y: 0 }, { x: 0, y: hy }, { x: -hx, y: 0 },        // edge mids
  ];
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return locals.map(l => ({ x: center.x + c * l.x - s * l.y, y: center.y + s * l.x + c * l.y }));
}

// Nearest of `pts` to `p` within `toleranceIn`, or null. Used to snap a Move
// grab point onto an object's own handle.
export function nearestPoint(p: Vec2, pts: Vec2[], toleranceIn: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = toleranceIn;
  for (const q of pts) {
    const d = dist(p, q);
    if (d < bestD) { best = q; bestD = d; }
  }
  return best;
}

// Snap to the nearest point ON a wall FACE (the outside edges of the rendered
// wall rectangle), not just its corners — so an object can be dropped flush
// along a wall edge. Returns the input unchanged if no edge is within tolerance.
export function snapToWallEdge(p: Vec2, walls: Wall[], toleranceIn: number): Vec2 {
  let best: Vec2 | null = null;
  let bestD = toleranceIn;
  for (const w of walls) {
    const poly = wallPolygon(w);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const q = closestPointOnSegment(p, a, b);
      const d = dist(p, q);
      if (d < bestD) { best = q; bestD = d; }
    }
  }
  return best ?? p;
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

// Wall length helper, used by the properties panel.
export function wallLength(w: Wall): number {
  return dist(w.start, w.end);
}

// Wall angle in degrees, for properties panel readout.
export function wallAngleDeg(w: Wall): number {
  const dy = w.end.y - w.start.y;
  const dx = w.end.x - w.start.x;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// ─── Polygon area (shoelace) ─────────────────────────────────────────────────
// Signed area of a polygon in INCHES². Sign reflects winding (CCW = positive,
// CW = negative); callers that just want "size" use the absolute value.
export function polygonAreaSqIn(points: Vec2[]): number {
  if (points.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

// Convert inches² → sqft (144 in² per ft²). Rounded to the nearest whole sqft
// to match how room areas are conventionally reported in residential plans.
export function polygonAreaSqFt(points: Vec2[]): number {
  return Math.round(Math.abs(polygonAreaSqIn(points)) / 144);
}

// Polygon centroid (area-weighted) — used when re-positioning a label after
// the user finishes drawing a boundary so the label sits inside the polygon
// even if the original drop point landed near an edge.
export function polygonCentroid(points: Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    let sx = 0, sy = 0;
    for (const p of points) { sx += p.x; sy += p.y; }
    return { x: sx / points.length, y: sy / points.length };
  }
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) {
    let sx = 0, sy = 0;
    for (const p of points) { sx += p.x; sy += p.y; }
    return { x: sx / points.length, y: sy / points.length };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Point-in-polygon test (ray casting). Used to decide whether the label is
// inside its boundary, etc.
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const intersect =
      (a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}
