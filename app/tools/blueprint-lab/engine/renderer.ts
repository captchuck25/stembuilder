import {
  Dimension, Level, LineEntity, SectionCut, Selection, Vec2, Wall,
  Door, Window as WindowObj, RoomLabel, Stair, FurnitureItem, TextLabel,
  FURNITURE_DEFAULTS, LINE_COLOR_HEX, LINE_DASH_INCHES, LINE_WEIGHT_PX, STAIR_DEFAULTS, formatImperial,
} from './types';
import { doorOpeningCut, resolveDimAnchor, stairHalfExtents, wallPolygon, wallSegmentsWithCuts, windowOpeningCuts } from './geometry';
import { DEFAULT_SIDE_PANEL_WIDTH } from './types';

// Viewport: maps world inches to screen pixels.
export interface Viewport {
  pan: Vec2;
  pxPerInch: number;
  width: number;
  height: number;
}

export const worldToScreen = (p: Vec2, vp: Viewport): Vec2 => ({
  x: p.x * vp.pxPerInch + vp.pan.x + vp.width / 2,
  y: p.y * vp.pxPerInch + vp.pan.y + vp.height / 2,
});

export const screenToWorld = (p: Vec2, vp: Viewport): Vec2 => ({
  x: (p.x - vp.pan.x - vp.width / 2) / vp.pxPerInch,
  y: (p.y - vp.pan.y - vp.height / 2) / vp.pxPerInch,
});

// ─── Drafting grid ────────────────────────────────────────────────────────────

const PAPER = '#ffffff';
const GRID_MINOR = '#eef0f7';
const GRID_MAJOR = '#d2d6e4';

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  gridInches: number,
  visible: boolean,
) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, vp.width, vp.height);
  if (!visible) return;

  const topLeft = screenToWorld({ x: 0, y: 0 }, vp);
  const botRight = screenToWorld({ x: vp.width, y: vp.height }, vp);

  // Skip grid drawing if it would render too dense.
  const pxPerCell = gridInches * vp.pxPerInch;
  if (pxPerCell < 4) return;

  ctx.strokeStyle = GRID_MINOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x0 = Math.floor(topLeft.x / gridInches) * gridInches;
  const x1 = Math.ceil(botRight.x / gridInches) * gridInches;
  for (let x = x0; x <= x1; x += gridInches) {
    const sx = worldToScreen({ x, y: 0 }, vp).x;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, vp.height);
  }
  const y0 = Math.floor(topLeft.y / gridInches) * gridInches;
  const y1 = Math.ceil(botRight.y / gridInches) * gridInches;
  for (let y = y0; y <= y1; y += gridInches) {
    const sy = worldToScreen({ x: 0, y }, vp).y;
    ctx.moveTo(0, sy);
    ctx.lineTo(vp.width, sy);
  }
  ctx.stroke();

  ctx.strokeStyle = GRID_MAJOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const mx0 = Math.floor(topLeft.x / 12) * 12;
  const mx1 = Math.ceil(botRight.x / 12) * 12;
  for (let x = mx0; x <= mx1; x += 12) {
    const sx = worldToScreen({ x, y: 0 }, vp).x;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, vp.height);
  }
  const my0 = Math.floor(topLeft.y / 12) * 12;
  const my1 = Math.ceil(botRight.y / 12) * 12;
  for (let y = my0; y <= my1; y += 12) {
    const sy = worldToScreen({ x: 0, y }, vp).y;
    ctx.moveTo(0, sy);
    ctx.lineTo(vp.width, sy);
  }
  ctx.stroke();
}

// ─── Wall geometry ────────────────────────────────────────────────────────────
//
// Each wall is a rectangle (filled + stroked). Corners look architectural
// because at each junction, perimeter strokes that fall inside ANOTHER wall's
// closed region are clipped away. This produces clean L-joins, T-joins, and
// crosses automatically — no per-junction miter math required.

// ─── Miter computation ────────────────────────────────────────────────────────
//
// At a 2-junction (exactly one other wall sharing this endpoint), the wall's
// butt corner is replaced with a miter point — the intersection of this wall's
// offset edge line with the other wall's offset edge line. This produces clean
// L-corners with a single outer corner instead of a stepped one.

interface WallFrame {
  // outgoing direction from a shared endpoint
  ex: number; ey: number;
  // unit normal "left" relative to outgoing
  nx: number; ny: number;
  h: number;
}

function wallFrameFromEndpoint(w: Wall, atStart: boolean): WallFrame | null {
  const sx = atStart ? w.start.x : w.end.x;
  const sy = atStart ? w.start.y : w.end.y;
  const ox = atStart ? w.end.x : w.start.x;
  const oy = atStart ? w.end.y : w.start.y;
  const dx = ox - sx, dy = oy - sy;
  const L = Math.hypot(dx, dy);
  if (L === 0) return null;
  const ex = dx / L, ey = dy / L;
  return { ex, ey, nx: -ey, ny: ex, h: w.thickness / 2 };
}

// Intersect two infinite lines: P1 + t * d1, P2 + s * d2. Returns null if parallel.
function intersectLines(
  p1x: number, p1y: number, d1x: number, d1y: number,
  p2x: number, p2y: number, d2x: number, d2y: number,
): Vec2 | null {
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p2x - p1x) * d2y - (p2y - p1y) * d2x) / denom;
  return { x: p1x + t * d1x, y: p1y + t * d1y };
}

// Given THIS wall's endpoint P (with outgoing frame fA) and the connected OTHER
// wall's outgoing frame fB from the same point P, compute the miter point for
// THIS wall's "left" corner at P (i.e., where this wall's +h*nA edge line
// meets the other wall's corresponding edge line).
//
// The other wall's "corresponding" edge depends on the turn direction. The
// fix is to pick the B-edge line whose offset has the same sign as A's
// outgoing-relative-to-B side — equivalently, the one that gives a finite
// intersection on the outer side of the junction.
function miterCorner(P: Vec2, fA: WallFrame, fB: WallFrame, side: 1 | -1): Vec2 {
  // A's edge line on `side`: passes through P + side*hA*nA, direction eA.
  const aLineX = P.x + side * fA.h * fA.nx;
  const aLineY = P.y + side * fA.h * fA.ny;

  // Try both of B's side offsets. The correct pairing is the one where the
  // miter's projection along BOTH walls' outgoing-from-P directions has the
  // same sign: both negative → outer corner of the junction, both positive
  // → inner corner. Mixed signs are the "phantom" intersection on the
  // wrong side of one wall's centerline.
  for (const bSide of [1, -1] as const) {
    const bLineX = P.x + bSide * fB.h * fB.nx;
    const bLineY = P.y + bSide * fB.h * fB.ny;
    const hit = intersectLines(aLineX, aLineY, fA.ex, fA.ey, bLineX, bLineY, fB.ex, fB.ey);
    if (!hit) continue;
    const uA = (hit.x - P.x) * fA.ex + (hit.y - P.y) * fA.ey;
    const uB = (hit.x - P.x) * fB.ex + (hit.y - P.y) * fB.ey;
    if (uA * uB < -1e-9) continue;
    return hit;
  }
  return { x: aLineX, y: aLineY };
}

// Build position-keyed junction map. Position keys quantize at 0.05" to absorb
// floating-point noise; in practice endpoint-snap means walls share exact coords.
function junctionKey(p: Vec2): string {
  return `${Math.round(p.x * 20)},${Math.round(p.y * 20)}`;
}

interface JunctionEntry {
  wall: Wall;
  atStart: boolean;
}

function buildJunctions(walls: Wall[]): Map<string, JunctionEntry[]> {
  const map = new Map<string, JunctionEntry[]>();
  for (const w of walls) {
    for (const atStart of [true, false]) {
      const p = atStart ? w.start : w.end;
      const k = junctionKey(p);
      const arr = map.get(k) ?? [];
      arr.push({ wall: w, atStart });
      map.set(k, arr);
    }
  }
  return map;
}

// True if point `p` lies inside wall `o`'s body, strictly BETWEEN its ends
// (not at one of its own endpoints) — i.e. `o` passes THROUGH `p`. Used to
// suppress a 2-junction miter at a point that a third wall covers.
function pointInsideWallBody(p: Vec2, o: Wall): boolean {
  const dx = o.end.x - o.start.x, dy = o.end.y - o.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return false;
  const ux = dx / L, uy = dy / L;
  const along = (p.x - o.start.x) * ux + (p.y - o.start.y) * uy;
  if (along <= 0.05 || along >= L - 0.05) return false; // at/near an endpoint
  const perp = Math.abs((p.x - o.start.x) * -uy + (p.y - o.start.y) * ux);
  return perp <= o.thickness / 2 + 0.05;
}

// Returns the 4 polygon corners of `w` with miters applied at 2-junctions.
// Corner order CCW: start-left, end-left, end-right, start-right.
// `allWalls` lets us detect a third wall passing through the junction point,
// in which case the miter is suppressed (the through-wall's body covers it;
// mitering the two end-sharing walls to each other would skew the joint).
function wallPolygonMitered(w: Wall, junctions: Map<string, JunctionEntry[]>, allWalls: Wall[]): Vec2[] {
  const basic = wallPolygon(w);
  const fStart = wallFrameFromEndpoint(w, true);
  const fEnd = wallFrameFromEndpoint(w, false);

  // ----- start endpoint -----
  if (fStart) {
    const k = junctionKey(w.start);
    const entries = junctions.get(k) ?? [];
    const others = entries.filter(e => e.wall.id !== w.id);
    if (others.length === 1 &&
        !allWalls.some(o => o.id !== w.id && o.id !== others[0].wall.id && pointInsideWallBody(w.start, o))) {
      const o = others[0];
      const fO = wallFrameFromEndpoint(o.wall, o.atStart);
      if (fO) {
        // start-left: side = +1 (CCW perpendicular of outgoing). But
        // outgoing for the START endpoint of A points along A's direction
        // (start→end), which means the "start-left" point P+h*nA corresponds
        // to side = +1 with our frame.
        basic[0] = miterCorner(w.start, fStart, fO, 1);   // start-left
        basic[3] = miterCorner(w.start, fStart, fO, -1);  // start-right
      }
    }
  }

  // ----- end endpoint -----
  if (fEnd) {
    const k = junctionKey(w.end);
    const entries = junctions.get(k) ?? [];
    const others = entries.filter(e => e.wall.id !== w.id);
    if (others.length === 1 &&
        !allWalls.some(o => o.id !== w.id && o.id !== others[0].wall.id && pointInsideWallBody(w.end, o))) {
      const o = others[0];
      const fO = wallFrameFromEndpoint(o.wall, o.atStart);
      if (fO) {
        // At end endpoint, the outgoing direction for A is reversed (end→start
        // sense). Our wallFrameFromEndpoint(w, false) flips ex,ey to point away
        // from `end`, so the corresponding side mapping is flipped: end-left
        // of the wall corresponds to side = -1 in the end-frame (because the
        // frame's CCW perpendicular now points to wall's RIGHT in start-frame
        // terms, but end-left is on the same physical side).
        basic[1] = miterCorner(w.end, fEnd, fO, -1);  // end-left
        basic[2] = miterCorner(w.end, fEnd, fO, 1);   // end-right
      }
    }
  }

  return basic;
}

// ─── Convex polygon clip ──────────────────────────────────────────────────────

function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

// Returns t-range [t0, t1] where segment a→b lies inside convex `poly`.
// Uses a small positive tolerance: a point exactly on the boundary counts
// as inside. Callers should shift the test segment OUTWARD by a small
// amount so that "on the boundary" never happens — only "strictly outside"
// (drawn) or "strictly inside another wall" (interior of union, skipped).
function edgeInsidePolygonRange(
  a: Vec2, b: Vec2, poly: Vec2[],
): [number, number] | null {
  if (poly.length < 3) return null;
  const ori = signedArea(poly) > 0 ? 1 : -1;
  const eps = 1e-4;

  let t0 = 0, t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const ea = poly[i], eb = poly[(i + 1) % poly.length];
    const edx = eb.x - ea.x, edy = eb.y - ea.y;
    const f0 = edx * (a.y - ea.y) - edy * (a.x - ea.x);
    const df = edx * (b.y - a.y) - edy * (b.x - a.x);
    // Inside iff ori * (f0 + t*df) > -eps.
    const slope = ori * df;
    const intercept = -eps - ori * f0;
    if (Math.abs(slope) < 1e-9) {
      if (intercept >= 0) return null;
    } else if (slope > 0) {
      t0 = Math.max(t0, intercept / slope);
    } else {
      t1 = Math.min(t1, intercept / slope);
    }
    if (t1 < t0 - 1e-6) return null;
  }
  t0 = Math.max(0, t0); t1 = Math.min(1, t1);
  if (t1 - t0 < 1e-6) return null;
  return [t0, t1];
}

function clipEdgeOutsidePolygons(
  a: Vec2, b: Vec2, others: Vec2[][],
): [number, number][] {
  const inside: [number, number][] = [];
  for (const poly of others) {
    const r = edgeInsidePolygonRange(a, b, poly);
    if (r) inside.push(r);
  }
  if (inside.length === 0) return [[0, 1]];
  inside.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [[inside[0][0], inside[0][1]]];
  for (let i = 1; i < inside.length; i++) {
    const last = merged[merged.length - 1];
    if (inside[i][0] <= last[1]) last[1] = Math.max(last[1], inside[i][1]);
    else merged.push([inside[i][0], inside[i][1]]);
  }
  const out: [number, number][] = [];
  let t = 0;
  for (const [lo, hi] of merged) {
    if (lo > t + 1e-6) out.push([t, lo]);
    t = Math.max(t, hi);
  }
  if (t < 1 - 1e-6) out.push([t, 1]);
  return out;
}

// Outward normal of a polygon edge (in world coords). Uses the centroid to
// disambiguate inward vs outward.
function edgeOutwardNormal(a: Vec2, b: Vec2, centroid: Vec2): { x: number; y: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return { x: 0, y: 0 };
  const nx = -dy / L, ny = dx / L;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dot = nx * (centroid.x - mx) + ny * (centroid.y - my);
  if (dot > 0) return { x: -nx, y: -ny };
  return { x: nx, y: ny };
}

function polyCentroid(poly: Vec2[]): Vec2 {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  return { x: cx / poly.length, y: cy / poly.length };
}

// ─── Wall colors ──────────────────────────────────────────────────────────────

// Renovation-status fills. Tuned for B&W print contrast:
//   existing → WHITE (reads as "unfilled" on paper, outline only)
//   proposed → light blue shading (prints as light gray, clearly distinct from existing)
//   demo     → WHITE (with a red hatch overlay, see below)
const STATUS_FILL = {
  existing: '#ffffff',
  proposed: '#cfddff',
  demo:     '#ffffff',
} as const;

// Only DEMO walls get a hatch — the existing/proposed distinction comes from
// fill alone, which prints cleanly.
const STATUS_HATCH = {
  existing: '#6b7280',  // unused
  proposed: '#4f7cff',  // unused
  demo:     '#e53e3e',
} as const;

// All renovation walls use a strong dark stroke so partition walls don't
// disappear in B&W print (where the type-based partition gray is too light).
const WALL_STROKE_RENOVATION = '#1f2540';

const SELECTED_FILL   = '#e7eeff';
const SELECTED_STROKE = '#4f7cff';

function wallStatus(w: Wall): 'existing' | 'proposed' | 'demo' {
  return w.status ?? 'proposed';
}

function wallInfill(w: Wall): string {
  return STATUS_FILL[wallStatus(w)];
}

function wallHatchColor(w: Wall): string {
  return STATUS_HATCH[wallStatus(w)];
}


// Draw 45° diagonal hatch lines inside a polygon, clipped to it.
// `spacing` is the perpendicular distance between lines in screen pixels.
function drawHatchInPolygon(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[],          // screen coords
  color: string,
  spacing: number,
) {
  if (poly.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.clip();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  // 45° lines: x + y = b, perpendicular spacing = bStep / √2.
  const bStep = spacing * Math.SQRT2;
  const bStart = Math.floor((minX + minY) / bStep) * bStep;
  const bEnd = (maxX + maxY) + bStep;
  for (let b = bStart; b <= bEnd; b += bStep) {
    ctx.moveTo(b - minY, minY);
    ctx.lineTo(b - maxY, maxY);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── Wall drawing ─────────────────────────────────────────────────────────────

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  doors: Door[],
  windows: WindowObj[],
  vp: Viewport,
  selectedIds: Set<string>,
) {
  // Replace each wall with its segments (cuts around any doors AND windows
  // anchored to it). Segment IDs encode the parent wall id so selection
  // highlighting still works. The original wall data is unchanged.
  const cutsByWall = new Map<string, { positionAlong: number; width: number }[]>();
  for (const d of doors) {
    const arr = cutsByWall.get(d.wallId) ?? [];
    arr.push(doorOpeningCut(d));
    cutsByWall.set(d.wallId, arr);
  }
  for (const win of windows) {
    const arr = cutsByWall.get(win.wallId) ?? [];
    arr.push(...windowOpeningCuts(win));
    cutsByWall.set(win.wallId, arr);
  }
  const segments: { seg: Wall; parentId: string }[] = [];
  for (const w of walls) {
    const cuts = cutsByWall.get(w.id) ?? [];
    const segs = wallSegmentsWithCuts(w, cuts);
    for (const s of segs) segments.push({ seg: s, parentId: w.id });
  }

  const segWalls = segments.map(s => s.seg);
  const junctions = buildJunctions(segWalls);

  // Pre-compute mitered polygons once; both fill and stroke passes use them.
  const polys: { id: string; parentId: string; poly: Vec2[] }[] = segments.map(s => ({
    id: s.seg.id, parentId: s.parentId, poly: wallPolygonMitered(s.seg, junctions, segWalls),
  }));

  // Pass 1: fill mitered polygons with the status base color, then overlay
  // a 45° hatch pattern in the status hatch color (clipped to the polygon).
  // Selected walls use the selection fill and skip the hatch so the highlight
  // reads cleanly.
  const HATCH_SPACING_PX = 6;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].seg;
    const screenPoly = polys[i].poly.map(p => worldToScreen(p, vp));
    const isSel = selectedIds.has(polys[i].parentId);
    ctx.fillStyle = isSel ? SELECTED_FILL : wallInfill(seg);
    ctx.beginPath();
    ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
    for (let k = 1; k < screenPoly.length; k++) ctx.lineTo(screenPoly[k].x, screenPoly[k].y);
    ctx.closePath();
    ctx.fill();
    // Only demo walls get a hatch overlay. Existing reads as outline-only;
    // proposed reads as a solid shaded fill. Both print clearly.
    if (!isSel && wallStatus(seg) === 'demo') {
      drawHatchInPolygon(ctx, screenPoly, wallHatchColor(seg), HATCH_SPACING_PX);
    }
  }

  // Pass 2: perimeter strokes (clipped against neighbors so seams hide).
  ctx.lineCap = 'butt';
  const SHIFT = 0.1; // inches — must be less than thinnest wall
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].seg;
    const poly = polys[i].poly;
    const centroid = polyCentroid(poly);
    const others = polys.filter(p => p.id !== seg.id).map(p => p.poly);
    const isSel = selectedIds.has(polys[i].parentId);
    // Use the strong renovation stroke (dark navy ≈ black) for all walls in
    // plan view — type-based gray would wash out in B&W print.
    ctx.strokeStyle = isSel ? SELECTED_STROKE : WALL_STROKE_RENOVATION;
    ctx.lineWidth = isSel ? 1.8 : 1.1;
    // Demo walls get a dashed perimeter — the architectural "to be removed"
    // convention. Selection highlight overrides (always solid).
    if (!isSel && wallStatus(seg) === 'demo') {
      ctx.setLineDash([5, 3]);
    } else {
      ctx.setLineDash([]);
    }

    for (let k = 0; k < poly.length; k++) {
      const a = poly[k];
      const b = poly[(k + 1) % poly.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.001) continue;
      const n = edgeOutwardNormal(a, b, centroid);
      const aS = { x: a.x + n.x * SHIFT, y: a.y + n.y * SHIFT };
      const bS = { x: b.x + n.x * SHIFT, y: b.y + n.y * SHIFT };
      const ranges = clipEdgeOutsidePolygons(aS, bS, others);
      for (const [t0, t1] of ranges) {
        const sa = worldToScreen({ x: a.x + t0 * (b.x - a.x), y: a.y + t0 * (b.y - a.y) }, vp);
        const sb = worldToScreen({ x: a.x + t1 * (b.x - a.x), y: a.y + t1 * (b.y - a.y) }, vp);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);
}

// Visible wall LINEWORK as world-space line segments — the SAME edges
// `drawWalls` strokes (openings cut, mitered corners, and each edge clipped to
// the part lying outside every other wall so seams hide). The on-screen plan
// gets clean joints from the FILL hiding overlaps; a pure line drawing (DXF
// export) has no fill, so it must emit exactly these clipped edges instead of
// raw per-wall rectangles. Mirrors `drawWalls`' segment→miter→clip passes.
export function wallPlanLinework(walls: Wall[], doors: Door[], windows: WindowObj[]): Array<[Vec2, Vec2]> {
  const cutsByWall = new Map<string, { positionAlong: number; width: number }[]>();
  for (const d of doors) {
    const arr = cutsByWall.get(d.wallId) ?? [];
    arr.push(doorOpeningCut(d));
    cutsByWall.set(d.wallId, arr);
  }
  for (const win of windows) {
    const arr = cutsByWall.get(win.wallId) ?? [];
    arr.push(...windowOpeningCuts(win));
    cutsByWall.set(win.wallId, arr);
  }
  const segments: Wall[] = [];
  for (const w of walls) {
    for (const s of wallSegmentsWithCuts(w, cutsByWall.get(w.id) ?? [])) segments.push(s);
  }
  const junctions = buildJunctions(segments);
  const polys = segments.map((s, idx) => ({ idx, poly: wallPolygonMitered(s, junctions, segments) }));

  const SHIFT = 0.1;   // outward shift so boundary-coincident edges resolve cleanly
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < polys.length; i++) {
    const poly = polys[i].poly;
    const centroid = polyCentroid(poly);
    const others = polys.filter(p => p.idx !== polys[i].idx).map(p => p.poly);
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.001) continue;
      const n = edgeOutwardNormal(a, b, centroid);
      const aS = { x: a.x + n.x * SHIFT, y: a.y + n.y * SHIFT };
      const bS = { x: b.x + n.x * SHIFT, y: b.y + n.y * SHIFT };
      for (const [t0, t1] of clipEdgeOutsidePolygons(aS, bS, others)) {
        out.push([
          { x: a.x + t0 * (b.x - a.x), y: a.y + t0 * (b.y - a.y) },
          { x: a.x + t1 * (b.x - a.x), y: a.y + t1 * (b.y - a.y) },
        ]);
      }
    }
  }
  return out;
}

// ─── Endpoint grips on selected walls ─────────────────────────────────────────

export function drawHandles(
  ctx: CanvasRenderingContext2D,
  walls: Wall[],
  selectedIds: Set<string>,
  vp: Viewport,
  hoveredWallId: string | null,
  hoveredEnd: 'start' | 'end' | null,
) {
  for (const w of walls) {
    if (!selectedIds.has(w.id)) continue;
    for (const end of ['start', 'end'] as const) {
      const pt = end === 'start' ? w.start : w.end;
      const s = worldToScreen(pt, vp);
      const isHovered = hoveredWallId === w.id && hoveredEnd === end;
      ctx.fillStyle = isHovered ? SELECTED_STROKE : '#ffffff';
      ctx.strokeStyle = SELECTED_STROKE;
      ctx.lineWidth = isHovered ? 2.2 : 1.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, isHovered ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

// ─── Wall preview while drawing ───────────────────────────────────────────────

export function drawWallPreview(
  ctx: CanvasRenderingContext2D,
  start: Vec2, end: Vec2, thickness: number,
  vp: Viewport,
) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) {
    const a = worldToScreen(start, vp);
    ctx.fillStyle = SELECTED_STROKE;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const h = thickness / 2;
  const corners = [
    { x: start.x + nx * h, y: start.y + ny * h },
    { x: end.x   + nx * h, y: end.y   + ny * h },
    { x: end.x   - nx * h, y: end.y   - ny * h },
    { x: start.x - nx * h, y: start.y - ny * h },
  ].map(p => worldToScreen(p, vp));

  // Semi-transparent infill.
  ctx.fillStyle = 'rgba(79,124,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();

  // Dashed outline.
  ctx.strokeStyle = SELECTED_STROKE;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Endpoint dots.
  ctx.fillStyle = SELECTED_STROKE;
  for (const p of [worldToScreen(start, vp), worldToScreen(end, vp)]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Symbols (v1 placeholders, unchanged) ─────────────────────────────────────

// ─── Doors ────────────────────────────────────────────────────────────────────
//
// Plan-view door symbols. The door is positioned at its anchored wall's
// centerline. We translate to door position and rotate the canvas so the
// wall direction is +x (local frame), then draw type-specific geometry.
// In the local frame:
//   - door opening runs from x = -w/2 to x = +w/2
//   - wall thickness extends from y = -t/2 to y = +t/2
//   - "flipped" toggles which side of the wall the door opens to (+y vs -y)

const DOOR_STROKE = '#1f2540';
const DOOR_STROKE_LIGHT = '#5a607a';

export function drawDoor(
  ctx: CanvasRenderingContext2D,
  d: Door,
  wall: Wall,
  vp: Viewport,
  selected: boolean,
) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return;
  const ux = dx / L, uy = dy / L;
  const center = {
    x: wall.start.x + ux * d.positionAlong,
    y: wall.start.y + uy * d.positionAlong,
  };
  const screen = worldToScreen(center, vp);
  const angle = Math.atan2(uy, ux);
  const ppi = vp.pxPerInch;
  const w = d.width * ppi;
  const t = wall.thickness * ppi;
  const stroke = selected ? SELECTED_STROKE : DOOR_STROKE;
  const lightStroke = selected ? SELECTED_STROKE : DOOR_STROKE_LIGHT;
  const flipSign = d.flipped ? -1 : 1;

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(angle);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  switch (d.doorType) {
    case 'room':
      drawSwingDoor(ctx, w, t, d, stroke, flipSign);
      break;
    case 'entry':
      drawEntryDoor(ctx, w, t, d, ppi, stroke, lightStroke, flipSign);
      break;
    case 'sliding':
      drawSlidingDoor(ctx, w, t, d, stroke, lightStroke, flipSign);
      break;
    case 'bifold':
      drawBifoldDoor(ctx, w, t, d, stroke, flipSign);
      break;
    case 'pocket':
      drawPocketDoor(ctx, w, t, d, stroke, lightStroke);
      break;
    case 'barn':
      drawBarnDoor(ctx, w, t, d, stroke, lightStroke, flipSign);
      break;
  }

  ctx.restore();
}

function drawEntryDoor(
  ctx: CanvasRenderingContext2D, w: number, t: number, d: Door,
  ppi: number, stroke: string, lightStroke: string, flipSign: number,
) {
  // Entry door = swing door with heavier jamb ticks + optional sidelites
  // (narrow fixed window panes flanking the door).
  drawSwingDoor(ctx, w, t, d, stroke, flipSign);

  // Threshold ticks at both jambs.
  ctx.strokeStyle = lightStroke;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -t / 2); ctx.lineTo(-w / 2, t / 2);
  ctx.moveTo(+w / 2, -t / 2); ctx.lineTo(+w / 2, t / 2);
  ctx.stroke();

  // Sidelites.
  const sp = d.sidePanels ?? 'none';
  if (sp !== 'none') {
    const swInches = d.sidePanelWidth ?? DEFAULT_SIDE_PANEL_WIDTH;
    const sw = swInches * ppi;
    const hasLeft = sp === 'left' || sp === 'both';
    const hasRight = sp === 'right' || sp === 'both';
    ctx.lineWidth = 1.2;
    if (hasLeft) drawSidelite(ctx, -w / 2 - sw, -w / 2, t, stroke, lightStroke);
    if (hasRight) drawSidelite(ctx, +w / 2, +w / 2 + sw, t, stroke, lightStroke);
  }
}

function drawSidelite(
  ctx: CanvasRenderingContext2D,
  uMin: number, uMax: number, t: number,
  stroke: string, lightStroke: string,
) {
  // Sidelite frame (thin rectangle in the wall) with three glass lines
  // running along the wall, like a narrow window plan symbol.
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.3;
  ctx.strokeRect(uMin, -t / 2, uMax - uMin, t);
  // Three parallel glazing lines.
  ctx.strokeStyle = lightStroke;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(uMin, -t * 0.18); ctx.lineTo(uMax, -t * 0.18);
  ctx.moveTo(uMin,  t * 0.18); ctx.lineTo(uMax,  t * 0.18);
  ctx.moveTo(uMin,  0);        ctx.lineTo(uMax,  0);
  ctx.stroke();
}

function drawSwingDoor(
  ctx: CanvasRenderingContext2D, w: number, t: number, d: Door,
  stroke: string, flipSign: number,
) {
  // Hinge at one end of the opening.
  const hingeSign = d.hingeSide === 'start' ? -1 : 1;   // -1 → left jamb, +1 → right
  const hingeX = hingeSign * (w / 2);
  const angleRad = (d.openAngle * Math.PI) / 180;

  // Panel direction at openAngle α:
  //   α = 0   → along wall toward the OTHER jamb (direction = -hingeSign on x)
  //   α = π/2 → perpendicular to wall on the swing side (sign = flipSign on y)
  // Y component depends only on flipSign (independent of hingeSign); the X
  // component depends only on hingeSign. This keeps the swing SIDE consistent
  // when you flip the hinge — only the rotation axis moves.
  const panelDirX = -hingeSign * Math.cos(angleRad);
  const panelDirY =  flipSign  * Math.sin(angleRad);
  const panelEndX = hingeX + w * panelDirX;
  const panelEndY = 0 + w * panelDirY;

  // Door panel line.
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hingeX, 0);
  ctx.lineTo(panelEndX, panelEndY);
  ctx.stroke();

  // Swing arc — from panel end back to the other jamb. Always take the SHORT
  // way around (≤ 180°) by normalizing the angular delta into (-π, π] and
  // setting anticlockwise based on its sign.
  const startA = Math.atan2(panelEndY, panelEndX - hingeX);
  const endA   = Math.atan2(0, -hingeSign * w);
  let delta = endA - startA;
  while (delta >  Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  const anticlockwise = delta < 0;

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(hingeX, 0, w, startA, endA, anticlockwise);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSlidingDoor(
  ctx: CanvasRenderingContext2D, w: number, t: number, d: Door,
  stroke: string, lightStroke: string, flipSign: number,
) {
  // Two bypass panels offset to opposite sides. No horizontal lines at the
  // wall edges (those read as the wall continuing across the cut, which it
  // doesn't — the wall is open here). Exterior adds a sill line through the
  // middle + jamb ticks to read as a heavier doorway.
  const isExterior = d.slideStyle === 'exterior';
  const panelW = w / 2;
  const panelT = isExterior ? Math.max(3, t * 0.35) : Math.max(2, t * 0.25);
  const panelOffset = flipSign * (panelT / 2 + 1);

  if (isExterior) {
    // Sill line through the middle of the wall thickness, plus jamb ticks.
    ctx.strokeStyle = lightStroke;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -t / 2); ctx.lineTo(-w / 2, t / 2);
    ctx.moveTo(+w / 2, -t / 2); ctx.lineTo(+w / 2, t / 2);
    ctx.stroke();
  }

  // Two bypass panels (mirrored offsets so the bypass reads visually).
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = isExterior ? 1.5 : 1.2;
  ctx.fillRect(-panelW, panelOffset - panelT / 2, panelW, panelT);
  ctx.strokeRect(-panelW, panelOffset - panelT / 2, panelW, panelT);
  ctx.fillRect(0, -panelOffset - panelT / 2, panelW, panelT);
  ctx.strokeRect(0, -panelOffset - panelT / 2, panelW, panelT);
}

function drawBifoldDoor(
  ctx: CanvasRenderingContext2D, w: number, t: number, d: Door,
  stroke: string, flipSign: number,
) {
  // Bifold "single" vs "double" is derived from width: any opening 36" or
  // wider gets a double bifold (4 panels in two chevrons), narrower gets a
  // single (2 panels in one chevron).
  const isDouble = d.width >= 36;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.fillStyle = stroke;

  if (isDouble) {
    // Two separate chevrons, one anchored at each jamb, folding toward the
    // center. Small gap between the inner tips (the panels are "ajar"). Each
    // chevron's peak offset is proportional to its OWN length, not the full
    // opening — that's why each triangle reads as smaller than a single.
    const halfW = w / 2;
    const centerGap = Math.min(halfW * 0.18, 8);   // gap in middle, capped
    const chevronLen = halfW - centerGap / 2;
    const peakOffset = flipSign * (chevronLen * 0.35);

    // Left chevron: fixed hinge at -halfW, free tip at -centerGap/2.
    const lFixedX = -halfW;
    const lTipX = -centerGap / 2;
    const lPeakX = (lFixedX + lTipX) / 2;
    ctx.beginPath();
    ctx.moveTo(lFixedX, 0);
    ctx.lineTo(lPeakX, peakOffset);
    ctx.lineTo(lTipX, 0);
    ctx.stroke();

    // Right chevron: fixed hinge at +halfW, free tip at +centerGap/2.
    const rFixedX = halfW;
    const rTipX = centerGap / 2;
    const rPeakX = (rFixedX + rTipX) / 2;
    ctx.beginPath();
    ctx.moveTo(rFixedX, 0);
    ctx.lineTo(rPeakX, peakOffset);
    ctx.lineTo(rTipX, 0);
    ctx.stroke();

    // Hinge dots at both fixed ends.
    ctx.beginPath(); ctx.arc(lFixedX, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rFixedX, 0, 2, 0, Math.PI * 2); ctx.fill();
  } else {
    const hingeSign = d.hingeSide === 'start' ? -1 : 1;
    const fixedX = hingeSign * (w / 2);
    const tipX = -hingeSign * (w / 2);
    const peakY = flipSign * (w * 0.30);
    ctx.beginPath();
    ctx.moveTo(fixedX, 0);
    ctx.lineTo(0, peakY);
    ctx.lineTo(tipX, 0);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(fixedX, 0, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPocketDoor(
  ctx: CanvasRenderingContext2D, w: number, t: number, d: Door,
  stroke: string, lightStroke: string,
) {
  // Single panel shown closed across the opening. The pocket cavity (where
  // the door slides into the wall when fully open) extends a FULL door
  // width into the wall on the hinge side — that's the door's travel path.
  const hingeSign = d.hingeSide === 'start' ? -1 : 1;
  const panelT = Math.max(2, t * 0.4);

  // Closed panel.
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.fillRect(-w / 2, -panelT / 2, w, panelT);
  ctx.strokeRect(-w / 2, -panelT / 2, w, panelT);

  // Dashed pocket cavity — full door-width travel past the jamb.
  ctx.strokeStyle = lightStroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  const pocketStartX = hingeSign * (w / 2);
  const pocketEndX = hingeSign * (w / 2 + w);
  ctx.beginPath();
  // Pocket top + bottom lines (just outside the panel).
  ctx.moveTo(pocketStartX, -panelT / 2); ctx.lineTo(pocketEndX, -panelT / 2);
  ctx.moveTo(pocketStartX,  panelT / 2); ctx.lineTo(pocketEndX,  panelT / 2);
  // Pocket end wall (back of the cavity).
  ctx.moveTo(pocketEndX, -panelT / 2);   ctx.lineTo(pocketEndX,  panelT / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Tiny arrow inside the cavity indicating slide direction.
  ctx.strokeStyle = lightStroke;
  ctx.lineWidth = 1;
  const arrowY = 0;
  const arrowStart = hingeSign * (w / 2 + w * 0.20);
  const arrowEnd   = hingeSign * (w / 2 + w * 0.70);
  ctx.beginPath();
  ctx.moveTo(arrowStart, arrowY);
  ctx.lineTo(arrowEnd, arrowY);
  // Arrowhead
  const ah = 3;
  ctx.moveTo(arrowEnd, arrowY);
  ctx.lineTo(arrowEnd - hingeSign * ah, arrowY - ah * 0.6);
  ctx.moveTo(arrowEnd, arrowY);
  ctx.lineTo(arrowEnd - hingeSign * ah, arrowY + ah * 0.6);
  ctx.stroke();
}

function drawBarnDoor(
  ctx: CanvasRenderingContext2D, w: number, t: number, d: Door,
  stroke: string, lightStroke: string, flipSign: number,
) {
  // Barn door panel(s) hang OFFSET from the wall on the flipped side, riding
  // on an overhead track that extends past the opening so the panels can
  // slide clear when fully open.
  //
  // Single: 1 panel covers the opening when closed. Track extends past the
  //         opening by a full door width on the hinge-side (where the panel
  //         slides to when open).
  // Double: 2 half-width panels meet at center when closed. Track extends
  //         past the opening on BOTH sides by half a door width.
  const variant = d.panels ?? 'single';
  const panelT = Math.max(2, t * 0.5);
  const offset = flipSign * (t / 2 + panelT);
  const trackY = offset - flipSign * (panelT / 2 + 2);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = stroke;

  if (variant === 'double') {
    // Track from -w to +w (extends half a door width past each jamb).
    // Thick + dark so it reads as a real rail, not just a guide line.
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w, trackY);
    ctx.lineTo( w, trackY);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // Track end stops.
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-w, trackY - 4); ctx.lineTo(-w, trackY + 4);
    ctx.moveTo( w, trackY - 4); ctx.lineTo( w, trackY + 4);
    ctx.stroke();

    // Two half-width panels meeting at center when closed.
    const panelW = w / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.fillRect(-panelW, offset - panelT / 2, panelW, panelT);
    ctx.strokeRect(-panelW, offset - panelT / 2, panelW, panelT);
    ctx.fillRect(0, offset - panelT / 2, panelW, panelT);
    ctx.strokeRect(0, offset - panelT / 2, panelW, panelT);
  } else {
    // Single: track extends one full door width past the jamb on the slide
    // (hinge) side. hingeSide='end' → slides toward +u (track extends right).
    const slideSign = d.hingeSide === 'end' ? 1 : -1;
    const trackStart = slideSign === 1 ? -w / 2 : -w / 2 - w;
    const trackEnd   = slideSign === 1 ?  w / 2 + w :  w / 2;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(trackStart, trackY);
    ctx.lineTo(trackEnd, trackY);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // Track end stops.
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(trackStart, trackY - 4); ctx.lineTo(trackStart, trackY + 4);
    ctx.moveTo(trackEnd,   trackY - 4); ctx.lineTo(trackEnd,   trackY + 4);
    ctx.stroke();

    // Panel covers the opening when closed.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.fillRect(-w / 2, offset - panelT / 2, w, panelT);
    ctx.strokeRect(-w / 2, offset - panelT / 2, w, panelT);
  }
}

// ─── Windows ──────────────────────────────────────────────────────────────────
//
// Plan-view window symbols, drawn in the wall's local frame at the window's
// projected position. Wall thickness extends from y = -t/2 to y = +t/2.

const WINDOW_STROKE = '#1f2540';
const WINDOW_STROKE_LIGHT = '#5a607a';

export function drawWindow(
  ctx: CanvasRenderingContext2D,
  win: WindowObj,
  wall: Wall,
  vp: Viewport,
  selected: boolean,
) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return;
  const ux = dx / L, uy = dy / L;
  const center = {
    x: wall.start.x + ux * win.positionAlong,
    y: wall.start.y + uy * win.positionAlong,
  };
  const screen = worldToScreen(center, vp);
  const angle = Math.atan2(uy, ux);
  const ppi = vp.pxPerInch;
  const w = win.width * ppi;
  const t = wall.thickness * ppi;
  const stroke = selected ? SELECTED_STROKE : WINDOW_STROKE;
  const lightStroke = selected ? SELECTED_STROKE : WINDOW_STROKE_LIGHT;
  const flipSign = win.flipped ? -1 : 1;

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(angle);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  switch (win.windowType) {
    case 'double-hung':
      if (win.panels === 'double') {
        // Two double-hung units flanking a 2x4 (1.5") mullion. The stored
        // win.width covers the whole assembly, so each unit gets half the
        // remaining width after the mullion.
        const mullionIn = 1.5;
        const unitW = (win.width - mullionIn) / 2;
        if (unitW > 0) {
          const unitPx = unitW * ppi;
          const offsetPx = (unitW + mullionIn) / 2 * ppi;
          ctx.save(); ctx.translate(-offsetPx, 0);
          drawSimpleWindow(ctx, unitPx, t, stroke, lightStroke);
          ctx.restore();
          ctx.save(); ctx.translate(offsetPx, 0);
          drawSimpleWindow(ctx, unitPx, t, stroke, lightStroke);
          ctx.restore();
        }
      } else {
        drawSimpleWindow(ctx, w, t, stroke, lightStroke);
      }
      break;
    case 'fixed':
      drawSimpleWindow(ctx, w, t, stroke, lightStroke);
      break;
    case 'sliding':
      drawSlidingWindow(ctx, w, t, stroke, lightStroke);
      break;
    case 'casement':
      drawCasementWindow(ctx, w, t, win, stroke, lightStroke, flipSign, ppi);
      break;
    case 'awning':
      drawAwningWindow(ctx, w, t, stroke, lightStroke, flipSign);
      break;
    case 'bay':
      drawBayWindow(ctx, w, t, win, stroke, lightStroke, flipSign, ppi);
      break;
  }

  ctx.restore();
}

// Frame box + three glazing lines.
function drawSimpleWindow(
  ctx: CanvasRenderingContext2D, w: number, t: number,
  stroke: string, lightStroke: string,
) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.3;
  ctx.fillRect(-w / 2, -t / 2, w, t);
  ctx.strokeRect(-w / 2, -t / 2, w, t);
  // Three glazing lines.
  ctx.strokeStyle = lightStroke;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -t * 0.18); ctx.lineTo(w / 2, -t * 0.18);
  ctx.moveTo(-w / 2,  t * 0.18); ctx.lineTo(w / 2,  t * 0.18);
  ctx.moveTo(-w / 2,  0);        ctx.lineTo(w / 2,  0);
  ctx.stroke();
}

// Two horizontal sashes offset perpendicular to indicate bypass.
function drawSlidingWindow(
  ctx: CanvasRenderingContext2D, w: number, t: number,
  stroke: string, lightStroke: string,
) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.3;
  ctx.fillRect(-w / 2, -t / 2, w, t);
  ctx.strokeRect(-w / 2, -t / 2, w, t);
  // Two sashes (left + right) shown as glass lines offset slightly.
  ctx.strokeStyle = lightStroke;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -t * 0.22); ctx.lineTo(0,    -t * 0.22);
  ctx.moveTo(-w / 2,  t * 0.05); ctx.lineTo(0,     t * 0.05);
  ctx.moveTo(0,      -t * 0.05); ctx.lineTo(w / 2, -t * 0.05);
  ctx.moveTo(0,       t * 0.22); ctx.lineTo(w / 2,  t * 0.22);
  ctx.stroke();
  // Meeting stile (where the two sashes overlap).
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -t / 2); ctx.lineTo(0, t / 2);
  ctx.stroke();
}

function drawCasementWindow(
  ctx: CanvasRenderingContext2D, w: number, t: number, win: WindowObj,
  stroke: string, lightStroke: string, flipSign: number, ppi: number,
) {
  // Frame + glazing lines, then a small swing line + arc on the flipped
  // side. For double casement, mirror the swing for both halves.
  drawSimpleWindow(ctx, w, t, stroke, lightStroke);

  const isDouble = win.panels === 'double';
  const reach = w * 0.45;  // sash sticks out about half its width when open

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;

  if (isDouble) {
    // Two sashes, hinged at the OUTER edges, swinging outward in a V.
    drawCasementSash(ctx, -w / 2,  +w * 0.5, 0, reach, flipSign, t);
    drawCasementSash(ctx, +w / 2,  -w * 0.5, 0, reach, flipSign, t);
  } else {
    const hingeSign = win.hingeSide === 'start' ? -1 : 1;
    const hingeX = hingeSign * (w / 2);
    const tipX = -hingeSign * (w / 2);
    drawCasementSash(ctx, hingeX, tipX, 0, reach, flipSign, t);
  }
  void ppi;
}

function drawCasementSash(
  ctx: CanvasRenderingContext2D,
  hingeX: number, tipBaseX: number, baseY: number, reach: number,
  flipSign: number, t: number,
) {
  // Sash line: from hinge perpendicular to wall (open ~45°), and a dashed
  // arc indicating the swing range.
  const angle = Math.PI / 4;  // shown half-open for symbol clarity
  const sashEndX = hingeX + Math.cos(angle) * Math.sign(tipBaseX - hingeX) * reach;
  const sashEndY = baseY + flipSign * Math.sin(angle) * reach;
  ctx.beginPath();
  ctx.moveTo(hingeX, flipSign * (t / 2));
  ctx.lineTo(sashEndX, sashEndY);
  ctx.stroke();
  // Arc from sash end back toward closed position (along wall).
  const startA = Math.atan2(sashEndY - flipSign * (t / 2), sashEndX - hingeX);
  const endA = Math.atan2(0, tipBaseX - hingeX);
  let delta = endA - startA;
  while (delta >  Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(hingeX, flipSign * (t / 2), reach, startA, endA, delta < 0);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawAwningWindow(
  ctx: CanvasRenderingContext2D, w: number, t: number,
  stroke: string, lightStroke: string, flipSign: number,
) {
  // Frame + glazing, plus a small triangle on the flipped side showing
  // the sash tilts open at the top.
  drawSimpleWindow(ctx, w, t, stroke, lightStroke);

  const reach = Math.min(t * 1.2, w * 0.15);
  const baseY = flipSign * (t / 2);
  const tipY = baseY + flipSign * reach;

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // Triangle from -w/2 along baseline, to +w/2 along baseline, peak at center.
  ctx.moveTo(-w / 2, baseY);
  ctx.lineTo(0, tipY);
  ctx.lineTo(+w / 2, baseY);
  ctx.stroke();
}

function drawBayWindow(
  ctx: CanvasRenderingContext2D, w: number, t: number, win: WindowObj,
  stroke: string, lightStroke: string, flipSign: number, ppi: number,
) {
  // Trapezoid projection on the flipped side: center pane (parallel to wall)
  // + two angled side panes. Three glazing lines per pane.
  const projInches = win.bayProjection ?? 18;
  const proj = projInches * ppi;
  const baseY = flipSign * (t / 2);          // outer face of the wall
  const tipY = baseY + flipSign * proj;       // tip of the projection
  // Side panes lean in at 30°-ish; center pane is parallel to the wall.
  const sideInset = Math.min(w * 0.30, proj * 0.6);

  // Outer frame (trapezoid).
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-w / 2, baseY);
  ctx.lineTo(-w / 2 + sideInset, tipY);
  ctx.lineTo( w / 2 - sideInset, tipY);
  ctx.lineTo( w / 2, baseY);
  ctx.lineTo( w / 2, -flipSign * (t / 2));   // back to inner wall edge
  ctx.lineTo(-w / 2, -flipSign * (t / 2));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pane separation lines (mullions).
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + sideInset, tipY); ctx.lineTo(-w / 2 + sideInset, baseY);
  ctx.moveTo( w / 2 - sideInset, tipY); ctx.lineTo( w / 2 - sideInset, baseY);
  // Inner wall line (at -flipSign*t/2) is implicit from the polygon.
  ctx.stroke();

  // Glazing hint lines on each pane (one mid-line).
  ctx.strokeStyle = lightStroke;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  // Center pane
  const midY = (baseY + tipY) / 2;
  ctx.moveTo(-w / 2 + sideInset, midY); ctx.lineTo( w / 2 - sideInset, midY);
  // Left side pane (interpolate)
  ctx.moveTo((-w / 2 + -w / 2 + sideInset) / 2, (baseY + tipY) / 2);
  ctx.lineTo((-w / 2 + sideInset + -w / 2 + sideInset) / 2, midY);
  ctx.stroke();
  // Side glazing — simple cross-line between corners (kept light).
}

// Amber glow indicating "needs a square-foot value". Surfaced when a room
// label has no sqft AND no boundary polygon, so the student notices and
// either types a number in the panel or draws the boundary.
const ROOM_NEEDS_SQFT_GLOW = '#d4a017';

export function drawRoomLabel(ctx: CanvasRenderingContext2D, r: RoomLabel, vp: Viewport, selected: boolean) {
  const c = worldToScreen(r.position, vp);
  const needsSqft = r.squareFeet == null && (!r.boundary || r.boundary.length < 3);
  const color = selected ? SELECTED_STROKE : (needsSqft ? ROOM_NEEDS_SQFT_GLOW : '#1f2540');
  ctx.font = '700 13px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Room labels follow architectural convention: ALL CAPS. The Text tool is
  // separate and preserves user case verbatim.
  const name = (r.name || 'ROOM').toUpperCase();
  const hasSf = r.squareFeet != null;
  ctx.fillStyle = color;
  ctx.fillText(name, c.x, hasSf ? c.y - 7 : c.y);
  if (hasSf) {
    ctx.font = '500 11px ui-sans-serif, system-ui';
    ctx.fillStyle = selected ? SELECTED_STROKE : '#5a607a';
    ctx.fillText(`${r.squareFeet} SF`, c.x, c.y + 8);
  } else if (needsSqft) {
    // Soft hint instead of a missing sqft value — disappears the moment a
    // boundary is drawn or a manual sqft is typed.
    ctx.font = '600 9px ui-sans-serif, system-ui';
    ctx.fillStyle = ROOM_NEEDS_SQFT_GLOW;
    ctx.fillText('NO SF', c.x, c.y + 8);
  }
  // Subtle selection box.
  if (selected) {
    const metrics = ctx.measureText(name);
    const w = Math.max(40, metrics.width + 16);
    const h = (hasSf || needsSqft) ? 30 : 18;
    ctx.strokeStyle = SELECTED_STROKE;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
    ctx.setLineDash([]);
  }
}

// ─── Room boundary polygon ──────────────────────────────────────────────────
// User-drawn polygon defining a room's footprint when walls don't enclose it.
// Always faintly outlined so the user can see the shape; gets a soft blue
// fill when its owning room label is selected.
export function drawRoomBoundary(
  ctx: CanvasRenderingContext2D,
  r: RoomLabel,
  vp: Viewport,
  selected: boolean,
) {
  const pts = r.boundary;
  if (!pts || pts.length < 3) return;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const sc = worldToScreen(pts[i], vp);
    if (i === 0) ctx.moveTo(sc.x, sc.y);
    else ctx.lineTo(sc.x, sc.y);
  }
  ctx.closePath();
  if (selected) {
    ctx.fillStyle = 'rgba(64, 130, 220, 0.10)';
    ctx.fill();
  }
  ctx.strokeStyle = selected ? 'rgba(64, 130, 220, 0.75)' : 'rgba(64, 130, 220, 0.30)';
  ctx.lineWidth = selected ? 1.4 : 1;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Live preview while the user is drawing a new boundary polygon. `vertices`
// are the committed points (world coords); `cursor` is the live mouse pos
// for the next vertex (or null if the cursor isn't over the canvas).
export function drawBoundaryDraft(
  ctx: CanvasRenderingContext2D,
  vertices: Vec2[],
  cursor: Vec2 | null,
  vp: Viewport,
  closeHover: boolean,
) {
  if (vertices.length === 0) return;
  ctx.save();
  // Filled preview of the closed shape if we already have ≥3 vertices.
  if (vertices.length >= 3) {
    ctx.beginPath();
    for (let i = 0; i < vertices.length; i++) {
      const sc = worldToScreen(vertices[i], vp);
      if (i === 0) ctx.moveTo(sc.x, sc.y);
      else ctx.lineTo(sc.x, sc.y);
    }
    if (cursor) {
      const tip = worldToScreen(cursor, vp);
      ctx.lineTo(tip.x, tip.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(64, 130, 220, 0.08)';
    ctx.fill();
  }
  // Committed segments.
  ctx.beginPath();
  for (let i = 0; i < vertices.length; i++) {
    const sc = worldToScreen(vertices[i], vp);
    if (i === 0) ctx.moveTo(sc.x, sc.y);
    else ctx.lineTo(sc.x, sc.y);
  }
  ctx.strokeStyle = 'rgba(64, 130, 220, 0.95)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([]);
  ctx.stroke();
  // Rubber-band to cursor.
  if (cursor) {
    const last = worldToScreen(vertices[vertices.length - 1], vp);
    const tip = worldToScreen(cursor, vp);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.strokeStyle = 'rgba(64, 130, 220, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Vertex dots.
  ctx.fillStyle = '#2563eb';
  for (const v of vertices) {
    const sc = worldToScreen(v, vp);
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Highlight the starting vertex while hovering near it (visual cue that
  // clicking will close the polygon).
  if (vertices.length >= 3 && closeHover) {
    const sc = worldToScreen(vertices[0], vp);
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Text annotation (free-form, no uppercase, no sqft) ─────────────────────
export function drawText(ctx: CanvasRenderingContext2D, t: TextLabel, vp: Viewport, selected: boolean) {
  const c = worldToScreen(t.position, vp);
  const color = selected ? SELECTED_STROKE : '#1f2540';
  ctx.font = '500 12px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const txt = t.text || 'Text';
  ctx.fillStyle = color;
  ctx.fillText(txt, c.x, c.y);
  if (selected) {
    const metrics = ctx.measureText(txt);
    const w = Math.max(30, metrics.width + 12);
    const h = 18;
    ctx.strokeStyle = SELECTED_STROKE;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h);
    ctx.setLineDash([]);
  }
}

// ─── Stair geometry helpers ──────────────────────────────────────────────────
// Local frame: origin at center of bounding box, +Y down.

// Each rectangle (run or landing) is in local space (before rotation).
interface StairPiece { x: number; y: number; w: number; h: number; kind: 'run' | 'landing'; treadAxis: 'x' | 'y' }

// Returns local-space pieces + bounding half-extents (hx, hy) in INCHES.
export function stairPieces(s: Stair): { pieces: StairPiece[]; hx: number; hy: number } {
  const shape = s.shape ?? 'straight';
  const W = s.width;
  const L = s.length;
  if (shape === 'straight') {
    return {
      pieces: [{ x: -W / 2, y: -L / 2, w: W, h: L, kind: 'run', treadAxis: 'x' }],
      hx: W / 2, hy: L / 2,
    };
  }
  if (shape === 'U') {
    // Two runs side by side + a landing across the top.
    const halfW = W;                            // total width = 2*W; half = W
    const halfH = (L + W) / 2;                  // total height = L + W (landing depth = W)
    const yRunTop    = -halfH + W;              // top of the runs (bottom of landing)
    const yRunBottom = halfH;                   // bottom of runs
    return {
      pieces: [
        // Left run (-X column)
        { x: -W,           y: yRunTop, w: W,        h: yRunBottom - yRunTop, kind: 'run',     treadAxis: 'x' },
        // Right run (+X column)
        { x: 0,            y: yRunTop, w: W,        h: yRunBottom - yRunTop, kind: 'run',     treadAxis: 'x' },
        // Landing across the top
        { x: -W,           y: -halfH,  w: 2 * W,    h: W,                    kind: 'landing', treadAxis: 'x' },
      ],
      hx: halfW, hy: halfH,
    };
  }
  // L-left or L-right
  const sign = shape === 'L-left' ? -1 : 1; // -1 = run 2 goes LEFT, +1 = run 2 goes RIGHT
  const halfW = (L + W) / 2;
  const halfH = (L + W) / 2;
  // Run 1: bottom column on the SIGN side, going up.
  // For L-left (sign=-1): run 1 is on the RIGHT, run 2 goes LEFT.
  // For L-right (sign=+1): run 1 is on the LEFT, run 2 goes RIGHT.
  const run1X = -sign * (halfW - W);          // sign * column on opposite side
  const run1: StairPiece = { x: run1X, y: -halfH + W, w: W, h: L, kind: 'run', treadAxis: 'x' };
  // Landing: at the corner (top, on run 1's side).
  const landing: StairPiece = { x: run1X, y: -halfH, w: W, h: W, kind: 'landing', treadAxis: 'x' };
  // Run 2: horizontal, going perpendicular from the landing.
  // sign=-1 → run 2 goes LEFT  (x from -halfW to run1X)
  // sign=+1 → run 2 goes RIGHT (x from run1X+W to +halfW)
  let r2x: number, r2w: number;
  if (sign === -1) { r2x = -halfW;       r2w = run1X - (-halfW); }      // from far-left to run1X
  else             { r2x = run1X + W;    r2w = halfW - (run1X + W); }   // from run1X+W to far-right
  const run2: StairPiece = { x: r2x, y: -halfH, w: r2w, h: W, kind: 'run', treadAxis: 'y' };
  return { pieces: [run1, run2, landing], hx: halfW, hy: halfH };
}

// 4 corners of the stair's local-space bounding box, in inches.
export function stairLocalCorners(s: Stair): Vec2[] {
  const { hx, hy } = stairPieces(s);
  return [
    { x: -hx, y: -hy }, { x:  hx, y: -hy },
    { x:  hx, y:  hy }, { x: -hx, y:  hy },
  ];
}

// World-space corners of the stair (after rotation + translation).
export function stairWorldCorners(s: Stair): Vec2[] {
  const c = Math.cos(s.rotation), si = Math.sin(s.rotation);
  return stairLocalCorners(s).map(p => ({
    x: s.position.x + c * p.x - si * p.y,
    y: s.position.y + si * p.x + c * p.y,
  }));
}

// Snap points along the stair's OUTSIDE edges, at every step (tread division)
// plus the corners — so the wall tool can trace a wall down the side of a
// staircase and stop flush at any individual step. World coords (after
// rotation + translation). Points sit ON the long run edges (never the
// centerline), so drawing between them runs ALONG the edge, not across it.
export function stairStepEdgePoints(s: Stair): Vec2[] {
  const { pieces } = stairPieces(s);
  const treadsBase = s.treads ?? STAIR_DEFAULTS.treads;
  const local: Vec2[] = [];
  for (const p of pieces) {
    if (p.kind === 'landing') {
      // No treads — just the four corners of the landing.
      local.push({ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h });
      continue;
    }
    // Tread count for this run (matches drawStair's division), then place a
    // point on BOTH long edges at every tread line (i = 0..n, so endpoints +
    // each step). treadAxis 'x' → treads cross X, long edges are the verticals;
    // treadAxis 'y' → treads cross Y, long edges are the horizontals.
    const runLen = p.treadAxis === 'x' ? p.h : p.w;
    const n = Math.max(2, Math.round(treadsBase * (runLen / Math.max(s.length, 24))));
    for (let i = 0; i <= n; i++) {
      if (p.treadAxis === 'x') {
        const y = p.y + (i * p.h) / n;
        local.push({ x: p.x, y }, { x: p.x + p.w, y });
      } else {
        const x = p.x + (i * p.w) / n;
        local.push({ x, y: p.y }, { x, y: p.y + p.h });
      }
    }
  }
  const c = Math.cos(s.rotation), si = Math.sin(s.rotation);
  return local.map(pt => ({ x: s.position.x + c * pt.x - si * pt.y, y: s.position.y + si * pt.x + c * pt.y }));
}

export function drawStair(ctx: CanvasRenderingContext2D, s: Stair, vp: Viewport, selected: boolean) {
  const c = worldToScreen(s.position, vp);
  const ppi = vp.pxPerInch;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(s.rotation);

  const { pieces } = stairPieces(s);
  const treads = s.treads ?? STAIR_DEFAULTS.treads;
  const fill = selected ? 'rgba(79,124,255,0.10)' : '#ffffff';
  const landingFill = selected ? 'rgba(79,124,255,0.14)' : '#f3f5fa';
  const stroke = selected ? SELECTED_STROKE : '#1f2540';
  const treadStroke = selected ? SELECTED_STROKE : '#5a607a';

  // Pass 1: fill + outline each piece.
  for (const p of pieces) {
    ctx.fillStyle = p.kind === 'landing' ? landingFill : fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.3;
    ctx.fillRect(p.x * ppi, p.y * ppi, p.w * ppi, p.h * ppi);
    ctx.strokeRect(p.x * ppi, p.y * ppi, p.w * ppi, p.h * ppi);
  }

  // Pass 2: tread lines (runs only).
  ctx.strokeStyle = treadStroke;
  ctx.lineWidth = 0.9;
  for (const p of pieces) {
    if (p.kind !== 'run') continue;
    // Tread count for this run, scaled by its length relative to a typical run.
    const runLen = p.treadAxis === 'x' ? p.h : p.w;
    const n = Math.max(2, Math.round(treads * (runLen / Math.max(s.length, 24))));
    ctx.beginPath();
    if (p.treadAxis === 'x') {
      // Treads run horizontally across the run (perpendicular to run's long axis Y).
      for (let i = 1; i < n; i++) {
        const ty = (p.y + (i * p.h) / n) * ppi;
        ctx.moveTo(p.x * ppi, ty);
        ctx.lineTo((p.x + p.w) * ppi, ty);
      }
    } else {
      // Treads run vertically (run's long axis is X).
      for (let i = 1; i < n; i++) {
        const tx = (p.x + (i * p.w) / n) * ppi;
        ctx.moveTo(tx, p.y * ppi);
        ctx.lineTo(tx, (p.y + p.h) * ppi);
      }
    }
    ctx.stroke();
  }

  // Direction arrow: a line up the FIRST run with an arrowhead at the travel
  // end (UP points toward the top of the flight; DN points back toward the
  // start). Drawn along the run's long axis, centered across its width.
  {
    const run = pieces.find(p => p.kind === 'run') ?? pieces[0];
    const along = run.treadAxis === 'x' ? 'y' : 'x';   // run's long axis
    const cx = (run.x + run.w / 2) * ppi;
    const cy = (run.y + run.h / 2) * ppi;
    const halfLen = (along === 'y' ? run.h : run.w) * ppi / 2 - 6;
    // 'up' travels toward decreasing local coordinate (top/left of the symbol);
    // 'down' travels the opposite way.
    const sign = s.direction === 'up' ? -1 : 1;
    const ax0 = along === 'x' ? cx - sign * halfLen : cx;
    const ay0 = along === 'y' ? cy - sign * halfLen : cy;
    const ax1 = along === 'x' ? cx + sign * halfLen : cx;
    const ay1 = along === 'y' ? cy + sign * halfLen : cy;
    ctx.strokeStyle = selected ? SELECTED_STROKE : '#1f2540';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ax0, ay0);
    ctx.lineTo(ax1, ay1);
    ctx.stroke();
    // Arrowhead at (ax1, ay1).
    const adx = ax1 - ax0, ady = ay1 - ay0;
    const aL = Math.hypot(adx, ady) || 1;
    const ux = adx / aL, uy = ady / aL;
    const hh = 6;
    ctx.beginPath();
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(ax1 - ux * hh - uy * hh * 0.6, ay1 - uy * hh + ux * hh * 0.6);
    ctx.lineTo(ax1 - ux * hh + uy * hh * 0.6, ay1 - uy * hh - ux * hh * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  // UP/DN label centered on the landing if any, else center of the run.
  const labelPiece = pieces.find(p => p.kind === 'landing') ?? pieces[0];
  const lx = (labelPiece.x + labelPiece.w / 2) * ppi;
  const ly = (labelPiece.y + labelPiece.h / 2) * ppi;
  ctx.fillStyle = selected ? SELECTED_STROKE : '#1f2540';
  ctx.font = '700 11px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.direction === 'up' ? 'UP' : 'DN', lx, ly);

  ctx.restore();
}

// Small circular handles at the 4 bounding-box corners of a stair, for
// click-and-drag relocation by a specific corner.
export function drawStairCornerHandles(
  ctx: CanvasRenderingContext2D, s: Stair, vp: Viewport, hoveredIndex: number | null,
) {
  const corners = stairWorldCorners(s);
  for (let i = 0; i < corners.length; i++) {
    const sp = worldToScreen(corners[i], vp);
    const hovered = i === hoveredIndex;
    ctx.fillStyle = hovered ? SELECTED_STROKE : '#ffffff';
    ctx.strokeStyle = SELECTED_STROKE;
    ctx.lineWidth = hovered ? 2.0 : 1.4;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, hovered ? 5.5 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// Map each specific catalog kind to one of the base symbol drawings.
type FurnitureSymbol = 'bed' | 'sofa' | 'table' | 'chair' | 'office-chair' | 'toilet'
                     | 'sink-bath' | 'sink-kitchen' | 'fridge' | 'stove'
                     | 'bathtub' | 'shower'
                     | 'cabinet-base' | 'cabinet-upper'
                     | 'generic';

function furnitureSymbolFor(kind: FurnitureItem['kind']): FurnitureSymbol {
  switch (kind) {
    case 'bed-twin': case 'bed-full': case 'bed-queen': case 'bed-king': case 'crib':
      return 'bed';
    case 'sofa-3': case 'loveseat': case 'armchair':
      return 'sofa';
    case 'coffee-table': case 'end-table': case 'island':
    case 'dining-table-4': case 'dining-table-6': case 'dining-table-8':
    case 'desk':
      return 'table';
    case 'dining-chair':
      return 'chair';
    case 'office-chair':
      return 'office-chair';
    case 'toilet':
      return 'toilet';
    case 'sink-vanity': case 'sink-pedestal':
      return 'sink-bath';
    case 'sink-kitchen':
      return 'sink-kitchen';
    case 'fridge':
      return 'fridge';
    case 'stove-range':
      return 'stove';
    case 'bathtub':
      return 'bathtub';
    case 'shower-stall':
      return 'shower';
    case 'cabinet-base':
      return 'cabinet-base';
    case 'cabinet-upper':
      return 'cabinet-upper';
    // Generic: nightstand, dresser, wardrobe, dishwasher, tv-console,
    // bookshelf, buffet, filing-cabinet.
    default:
      return 'generic';
  }
}

export function drawFurniture(ctx: CanvasRenderingContext2D, f: FurnitureItem, vp: Viewport, selected: boolean) {
  const c = worldToScreen(f.position, vp);
  const w = f.width * vp.pxPerInch;
  const d = f.depth * vp.pxPerInch;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(f.rotation);
  ctx.fillStyle = selected ? 'rgba(79,124,255,0.18)' : '#ffffff';
  ctx.strokeStyle = selected ? SELECTED_STROKE : '#1f2540';
  ctx.lineWidth = 1.1;
  ctx.fillRect(-w / 2, -d / 2, w, d);
  ctx.strokeRect(-w / 2, -d / 2, w, d);
  drawFurnitureSymbol(ctx, f, w, d, selected);
  ctx.fillStyle = selected ? SELECTED_STROKE : '#5a607a';
  ctx.font = '500 9px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = FURNITURE_DEFAULTS[f.kind]?.label ?? f.kind;
  ctx.fillText(label, 0, d / 2 + 8);
  ctx.restore();
}

// Per-symbol interior hint — keeps the symbol readable beyond just a label.
function drawFurnitureSymbol(
  ctx: CanvasRenderingContext2D, f: FurnitureItem, w: number, d: number, selected: boolean,
) {
  const stroke = selected ? SELECTED_STROKE : '#5a607a';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.9;
  const symbol = furnitureSymbolFor(f.kind);
  switch (symbol) {
    case 'bed': {
      // Headboard band on the +y side + pillow rectangles.
      ctx.fillStyle = selected ? 'rgba(79,124,255,0.20)' : '#e8ebf3';
      const band = Math.min(d * 0.18, 12);
      ctx.fillRect(-w / 2, -d / 2, w, band);
      ctx.strokeRect(-w / 2, -d / 2, w, band);
      const pillowH = band * 0.7;
      const pillowY = -d / 2 + band + 3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-w * 0.35, pillowY, w * 0.25, pillowH);
      ctx.strokeRect(-w * 0.35, pillowY, w * 0.25, pillowH);
      ctx.fillRect( w * 0.10, pillowY, w * 0.25, pillowH);
      ctx.strokeRect( w * 0.10, pillowY, w * 0.25, pillowH);
      break;
    }
    case 'sofa': {
      // Two cushions inset; back band along one long edge.
      const back = Math.min(d * 0.30, 12);
      ctx.fillStyle = selected ? 'rgba(79,124,255,0.18)' : '#e8ebf3';
      ctx.fillRect(-w / 2, -d / 2, w, back);
      ctx.strokeRect(-w / 2, -d / 2, w, back);
      const cushW = (w - 8) / 2;
      const cushY = -d / 2 + back + 3;
      const cushH = d - back - 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-cushW - 2, cushY, cushW, cushH);
      ctx.strokeRect(-cushW - 2, cushY, cushW, cushH);
      ctx.fillRect(2, cushY, cushW, cushH);
      ctx.strokeRect(2, cushY, cushW, cushH);
      break;
    }
    case 'table':
    case 'chair':
      // Single inset rectangle hints at top surface vs frame.
      ctx.strokeRect(-w / 2 + 3, -d / 2 + 3, w - 6, d - 6);
      break;
    case 'office-chair': {
      // 5-star caster base + round seat + arc backrest at -d side.
      const seatR = Math.min(w, d) * 0.34;
      const baseR = Math.min(w, d) * 0.46;
      // 5 spokes radiating from center, caster dot at each end.
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) {
        // Start from -π/2 (back) so spokes splay out evenly.
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const ex = Math.cos(a) * baseR;
        const ey = Math.sin(a) * baseR;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Seat circle (on top of base).
      ctx.beginPath();
      ctx.arc(0, 0, seatR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Backrest arc at -d/2 side (the back).
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, seatR + 1.5, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
      ctx.lineWidth = 0.9;
      break;
    }
    case 'toilet': {
      // Tank (rounded rect at back) + elongated bowl + smaller inner opening.
      const tankInset = Math.min(w * 0.06, 1.5);
      const tankH = d * 0.26;
      const bowlTop = -d / 2 + tankH + 1;
      const bowlH = d - tankH - 3;
      const bowlInset = w * 0.05;
      const innerInset = bowlInset + 1.5;
      const innerYInset = 2;
      const bowlCornerR = w * 0.30;
      ctx.fillStyle = '#ffffff';
      // Tank
      pathRoundedRect(ctx, -w / 2 + tankInset, -d / 2 + 1, w - 2 * tankInset, tankH, 2);
      ctx.fill();
      ctx.stroke();
      // Bowl (rounded rect — rounded on all corners; reads as the seat outline)
      pathRoundedRect(ctx, -w / 2 + bowlInset, bowlTop, w - 2 * bowlInset, bowlH, bowlCornerR);
      ctx.fill();
      ctx.stroke();
      // Inner opening (water area) — smaller rounded rect inset within bowl
      pathRoundedRect(
        ctx,
        -w / 2 + innerInset,
        bowlTop + innerYInset,
        w - 2 * innerInset,
        bowlH - 2 * innerYInset,
        bowlCornerR - 2,
      );
      ctx.stroke();
      break;
    }
    case 'sink-bath': {
      // Vanity / pedestal sink: inset basin + X + circle drain + faucet dot.
      const pad = 3;
      const bx = -w / 2 + pad, by = -d / 2 + pad;
      const bw = w - 2 * pad, bh = d - 2 * pad;
      // Inset basin
      ctx.strokeRect(bx, by, bw, bh);
      // X across basin (water-flow / drain indicator)
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + bw, by + bh);
      ctx.moveTo(bx + bw, by);
      ctx.lineTo(bx, by + bh);
      ctx.stroke();
      // Drain circle in the center
      const drainR = Math.min(w, d) * 0.10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, drainR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Faucet at the back (-d side)
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(0, -d / 2 + 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sink-kitchen': {
      // Kitchen sink: double basin with X + drain in each + faucet at back.
      const pad = 3;
      const gap = 2;
      const bw = (w - 2 * pad - gap) / 2;
      const bh = d - 2 * pad;
      const by = -d / 2 + pad;
      for (const sx of [-1, 1]) {
        const bx = sx === -1 ? -w / 2 + pad : pad + gap / 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bw, by + bh);
        ctx.moveTo(bx + bw, by);
        ctx.lineTo(bx, by + bh);
        ctx.stroke();
        const drainR = Math.min(bw, bh) * 0.16;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bx + bw / 2, by + bh / 2, drainR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Faucet at the back, centered
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(0, -d / 2 + 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fridge': {
      // Horizontal split (door / freezer).
      ctx.beginPath();
      ctx.moveTo(-w / 2, -d * 0.10);
      ctx.lineTo( w / 2, -d * 0.10);
      ctx.stroke();
      break;
    }
    case 'stove': {
      // 4 burners.
      const r = Math.min(w, d) * 0.18;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * w * 0.22, sy * d * 0.22, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'bathtub': {
      // Inset oval inside the tub rectangle + drain circle.
      const pad = Math.min(w, d) * 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2 - pad, d / 2 - pad, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Drain circle inside the tub, opposite the faucet end.
      const drainR = Math.min(w, d) * 0.08;
      ctx.beginPath();
      ctx.arc(0, d / 2 - pad - drainR - 2, drainR, 0, Math.PI * 2);
      ctx.stroke();
      // Faucet dot at one short end.
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(0, -d / 2 + pad + 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cabinet-base': {
      // Base cabinet: counter outline + inset front-edge line (door fronts) +
      // tick marks for door splits. Reads as "counter with doors below".
      const front = -d / 2 + Math.min(d * 0.10, 2.5);
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 2, front);
      ctx.lineTo( w / 2 - 2, front);
      ctx.stroke();
      // Door splits — vertical tick marks at ~30" intervals along front.
      const doors = Math.max(1, Math.round(w / 30));
      for (let i = 1; i < doors; i++) {
        const x = -w / 2 + (w * i) / doors;
        ctx.beginPath();
        ctx.moveTo(x, front);
        ctx.lineTo(x, d / 2 - 2);
        ctx.stroke();
      }
      break;
    }
    case 'cabinet-upper': {
      // Upper cabinet: drawn with a DASHED outline since it hangs above the
      // counter (hidden line per architectural convention).
      ctx.save();
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(-w / 2 + 1.5, -d / 2 + 1.5, w - 3, d - 3);
      // Diagonal split lines for doors.
      const doors = Math.max(1, Math.round(w / 30));
      for (let i = 1; i < doors; i++) {
        const x = -w / 2 + (w * i) / doors;
        ctx.beginPath();
        ctx.moveTo(x, -d / 2 + 1.5);
        ctx.lineTo(x, d / 2 - 1.5);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'shower': {
      // Inset border (shower pan) + X across + drain circle in middle.
      const pad = 3;
      const bx = -w / 2 + pad, by = -d / 2 + pad;
      const bw = w - 2 * pad, bh = d - 2 * pad;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + bw, by + bh);
      ctx.moveTo(bx + bw, by);
      ctx.lineTo(bx, by + bh);
      ctx.stroke();
      const drainR = Math.min(w, d) * 0.10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, drainR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Small inner dot in the drain
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(0, 0, drainR * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'generic':
      // No interior detail — the outer rect + label is enough.
      break;
  }
}

// Trace a rounded rectangle into the current path (does not stroke/fill).
function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// ─── Dimensions ───────────────────────────────────────────────────────────────

const DIM_COLOR = '#5a607a';

export function drawDimension(
  ctx: CanvasRenderingContext2D, d: Dimension, level: Level, vp: Viewport, selected: boolean,
) {
  // Resolve the anchors to world points. If either has gone stale (the
  // anchored object was deleted), skip drawing.
  const a = resolveDimAnchor(d.start, level);
  const b = resolveDimAnchor(d.end, level);
  if (!a || !b) return;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return;
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;

  const dimStartW = { x: a.x + nx * d.offset, y: a.y + ny * d.offset };
  const dimEndW   = { x: b.x + nx * d.offset, y: b.y + ny * d.offset };

  const sStart  = worldToScreen(a, vp);
  const sEnd    = worldToScreen(b, vp);
  const sDimSt  = worldToScreen(dimStartW, vp);
  const sDimEn  = worldToScreen(dimEndW, vp);

  const color = selected ? SELECTED_STROKE : DIM_COLOR;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.9;

  // Extension lines — from each measured point to just past the dim line.
  const extPastPx = 4;
  const screenNX = sDimSt.x - sStart.x;
  const screenNY = sDimSt.y - sStart.y;
  const extLen = Math.hypot(screenNX, screenNY);
  const extNX = extLen > 0 ? screenNX / extLen : 0;
  const extNY = extLen > 0 ? screenNY / extLen : 0;
  ctx.beginPath();
  ctx.moveTo(sStart.x + extNX * 2, sStart.y + extNY * 2);
  ctx.lineTo(sDimSt.x + extNX * extPastPx, sDimSt.y + extNY * extPastPx);
  ctx.moveTo(sEnd.x + extNX * 2, sEnd.y + extNY * 2);
  ctx.lineTo(sDimEn.x + extNX * extPastPx, sDimEn.y + extNY * extPastPx);
  ctx.stroke();

  // Dim line.
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(sDimSt.x, sDimSt.y);
  ctx.lineTo(sDimEn.x, sDimEn.y);
  ctx.stroke();

  // Architectural ticks (short 45° slashes) at each end of the dim line.
  const angle = Math.atan2(sDimEn.y - sDimSt.y, sDimEn.x - sDimSt.x);
  const tickHalf = 4;
  const drawTick = (cx: number, cy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-tickHalf, 0);
    ctx.lineTo( tickHalf, 0);
    ctx.stroke();
    ctx.restore();
  };
  ctx.lineWidth = 1.4;
  drawTick(sDimSt.x, sDimSt.y);
  drawTick(sDimEn.x, sDimEn.y);

  // Measurement text — centered on the dim line, rotated to read along it,
  // and flipped 180° if it would otherwise read upside-down.
  const midX = (sDimSt.x + sDimEn.x) / 2;
  const midY = (sDimSt.y + sDimEn.y) / 2;
  let textAngle = angle;
  if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) textAngle += Math.PI;
  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(textAngle);
  ctx.fillStyle = color;
  ctx.font = '600 11px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(formatImperial(L), 0, -3);
  ctx.restore();
}

// ─── Composite scene draw ─────────────────────────────────────────────────────

// Ghost silhouette of the floor below, drawn under the active floor so walls,
// stairs, and rooms can be aligned across floors. Walls fill as translucent
// grey; stairs show a dashed footprint; room labels are faint.
export function drawFloorUnderlay(ctx: CanvasRenderingContext2D, level: Level, vp: Viewport) {
  ctx.save();
  ctx.setLineDash([]);
  // One combined path + a single fill so overlapping walls don't double-darken
  // at corners — the silhouette reads as one continuous shape, not stacked bars.
  ctx.fillStyle = 'rgba(120, 128, 152, 0.32)';
  ctx.beginPath();
  for (const w of level.walls) {
    const corners = wallPolygon(w);
    if (corners.length < 4) continue;
    corners.forEach((c, i) => {
      const s = worldToScreen(c, vp);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
  }
  ctx.fill();
  // Stair footprints — dashed rotated rectangle of the bounding extents.
  ctx.strokeStyle = 'rgba(90, 98, 122, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 4]);
  for (const st of level.stairs) {
    const { hx, hy } = stairHalfExtents(st);
    const cs = Math.cos(st.rotation), sn = Math.sin(st.rotation);
    const local = [{ x: -hx, y: -hy }, { x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy }];
    ctx.beginPath();
    local.forEach((p, i) => {
      const wx = st.position.x + cs * p.x - sn * p.y;
      const wy = st.position.y + sn * p.x + cs * p.y;
      const s = worldToScreen({ x: wx, y: wy }, vp);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(80, 86, 110, 0.7)';
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of level.roomLabels) {
    const s = worldToScreen(r.position, vp);
    ctx.fillText(r.name.toUpperCase(), s.x, s.y);
  }
  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  level: Level,
  vp: Viewport,
  gridInches: number,
  gridVisible: boolean,
  selections: Selection[],
  underlay?: Level | null,
) {
  drawGrid(ctx, vp, gridInches, gridVisible);
  if (underlay) drawFloorUnderlay(ctx, underlay, vp);

  const selWallIds = new Set<string>();
  const selDoorIds = new Set<string>();
  const selWinIds = new Set<string>();
  const selFurnIds = new Set<string>();
  const selStairIds = new Set<string>();
  const selLabelIds = new Set<string>();
  const selDimIds = new Set<string>();
  const selLineIds = new Set<string>();
  const selTextIds = new Set<string>();
  for (const s of selections) {
    if (s.kind === 'wall') selWallIds.add(s.id);
    else if (s.kind === 'door') selDoorIds.add(s.id);
    else if (s.kind === 'window') selWinIds.add(s.id);
    else if (s.kind === 'furniture') selFurnIds.add(s.id);
    else if (s.kind === 'stair') selStairIds.add(s.id);
    else if (s.kind === 'roomLabel') selLabelIds.add(s.id);
    else if (s.kind === 'dimension') selDimIds.add(s.id);
    else if (s.kind === 'line') selLineIds.add(s.id);
    else if (s.kind === 'text') selTextIds.add(s.id);
  }

  drawWalls(ctx, level.walls, level.doors, level.windows, vp, selWallIds);
  const wallById = new Map(level.walls.map(w => [w.id, w]));
  for (const d of level.doors) {
    const wall = wallById.get(d.wallId);
    if (wall) drawDoor(ctx, d, wall, vp, selDoorIds.has(d.id));
  }
  for (const win of level.windows) {
    const wall = wallById.get(win.wallId);
    if (wall) drawWindow(ctx, win, wall, vp, selWinIds.has(win.id));
  }
  for (const f of level.furniture)   drawFurniture(ctx, f, vp, selFurnIds.has(f.id));
  for (const s of level.stairs)      drawStair(ctx, s, vp, selStairIds.has(s.id));
  for (const l of (level.lines ?? [])) drawLine(ctx, l, vp, selLineIds.has(l.id));
  // Boundaries first so labels sit on top.
  for (const r of level.roomLabels)  drawRoomBoundary(ctx, r, vp, selLabelIds.has(r.id));
  for (const r of level.roomLabels)  drawRoomLabel(ctx, r, vp, selLabelIds.has(r.id));
  for (const t of (level.texts ?? [])) drawText(ctx, t, vp, selTextIds.has(t.id));
  for (const dm of level.dimensions) drawDimension(ctx, dm, level, vp, selDimIds.has(dm.id));
}

// Render a SectionCut on the plan: a dashed cut line spanning [start, end]
// along its parallel axis at the fixed `position` on the perpendicular axis,
// with circle labels at each end (A / A') and an arrowhead on each circle
// pointing in the viewing direction. Ghosts draw at 70% opacity.
export function drawSectionCutSymbol(
  ctx: CanvasRenderingContext2D,
  cut: SectionCut,
  viewport: Viewport,
  ghost: boolean,
  selected = false,
) {
  const a: Vec2 = cut.axis === 'x'
    ? { x: cut.start, y: cut.position }
    : { x: cut.position, y: cut.start };
  const b: Vec2 = cut.axis === 'x'
    ? { x: cut.end,   y: cut.position }
    : { x: cut.position, y: cut.end   };
  const sa = worldToScreen(a, viewport);
  const sb = worldToScreen(b, viewport);
  // Perpendicular unit vector on screen — points in the viewing direction
  // (cut.facing). For axis='x' that's vertical; for axis='y' horizontal.
  // World Y is screen-down, so positive world Y → positive screen Y.
  const nx = cut.axis === 'x' ? 0 : cut.facing;
  const ny = cut.axis === 'x' ? cut.facing : 0;

  ctx.save();
  ctx.globalAlpha = ghost ? 0.7 : 1;
  // Selection halo — thick semi-transparent stroke under the dashed cut
  // line so the user can see at a glance which cut is selected.
  if (selected) {
    ctx.strokeStyle = 'rgba(79,124,255,0.30)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3B82F6';
  ctx.fillStyle   = '#3B82F6';
  ctx.lineWidth   = 1.5;
  // Cut line — dashed.
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Circle markers + label at each end.
  const R = 9;
  for (const [s, primeLabel] of [[sa, ''], [sb, "'"]] as const) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#3B82F6';
    ctx.stroke();
    ctx.font = 'bold 11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${cut.name}${primeLabel}`, s.x, s.y);
  }

  // Viewing-direction arrow at the midpoint, perpendicular to the cut line.
  const mid = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
  const STEM = 14;
  const HEAD = 5;
  const tipX = mid.x + nx * STEM;
  const tipY = mid.y + ny * STEM;
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.beginPath();
  if (cut.axis === 'x') {
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - HEAD, tipY - HEAD * cut.facing);
    ctx.lineTo(tipX + HEAD, tipY - HEAD * cut.facing);
  } else {
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - HEAD * cut.facing, tipY - HEAD);
    ctx.lineTo(tipX - HEAD * cut.facing, tipY + HEAD);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Annotation line ──────────────────────────────────────────────────────────
export function drawLine(
  ctx: CanvasRenderingContext2D, l: LineEntity, vp: Viewport, selected: boolean,
) {
  const a = worldToScreen(l.start, vp);
  const b = worldToScreen(l.end, vp);
  ctx.save();
  ctx.strokeStyle = selected ? SELECTED_STROKE : LINE_COLOR_HEX[l.color ?? 'black'];
  ctx.lineWidth = LINE_WEIGHT_PX[l.weight] * Math.max(1, vp.pxPerInch / 4);
  // Cap lineWidth so it doesn't explode at extreme zoom — visual only.
  if (ctx.lineWidth > 8) ctx.lineWidth = 8;
  const dashIn = LINE_DASH_INCHES[l.style];
  ctx.setLineDash(dashIn.map(d => d * vp.pxPerInch));
  ctx.lineCap = l.style === 'solid' ? 'butt' : 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
