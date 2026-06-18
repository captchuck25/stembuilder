// Sandbox sheet composer.
//
// The Sandbox tab is a CAD "paperspace" — a single drawing surface that
// composites every generated view into one aligned layout. Two layout modes:
//
//   • 'row'  (default) — everything in ONE horizontal line, for reference:
//        [ FLOOR PLAN ] [ SECTIONS ] [ W · S · E · N elevations ] [ ROOF PLAN ]
//     Elevations + sections share the height-datum row; the plan/roof are
//     reference views centered on that row to the left/right.
//
//   • 'projected' — the architect's "unfolded" set: each elevation gets a
//     ROOF PLAN copy ABOVE and a FLOOR PLAN copy BELOW, each rigidly ROTATED
//     so the face you're viewing in that elevation is nearest the elevation
//     (South 0°, East +90°, North 180°, West −90°) and X-aligned to it. Placed
//     section cuts sit in a row off to the side, sharing the datums.
//
// Coordinate model: one sheet-world, Y-UP inches.
//   • 'elevation' blocks (elevations + sections) are already Y-up and share
//     absolute heights (Y=0 = top of first-floor subfloor; grade & plate come
//     from buildSectionStack), so at offset.y = 0 their grade/plate/ridge
//     datums line up across the whole sheet.
//   • 'plan' blocks (floor plan + roof plan) are plan coords (Y-DOWN, +Y =
//     south) and map into the Y-up sheet with a Y-flip (sheetY = -localY +
//     offset.y).
// A block may also carry a rigid `rotationDeg` about its sheet-world `center`,
// applied at render time (used by Projected mode). The floor plan is rendered
// by reusing the 2D canvas renderer (drawScene); roof plan + elevations +
// sections are primitive blocks.

import { Door, Level, Project, SectionCut, SectionPrimitive, SectionLineStyle, Vec2, Wall, Window as WindowObj } from './types';
import { getElevationPrimitives } from './elevationPrimitives';
import { getSectionPrimitives } from './sectionPrimitives';
import { ElevationDirection } from './elevations';
import { wallPolygon, windowOpeningCuts } from './geometry';
import { wallPlanLinework } from './renderer';
import { bboxOf, buildRoofFootprint } from './roof';
import { buildSectionStack, getStructural } from './structural';

export type SheetLayoutMode = 'row' | 'projected';

export interface SheetBounds { minX: number; minY: number; maxX: number; maxY: number; }
export type BlockSpace = 'elevation' | 'plan';

export interface SheetBlock {
  id: string;
  title: string;
  space: BlockSpace;
  kind: 'primitives' | 'plan-scene';
  primitives?: SectionPrimitive[];
  level?: Level;
  // Placement: local coords map to sheet-world by (elevation) local+offset or
  // (plan) (localX+offset.x, -localY+offset.y). Then a rigid rotation of
  // `rotationDeg` is applied about `center` (sheet-world) at render time.
  offset: Vec2;
  rotationDeg: number;        // 0 / 90 / 180 / 270, clockwise on screen
  center: Vec2;               // sheet-world rotation pivot (= block center)
  localBounds: SheetBounds;
  sheetBounds: SheetBounds;   // sheet-world AABB AFTER offset/flip/rotation
}

export interface SheetDatum { y: number; label: string; }

export interface SheetLayout {
  blocks: SheetBlock[];
  bounds: SheetBounds | null;
  datums: SheetDatum[];
  datumXRange: [number, number] | null;
}

const BLOCK_GUTTER_IN = 48;
const SHEET_MARGIN_IN = 36;
const PLAN_PAD_IN = 18;

// Viewing-direction → rigid rotation that brings the viewed face to the bottom
// (nearest the elevation), clockwise on screen.
const ROT_FOR_DIR: Record<ElevationDirection, number> = {
  south: 0, east: 90, north: 180, west: 270,
};

// ── primitive bounds ─────────────────────────────────────────────────────────
export function primitiveBounds(prims: SectionPrimitive[]): SheetBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  };
  for (const p of prims) {
    switch (p.kind) {
      case 'line': case 'dimLinear': acc(p.a.x, p.a.y); acc(p.b.x, p.b.y); break;
      case 'polyline': case 'hatch': for (const v of p.verts) acc(v.x, v.y); break;
      case 'text': acc(p.at.x, p.at.y); break;
      case 'pitchSymbol': acc(p.anchor.x, p.anchor.y); break;
      case 'dimChain': acc(p.xIn, p.y1In); acc(p.xIn, p.y2In); break;
      case 'toLine': acc(p.leftXIn, p.yIn); acc(p.rightXIn, p.yIn); break;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

// Sheet-world half-extents of a local box, after the space flip and a rigid
// 90°-step rotation (90/270 swap width and height).
function halfExtents(space: BlockSpace, lb: SheetBounds, rotationDeg: number): { hw: number; hh: number } {
  const hw0 = (lb.maxX - lb.minX) / 2;
  const hh0 = (lb.maxY - lb.minY) / 2;       // flip doesn't change extent
  void space;
  const swap = rotationDeg === 90 || rotationDeg === 270;
  return { hw: swap ? hh0 : hw0, hh: swap ? hw0 : hh0 };
}

// Local center of a box, mapped into sheet-world (pre-rotation).
function sheetCenterOf(space: BlockSpace, lb: SheetBounds, offset: Vec2): Vec2 {
  const clx = (lb.minX + lb.maxX) / 2;
  const cly = (lb.minY + lb.maxY) / 2;
  return space === 'elevation'
    ? { x: clx + offset.x, y: cly + offset.y }
    : { x: clx + offset.x, y: -cly + offset.y };
}

// Build a fully-placed block from local geometry + an offset + rotation.
function makeBlock(
  base: { id: string; title: string; space: BlockSpace; kind: 'primitives' | 'plan-scene'; primitives?: SectionPrimitive[]; level?: Level; lb: SheetBounds },
  offset: Vec2, rotationDeg: number,
): SheetBlock {
  const center = sheetCenterOf(base.space, base.lb, offset);
  const { hw, hh } = halfExtents(base.space, base.lb, rotationDeg);
  const sheetBounds: SheetBounds = {
    minX: center.x - hw, maxX: center.x + hw,
    minY: center.y - hh, maxY: center.y + hh,
  };
  return {
    id: base.id, title: base.title, space: base.space, kind: base.kind,
    primitives: base.primitives, level: base.level,
    offset, rotationDeg, center, localBounds: base.lb, sheetBounds,
  };
}

// Offset that lands a block's left edge at `leftX` and (elevation) keeps
// offset.y at `datumY`, or (plan) centers its Y on `centerY`.
function offsetForRow(space: BlockSpace, lb: SheetBounds, leftX: number, datumY: number, centerY: number): Vec2 {
  const offX = leftX - lb.minX;
  if (space === 'elevation') return { x: offX, y: datumY };
  // plan: sheetY = -localY + offY; center maps to -cly + offY = centerY.
  const cly = (lb.minY + lb.maxY) / 2;
  return { x: offX, y: centerY + cly };
}

// Offset that centers a block at sheet-world `center` (used by Projected mode,
// where rotation pivots about that same center).
function offsetForCenter(space: BlockSpace, lb: SheetBounds, center: Vec2): Vec2 {
  const clx = (lb.minX + lb.maxX) / 2;
  const cly = (lb.minY + lb.maxY) / 2;
  return space === 'elevation'
    ? { x: center.x - clx, y: center.y - cly }
    : { x: center.x - clx, y: center.y + cly };
}

function union(a: SheetBounds, b: SheetBounds): SheetBounds {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

function planWallBounds(level: Level): SheetBounds | null {
  const pts: Vec2[] = [];
  for (const w of level.walls) pts.push(...wallPolygon(w));
  const bb = bboxOf(pts);
  if (!bb) return null;
  return {
    minX: bb.minX - PLAN_PAD_IN, maxX: bb.maxX + PLAN_PAD_IN,
    minY: bb.minY - PLAN_PAD_IN, maxY: bb.maxY + PLAN_PAD_IN,
  };
}

const ELEVATION_ORDER: { dir: ElevationDirection; title: string }[] = [
  { dir: 'west',  title: 'WEST ELEVATION'  },
  { dir: 'south', title: 'SOUTH ELEVATION' },
  { dir: 'east',  title: 'EAST ELEVATION'  },
  { dir: 'north', title: 'NORTH ELEVATION' },
];

// Raw (unplaced) building blocks shared by both layout modes.
interface RawBlocks {
  elevations: { dir: ElevationDirection; title: string; prims: SectionPrimitive[]; lb: SheetBounds }[];
  sections: { id: string; title: string; prims: SectionPrimitive[]; lb: SheetBounds }[];
  floorPlanLb: SheetBounds | null;
  level: Level | undefined;
  // Plan geometry as primitives (walls + lines + labels + section cut lines) —
  // used for DXF export of the floor plan (on screen the plan uses drawScene).
  planPrims: SectionPrimitive[];
  roof: { prims: SectionPrimitive[]; lb: SheetBounds } | null;
}

function gatherRaw(project: Project): RawBlocks {
  const level = project.levels.find(l => l.id === project.activeLevelId) ?? project.levels[0];
  const planPrims = level ? planExportPrimitives(level, project.sectionCuts ?? []) : [];

  const elevations: RawBlocks['elevations'] = [];
  for (const { dir, title } of ELEVATION_ORDER) {
    const prims = getElevationPrimitives(project, dir);
    const lb = primitiveBounds(prims);
    if (lb) elevations.push({ dir, title, prims, lb });
  }

  // Only REAL placed section cuts (typical is symbolic — excluded; it stays in
  // the Section Views tab). User decision 2026-06-04.
  const sections: RawBlocks['sections'] = [];
  for (const cut of project.sectionCuts ?? []) {
    const prims = getSectionPrimitives(project, cut.id);
    const lb = primitiveBounds(prims);
    if (lb) sections.push({ id: `section-${cut.id}`, title: `SECTION ${cut.name}-${cut.name}'`, prims, lb });
  }

  const floorPlanLb = level ? planWallBounds(level) : null;

  const footprint = level ? buildRoofFootprint(level, project.roof.overhang ?? 12) : null;
  const eaveBb = footprint ? bboxOf(footprint.eave) : null;
  let roof: RawBlocks['roof'] = null;
  if (footprint && eaveBb) {
    roof = {
      prims: [
        { id: 'rp-eave', kind: 'polyline', verts: footprint.eave, closed: true, style: 'normal' },
        { id: 'rp-wall', kind: 'polyline', verts: footprint.wallOuter, closed: true, style: 'thin' },
        ...(project.roof.drafting ?? []),
      ],
      lb: {
        minX: eaveBb.minX - PLAN_PAD_IN, maxX: eaveBb.maxX + PLAN_PAD_IN,
        minY: eaveBb.minY - PLAN_PAD_IN, maxY: eaveBb.maxY + PLAN_PAD_IN,
      },
    };
  }
  return { elevations, sections, floorPlanLb, level, planPrims, roof };
}

function buildDatums(project: Project, elevBlocks: SheetBlock[]): { datums: SheetDatum[]; datumXRange: [number, number] | null } {
  if (!elevBlocks.length) return { datums: [], datumXRange: null };
  const stack = buildSectionStack(project);
  const s = getStructural(project);
  const gradeY = -(s.foundation.gradeToFirstFloor ?? 18);
  const datums: SheetDatum[] = [
    { y: gradeY, label: 'GRADE' },
    { y: 0, label: 'T/O SUBFLOOR' },
    { y: stack.firstFloorPlateTopY, label: 'T/O PLATE' },
  ];
  if (stack.secondFloorPlateTopY != null) datums.push({ y: stack.secondFloorPlateTopY, label: 'T/O 2ND PLATE' });
  let xL = Infinity, xR = -Infinity;
  for (const b of elevBlocks) { xL = Math.min(xL, b.sheetBounds.minX); xR = Math.max(xR, b.sheetBounds.maxX); }
  return { datums, datumXRange: [xL, xR] };
}

function finalize(project: Project, blocks: SheetBlock[]): SheetLayout {
  const { datums, datumXRange } = buildDatums(project, blocks.filter(b => b.space === 'elevation'));
  let bounds: SheetBounds | null = null;
  for (const b of blocks) bounds = bounds ? union(bounds, b.sheetBounds) : b.sheetBounds;
  if (bounds) {
    bounds = {
      minX: bounds.minX - SHEET_MARGIN_IN, minY: bounds.minY - SHEET_MARGIN_IN,
      maxX: bounds.maxX + SHEET_MARGIN_IN, maxY: bounds.maxY + SHEET_MARGIN_IN,
    };
  }
  return { blocks, bounds, datums, datumXRange };
}

// ── Row layout (default) ──────────────────────────────────────────────────────
function buildRow(project: Project, raw: RawBlocks): SheetLayout {
  const blocks: SheetBlock[] = [];

  // Row Y-center from the elevation + section local Y (offset.y = 0 → sheetY =
  // localY). Plan/roof reference views are centered on it.
  let yMin = Infinity, yMax = -Infinity;
  for (const e of [...raw.elevations, ...raw.sections]) { yMin = Math.min(yMin, e.lb.minY); yMax = Math.max(yMax, e.lb.maxY); }
  const rowCenterY = Number.isFinite(yMin) ? (yMin + yMax) / 2 : 0;

  let runningX = 0;
  const place = (
    base: Parameters<typeof makeBlock>[0],
  ) => {
    const offset = offsetForRow(base.space, base.lb, runningX, 0, rowCenterY);
    const block = makeBlock(base, offset, 0);
    blocks.push(block);
    runningX = block.sheetBounds.maxX + BLOCK_GUTTER_IN;
  };

  // LEFT: floor plan, then sections.
  if (raw.level && raw.floorPlanLb) {
    place({ id: 'floor-plan', title: `FLOOR PLAN — ${raw.level.name}`, space: 'plan', kind: 'plan-scene', level: raw.level, primitives: raw.planPrims, lb: raw.floorPlanLb });
  }
  for (const sec of raw.sections) {
    place({ id: sec.id, title: sec.title, space: 'elevation', kind: 'primitives', primitives: sec.prims, lb: sec.lb });
  }
  // MIDDLE: elevations.
  for (const e of raw.elevations) {
    place({ id: `elevation-${e.dir}`, title: e.title, space: 'elevation', kind: 'primitives', primitives: e.prims, lb: e.lb });
  }
  // RIGHT: roof plan.
  if (raw.roof) {
    place({ id: 'roof-plan', title: 'ROOF PLAN', space: 'plan', kind: 'primitives', primitives: raw.roof.prims, lb: raw.roof.lb });
  }

  return finalize(project, blocks);
}

// ── Projected layout (toggle) ─────────────────────────────────────────────────
// The full Row line stays exactly in place — floor plan (left), placed
// sections, the W·S·E·N elevations, roof plan (right) — AND each elevation
// additionally gets a rotated ROOF PLAN copy ABOVE and FLOOR PLAN copy BELOW,
// oriented so the viewed face is nearest the elevation. So a CAD export already
// has both the clean reference line and the projected, pre-aligned set. The
// elevation slots are widened just enough that the rotated copies don't collide.
function buildProjected(project: Project, raw: RawBlocks): SheetLayout {
  const blocks: SheetBlock[] = [];

  // Row Y-center for the reference floor/roof plan at the line's ends.
  let yMin = Infinity, yMax = -Infinity;
  for (const e of [...raw.elevations, ...raw.sections]) { yMin = Math.min(yMin, e.lb.minY); yMax = Math.max(yMax, e.lb.maxY); }
  const rowCenterY = Number.isFinite(yMin) ? (yMin + yMax) / 2 : 0;

  let runningX = 0;

  // LEFT reference: the un-rotated floor plan, centered on the row.
  if (raw.level && raw.floorPlanLb) {
    const b = makeBlock(
      { id: 'floor-plan', title: `FLOOR PLAN — ${raw.level.name}`, space: 'plan', kind: 'plan-scene', level: raw.level, primitives: raw.planPrims, lb: raw.floorPlanLb },
      offsetForRow('plan', raw.floorPlanLb, runningX, 0, rowCenterY), 0,
    );
    blocks.push(b); runningX = b.sheetBounds.maxX + BLOCK_GUTTER_IN;
  }
  // Placed sections (on the datum row).
  for (const sec of raw.sections) {
    const b = makeBlock(
      { id: sec.id, title: sec.title, space: 'elevation', kind: 'primitives', primitives: sec.prims, lb: sec.lb },
      offsetForRow('elevation', sec.lb, runningX, 0, 0), 0,
    );
    blocks.push(b); runningX = b.sheetBounds.maxX + BLOCK_GUTTER_IN;
  }

  // MIDDLE: each elevation in the line, with rotated roof-above / plan-below.
  for (const e of raw.elevations) {
    const rot = ROT_FOR_DIR[e.dir];
    const elevHalfW = (e.lb.maxX - e.lb.minX) / 2;
    const planHalf = raw.floorPlanLb ? halfExtents('plan', raw.floorPlanLb, rot) : null;
    const roofHalf = raw.roof ? halfExtents('plan', raw.roof.lb, rot) : null;
    const colHalfW = Math.max(elevHalfW, planHalf?.hw ?? 0, roofHalf?.hw ?? 0);
    const centerX = runningX + colHalfW;

    const elevCenterY = (e.lb.minY + e.lb.maxY) / 2;       // → offset.y = 0 (datum row)
    const elev = makeBlock(
      { id: `elevation-${e.dir}`, title: e.title, space: 'elevation', kind: 'primitives', primitives: e.prims, lb: e.lb },
      offsetForCenter('elevation', e.lb, { x: centerX, y: elevCenterY }), 0,
    );
    blocks.push(elev);

    if (raw.roof && roofHalf) {
      const center: Vec2 = { x: centerX, y: elev.sheetBounds.maxY + BLOCK_GUTTER_IN + roofHalf.hh };
      blocks.push(makeBlock(
        { id: `roof-${e.dir}`, title: `ROOF ▸ ${e.dir.toUpperCase()}`, space: 'plan', kind: 'primitives', primitives: raw.roof.prims, lb: raw.roof.lb },
        offsetForCenter('plan', raw.roof.lb, center), rot,
      ));
    }
    if (raw.level && raw.floorPlanLb && planHalf) {
      const center: Vec2 = { x: centerX, y: elev.sheetBounds.minY - BLOCK_GUTTER_IN - planHalf.hh };
      blocks.push(makeBlock(
        { id: `plan-${e.dir}`, title: `PLAN ▸ ${e.dir.toUpperCase()}`, space: 'plan', kind: 'plan-scene', level: raw.level, primitives: raw.planPrims, lb: raw.floorPlanLb },
        offsetForCenter('plan', raw.floorPlanLb, center), rot,
      ));
    }
    runningX = centerX + colHalfW + BLOCK_GUTTER_IN;
  }

  // RIGHT reference: the un-rotated roof plan, centered on the row.
  if (raw.roof) {
    const b = makeBlock(
      { id: 'roof-plan', title: 'ROOF PLAN', space: 'plan', kind: 'primitives', primitives: raw.roof.prims, lb: raw.roof.lb },
      offsetForRow('plan', raw.roof.lb, runningX, 0, rowCenterY), 0,
    );
    blocks.push(b); runningX = b.sheetBounds.maxX + BLOCK_GUTTER_IN;
  }

  return finalize(project, blocks);
}

// ── Floor-plan geometry as primitives (for DXF export) ────────────────────────
// drawScene renders the plan richly on screen, but DXF needs vector entities.
// V1 exports the structural backbone: wall polygons, annotation lines, and room
// labels. (Doors/windows/furniture/stairs/dims on the plan are a follow-up.)
// ── Door / window plan symbols (world inches) ─────────────────────────────────
// The opening JAMBS already come from the wall linework's segment end-caps;
// these add the swing+leaf (doors) and frame+glazing rails (windows).
function wallUN(w: Wall): { u: Vec2; n: Vec2 } | null {
  const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return null;
  const u = { x: dx / L, y: dy / L };
  return { u, n: { x: -u.y, y: u.x } };
}
const alongWall = (w: Wall, u: Vec2, d: number): Vec2 => ({ x: w.start.x + u.x * d, y: w.start.y + u.y * d });
const rotV = (v: Vec2, a: number): Vec2 => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const addV = (p: Vec2, v: Vec2, k: number): Vec2 => ({ x: p.x + v.x * k, y: p.y + v.y * k });

function doorSymbol(d: Door, w: Wall, id: () => string): SectionPrimitive[] {
  const fr = wallUN(w);
  if (!fr) return [];
  const { u, n } = fr;
  const half = d.width / 2;
  const out: SectionPrimitive[] = [];
  if (d.doorType === 'room' || d.doorType === 'entry') {
    // Swing door: leaf pivots at the hinge jamb; swing arc back to closed.
    const hingeAlong = d.hingeSide === 'start' ? d.positionAlong - half : d.positionAlong + half;
    const H = alongWall(w, u, hingeAlong);
    const d0 = d.hingeSide === 'start' ? u : { x: -u.x, y: -u.y };   // closed leaf dir (toward latch)
    const openN = d.flipped ? { x: -n.x, y: -n.y } : n;
    const theta = ((d.openAngle || 90) * Math.PI) / 180;
    const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
    const sweep = dot(rotV(d0, theta), openN) >= dot(rotV(d0, -theta), openN) ? theta : -theta;
    out.push({ id: id(), kind: 'line', a: H, b: addV(H, rotV(d0, sweep), d.width), style: 'solid' });
    const steps = Math.max(6, Math.round(Math.abs(sweep) / (Math.PI / 24)));
    const arc: Vec2[] = [];
    for (let k = 0; k <= steps; k++) arc.push(addV(H, rotV(d0, sweep * (k / steps)), d.width));
    out.push({ id: id(), kind: 'polyline', verts: arc, closed: false, style: 'normal' });
  } else {
    // Sliding / pocket / bifold / barn: a panel line across the opening, nudged
    // toward one face so it reads as a leaf rather than an empty gap.
    const a = alongWall(w, u, d.positionAlong - half);
    const b = alongWall(w, u, d.positionAlong + half);
    const off = (d.flipped ? -1 : 1) * Math.min(w.thickness / 4, 1.5);
    out.push({ id: id(), kind: 'line', a: addV(a, n, off), b: addV(b, n, off), style: 'solid' });
  }
  return out;
}

function windowSymbol(win: WindowObj, w: Wall, id: () => string): SectionPrimitive[] {
  const fr = wallUN(w);
  if (!fr) return [];
  const { u, n } = fr;
  const h = w.thickness / 2;
  const out: SectionPrimitive[] = [];
  for (const cut of windowOpeningCuts(win)) {
    const pa = alongWall(w, u, cut.positionAlong - cut.width / 2);
    const pb = alongWall(w, u, cut.positionAlong + cut.width / 2);
    // Frame rails at both wall faces + a centre glazing line, bridging the gap.
    for (const off of [h, 0, -h]) {
      out.push({ id: id(), kind: 'line', a: addV(pa, n, off), b: addV(pb, n, off), style: 'solid' });
    }
  }
  return out;
}

export function planExportPrimitives(level: Level, sectionCuts: SectionCut[] = []): SectionPrimitive[] {
  const out: SectionPrimitive[] = [];
  let n = 0;
  const id = () => `pl-${n++}`;
  // Walls as TRUE linework: mitered joints, opening gaps + jambs, each edge
  // clipped to the part outside other walls — a pure line drawing, NOT filled
  // rectangles (whose overlaps only hid because the on-screen plan fills them).
  for (const [a, b] of wallPlanLinework(level.walls, level.doors, level.windows)) {
    out.push({ id: id(), kind: 'line', a, b, style: 'solid' });
  }
  // Door + window symbols on top of the opening gaps.
  const wallById = new Map(level.walls.map(w => [w.id, w]));
  for (const d of level.doors) { const w = wallById.get(d.wallId); if (w) out.push(...doorSymbol(d, w, id)); }
  for (const win of level.windows) { const w = wallById.get(win.wallId); if (w) out.push(...windowSymbol(win, w, id)); }
  for (const l of level.lines ?? []) {
    const allowed: SectionLineStyle[] = ['solid', 'dashed', 'dotted', 'center', 'hidden'];
    const style = (allowed as string[]).includes(l.style) ? (l.style as SectionLineStyle) : 'solid';
    out.push({ id: id(), kind: 'line', a: l.start, b: l.end, style });
  }
  for (const r of level.roomLabels) {
    out.push({ id: id(), kind: 'text', at: r.position, content: r.name, size: 11, align: 'center', baseline: 'middle' });
  }
  // Section cut lines + A/A' end labels, so the DXF plan shows which line each
  // section was taken from (mirrors the on-screen section markers).
  for (const cut of sectionCuts) {
    const a: Vec2 = cut.axis === 'x' ? { x: cut.start, y: cut.position } : { x: cut.position, y: cut.start };
    const b: Vec2 = cut.axis === 'x' ? { x: cut.end, y: cut.position } : { x: cut.position, y: cut.end };
    out.push({ id: id(), kind: 'line', a, b, style: 'dashed' });
    out.push({ id: id(), kind: 'text', at: a, content: cut.name, size: 11, align: 'center', baseline: 'middle' });
    out.push({ id: id(), kind: 'text', at: b, content: `${cut.name}'`, size: 11, align: 'center', baseline: 'middle' });
  }
  return out;
}

export function buildSheet(project: Project, mode: SheetLayoutMode = 'row'): SheetLayout {
  const raw = gatherRaw(project);
  return mode === 'projected' ? buildProjected(project, raw) : buildRow(project, raw);
}
