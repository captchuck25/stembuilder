// Section drafting edit helpers.
//
// Operations on the `project.sectionDrafting.typical` snapshot: hit-testing,
// adding new primitives (line / text / dim), updating, and removing. Each
// helper returns a NEW `Project` object — callers should pass the result to
// `onChange` to commit.

import {
  PrimLine, PrimPolyline, PrimText, PrimTOLine, PrimDimChain, PrimDimLinear,
  PrimPitchSymbol, Project, SectionLineStyle, SectionPrimitive, Vec2,
  formatImperial,
} from './types';

// ── ID generation ───────────────────────────────────────────────────────────
// New user-drawn primitives need stable unique IDs. We combine a base36
// timestamp with a process-local counter so IDs are sortable + unique even
// when the user draws many primitives in a single second.
let nextUserId = 0;
export function makeUserPrimId(prefix: string): string {
  nextUserId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextUserId.toString(36)}`;
}

// ── Hit-testing ─────────────────────────────────────────────────────────────
// Returns true if the world-coord `point` is within `tolWorld` of the
// primitive's drawable geometry. Used by the Select tool.

export function hitTestPrimitive(
  p: SectionPrimitive,
  point: Vec2,
  tolWorld: number,
): boolean {
  switch (p.kind) {
    case 'line':
      return distanceToSegment(point, p.a, p.b) <= tolWorld;
    case 'polyline': {
      for (let i = 0; i < p.verts.length - 1; i++) {
        if (distanceToSegment(point, p.verts[i], p.verts[i + 1]) <= tolWorld) return true;
      }
      if (p.closed && p.verts.length > 1) {
        if (distanceToSegment(point, p.verts[p.verts.length - 1], p.verts[0]) <= tolWorld) return true;
      }
      return false;
    }
    case 'text':
      return Math.hypot(p.at.x - point.x, p.at.y - point.y) <= tolWorld;
    case 'toLine':
      return distanceToSegment(point,
        { x: p.leftXIn, y: p.yIn },
        { x: p.rightXIn, y: p.yIn },
      ) <= tolWorld;
    case 'dimChain':
      return distanceToSegment(point,
        { x: p.xIn, y: p.y1In },
        { x: p.xIn, y: p.y2In },
      ) <= tolWorld;
    case 'dimLinear': {
      // Clickable anywhere on the dimension's drawn geometry: the dim line
      // (offset from AB), the label (which sits on the dim line), AND the two
      // extension lines from the measured points out to the dim line. A user
      // clicks the whole dimension, not just the thin dim line — hitting only
      // the dim line made dims feel un-selectable / un-erasable.
      const dx = p.b.x - p.a.x;
      const dy = p.b.y - p.a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return false;
      const nx = -dy / len;
      const ny =  dx / len;
      const da = { x: p.a.x + nx * p.offset, y: p.a.y + ny * p.offset };
      const db = { x: p.b.x + nx * p.offset, y: p.b.y + ny * p.offset };
      // The measurement label sits ~a label-height OFF the dim line, so the
      // natural click target (the number) lands beyond the thin-line tolerance.
      // Widen the dim-line pick band (world inches, ~the label height) so
      // clicking the number selects the dimension; keep the extension lines at
      // the normal tolerance so the pick area doesn't get greedy.
      const DIM_PICK = Math.max(tolWorld, 12);
      return distanceToSegment(point, da, db)   <= DIM_PICK   // dim line + label
          || distanceToSegment(point, p.a, da)  <= tolWorld   // extension line A
          || distanceToSegment(point, p.b, db)  <= tolWorld;  // extension line B
    }
    case 'pitchSymbol':
      return Math.hypot(p.anchor.x - point.x, p.anchor.y - point.y) <= tolWorld;
    case 'hatch':
      // A hatch is a filled region — selecting anywhere INSIDE the polygon
      // counts as a hit. Also accept edge proximity (matches closed-polyline
      // behaviour) so very thin hatches stay clickable.
      if (pointInPolygon(point, p.verts)) return true;
      for (let i = 0; i < p.verts.length - 1; i++) {
        if (distanceToSegment(point, p.verts[i], p.verts[i + 1]) <= tolWorld) return true;
      }
      if (p.verts.length > 1
        && distanceToSegment(point, p.verts[p.verts.length - 1], p.verts[0]) <= tolWorld) {
        return true;
      }
      return false;
  }
}

// Standard even-odd point-in-polygon test in world coords.
function pointInPolygon(p: Vec2, verts: Vec2[]): boolean {
  if (verts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    const intersects = ((yi > p.y) !== (yj > p.y))
      && (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

// Picks the topmost primitive at `point` (within `tolWorld`), or null. The
// snapshot order is "drawn later = on top," so we iterate from the end.
export function hitTestTopmost(
  primitives: SectionPrimitive[],
  point: Vec2,
  tolWorld: number,
): SectionPrimitive | null {
  for (let i = primitives.length - 1; i >= 0; i--) {
    if (hitTestPrimitive(primitives[i], point, tolWorld)) return primitives[i];
  }
  return null;
}

// ── Project mutators ────────────────────────────────────────────────────────
// All return a new Project; the snapshot itself is shallow-copied so React
// state updates are detected.

// `cutId` selects which drafting snapshot to read/write. `null` (or omitted)
// means the Typical section; a string id selects sectionDrafting.cuts[cutId].
// All section-edit helpers below accept this same parameter so the same
// machinery edits the typical section or any per-cut snapshot.
export type CutScope = string | null;

export function getDraftingPrimitives(project: Project, cutId: CutScope = null): SectionPrimitive[] {
  if (cutId == null) return project.sectionDrafting?.typical ?? [];
  return project.sectionDrafting?.cuts?.[cutId] ?? [];
}

export function setDraftingPrimitives(project: Project, next: SectionPrimitive[], cutId: CutScope = null): Project {
  const current = project.sectionDrafting ?? {};
  if (cutId == null) {
    return { ...project, sectionDrafting: { ...current, typical: next } };
  }
  return {
    ...project,
    sectionDrafting: {
      ...current,
      cuts: { ...(current.cuts ?? {}), [cutId]: next },
    },
  };
}

export function addPrimitive(project: Project, prim: SectionPrimitive, cutId: CutScope = null): Project {
  const current = getDraftingPrimitives(project, cutId);
  return setDraftingPrimitives(project, [...current, prim], cutId);
}

export function removePrimitives(project: Project, ids: Set<string>, cutId: CutScope = null): Project {
  if (ids.size === 0) return project;
  const current = getDraftingPrimitives(project, cutId);
  const next = current.filter(p => !ids.has(p.id));
  if (next.length === current.length) return project;
  return setDraftingPrimitives(project, next, cutId);
}

// ── Factory: user line ──────────────────────────────────────────────────────

export function makeUserLine(a: Vec2, b: Vec2, style: SectionLineStyle = 'normal'): PrimLine {
  return { id: makeUserPrimId('user-line'), kind: 'line', a, b, style };
}

// User-placed text label. Anchor `at` is in world inches; size is in
// "paper pixels at zoom 1.0" (same convention as the procedural labels —
// scales with zoom, doesn't change with scale mode).
export function makeUserText(at: Vec2, content: string, size = 11): PrimText {
  return {
    id: makeUserPrimId('user-text'),
    kind: 'text',
    at,
    content,
    size,
    align: 'left',
    baseline: 'middle',
  };
}

// User-placed linear dimension between two world points at perpendicular
// `offset` (signed, CCW positive from A→B).
export function makeUserDimLinear(a: Vec2, b: Vec2, offset: number): PrimDimLinear {
  return { id: makeUserPrimId('user-dim'), kind: 'dimLinear', a, b, offset };
}

// Computes the signed perpendicular offset of a point from segment AB,
// using the same convention as PrimDimLinear (CCW positive in world Y-up).
export function signedPerpendicularOffset(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  return ((p.x - a.x) * (-dy / len) + (p.y - a.y) * (dx / len));
}

// Ghost preview for the Dim tool while picking the third (offset) point.
// Renders extension lines, a dashed dim line, and a preview label of the
// distance. Mirrors the look of `drawPrimDimLinear` but in amber + dashed
// so the user knows it's not committed yet.
const DIM_GHOST_COLOR = '#F59E0B';   // amber-500

export function drawDimGhost(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  offset: number,
  zoom: number,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const nx = -dy / len;
  const ny =  dx / len;
  const da = { x: a.x + nx * offset, y: a.y + ny * offset };
  const db = { x: b.x + nx * offset, y: b.y + ny * offset };
  const sA = toScreen(a),  sB = toScreen(b);
  const sDA = toScreen(da), sDB = toScreen(db);
  ctx.save();
  ctx.strokeStyle = DIM_GHOST_COLOR;
  ctx.fillStyle = DIM_GHOST_COLOR;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  // Extension lines
  ctx.beginPath();
  ctx.moveTo(sA.x, sA.y);  ctx.lineTo(sDA.x, sDA.y);
  ctx.moveTo(sB.x, sB.y);  ctx.lineTo(sDB.x, sDB.y);
  // Dim line
  ctx.moveTo(sDA.x, sDA.y); ctx.lineTo(sDB.x, sDB.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // Anchor dots
  ctx.fillRect(sA.x - 3, sA.y - 3, 6, 6);
  ctx.fillRect(sB.x - 3, sB.y - 3, 6, 6);
  // Distance label preview
  const fontSize = 10 * zoom;
  if (fontSize >= 1) {
    const cxScr = (sDA.x + sDB.x) / 2;
    const cyScr = (sDA.y + sDB.y) / 2;
    let labelAngle = Math.atan2(sDB.y - sDA.y, sDB.x - sDA.x);
    if (Math.cos(labelAngle) < 0) labelAngle += Math.PI;
    ctx.save();
    ctx.translate(cxScr, cyScr);
    ctx.rotate(labelAngle);
    ctx.translate(0, -fontSize * 0.4);
    ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatImperial(len), 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// Build an offset copy of a line at `distance` inches, on the side of the
// line that contains `sidePoint`. Both endpoints are shifted by the same
// perpendicular vector so the result is exactly parallel.
export function offsetLineCopy(line: PrimLine, distance: number, sidePoint: Vec2): PrimLine | null {
  const { a, b, style } = line;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  // Unit perpendicular (CCW from the segment direction).
  const px = -dy / len;
  const py =  dx / len;
  // Dot product picks the side the cursor is on.
  const dot = (sidePoint.x - a.x) * px + (sidePoint.y - a.y) * py;
  const sign = dot >= 0 ? 1 : -1;
  const ox = sign * px * distance;
  const oy = sign * py * distance;
  return {
    id: makeUserPrimId('user-offset'),
    kind: 'line',
    a: { x: a.x + ox, y: a.y + oy },
    b: { x: b.x + ox, y: b.y + oy },
    style,
  };
}

// ── Explosion ───────────────────────────────────────────────────────────────
// Procedural primitives are compound: a polyline holds several edges; a
// lumber-x polyline also implies two X diagonals drawn at render time. Once
// the user enters drafting mode, we want EVERY visible line to be its own
// selectable primitive — easier to delete one piece, drag one endpoint,
// restyle one segment. `explodePrimitives` performs that conversion:
//
//   • polyline → one PrimLine per edge (+ closing edge if `closed`)
//   • lumber-x polyline → outline edges PLUS two diagonal PrimLines
//   • text / toLine / dimChain / pitchSymbol → passed through unchanged
//
// Style mapping: 'normal' and 'sheathing' carry over to lines; lumber-x
// outline and diagonals become 'normal' (their lineWidth difference is
// barely perceptible at section scales).

export function explodePrimitives(primitives: SectionPrimitive[]): SectionPrimitive[] {
  const out: SectionPrimitive[] = [];
  for (const p of primitives) {
    if (p.kind !== 'polyline') { out.push(p); continue; }
    // Preserve FILLED OPENINGS (window glass, door panels — any non-'trim' fill)
    // as intact filled polygons. Exploding them into edge lines drops the fill, so
    // windows/doors went blank on the first edit. Structural outlines ('trim' fill
    // or unfilled — wall shell, corner boards, gable trim, roof) still explode so
    // their edges stay individually editable (e.g. for roofline tweaks).
    if (p.fill && p.fill !== 'trim') { out.push(p); continue; }
    const edgeStyle: SectionLineStyle = p.style === 'sheathing' ? 'sheathing' : 'normal';
    for (let i = 0; i < p.verts.length - 1; i++) {
      out.push({
        id: makeUserPrimId('exp-edge'),
        kind: 'line',
        a: p.verts[i],
        b: p.verts[i + 1],
        style: edgeStyle,
      });
    }
    if (p.closed && p.verts.length > 1) {
      out.push({
        id: makeUserPrimId('exp-edge'),
        kind: 'line',
        a: p.verts[p.verts.length - 1],
        b: p.verts[0],
        style: edgeStyle,
      });
    }
    // Lumber-x: two diagonals (corner-to-corner of a 4-vertex closed poly).
    if (p.style === 'lumber-x' && p.closed && p.verts.length === 4) {
      out.push({
        id: makeUserPrimId('exp-diag'),
        kind: 'line',
        a: p.verts[0], b: p.verts[2],
        style: 'normal',
      });
      out.push({
        id: makeUserPrimId('exp-diag'),
        kind: 'line',
        a: p.verts[1], b: p.verts[3],
        style: 'normal',
      });
    }
  }
  return out;
}

// ── Endpoint editing ────────────────────────────────────────────────────────

// Returns 'a' or 'b' if `cursor` is within `tolWorld` of one of the line's
// endpoints, or null otherwise. Used by the Select tool to start a handle
// drag.
export function hitTestLineHandle(p: PrimLine, cursor: Vec2, tolWorld: number): 'a' | 'b' | null {
  const da = Math.hypot(p.a.x - cursor.x, p.a.y - cursor.y);
  const db = Math.hypot(p.b.x - cursor.x, p.b.y - cursor.y);
  // Prefer the closer endpoint when both are in range (rare but possible
  // on very short lines).
  if (da <= tolWorld && (db > tolWorld || da <= db)) return 'a';
  if (db <= tolWorld) return 'b';
  return null;
}

// Translate a set of primitives (by id) by (dx, dy) in world inches. Used by
// the Select tool's "drag the body of a line" gesture. Translates all known
// primitive kinds — line endpoints, polyline verts, text/dim anchors — so
// the same gesture works on heterogeneous multi-selections.
export function translatePrimitivesBy(
  project: Project,
  ids: Set<string>,
  dx: number,
  dy: number,
  cutId: CutScope = null,
): Project {
  if (ids.size === 0 || (dx === 0 && dy === 0)) return project;
  const current = getDraftingPrimitives(project, cutId);
  const shift = (v: Vec2): Vec2 => ({ x: v.x + dx, y: v.y + dy });
  let changed = false;
  const next = current.map(p => {
    if (!ids.has(p.id)) return p;
    changed = true;
    switch (p.kind) {
      case 'line':       return { ...p, a: shift(p.a), b: shift(p.b) };
      case 'polyline':   return { ...p, verts: p.verts.map(shift) };
      case 'text':       return { ...p, at: shift(p.at) };
      case 'dimLinear':  return { ...p, a: shift(p.a), b: shift(p.b) };
      // T/O lines, dim chains, pitch symbols aren't user-translatable from
      // the section drafting flow — they're elevation-anchored primitives
      // generated by the procedural builder.
      default:           return p;
    }
  });
  if (!changed) return project;
  return setDraftingPrimitives(project, next, cutId);
}

// Hit-test the BODY of a line (not its endpoints). Returns true if the point
// is within `tol` of the segment AND outside the endpoint-handle zones.
// Used by the Select tool to distinguish "drag the whole line" (body) from
// "drag an endpoint" (handle).
export function hitTestLineBody(line: PrimLine, p: Vec2, tol: number, endpointTol: number): boolean {
  const da = Math.hypot(p.x - line.a.x, p.y - line.a.y);
  const db = Math.hypot(p.x - line.b.x, p.y - line.b.y);
  if (da <= endpointTol || db <= endpointTol) return false;
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = Math.max(0, Math.min(1, ((p.x - line.a.x) * dx + (p.y - line.a.y) * dy) / len2));
  const px = line.a.x + dx * t;
  const py = line.a.y + dy * t;
  return Math.hypot(p.x - px, p.y - py) <= tol;
}

// Update one endpoint of a PrimLine in the snapshot. Returns a new Project.
// No-op if the primitive doesn't exist or isn't a line.
export function moveLineEndpoint(
  project: Project,
  primId: string,
  endpoint: 'a' | 'b',
  to: Vec2,
  cutId: CutScope = null,
): Project {
  const current = getDraftingPrimitives(project, cutId);
  let changed = false;
  const next = current.map(p => {
    if (p.id !== primId || p.kind !== 'line') return p;
    changed = true;
    return endpoint === 'a' ? { ...p, a: to } : { ...p, b: to };
  });
  if (!changed) return project;
  return setDraftingPrimitives(project, next, cutId);
}

// Render small square handles at the endpoints of every selected PrimLine.
// Phase F drag-edit clicks these to start an endpoint drag.

const HANDLE_COLOR = '#3B82F6';
const HANDLE_SIZE = 5;   // half-size in screen pixels

export function drawLineHandles(
  ctx: CanvasRenderingContext2D,
  primitives: SectionPrimitive[],
  selection: Set<string>,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  if (selection.size === 0) return;
  ctx.save();
  ctx.strokeStyle = HANDLE_COLOR;
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (const p of primitives) {
    if (!selection.has(p.id) || p.kind !== 'line') continue;
    for (const endpoint of [p.a, p.b]) {
      const s = toScreen(endpoint);
      ctx.fillRect(s.x - HANDLE_SIZE, s.y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
      ctx.strokeRect(s.x - HANDLE_SIZE, s.y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
    }
  }
  ctx.restore();
}

// Re-exports so consumers can build other primitive types in one import.
export type {
  PrimLine, PrimPolyline, PrimText, PrimTOLine, PrimDimChain, PrimPitchSymbol,
};

// ── Box selection ───────────────────────────────────────────────────────────
// Drag a rectangle on the canvas to select primitives. Two semantics, by
// drag direction (matches AutoCAD / STEM Sketch convention):
//   • Left-to-right (end.x > start.x): WINDOW — only primitives ENTIRELY
//     inside the box qualify. Visual: solid blue.
//   • Right-to-left (end.x < start.x): CROSSING — any primitive the box
//     touches qualifies. Visual: dashed green.

export interface BoxRect { minX: number; maxX: number; minY: number; maxY: number; }

export function pointInRect(p: Vec2, r: BoxRect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
}

// Standard 2D segment-segment intersection. Returns true if the open segments
// (excluding zero-length cases) properly intersect.
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abx = b.x - a.x, aby = b.y - a.y;
  const cdx = d.x - c.x, cdy = d.y - c.y;
  const denom = abx * cdy - aby * cdx;
  if (Math.abs(denom) < 1e-9) return false;   // parallel / collinear
  const t = ((c.x - a.x) * cdy - (c.y - a.y) * cdx) / denom;
  const u = ((c.x - a.x) * aby - (c.y - a.y) * abx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// Returns the intersection point of two segments, or null if they don't
// properly cross (parallel, or intersection is outside either segment).
export function segmentIntersectionPoint(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const abx = b.x - a.x, aby = b.y - a.y;
  const cdx = d.x - c.x, cdy = d.y - c.y;
  const denom = abx * cdy - aby * cdx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * cdy - (c.y - a.y) * cdx) / denom;
  const u = ((c.x - a.x) * aby - (c.y - a.y) * abx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * abx, y: a.y + t * aby };
}

// Intersection of a SEGMENT (ab) with an infinite LINE through (cd). Used by
// the Trim tool: AutoCAD-style trim treats the cutting "line" as if it
// extended forever, so a short cutting segment can still trim a longer
// target it doesn't physically cross. The target still has to be intersected
// within its own [0,1] segment.
export function segmentInfiniteLineIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const abx = b.x - a.x, aby = b.y - a.y;
  const cdx = d.x - c.x, cdy = d.y - c.y;
  const denom = abx * cdy - aby * cdx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * cdy - (c.y - a.y) * cdx) / denom;
  if (t < 0 || t > 1) return null;
  return { x: a.x + t * abx, y: a.y + t * aby };
}

// AutoCAD-style trim: replace the endpoint of `target` that lies on the
// same side of `cutting` as the click point with the intersection point.
// Returns the trimmed line, or null if the two lines don't properly cross.
export function trimLineAtCut(
  target: PrimLine,
  cutting: PrimLine,
  clickPoint: Vec2,
): PrimLine | null {
  // Treat the cutting line as an infinite line — the cutting segment doesn't
  // have to physically reach the target. The intersection must still land
  // somewhere on the TARGET segment (between its endpoints), and we drop
  // degenerate corner-touch trims (intersection exactly at an endpoint)
  // since trimming there either erases the line or no-ops.
  const intersection = segmentInfiniteLineIntersection(target.a, target.b, cutting.a, cutting.b);
  if (!intersection) return null;
  const epsilon = 1e-6;
  const atA = Math.hypot(intersection.x - target.a.x, intersection.y - target.a.y) < epsilon;
  const atB = Math.hypot(intersection.x - target.b.x, intersection.y - target.b.y) < epsilon;
  if (atA || atB) return null;
  const cdx = cutting.b.x - cutting.a.x;
  const cdy = cutting.b.y - cutting.a.y;
  const sideOf = (pt: Vec2) =>
    Math.sign(cdx * (pt.y - cutting.a.y) - cdy * (pt.x - cutting.a.x));
  const clickSide = sideOf(clickPoint);
  const aSide = sideOf(target.a);
  // Replace whichever endpoint is on the SAME side as the click. If the
  // click is exactly ON the cutting line (clickSide == 0), pick whichever
  // endpoint is closer to the click — this still trims the half the user
  // is closest to.
  let trimA: boolean;
  if (clickSide === 0) {
    const dA = Math.hypot(target.a.x - clickPoint.x, target.a.y - clickPoint.y);
    const dB = Math.hypot(target.b.x - clickPoint.x, target.b.y - clickPoint.y);
    trimA = dA <= dB;
  } else {
    trimA = aSide === clickSide;
  }
  return trimA ? { ...target, a: intersection } : { ...target, b: intersection };
}

// STEM Sketch trim model: click any sub-segment of `target` that's been cut
// by other line/polyline primitives and that one segment is removed. The
// target is conceptually split at every crossing, then the interval that
// contains `clickPoint` is dropped and the others survive. Returns:
//   { keep: PrimLine[] }   one or more survivors (when ≥1 cut exists and
//                          the click landed on a real interval)
//   null                   no cuts found, or click missed all intervals
//                          (caller should treat as a no-op)
export function trimLineByClick(
  target: PrimLine,
  others: SectionPrimitive[],
  clickPoint: Vec2,
  opts?: { tipGuard?: number },
): { keep: PrimLine[] } | null {
  const dx = target.b.x - target.a.x;
  const dy = target.b.y - target.a.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return null;
  // Collect every cut as a parametric position in WORLD UNITS along the
  // target (so the math mirrors how the 2D plan trims walls).
  const rawCuts: number[] = [];
  const considerSeg = (a: Vec2, b: Vec2) => {
    // Standard segment-segment intersection — both segments must overlap.
    const rX = target.b.x - target.a.x, rY = target.b.y - target.a.y;
    const sX = b.x - a.x,               sY = b.y - a.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-9) return;
    const t = ((a.x - target.a.x) * sY - (a.y - target.a.y) * sX) / denom;
    const u = ((a.x - target.a.x) * rY - (a.y - target.a.y) * rX) / denom;
    const EPS = 1e-4;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return;
    rawCuts.push(t * L);
  };
  for (const p of others) {
    if (p.id === target.id) continue;
    if (p.kind === 'line') {
      considerSeg(p.a, p.b);
    } else if (p.kind === 'polyline') {
      const n = p.verts.length;
      if (n < 2) continue;
      const segCount = p.closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        considerSeg(p.verts[i], p.verts[(i + 1) % n]);
      }
    }
  }
  // Dedup near-duplicate cuts (multi-line junctions hit the same point
  // multiple times). Tolerance is small because section/elevation units are
  // inches — 0.25" matches the plan-side trim.
  const DEDUP = 0.25;
  // Ignore cuts within this distance of either endpoint (and drop kept slivers
  // shorter than it). Defaults to ½" to match the plan-side trim, but callers
  // can shrink it — e.g. when zoomed far in — so a tiny stub near a junction is
  // still trimmable instead of being swallowed by the guard.
  const TIP_GUARD = opts?.tipGuard ?? 0.5;
  const sorted = [...rawCuts]
    .filter(t => t > TIP_GUARD && t < L - TIP_GUARD)
    .sort((a, b) => a - b);
  const cuts: number[] = [];
  for (const t of sorted) {
    if (cuts.length === 0 || Math.abs(t - cuts[cuts.length - 1]) > DEDUP) cuts.push(t);
  }
  if (cuts.length === 0) return null;
  // Project the click onto the target → click position in world units.
  const proj = ((clickPoint.x - target.a.x) * dx + (clickPoint.y - target.a.y) * dy) / (L * L);
  const clickT = Math.max(0, Math.min(L, proj * L));
  const bounds = [0, ...cuts, L];
  let removeIdx = -1;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (clickT >= bounds[i] - 0.001 && clickT <= bounds[i + 1] + 0.001) {
      removeIdx = i;
      break;
    }
  }
  if (removeIdx === -1) return null;
  const ux = dx / L, uy = dy / L;
  const keep: PrimLine[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    if (i === removeIdx) continue;
    const t0 = bounds[i], t1 = bounds[i + 1];
    if (t1 - t0 < TIP_GUARD) continue;
    keep.push({
      ...target,
      id: makeUserPrimId('user-line'),
      a: i === 0 ? target.a : { x: target.a.x + ux * t0, y: target.a.y + uy * t0 },
      b: i === bounds.length - 2 ? target.b : { x: target.a.x + ux * t1, y: target.a.y + uy * t1 },
    });
  }
  return { keep };
}

// Polyline counterpart of `trimLineByClick`. STEM Sketch model: click any
// segment of a polyline and that segment (or sub-portion of it, bracketed by
// crossings) disappears.
//
// Algorithm (much simpler than running-distance math): identify the polyline
// segment closest to the click, then bracket the click within THAT segment
// between any crossings on either side of it (or the segment's endpoints if
// no crossings exist on that side). Remove just the bracketed sub-portion.
// Closed polylines open up; open polylines may split into two pieces.
export function trimPolylineByClick(
  target: PrimPolyline,
  others: SectionPrimitive[],
  clickPoint: Vec2,
): { keep: (PrimLine | PrimPolyline)[] } | null {
  const n = target.verts.length;
  if (n < 2) return null;
  const segCount = target.closed ? n : n - 1;
  if (segCount < 1) return null;

  // Step 1 — find the polyline segment closest to the click + the click's t
  // along that segment. Project the click onto every segment and pick the
  // nearest hit; this also ignores zero-length degenerate segments.
  let bestSeg = -1;
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i < segCount; i++) {
    const a = target.verts[i];
    const b = target.verts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-12) continue;
    const projT = ((clickPoint.x - a.x) * dx + (clickPoint.y - a.y) * dy) / L2;
    const tClamp = Math.max(0, Math.min(1, projT));
    const px = a.x + dx * tClamp;
    const py = a.y + dy * tClamp;
    const d = Math.hypot(clickPoint.x - px, clickPoint.y - py);
    if (d < bestDist) { bestDist = d; bestSeg = i; bestT = tClamp; }
  }
  if (bestSeg < 0) return null;

  const segA = target.verts[bestSeg];
  const segB = target.verts[(bestSeg + 1) % n];
  const sdx = segB.x - segA.x, sdy = segB.y - segA.y;
  const segL = Math.hypot(sdx, sdy);
  if (segL === 0) return null;

  // Step 2 — collect crossings on the clicked segment only. Each comes back
  // as a t value in [0, 1] along the segment.
  const intersectAlongSeg = (c: Vec2, d: Vec2): number | null => {
    const rX = sdx, rY = sdy;
    const sX = d.x - c.x, sY = d.y - c.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((c.x - segA.x) * sY - (c.y - segA.y) * sX) / denom;
    const u = ((c.x - segA.x) * rY - (c.y - segA.y) * rX) / denom;
    const EPS = 1e-4;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return Math.max(0, Math.min(1, t));
  };
  const crossings: number[] = [];
  for (const p of others) {
    if (p.id === target.id) continue;
    if (p.kind === 'line') {
      const t = intersectAlongSeg(p.a, p.b);
      if (t != null) crossings.push(t);
    } else if (p.kind === 'polyline') {
      const pn = p.verts.length;
      const pSegCount = p.closed ? pn : pn - 1;
      for (let j = 0; j < pSegCount; j++) {
        const t = intersectAlongSeg(p.verts[j], p.verts[(j + 1) % pn]);
        if (t != null) crossings.push(t);
      }
    }
  }
  // Sort + dedup so coincident crossings (a corner where two lines meet at the
  // same place) collapse into one.
  const TIP_GUARD_T = 0.5 / segL; // ½" expressed as a t fraction
  const DEDUP_T = 0.25 / segL;
  const sorted = [...crossings].sort((a, b) => a - b);
  const dedup: number[] = [];
  for (const t of sorted) {
    if (dedup.length === 0 || Math.abs(t - dedup[dedup.length - 1]) > DEDUP_T) dedup.push(t);
  }

  // Step 3 — bracket the click between t_prev (the highest crossing < click)
  // and t_next (the lowest crossing > click). If no crossing exists on a
  // side, that boundary is the segment's natural endpoint (0 or 1). This is
  // the STEM Sketch behavior: when a segment is uncut, the whole segment is
  // removed; when it's cut, only the clicked sub-segment goes.
  let tPrev = 0;
  let tNext = 1;
  for (const t of dedup) {
    if (t < bestT - 0.001) tPrev = Math.max(tPrev, t);
    else if (t > bestT + 0.001) { tNext = t; break; }
  }

  // Step 4 — emit the survivor(s).
  const pointAt = (t: number): Vec2 => ({
    x: segA.x + sdx * t,
    y: segA.y + sdy * t,
  });
  const keep: (PrimLine | PrimPolyline)[] = [];
  const finish = (pts: Vec2[]) => {
    const cleaned: Vec2[] = [];
    for (const p of pts) {
      const last = cleaned[cleaned.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) cleaned.push(p);
    }
    if (cleaned.length < 2) return;
    if (cleaned.length === 2) {
      keep.push({
        id: makeUserPrimId('user-line'),
        kind: 'line',
        a: cleaned[0],
        b: cleaned[1],
        style: 'normal',
      });
    } else {
      keep.push({
        ...target,
        id: makeUserPrimId('user-polyline'),
        verts: cleaned,
        closed: false,
      });
    }
  };

  if (target.closed) {
    // Removing [tPrev, tNext] on segment K opens the polyline. The survivor
    // starts at the t_next point, walks forward through verts[K+1, K+2, …,
    // wrapping back to K], and ends at the t_prev point.
    const survivor: Vec2[] = [];
    if (tNext < 1 - TIP_GUARD_T) survivor.push(pointAt(tNext));
    for (let i = 0; i < n; i++) {
      const idx = (bestSeg + 1 + i) % n;
      survivor.push({ ...target.verts[idx] });
      if (idx === bestSeg) break;
    }
    if (tPrev > TIP_GUARD_T) survivor.push(pointAt(tPrev));
    finish(survivor);
  } else {
    // Open polyline: removing [tPrev, tNext] on segment K may yield two
    // pieces — one with verts[0..K] (+ tPrev point) and one with (tNext
    // point +) verts[K+1..n-1]. Either piece is dropped if it shrinks to a
    // single vertex.
    const piece1: Vec2[] = [];
    for (let i = 0; i <= bestSeg; i++) piece1.push({ ...target.verts[i] });
    if (tPrev > TIP_GUARD_T) piece1.push(pointAt(tPrev));
    const piece2: Vec2[] = [];
    if (tNext < 1 - TIP_GUARD_T) piece2.push(pointAt(tNext));
    for (let i = bestSeg + 1; i < n; i++) piece2.push({ ...target.verts[i] });
    finish(piece1);
    finish(piece2);
  }

  return keep.length > 0 ? { keep } : null;
}

// Replace a polyline primitive with zero, one, or many primitives (any mix of
// lines and polylines). Used by the polyline trim path.
export function replacePrimitiveWithMany(
  project: Project,
  primId: string,
  next: SectionPrimitive[],
  cutId: CutScope = null,
): Project {
  const current = getDraftingPrimitives(project, cutId);
  let changed = false;
  const out: SectionPrimitive[] = [];
  for (const p of current) {
    if (p.id === primId) {
      changed = true;
      for (const n of next) out.push(n);
    } else {
      out.push(p);
    }
  }
  if (!changed) return project;
  return setDraftingPrimitives(project, out, cutId);
}

// Replace a single line primitive with zero, one, or many primitives. Used
// by the click-trim path (a single line becomes its surviving segments).
export function replaceLinePrimitiveWithMany(
  project: Project,
  primId: string,
  next: PrimLine[],
  cutId: CutScope = null,
): Project {
  const current = getDraftingPrimitives(project, cutId);
  let changed = false;
  const out: SectionPrimitive[] = [];
  for (const p of current) {
    if (p.id === primId && p.kind === 'line') {
      changed = true;
      for (const n of next) out.push(n);
    } else {
      out.push(p);
    }
  }
  if (!changed) return project;
  return setDraftingPrimitives(project, out, cutId);
}

// Updates a single line primitive in the snapshot. No-op if not found.
export function replaceLinePrimitive(project: Project, primId: string, next: PrimLine, cutId: CutScope = null): Project {
  const current = getDraftingPrimitives(project, cutId);
  let changed = false;
  const out = current.map(p => {
    if (p.id !== primId || p.kind !== 'line') return p;
    changed = true;
    return next;
  });
  if (!changed) return project;
  return setDraftingPrimitives(project, out, cutId);
}

// Highlight the chosen cutting line for the Trim tool — amber, same as the
// offset source highlight, so the user's CAD muscle memory transfers.
export function drawTrimCuttingHighlight(
  ctx: CanvasRenderingContext2D,
  line: PrimLine,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const a = toScreen(line.a);
  const b = toScreen(line.b);
  ctx.save();
  ctx.strokeStyle = '#F59E0B';   // amber-500
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

export function segmentIntersectsRect(a: Vec2, b: Vec2, r: BoxRect): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  const corners: Vec2[] = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

export function primitiveInBoxSelection(p: SectionPrimitive, r: BoxRect, crossing: boolean): boolean {
  switch (p.kind) {
    case 'line':
      return crossing
        ? segmentIntersectsRect(p.a, p.b, r)
        : (pointInRect(p.a, r) && pointInRect(p.b, r));
    case 'polyline': {
      if (p.verts.length < 2) return false;
      if (crossing) {
        for (let i = 0; i < p.verts.length - 1; i++) {
          if (segmentIntersectsRect(p.verts[i], p.verts[i + 1], r)) return true;
        }
        if (p.closed) {
          if (segmentIntersectsRect(p.verts[p.verts.length - 1], p.verts[0], r)) return true;
        }
        return false;
      }
      return p.verts.every(v => pointInRect(v, r));
    }
    case 'text':        return pointInRect(p.at, r);
    case 'pitchSymbol': return pointInRect(p.anchor, r);
    case 'toLine': {
      const a = { x: p.leftXIn,  y: p.yIn };
      const b = { x: p.rightXIn, y: p.yIn };
      return crossing
        ? segmentIntersectsRect(a, b, r)
        : (pointInRect(a, r) && pointInRect(b, r));
    }
    case 'dimChain': {
      const a = { x: p.xIn, y: p.y1In };
      const b = { x: p.xIn, y: p.y2In };
      return crossing
        ? segmentIntersectsRect(a, b, r)
        : (pointInRect(a, r) && pointInRect(b, r));
    }
    case 'dimLinear': {
      const dx = p.b.x - p.a.x;
      const dy = p.b.y - p.a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return false;
      const nx = -dy / len;
      const ny =  dx / len;
      const da = { x: p.a.x + nx * p.offset, y: p.a.y + ny * p.offset };
      const db = { x: p.b.x + nx * p.offset, y: p.b.y + ny * p.offset };
      return crossing
        ? segmentIntersectsRect(da, db, r)
        : (pointInRect(da, r) && pointInRect(db, r));
    }
    case 'hatch': {
      // Same crossing/window semantics as closed polyline.
      if (p.verts.length < 2) return false;
      if (crossing) {
        for (let i = 0; i < p.verts.length - 1; i++) {
          if (segmentIntersectsRect(p.verts[i], p.verts[i + 1], r)) return true;
        }
        if (segmentIntersectsRect(p.verts[p.verts.length - 1], p.verts[0], r)) return true;
        return false;
      }
      return p.verts.every(v => pointInRect(v, r));
    }
  }
}

export function computeBoxSelection(
  primitives: SectionPrimitive[],
  start: Vec2,
  current: Vec2,
): { ids: Set<string>; crossing: boolean; rect: BoxRect } {
  const rect: BoxRect = {
    minX: Math.min(start.x, current.x),
    maxX: Math.max(start.x, current.x),
    minY: Math.min(start.y, current.y),
    maxY: Math.max(start.y, current.y),
  };
  // Right-to-left = crossing (touch); left-to-right = window (fully inside).
  const crossing = current.x < start.x;
  const ids = new Set<string>();
  for (const p of primitives) {
    if (primitiveInBoxSelection(p, rect, crossing)) ids.add(p.id);
  }
  return { ids, crossing, rect };
}

// Renders the in-progress selection rectangle. Crossing = green dashed
// (loose), window = blue solid (strict) — same visual vocabulary as
// professional CAD tools.
export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  start: Vec2,
  current: Vec2,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const a = toScreen(start);
  const b = toScreen(current);
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w < 1 && h < 1) return;
  const crossing = current.x < start.x;
  ctx.save();
  if (crossing) {
    ctx.strokeStyle = '#22C55E';
    ctx.fillStyle = 'rgba(34, 197, 94, 0.10)';
    ctx.setLineDash([4, 3]);
  } else {
    ctx.strokeStyle = '#3B82F6';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.setLineDash([]);
  }
  ctx.lineWidth = 1.2;
  ctx.fillRect(minX, minY, w, h);
  ctx.strokeRect(minX, minY, w, h);
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Selection-highlight overlay ─────────────────────────────────────────────
// Draws a thick blue stroke over each selected primitive. Called AFTER the
// section render so the highlight sits on top.

const SELECTION_COLOR = '#3B82F6';   // blue-500

export function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  primitives: SectionPrimitive[],
  selection: Set<string>,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  if (selection.size === 0) return;
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 2.5;
  for (const p of primitives) {
    if (!selection.has(p.id)) continue;
    switch (p.kind) {
      case 'line': {
        const a = toScreen(p.a), b = toScreen(p.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case 'polyline': {
        if (p.verts.length < 2) break;
        ctx.beginPath();
        const v0 = toScreen(p.verts[0]);
        ctx.moveTo(v0.x, v0.y);
        for (let i = 1; i < p.verts.length; i++) {
          const v = toScreen(p.verts[i]);
          ctx.lineTo(v.x, v.y);
        }
        if (p.closed) ctx.closePath();
        ctx.stroke();
        break;
      }
      case 'toLine': {
        const a = toScreen({ x: p.leftXIn, y: p.yIn });
        const b = toScreen({ x: p.rightXIn, y: p.yIn });
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case 'dimChain': {
        const a = toScreen({ x: p.xIn, y: p.y1In });
        const b = toScreen({ x: p.xIn, y: p.y2In });
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case 'text': {
        const at = toScreen(p.at);
        ctx.beginPath();
        ctx.arc(at.x, at.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'pitchSymbol': {
        const at = toScreen(p.anchor);
        ctx.beginPath();
        ctx.arc(at.x, at.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
  }
  ctx.restore();
}

// ── Offset-tool helpers ─────────────────────────────────────────────────────
// Highlights the SOURCE line picked for an offset operation, and renders a
// dashed ghost showing where the offset line will land.

const OFFSET_SOURCE_COLOR = '#F59E0B';   // amber-500

export function drawOffsetSource(
  ctx: CanvasRenderingContext2D,
  line: PrimLine,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const a = toScreen(line.a);
  const b = toScreen(line.b);
  ctx.save();
  ctx.strokeStyle = OFFSET_SOURCE_COLOR;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

export function drawOffsetGhost(
  ctx: CanvasRenderingContext2D,
  source: PrimLine,
  distance: number,
  sidePoint: Vec2,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const ghost = offsetLineCopy(source, distance, sidePoint);
  if (!ghost) return;
  const a = toScreen(ghost.a);
  const b = toScreen(ghost.b);
  ctx.save();
  ctx.strokeStyle = OFFSET_SOURCE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Line-tool ghost preview ─────────────────────────────────────────────────
// Dashed line from the first-click anchor to the current cursor, plus a
// small anchor marker. Called after the section render when a Line tool
// draw is in progress.

export function drawLineGhost(
  ctx: CanvasRenderingContext2D,
  anchor: Vec2,
  cursor: Vec2,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const a = toScreen(anchor);
  const c = toScreen(cursor);
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.fillStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillRect(a.x - 3, a.y - 3, 6, 6);
  ctx.restore();
}
