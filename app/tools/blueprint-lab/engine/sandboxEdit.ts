// Sandbox editing — "simple line" editing of the generated views directly on
// the composite sheet.
//
// Editable views: the ELEVATIONS and placed SECTIONS only. The floor plan (the
// source drawing) and the ROOF PLAN are NOT editable here. Edits write to the
// SAME per-view drafting buckets the dedicated tabs use, so a change made on the
// sheet also appears in the Elevations / Section Views tabs:
//   • elevation-<dir> → project.elevationDrafting[dir]   (visual only)
//   • section-<cutId> → project.sectionDrafting.cuts[cutId]
//
// The drafting snapshot REPLACES the procedural drawing, so the first edit
// "explodes" the current procedural primitives into the bucket (same as the
// tabs' "Customize this drawing") and edits proceed on that.
//
// NOTE (to design with the user): section edits that change the eave/overhang
// SHOULD propagate to the roof plan + roof — not yet wired; section edits are
// currently visual-only like elevations.
//
// Only rotation-0 primitive blocks are editable, which covers both views in Row
// mode and the upright elevations in Projected mode. All instances of a view
// share one bucket, so editing the upright instance updates the rotated copies.

import { ElevationDirection } from './elevations';
import {
  ExtendBoundary, computeLineExtend, explodePrimitives, filletLines, makeUserLine, mirrorReflector,
  reflectPrimitive, trimLineByClick,
} from './sectionEdit';
import { Project, SectionLineStyle, SectionPrimitive, SheetGuide, Vec2 } from './types';
import { SheetBlock } from './sheet';

export type EditScope =
  | { type: 'elevation'; dir: ElevationDirection }
  | { type: 'section'; cutId: string };

// The drafting scope a block edits into, or null when the block isn't editable
// on the sheet (the floor plan and the roof plan).
export function blockScope(block: SheetBlock): EditScope | null {
  if (block.id.startsWith('elevation-')) return { type: 'elevation', dir: block.id.slice('elevation-'.length) as ElevationDirection };
  if (block.id.startsWith('section-')) return { type: 'section', cutId: block.id.slice('section-'.length) };
  return null;
}

// A block can be edited on the sheet when it's a primitive view (not the
// plan-scene floor plan) drawn upright (rotation 0).
export function isSandboxEditable(block: SheetBlock): boolean {
  return block.kind === 'primitives' && (block.rotationDeg || 0) === 0 && blockScope(block) !== null;
}

// ── Coordinate mapping (rotation-0 blocks only) ───────────────────────────────
// sheet-world ↔ block-local. elevation: local + offset; plan: Y flips.
export function sheetToBlockLocal(block: SheetBlock, p: Vec2): Vec2 {
  if (block.space === 'elevation') return { x: p.x - block.offset.x, y: p.y - block.offset.y };
  return { x: p.x - block.offset.x, y: block.offset.y - p.y };
}
export function blockLocalToSheet(block: SheetBlock, p: Vec2): Vec2 {
  if (block.space === 'elevation') return { x: p.x + block.offset.x, y: p.y + block.offset.y };
  return { x: p.x + block.offset.x, y: -p.y + block.offset.y };
}

// General block-local → sheet-world INCLUDING any rigid rotation (Projected
// mode). Matches the renderer's on-screen transform (and dxf.ts). Used to
// enumerate snap candidates for projection guides across every block.
export function blockToSheet(block: SheetBlock, p: Vec2): Vec2 {
  let x = p.x + block.offset.x;
  let y = block.space === 'plan' ? -p.y + block.offset.y : p.y + block.offset.y;
  const deg = block.rotationDeg || 0;
  if (deg) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const u = x - block.center.x, v = y - block.center.y;
    x = block.center.x + u * c + v * s;
    y = block.center.y - u * s + v * c;
  }
  return { x, y };
}

// Infinite projection guides → block-local segments, clipped to the block's
// extent, so they can be fed to `findSnap` alongside the block's primitives.
// Only guides that actually cross the block are returned. Editable blocks are
// rotation-0 elevation-space, so `sheetToBlockLocal` is the exact inverse map.
export function guideSegmentsForBlock(block: SheetBlock, guides: SheetGuide[]): Array<[Vec2, Vec2]> {
  const sb = block.sheetBounds;
  const segs: Array<[Vec2, Vec2]> = [];
  for (const g of guides) {
    if (g.axis === 'h') {
      if (g.pos < sb.minY || g.pos > sb.maxY) continue;
      segs.push([sheetToBlockLocal(block, { x: sb.minX, y: g.pos }), sheetToBlockLocal(block, { x: sb.maxX, y: g.pos })]);
    } else {
      if (g.pos < sb.minX || g.pos > sb.maxX) continue;
      segs.push([sheetToBlockLocal(block, { x: g.pos, y: sb.minY }), sheetToBlockLocal(block, { x: g.pos, y: sb.maxY })]);
    }
  }
  return segs;
}

// Sheet-world vertices of a primitive (for snapping).
export function primSheetVertices(block: SheetBlock, p: SectionPrimitive): Vec2[] {
  const t = (v: Vec2) => blockToSheet(block, v);
  switch (p.kind) {
    case 'line': case 'dimLinear': return [t(p.a), t(p.b)];
    case 'polyline': case 'hatch': return p.verts.map(t);
    case 'text': return [t(p.at)];
    case 'pitchSymbol': return [t(p.anchor)];
    case 'dimChain': return [t({ x: p.xIn, y: p.y1In }), t({ x: p.xIn, y: p.y2In })];
    case 'toLine': return [t({ x: p.leftXIn, y: p.yIn }), t({ x: p.rightXIn, y: p.yIn })];
    default: return [];
  }
}

// The editable block under a sheet-world point (topmost = last drawn). Uses the
// block's sheet AABB with a small world-space margin.
export function pickEditableBlock(blocks: SheetBlock[], sheetPt: Vec2, marginIn = 0): SheetBlock | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (!isSandboxEditable(b)) continue;
    const sb = b.sheetBounds;
    if (sheetPt.x >= sb.minX - marginIn && sheetPt.x <= sb.maxX + marginIn &&
        sheetPt.y >= sb.minY - marginIn && sheetPt.y <= sb.maxY + marginIn) {
      return b;
    }
  }
  return null;
}

// ── Bucket read / write ───────────────────────────────────────────────────────
function snapshotFor(project: Project, scope: EditScope): SectionPrimitive[] | undefined {
  if (scope.type === 'elevation') return project.elevationDrafting?.[scope.dir];
  return project.sectionDrafting?.cuts?.[scope.cutId];
}

function writeBucket(project: Project, scope: EditScope, prims: SectionPrimitive[]): Project {
  if (scope.type === 'elevation') {
    return { ...project, elevationDrafting: { ...project.elevationDrafting, [scope.dir]: prims } };
  }
  const cuts = { ...(project.sectionDrafting?.cuts ?? {}), [scope.cutId]: prims };
  return { ...project, sectionDrafting: { ...project.sectionDrafting, cuts } };
}

// The primitives currently shown for an editable block (snapshot if it exists,
// else the block's procedural primitives). Read-only — used for hit-testing +
// selection.
export function editablePrims(block: SheetBlock, project: Project): SectionPrimitive[] {
  const scope = blockScope(block);
  if (!scope) return [];
  const snap = snapshotFor(project, scope);
  return snap && snap.length ? snap : (block.primitives ?? []);
}

// Ensure the block's bucket holds an editable snapshot and return it. For
// elevations/sections with no snapshot yet, this explodes the procedural
// primitives into the bucket (first-edit "customize"). Returns the (possibly
// updated) project, the editable primitive array, and the scope.
function ensureEditable(project: Project, block: SheetBlock): { project: Project; prims: SectionPrimitive[]; scope: EditScope } | null {
  const scope = blockScope(block);
  if (!scope) return null;
  const snap = snapshotFor(project, scope);
  if (snap && snap.length) return { project, prims: snap, scope };
  const exploded = explodePrimitives(block.primitives ?? []);
  return { project: writeBucket(project, scope, exploded), prims: exploded, scope };
}

// ── Mutations ─────────────────────────────────────────────────────────────────
// All point arguments are in BLOCK-LOCAL coords (the view's native frame).
// Enter edit mode: explode every editable view's procedural drawing into its
// drafting bucket ONCE, up front, so all its lines become individually
// editable with STABLE ids. Without this, hit-testing the procedural prims and
// then exploding on write would renumber the polygon edges, so the clicked id
// would no longer exist and the edit would silently no-op. Idempotent — views
// already customized are left as-is.
export function enterEditMode(project: Project, blocks: SheetBlock[]): Project {
  let next = project;
  for (const block of blocks) {
    const scope = blockScope(block);
    if (!scope) continue;
    const snap = snapshotFor(next, scope);
    if (snap && snap.length) continue;
    const exploded = explodePrimitives(block.primitives ?? []);
    if (!exploded.length) continue;
    next = writeBucket(next, scope, exploded);
  }
  return next;
}

export function appendPrim(project: Project, block: SheetBlock, prim: SectionPrimitive): Project {
  const e = ensureEditable(project, block);
  if (!e) return project;
  return writeBucket(e.project, e.scope, [...e.prims, prim]);
}

export function addLine(project: Project, block: SheetBlock, a: Vec2, b: Vec2, style: SectionLineStyle = 'solid'): Project {
  return appendPrim(project, block, makeUserLine(a, b, style));
}

// Trim a clicked line at its crossings with the block's other primitives,
// removing the segment under the click (reuses the section trim logic).
// Projection guides crossing the block count as cutting edges too — so a line
// can be trimmed right at a projection line, matching how guides now produce
// snap/intersection points.
export function trimLineAt(project: Project, block: SheetBlock, primId: string, clickLocal: Vec2, tipGuard?: number): Project {
  const e = ensureEditable(project, block);
  if (!e) return project;
  const target = e.prims.find(p => p.id === primId);
  if (!target || target.kind !== 'line') return e.project;
  const guidePrims: SectionPrimitive[] = guideSegmentsForBlock(block, project.sheet?.guides ?? [])
    .map(([a, b], i) => ({ id: `__guide-cut-${i}`, kind: 'line', a, b, style: 'solid' }));
  const others = [...e.prims.filter(p => p.id !== primId), ...guidePrims];
  const res = trimLineByClick(target, others, clickLocal, { tipGuard });
  if (!res) return e.project;
  const next = e.prims.flatMap(p => (p.id === primId ? res.keep : [p]));
  return writeBucket(e.project, e.scope, next);
}

// Mirror the selected primitives across the chosen axis line (block-local),
// ADDING reflected copies (originals kept). Returns the updated project and the
// new copies' ids (so the caller can select them). Reflection math is shared
// with the other drafting surfaces (sectionEdit.reflectPrimitive).
export function mirrorSelection(project: Project, block: SheetBlock, ids: Set<string>, axis: 'x' | 'y', pos: number): { project: Project; newIds: string[] } {
  const e = ensureEditable(project, block);
  if (!e) return { project, newIds: [] };
  const R = mirrorReflector(axis, pos);
  const copies = e.prims.filter(p => ids.has(p.id)).map(p => reflectPrimitive(p, R));
  if (!copies.length) return { project: e.project, newIds: [] };
  return { project: writeBucket(e.project, e.scope, [...e.prims, ...copies]), newIds: copies.map(c => c.id) };
}

// ── Extend ────────────────────────────────────────────────────────────────────
// Compute (without mutating) how a clicked line would extend — for both the
// commit and the hover preview. Returns the moved end + its new point, or null.
// Extension math is shared with the other drafting surfaces
// (sectionEdit.computeLineExtend); the Sandbox-only twist is that projection
// guides crossing the block count as INFINITE boundaries.
export function computeExtend(project: Project, block: SheetBlock, primId: string, clickLocal: Vec2): { end: 'a' | 'b'; from: Vec2; point: Vec2 } | null {
  const prims = editablePrims(block, project);
  const target = prims.find(p => p.id === primId);
  if (!target || target.kind !== 'line') return null;
  const guideBoundaries: ExtendBoundary[] = guideSegmentsForBlock(block, project.sheet?.guides ?? [])
    .map(([c, d]) => ({ c, d, infinite: true }));
  return computeLineExtend(target, prims, clickLocal, guideBoundaries);
}

// Fillet two lines in a block into a corner at their intersection. Picks are
// block-local. Both near ends move to where the two lines cross (any angle).
export function filletLinesAt(project: Project, block: SheetBlock, id1: string, pick1: Vec2, id2: string, pick2: Vec2): Project {
  const e = ensureEditable(project, block);
  if (!e) return project;
  const next = filletLines(e.prims, id1, pick1, id2, pick2);
  if (!next) return e.project;
  return writeBucket(e.project, e.scope, next);
}

// Extend a clicked line to the nearest boundary (the counterpart to trim).
export function extendLineAt(project: Project, block: SheetBlock, primId: string, clickLocal: Vec2): Project {
  const e = ensureEditable(project, block);
  if (!e) return project;
  const res = computeExtend(e.project, block, primId, clickLocal);
  if (!res) return e.project;
  const next = e.prims.map(p => (p.id === primId && p.kind === 'line' ? { ...p, [res.end]: res.point } : p));
  return writeBucket(e.project, e.scope, next);
}

export function deleteIds(project: Project, block: SheetBlock, ids: Set<string>): Project {
  if (ids.size === 0) return project;
  const e = ensureEditable(project, block);
  if (!e) return project;
  const next = e.prims.filter(p => !ids.has(p.id));
  if (next.length === e.prims.length) return e.project;
  return writeBucket(e.project, e.scope, next);
}

export function setLineEndpoint(project: Project, block: SheetBlock, primId: string, endpoint: 'a' | 'b', to: Vec2): Project {
  const e = ensureEditable(project, block);
  if (!e) return project;
  const next = e.prims.map(p => (p.id === primId && p.kind === 'line' ? { ...p, [endpoint]: to } : p));
  return writeBucket(e.project, e.scope, next);
}

// Move one vertex of a polyline/hatch (block-local). Lets the user reshape the
// filled outlines (wall shell, corner boards, trim) by dragging their corners —
// the same vertex editing the Elevations page offers, so both edit identically.
export function moveVertex(project: Project, block: SheetBlock, primId: string, index: number, to: Vec2): Project {
  const e = ensureEditable(project, block);
  if (!e) return project;
  const next = e.prims.map(p => {
    if (p.id !== primId) return p;
    if (p.kind === 'polyline' || p.kind === 'hatch') {
      return { ...p, verts: p.verts.map((v, i) => (i === index ? to : v)) };
    }
    return p;
  });
  return writeBucket(e.project, e.scope, next);
}

export function translateIds(project: Project, block: SheetBlock, ids: Set<string>, dx: number, dy: number): Project {
  if (ids.size === 0 || (dx === 0 && dy === 0)) return project;
  const e = ensureEditable(project, block);
  if (!e) return project;
  const sh = (v: Vec2): Vec2 => ({ x: v.x + dx, y: v.y + dy });
  const next = e.prims.map(p => {
    if (!ids.has(p.id)) return p;
    switch (p.kind) {
      case 'line': case 'dimLinear': return { ...p, a: sh(p.a), b: sh(p.b) };
      case 'polyline': case 'hatch': return { ...p, verts: p.verts.map(sh) };
      case 'text': return { ...p, at: sh(p.at) };
      case 'pitchSymbol': return { ...p, anchor: sh(p.anchor) };
      case 'dimChain': return { ...p, xIn: p.xIn + dx, y1In: p.y1In + dy, y2In: p.y2In + dy };
      case 'toLine': return { ...p, leftXIn: p.leftXIn + dx, rightXIn: p.rightXIn + dx, yIn: p.yIn + dy };
      default: return p;
    }
  });
  return writeBucket(e.project, e.scope, next);
}
