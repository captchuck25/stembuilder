// Section-view drawing as a list of structured primitives.
//
// `buildSectionPrimitives(project)` produces a flat `SectionPrimitive[]`
// describing every line/polyline/text/dim in the cross-section. The same
// list is consumed by:
//   • `renderSectionPrimitives` — draws to a canvas (Auto mode).
//   • Drafting mode — snapshots the list and lets the user edit it.
//   • Snap engine + hit-testing (Phase D/F).
//
// All coords are world inches (origin = building centerline at top of
// first-floor subfloor; Y-up). Screen projection happens once at render
// time via the `Projector` passed in.

import {
  FASCIA_DEPTH,
  KEYWAY_DEPTH, KEYWAY_WIDTH,
  ROOF_SHEATHING_THICKNESS, SHEETROCK_THICKNESS,
  SILL_PLATE_BOARD_WIDTH, WALL_SHEATHING_THICKNESS,
  buildSectionStack, computeBuildingWidth, computeFootingWidth, effectiveSecondFloor, getStructural,
} from './structural';
import {
  LUMBER_ACTUAL_DEPTH, Project, SectionCut, Vec2, Wall, WallType, makeId,
  PrimLine, PrimPolyline, PrimHatch, PrimText, PrimTOLine, PrimDimChain,
  PrimDimLinear, PrimPitchSymbol,
  DrawingFillStyle, HatchPattern,
  SectionLineStyle, SectionPolyStyle, SectionPrimitive, SectionTextColor,
  formatImperial, formatJoistLabel,
} from './types';
import { T } from './theme';
import {
  buildRoofTopology, roofHeightAt,
  buildRoofTiers, hasSetback, roofHeightAtAbsolute,
} from './roofTopology';

// Re-exported for back-compat with consumers that imported these from this
// module. New code should import directly from './types'.
export type {
  PrimLine, PrimPolyline, PrimText, PrimTOLine, PrimDimChain, PrimPitchSymbol,
  SectionPrimitive,
};
// Local aliases so the existing builder closures keep their short names.
type LineStyle = SectionLineStyle;
type PolyStyle = SectionPolyStyle;
type TextColor = SectionTextColor;

// ── Projector type (mirrors the one in SpecsView; keeps this module
// independent of React state) ───────────────────────────────────────────────
//
// `zoom` is exposed so the renderer can scale drafting indicators (text,
// dim ticks, L-glyph) proportionally with the drawing. Stored sizes are in
// "paper pixels at zoom 1.0"; multiplying by `zoom` gives the on-screen
// pixel size. At extreme zoom-out the text becomes unreadable — that's the
// correct architectural behavior, matching a real to-scale drawing.
export interface Projector {
  px: number;
  zoom: number;
  sx: (xIn: number) => number;
  sy: (yIn: number) => number;
}

// Dim-chain layout — all in world inches, anchored relative to the LEFT
// outside wall face. Sized so the longest T/O label ("T/O 1st FLOOR PLATE",
// ~110px at 10px font) fits inside the T/O extension column at 1/4" scale
// (2 px/in → 80" × 2 = 160px column).
export const TO_LINE_INSET_IN      = 80;
export const DIM_CHAIN_OFFSET_IN   = 12;
export const OVERALL_DIM_OFFSET_IN = 14;

// ── Section-cut analysis ────────────────────────────────────────────────────
// Compute which walls a SectionCut intersects and how the section's
// geometry should be derived from them. Only walls that ACTUALLY cross the
// cut line (i.e. their centerline endpoints lie on opposite sides of the
// cut's perpendicular axis) within [cut.start, cut.end] are included.
//
// The leftmost intersected wall becomes the section's LEFT exterior wall;
// the rightmost becomes the RIGHT. Anything in between is treated as an
// interior wall and rendered as a vertical wall block (studs + drywall,
// floor-to-ceiling) inside the section.

export interface CutWallHit {
  wallId: string;
  // Plan position along the cut's PARALLEL axis (X for axis='x', Y for
  // axis='y'). This is the wall centerline's intersection with the cut line.
  pos: number;
  thickness: number;
  type: WallType;
}

export interface CutAnalysis {
  hits: CutWallHit[];
  leftHit: CutWallHit | null;
  rightHit: CutWallHit | null;
  interior: CutWallHit[];   // hits between left and right
  sectionWidth: number;     // leftHit→rightHit distance, plan inches
  centerPlanX: number;      // (leftHit.pos + rightHit.pos) / 2 — to map plan→section coords
}

const EMPTY_CUT_ANALYSIS: CutAnalysis = {
  hits: [], leftHit: null, rightHit: null, interior: [],
  sectionWidth: 0, centerPlanX: 0,
};

export function analyzeSectionCut(project: Project, cut: SectionCut): CutAnalysis {
  // Use the active level's walls to determine the section geometry. The cut
  // applies to all floors, so multi-floor stacking happens in the builder
  // (it re-draws the same interior walls on each level).
  const level = project.levels.find(l => l.id === project.activeLevelId);
  if (!level) return EMPTY_CUT_ANALYSIS;
  const hits: CutWallHit[] = [];
  for (const w of level.walls) {
    const pos = wallCutIntersection(cut, w);
    if (pos == null) continue;
    hits.push({ wallId: w.id, pos, thickness: w.thickness, type: w.type });
  }
  hits.sort((a, b) => a.pos - b.pos);
  if (hits.length < 2) {
    return { ...EMPTY_CUT_ANALYSIS, hits, leftHit: hits[0] ?? null };
  }
  const leftHit  = hits[0];
  const rightHit = hits[hits.length - 1];
  return {
    hits, leftHit, rightHit,
    interior: hits.slice(1, -1),
    sectionWidth: rightHit.pos - leftHit.pos,
    centerPlanX: (leftHit.pos + rightHit.pos) / 2,
  };
}

// Returns the plan axis along which the building's ridge runs. For a gable
// roof, the ridge follows the LONGER side of the building's plan bounding
// box (gable ends sit on the shorter sides). Until the roof plan tab
// provides an explicit ridge direction, the section builder uses this
// heuristic to decide whether a cut runs along the ridge (longitudinal,
// no peak) or across it (transverse, peak visible).
export function getRidgeAxis(project: Project): 'x' | 'y' {
  const level = project.levels.find(l => l.id === project.activeLevelId);
  if (!level || level.walls.length === 0) return 'x';
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of level.walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  return (maxX - minX) >= (maxY - minY) ? 'x' : 'y';
}

// True iff the cut runs PARALLEL to the ridge (a longitudinal cut). In that
// orientation the section shouldn't show the gable peak — the cut plane
// sits parallel to the ridge so the rafters are seen end-on, not bisected.
export function isCutAlongRidge(project: Project, cut: SectionCut): boolean {
  return cut.axis === getRidgeAxis(project);
}

// ── Section roof condition (topology-driven) ─────────────────────────────────
// Replaces the bbox `getRidgeAxis` guess. The section's roof is derived from
// the SAME source as the elevations — `roofHeightAt` over the real ridges/
// valleys/hips drawn on the Roof Plan — sampled along the section cut.
//
//   • `gable`   — a clean, centered, symmetric peak in this plane (roof meets
//                 BOTH plates at the eave). Rendered by the parametric rafter
//                 block (birds-mouth / ridge board / collar tie). This is the
//                 classic primary-ridge section and ANY exposed-wing gable.
//   • `profile` — anything else with real height: a slope tucked under a taller
//                 roof, a flat run parallel to a ridge, an off-center or
//                 compound peak. Drawn as the HONEST sampled roof surface.
//   • `flat`    — no roof height (pitch 0 / flat-roof building).
//
// `surface` (profile only) is the roof top in SECTION coords: { x = section X
// (0 = building center), y = world Y = topOfWallsY + heightAboveWalls }.
export type SectionRoofShape =
  // `equalAboveWalls` = the EQUAL-HEIGHT ridge height (above the plates) the
  // whole building draws to — the tallest ridge's height. Every gable section
  // draws its ridge at this height (narrower sections get a steeper pitch),
  // matching how the elevations draw all ridges at one height.
  | { kind: 'gable';   pitch: number; maxAboveWalls: number; equalAboveWalls: number }
  | { kind: 'profile'; pitch: number; maxAboveWalls: number; equalAboveWalls: number; surface: Vec2[] }
  | { kind: 'flat';    pitch: number; maxAboveWalls: number; equalAboveWalls: number };

const ROOF_EAVE_TOL = 10;   // roof "meets the plate" within this many inches
const ROOF_PEAK_TOL = 10;   // peak counts as centered within this of section-0
const ROOF_FLAT_TOL = 6;    // below this height there is no roof to draw

export function classifySectionRoof(
  project: Project,
  cut: SectionCut | undefined,
  ca: CutAnalysis | null,
  halfBuildingWidth: number,
  overhang: number,
  topOfWallsY: number,
): SectionRoofShape {
  const pitch = project.roof.pitch || 0;
  const pitchRatio = pitch / 12;
  const gableMax = Math.max(0, halfBuildingWidth) * pitchRatio;
  // No pitch → flat-roof building.
  if (pitch <= 0) return { kind: 'flat', pitch, maxAboveWalls: 0, equalAboveWalls: 0 };
  // Typical view (no placed cut) keeps the symmetric parametric gable, exactly
  // as before — there is no cut location to sample a real roof along.
  if (!cut || !ca || !ca.leftHit || !ca.rightHit) {
    return { kind: 'gable', pitch, maxAboveWalls: gableMax, equalAboveWalls: gableMax };
  }
  const topo = buildRoofTopology(project);
  if (!topo.hasRoof) return { kind: 'gable', pitch, maxAboveWalls: gableMax, equalAboveWalls: gableMax };
  // The equal height = the tallest ridge's height above the plates.
  const equalAboveWalls = topo.ridges.reduce((m, r) => Math.max(m, r.heightAboveWalls), 0) || gableMax;

  // section X → plan point. Section X = planPos − centerPlanX (matches how
  // interior walls map), so planPos = centerPlanX + sx. The cut's PERPENDICULAR
  // coord is fixed at cut.position.
  const center = ca.centerPlanX;
  const planAt = (sx: number): Vec2 =>
    cut.axis === 'y'
      ? { x: cut.position, y: center + sx }
      : { x: center + sx, y: cut.position };

  const lo = -halfBuildingWidth - overhang;
  const hi = +halfBuildingWidth + overhang;
  const surface: Vec2[] = [];
  let maxH = -Infinity, peakX = 0;
  for (let sx = lo; sx <= hi + 0.001; sx += 4) {
    const h = roofHeightAt(topo, planAt(sx));
    if (h == null) continue;
    surface.push({ x: sx, y: topOfWallsY + h });
    if (h > maxH) { maxH = h; peakX = sx; }
  }
  if (!Number.isFinite(maxH) || maxH < ROOF_FLAT_TOL) {
    return { kind: 'flat', pitch, maxAboveWalls: 0, equalAboveWalls };
  }
  const edgeL = roofHeightAt(topo, planAt(-halfBuildingWidth + 1)) ?? Infinity;
  const edgeR = roofHeightAt(topo, planAt(+halfBuildingWidth - 1)) ?? Infinity;
  const peakInterior = peakX > -halfBuildingWidth + 12 && peakX < halfBuildingWidth - 12;
  const cleanGable =
    edgeL < ROOF_EAVE_TOL && edgeR < ROOF_EAVE_TOL &&
    peakInterior && Math.abs(peakX) < ROOF_PEAK_TOL && Math.abs(edgeL - edgeR) < 8;
  if (cleanGable) return { kind: 'gable', pitch, maxAboveWalls: gableMax, equalAboveWalls };
  return { kind: 'profile', pitch, maxAboveWalls: maxH, equalAboveWalls, surface };
}

// ── Auto-placed primary section ──────────────────────────────────────────────
// Builds the FIRST section a user should see: a transverse cut straight across
// the PRIMARY ridge (the one roofing the widest perpendicular span → the
// tallest peak → overall building height), positioned at the WIDEST point along
// that ridge so a stepped footprint is cut through its fat part. Returns null
// when there's no roof yet (no ridge → no defined peak to establish height).
export function buildPrimarySectionCut(project: Project): SectionCut | null {
  const level = project.levels.find(l => l.id === project.activeLevelId);
  if (!level || level.walls.length === 0) return null;
  const topo = buildRoofTopology(project);
  if (!topo.hasRoof || topo.ridges.length === 0) return null;
  // Primary = max height above walls (= widest perpendicular span × pitch);
  // tie-break toward the ridge on the longer plan extent (the "main body").
  let primary = topo.ridges[0];
  for (const r of topo.ridges) {
    if (r.heightAboveWalls > primary.heightAboveWalls + 0.5) { primary = r; continue; }
    if (Math.abs(r.heightAboveWalls - primary.heightAboveWalls) <= 0.5) {
      const rLen = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
      const pLen = Math.hypot(primary.b.x - primary.a.x, primary.b.y - primary.a.y);
      if (rLen > pLen) primary = r;
    }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of level.walls) {
    minX = Math.min(minX, w.start.x, w.end.x); maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y); maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  // Transverse to the ridge: an E-W ridge (runs along X) is cut by a vertical
  // line (axis='y'); an N-S ridge by a horizontal line (axis='x').
  const horiz = Math.abs(primary.b.x - primary.a.x) >= Math.abs(primary.b.y - primary.a.y);
  const axis: 'x' | 'y' = horiz ? 'y' : 'x';
  const start = (horiz ? minY : minX) - 24;
  const end   = (horiz ? maxY : maxX) + 24;
  // Scan positions ALONG the ridge. We do NOT just maximize total section width
  // — that catches perpendicular wings and yields a messy compound section, and
  // the raw widest spot often lands ON a step or THROUGH a window/door. Score
  // each candidate lexicographically: clean centered GABLE → WIDEST (bucketed
  // to ~½'), then prefer crossing the FEWEST door/window openings, then CLEAR of
  // any wall running parallel to the cut (so it doesn't sit on a step/jog), then
  // tallest, then closest to the ridge midpoint. Falls back to the tallest
  // profile if no clean gable position exists.
  const stack = buildSectionStack(project);
  const overhang = Math.max(0, project.roof.overhang || 0);
  const lo = horiz ? Math.min(primary.a.x, primary.b.x) : Math.min(primary.a.y, primary.b.y);
  const hi = horiz ? Math.max(primary.a.x, primary.b.x) : Math.max(primary.a.y, primary.b.y);
  const inset = Math.min(12, Math.max(0, (hi - lo) / 4));
  const a0 = lo + inset, a1 = hi - inset;
  const mid = (lo + hi) / 2;

  // Pre-compute each opening as a padded world segment along its wall, so we can
  // test whether a candidate cut line passes through it.
  const wallById = new Map(level.walls.map(w => [w.id, w] as const));
  const openSegs: { p0: Vec2; p1: Vec2 }[] = [];
  for (const op of [...level.doors, ...level.windows]) {
    const w = wallById.get(op.wallId);
    if (!w) continue;
    const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    const spw = (op as { sidePanels?: string; sidePanelWidth?: number });
    const extra = spw.sidePanels === 'both' ? 2 * (spw.sidePanelWidth ?? 14)
      : (spw.sidePanels === 'left' || spw.sidePanels === 'right') ? (spw.sidePanelWidth ?? 14) : 0;
    const t0 = op.positionAlong - 6;                  // 6" casing margin
    const t1 = op.positionAlong + op.width + extra + 6;
    openSegs.push({
      p0: { x: w.start.x + ux * t0, y: w.start.y + uy * t0 },
      p1: { x: w.start.x + ux * t1, y: w.start.y + uy * t1 },
    });
  }
  // Walls running PARALLEL to the cut (a transverse 'y' cut → vertical walls).
  // HARD RULE (user): the section line must NOT run along / through any wall
  // parallel to it. Record each parallel wall's perpendicular coordinate, its
  // span along the cut axis, and half its thickness, so we can reject any
  // candidate whose cut line sits within a parallel wall it overlaps.
  const parallelWalls: { perp: number; lo: number; hi: number; half: number }[] = [];
  for (const w of level.walls) {
    const vert = Math.abs(w.end.y - w.start.y) >= Math.abs(w.end.x - w.start.x);
    if ((axis === 'y') !== vert) continue;   // keep only walls running the cut's direction
    const perp = axis === 'y' ? (w.start.x + w.end.x) / 2 : (w.start.y + w.end.y) / 2;
    const sa = axis === 'y' ? w.start.y : w.start.x;
    const sb = axis === 'y' ? w.end.y : w.end.x;
    parallelWalls.push({ perp, lo: Math.min(sa, sb), hi: Math.max(sa, sb), half: (w.thickness ?? 4) / 2 });
  }
  const THROUGH = 2;   // inches of clearance past the wall face before it stops counting as "through"
  const segHit = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
    const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  // HARD RULE (user): the section must NOT cross a valley or hip — those are
  // roof-plane breaks, so a cut through one isn't a clean gable. Collect them
  // as plan segments to test the candidate cut line against.
  const roofBreaks: { a: Vec2; b: Vec2 }[] = [...(topo.valleys ?? []), ...(topo.hips ?? [])];

  type Cand = { violations: number; gable: boolean; wbucket: number; openings: number; clearB: number; h: number; width: number; dist: number };
  let bestPos = mid;
  let best: Cand | null = null;
  const SPACING = 12;                                  // sample ~every foot
  const STEPS = Math.max(10, Math.min(80, Math.ceil((a1 - a0) / SPACING)));
  for (let i = 0; i <= STEPS; i++) {
    const pos = a1 > a0 ? a0 + (a1 - a0) * (i / STEPS) : mid;
    const probe: SectionCut = { id: 'probe', name: 'A', axis, position: pos, start, end, facing: 1 };
    const ca = analyzeSectionCut(project, probe);
    if (!ca.leftHit || !ca.rightHit) continue;
    const shape = classifySectionRoof(project, probe, ca, ca.sectionWidth / 2, overhang, stack.topOfWallsY);
    // Cut line as a world segment, clamped to the intersected walls so we only
    // count openings/steps within the actual drawn section width.
    const cutA: Vec2 = axis === 'y' ? { x: pos, y: ca.leftHit.pos } : { x: ca.leftHit.pos, y: pos };
    const cutB: Vec2 = axis === 'y' ? { x: pos, y: ca.rightHit.pos } : { x: ca.rightHit.pos, y: pos };
    const openings = openSegs.reduce((n, s) => n + (segHit(cutA, cutB, s.p0, s.p1) ? 1 : 0), 0);
    // Run-through test + clearance, only against parallel walls whose span
    // overlaps the section's drawn extent.
    const cutLo = Math.min(ca.leftHit.pos, ca.rightHit.pos);
    const cutHi = Math.max(ca.leftHit.pos, ca.rightHit.pos);
    let through = false, minClear = Infinity;
    for (const w of parallelWalls) {
      if (w.hi <= cutLo + 1 || w.lo >= cutHi - 1) continue;   // wall not within the section
      const d = Math.abs(w.perp - pos);
      minClear = Math.min(minClear, d);
      if (d < w.half + THROUGH) through = true;
    }
    // HARD violations (the two rules the user set): the cut runs through a
    // parallel wall, and/or it crosses a valley/hip. Fewer is strictly better;
    // 0 is required unless no position can achieve it (graceful fallback).
    const crossesBreak = roofBreaks.some(s => segHit(cutA, cutB, s.a, s.b));
    const violations = (through ? 1 : 0) + (crossesBreak ? 1 : 0);
    const cand: Cand = {
      violations, gable: shape.kind === 'gable', wbucket: Math.round(ca.sectionWidth / 6),
      openings, clearB: Math.floor((minClear === Infinity ? 999 : minClear) / 12),
      h: shape.maxAboveWalls, width: ca.sectionWidth, dist: Math.abs(pos - mid),
    };
    // Priority (user's importance order): no hard violations [parallel wall +
    // valley/hip] → clean gable (shows the peak) → WIDEST → fewest doors/windows
    // (lowest) → most clearance in the bay → tallest → centered on ridge.
    const better = !best || (() => {
      if (cand.violations !== best!.violations) return cand.violations < best!.violations;
      if (cand.gable !== best!.gable) return cand.gable;
      if (cand.wbucket !== best!.wbucket) return cand.wbucket > best!.wbucket;
      if (cand.openings !== best!.openings) return cand.openings < best!.openings;
      if (cand.clearB !== best!.clearB) return cand.clearB > best!.clearB;
      if (Math.abs(cand.h - best!.h) > 0.5) return cand.h > best!.h;
      if (Math.abs(cand.width - best!.width) > 0.5) return cand.width > best!.width;
      return cand.dist < best!.dist;
    })();
    if (better) { best = cand; bestPos = pos; }
  }
  const used = new Set((project.sectionCuts ?? []).map(c => c.name));
  let name = 'A';
  for (let i = 0; i < 26; i++) { const n = String.fromCharCode(65 + i); if (!used.has(n)) { name = n; break; } }
  return { id: makeId('cut'), name, axis, position: bestPos, start, end, facing: 1 };
}

// Where (along the cut's parallel axis) does the wall's centerline cross the
// cut line? null if the wall doesn't cross within [cut.start, cut.end], is
// parallel to the cut, or sits entirely on one side.
function wallCutIntersection(cut: SectionCut, w: Wall): number | null {
  if (cut.axis === 'x') {
    // Cut runs along X at fixed Y = cut.position.
    const d0 = w.start.y - cut.position;
    const d1 = w.end.y   - cut.position;
    if (d0 * d1 > 0) return null;
    const totalDy = w.end.y - w.start.y;
    if (Math.abs(totalDy) < 1e-9) return null;
    const t = -d0 / totalDy;
    const x = w.start.x + (w.end.x - w.start.x) * t;
    if (x < cut.start || x > cut.end) return null;
    return x;
  } else {
    const d0 = w.start.x - cut.position;
    const d1 = w.end.x   - cut.position;
    if (d0 * d1 > 0) return null;
    const totalDx = w.end.x - w.start.x;
    if (Math.abs(totalDx) < 1e-9) return null;
    const t = -d0 / totalDx;
    const y = w.start.y + (w.end.y - w.start.y) * t;
    if (y < cut.start || y > cut.end) return null;
    return y;
  }
}

// ── Mode-aware accessor ─────────────────────────────────────────────────────
// Returns the section primitives to render. In drafting mode (the user has
// "customized" the drawing), returns the snapshot stored on the project;
// otherwise builds them procedurally from `project.structural`.

// `cutId` selects which section to render: null = typical (default), a
// string id = sectionDrafting.cuts[cutId]. If the snapshot for the active
// scope is empty, the procedural drawing is built — using the placed cut
// geometry (width from intersected exterior walls + interior wall blocks)
// when cutId is a real cut, or the default `computeBuildingWidth` for typical.
export function getSectionPrimitives(project: Project, cutId: string | null = null): SectionPrimitive[] {
  if (cutId == null) {
    const snapshot = project.sectionDrafting?.typical;
    if (snapshot && snapshot.length > 0) return snapshot;
    return buildSectionPrimitives(project);
  }
  const snapshot = project.sectionDrafting?.cuts?.[cutId];
  if (snapshot && snapshot.length > 0) return snapshot;
  const cut = (project.sectionCuts ?? []).find(c => c.id === cutId) ?? null;
  return buildSectionPrimitives(project, cut ?? undefined);
}

export function isSectionDrafting(project: Project, cutId: string | null = null): boolean {
  if (cutId == null) return (project.sectionDrafting?.typical?.length ?? 0) > 0;
  return (project.sectionDrafting?.cuts?.[cutId]?.length ?? 0) > 0;
}

// ── Builder ─────────────────────────────────────────────────────────────────
// Returns the full procedural section as a primitive list. Identical visual
// output to the legacy direct-canvas draw — just structured.
//
// When `cut` is provided, the section's overall WIDTH is derived from the
// distance between the leftmost and rightmost walls the cut crosses on the
// active plan (instead of the default `computeBuildingWidth` heuristic),
// and any walls between them are rendered as interior wall blocks (studs +
// drywall, floor-to-ceiling). When `cut` is omitted (Typical view), the
// section uses the default building width and no interior walls.

export function buildSectionPrimitives(project: Project, cut?: SectionCut): SectionPrimitive[] {
  const out: SectionPrimitive[] = [];
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${nextId++}`;

  const line = (a: Vec2, b: Vec2, style: LineStyle = 'normal', tag = 'line') =>
    out.push({ id: id(tag), kind: 'line', a, b, style });
  const closedPoly = (verts: Vec2[], style: PolyStyle = 'normal', tag = 'poly') =>
    out.push({ id: id(tag), kind: 'polyline', verts, closed: true, style });
  const closedRect = (xMin: number, yMin: number, xMax: number, yMax: number, style: PolyStyle, tag: string) =>
    closedPoly([
      { x: xMin, y: yMax }, { x: xMax, y: yMax },
      { x: xMax, y: yMin }, { x: xMin, y: yMin },
    ], style, tag);
  const text = (at: Vec2, content: string, opts: Partial<PrimText> = {}, tag = 'text') =>
    out.push({ id: id(tag), kind: 'text', at, content, ...opts });

  const s = getStructural(project);
  // Treat a building with ≥2 levels as two stories even without explicit
  // second-floor specs, so the section auto-stacks when a floor is added in plan.
  const secondFloor = effectiveSecondFloor(project);
  const stack = buildSectionStack(project);
  const footingWidth = computeFootingWidth(s.foundation);

  // Width + interior-wall layout: cut analysis overrides the default when a
  // placed cut is provided AND it intersects at least two walls (otherwise
  // we fall back to the default building width so the user still gets a
  // meaningful drawing).
  const cutAnalysis = cut ? analyzeSectionCut(project, cut) : null;
  const useCut = !!(cutAnalysis && cutAnalysis.leftHit && cutAnalysis.rightHit);
  const buildingWidth = useCut ? cutAnalysis!.sectionWidth : computeBuildingWidth(project);
  const halfBuildingWidth = buildingWidth / 2;
  // Viewing direction: the section MIRRORS with the cut's facing arrow. Plan
  // position maps to section X as `(planPos − center) × dirSign`. dirSign flips
  // with `cut.facing` so the "Flip" control actually reverses the drawing, and
  // the default (facing = 1) is oriented so the side matches the arrow.
  const dirSign = -(cut?.facing ?? 1);
  // Interior wall section X positions (centerline coords, section frame
  // where 0 = building center). Empty for the Typical view.
  const interiorWallSectionXs: { x: number; thickness: number }[] = useCut
    ? cutAnalysis!.interior.map(h => ({ x: (h.pos - cutAnalysis!.centerPlanX) * dirSign, thickness: h.thickness }))
    : [];
  // Roof condition, derived from the real roof topology (NOT a bbox guess) by
  // sampling roofHeightAt along the cut — the same source the elevations use.
  // A clean centered peak → the parametric gable block (birds-mouth / ridge /
  // collar tie). Anything else with height → the honest sampled roof surface.
  // `effectiveRoofPitch` is hoisted to function scope and used by the wall
  // sheathing (trim top to birds-mouth plumb cut) and the ceiling joists: it
  // is the real pitch only for a gable, and 0 otherwise (so walls/CJ get the
  // flat treatment while the roof block draws the true surface separately).
  const roofOverhang = Math.max(0, project.roof.overhang || 0);
  let roofShape = classifySectionRoof(
    project, cut, cutAnalysis, halfBuildingWidth, roofOverhang, stack.topOfWallsY,
  );

  // ── Setback (smaller upper floor) detection ────────────────────────────────
  // When the cut crosses a genuine setback, the upper floor occupies only PART
  // of the section width: the covered sub-span draws full (2-story) height, the
  // rest draws one story, and the roof steps. Everything below is GATED on
  // `setbackCut` so single-story and identical-footprint two-story sections stay
  // byte-identical. The upper-floor span is found by re-running the cut analysis
  // against ONLY the upper level, mapped into the same section frame as the
  // first-floor walls ((planPos − centerPlanX) × dirSign).
  const fullLeftIn = -halfBuildingWidth;
  const fullRightIn = +halfBuildingWidth;
  let setbackCut = false;       // cut crosses the step: part 2-story, part 1-story
  let oneStoryCut = false;      // cut lies entirely in a one-story region of a setback house
  let upperLeftIn = fullLeftIn;     // section-X span of the upper floor (= full when not setback)
  let upperRightIn = fullRightIn;
  if (useCut && cut && secondFloor && hasSetback(project)) {
    const tiers = buildRoofTiers(project);
    const upper = project.levels.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    const caU = analyzeSectionCut({ ...project, activeLevelId: upper.id }, cut);
    if (caU.leftHit && caU.rightHit) {
      const e1 = (caU.leftHit.pos - cutAnalysis!.centerPlanX) * dirSign;
      const e2 = (caU.rightHit.pos - cutAnalysis!.centerPlanX) * dirSign;
      const uL = Math.min(e1, e2), uR = Math.max(e1, e2);
      // Genuine setback only when the upper span is meaningfully narrower than
      // the full section width (one or both sides drop to a single story).
      if (uR - uL < (fullRightIn - fullLeftIn) - 6) {
        setbackCut = true;
        upperLeftIn = Math.max(uL, fullLeftIn);
        upperRightIn = Math.min(uR, fullRightIn);
      }
    } else {
      // The upper floor doesn't span this cut at all → the section is entirely
      // in a one-story region (e.g. a transverse cut through the wing). Drop the
      // second floor and ceil/roof at the first-floor plate.
      oneStoryCut = true;
    }
    if (setbackCut || oneStoryCut) {
      // Honest roof surface from the tiers (main roof + lower wing roof tying
      // into the 2-story wall, or just the wing roof for a one-story cut).
      // Sampled in the PRE-dirSign frame (planPos = centerPlanX + sx) to match
      // the profile renderer, which re-applies dirSign. Absolute world Y comes
      // straight from roofHeightAtAbsolute.
      const towY = oneStoryCut ? stack.firstFloorPlateTopY : stack.topOfWallsY;
      const center = cutAnalysis!.centerPlanX;
      const planAt = (sx: number): Vec2 =>
        cut.axis === 'y' ? { x: cut.position, y: center + sx } : { x: center + sx, y: cut.position };
      const surface: Vec2[] = [];
      let maxAbs = -Infinity;
      for (let sx = fullLeftIn - roofOverhang; sx <= fullRightIn + roofOverhang + 0.001; sx += 4) {
        const y = roofHeightAtAbsolute(tiers, planAt(sx));
        if (y == null) continue;
        surface.push({ x: sx, y });
        if (y > maxAbs) maxAbs = y;
      }
      if (surface.length >= 2 && Number.isFinite(maxAbs)) {
        const maxAboveWalls = maxAbs - towY;
        roofShape = { kind: 'profile', pitch: roofShape.pitch, maxAboveWalls, equalAboveWalls: roofShape.equalAboveWalls, surface };
      }
      // else (no tier roof over the cut → flat-roof building): keep the flat
      // shape from classifySectionRoof; the roof block draws it at `towY`.
    }
  }
  // Whether THIS section draws a second floor, and the top-of-walls datum the
  // ceiling/roof/T-O reference. Both collapse to the legacy values unless this
  // is a one-story cut through a setback house, keeping all other output identical.
  const drawSecondFloor = !!secondFloor && !oneStoryCut;
  const towY = oneStoryCut ? stack.firstFloorPlateTopY : stack.topOfWallsY;
  // A gable section is drawn at the roof's TRUE pitch (the design pitch), so a
  // 6:12 roof draws and labels 6:12 regardless of how wide this particular cut
  // is. Its ridge height then follows honestly from that pitch over the
  // section's half-width. (Earlier an "equal-height" convention back-solved a
  // steeper pitch so every section reached the building's tallest ridge — but
  // that mislabels the pitch and is plain wrong when a house genuinely has
  // roofs at different heights, e.g. a setback wing.)
  const effectiveRoofPitch = roofShape.kind === 'gable' ? roofShape.pitch : 0;
  const roofPitchRatio = effectiveRoofPitch / 12;

  // Constants used inside the section (matched to the legacy draw function).
  const PLATE_WIDTH = 3.5;     // 2× stud / plate actual width
  const PLATE_THICK = 1.5;     // 2× stud / plate actual thickness
  const RIM_THICKNESS = 1.5;
  const wallT = s.foundation.wallThickness;

  // Interior wall block — vertical stud column (3.5") centered on `sectionX`,
  // with sole + doubled top plate and drywall both sides. Sole plate is
  // omitted on slab-on-grade for the FIRST floor (matches the exterior wall
  // treatment: studs bear directly on the slab). Used by cut-driven sections
  // to add interior walls along the cut.
  const addInteriorWallBlock = (sectionX: number, idx: number, floor: 1 | 2) => {
    const floorTopY = floor === 1 ? stack.firstFloorPlateTopY : stack.secondFloorPlateTopY!;
    const floorBotY = floor === 1 ? stack.joistBandTopY        : stack.secondJoistBandTopY!;
    const tpTopY    = floorTopY;
    const tpMidY    = floorTopY - PLATE_THICK;
    const tpBotY    = floorTopY - PLATE_THICK * 2;
    const studL     = sectionX - PLATE_WIDTH / 2;
    const studR     = sectionX + PLATE_WIDTH / 2;
    const isSlabFirst = floor === 1 && s.foundation.type === 'slab';
    // Bottom plate + stud seat. On slab-on-grade the partition bears on a
    // SINGLE 2× bottom plate (PLATE_THICK) resting directly on the slab
    // (slabTopY), and the studs seat on top of it. Platform framing instead
    // lays a single sole plate over the subfloor, with the studs sharing the
    // floorBotY datum.
    const plateBotY = isSlabFirst ? stack.slabTopY : floorBotY;
    const plateTopY = plateBotY + PLATE_THICK;
    const studBotY  = isSlabFirst ? plateTopY : floorBotY;
    // 3.5" stud envelope, plate-top to ceiling.
    closedRect(studL, studBotY, studR, floorTopY, 'normal', `int-wall-${floor}-${idx}`);
    // Single 2× bottom/sole plate.
    closedRect(studL, plateBotY, studR, plateTopY, 'lumber-x', `int-sole-${floor}-${idx}`);
    // Doubled top plate.
    closedRect(studL, tpMidY, studR, tpTopY, 'lumber-x', `int-tp-${floor}-${idx}-top`);
    closedRect(studL, tpBotY, studR, tpMidY, 'lumber-x', `int-tp-${floor}-${idx}-bot`);
    // 1/2" drywall both sides — interior partitions are finished on each face.
    // On slab, extend drywall down to the slab top (bottom of the plate) so it
    // doesn't stop short above the gap-filling bottom plate.
    const dwBotY = isSlabFirst ? stack.slabTopY : floorBotY;
    line(
      { x: studL - SHEETROCK_THICKNESS, y: floorTopY },
      { x: studL - SHEETROCK_THICKNESS, y: dwBotY },
      'sheathing', `int-dw-l-${floor}-${idx}`,
    );
    line(
      { x: studR + SHEETROCK_THICKNESS, y: floorTopY },
      { x: studR + SHEETROCK_THICKNESS, y: dwBotY },
      'sheathing', `int-dw-r-${floor}-${idx}`,
    );
  };

  // LEFT wall reference Xs
  const wallLeftIn   = -halfBuildingWidth;          // outside face of wall framing (= foundation outside)
  const wallRightIn  = wallLeftIn + wallT;
  const wallCenterIn = wallLeftIn + wallT / 2;
  // Stud framing column — 3.5" wide, flush with the foundation, rim joist,
  // and sill plate outside face. Sheathing extends OUTSIDE this as a
  // separate thin parallel line; drywall is INSIDE as another separate line.
  const studLeftIn   = wallLeftIn;
  const studRightIn  = studLeftIn + PLATE_WIDTH;
  // RIGHT wall reference Xs (mirrored)
  const rWallOutIn    = +halfBuildingWidth;
  const rWallInIn     = rWallOutIn - wallT;
  const rWallCenterIn = rWallOutIn - wallT / 2;
  const rStudRightIn  = rWallOutIn;
  const rStudLeftIn   = rStudRightIn - PLATE_WIDTH;
  // Slab + joist bands span the FULL interior between the two inside faces.
  const interiorLeftIn  = wallRightIn;
  const interiorRightIn = rWallInIn;

  // ── Foundation: footings (both sides) ──────────────────────────────────
  // Footings draw for any foundation type with a wall height > 0 — including
  // slab-on-grade, which now has a stem wall + footing supporting the sill.
  if (s.foundation.wallHeight > 0) {
    for (const cx of [wallCenterIn, rWallCenterIn]) {
      const footLeft  = cx - footingWidth / 2;
      const footRight = cx + footingWidth / 2;
      const kwLeft  = cx - KEYWAY_WIDTH / 2;
      const kwRight = cx + KEYWAY_WIDTH / 2;
      const topY = stack.footingTopY;
      const botY = stack.footingBottomY;
      if (s.foundation.keyway) {
        // 8-vertex outline with a notch in the top edge for the keyway.
        closedPoly([
          { x: footLeft,  y: topY },
          { x: kwLeft,    y: topY },
          { x: kwLeft,    y: topY - KEYWAY_DEPTH },
          { x: kwRight,   y: topY - KEYWAY_DEPTH },
          { x: kwRight,   y: topY },
          { x: footRight, y: topY },
          { x: footRight, y: botY },
          { x: footLeft,  y: botY },
        ], 'normal', 'footing');
      } else {
        closedRect(footLeft, botY, footRight, topY, 'normal', 'footing');
      }
    }
  }

  // ── Foundation walls (both sides) ──────────────────────────────────────
  // When a keyway is enabled, the wall outline includes a downward
  // protrusion into the keyway notch in the footing — so the wall's bottom
  // edge no longer crosses ABOVE the keyway groove (removes the extra
  // horizontal line that read as a "lid" on the keyway).
  if (s.foundation.wallHeight > 0) {
    const wallBotKwY = stack.foundationWallBottomY - KEYWAY_DEPTH;
    for (const [wxIn, wxOut, cx, tag] of [
      [wallLeftIn, wallRightIn, wallCenterIn, 'foundation-wall-l'] as const,
      [rWallInIn,  rWallOutIn,  rWallCenterIn, 'foundation-wall-r'] as const,
    ]) {
      if (s.foundation.keyway) {
        const kwL = cx - KEYWAY_WIDTH / 2;
        const kwR = cx + KEYWAY_WIDTH / 2;
        closedPoly([
          { x: wxIn,  y: stack.foundationWallTopY },
          { x: wxOut, y: stack.foundationWallTopY },
          { x: wxOut, y: stack.foundationWallBottomY },
          { x: kwR,   y: stack.foundationWallBottomY },
          { x: kwR,   y: wallBotKwY },
          { x: kwL,   y: wallBotKwY },
          { x: kwL,   y: stack.foundationWallBottomY },
          { x: wxIn,  y: stack.foundationWallBottomY },
        ], 'normal', tag);
      } else {
        closedRect(wxIn, stack.foundationWallBottomY, wxOut, stack.foundationWallTopY, 'normal', tag);
      }
    }
  }

  // ── Slab ───────────────────────────────────────────────────────────────
  // Slab always spans the interior (between the two stem walls). For
  // slab-on-grade the slab top is at the floor finish; for full-basement
  // it rests on the footings.
  if (s.foundation.slabThickness > 0) {
    closedRect(interiorLeftIn, stack.slabBottomY, interiorRightIn, stack.slabTopY, 'normal', 'slab');
  }

  // ── Sill plates (doubled 2×4, both sides) ──────────────────────────────
  {
    const midY = (stack.sillPlateTopY + stack.sillPlateBottomY) / 2;
    // The sill plate is anchored to the foundation wall and supports the
    // rim joist directly above — both share the LEFT outside face of the
    // wall (= wallLeftIn). The stud column above sits inset by 0.5"
    // (sheathing thickness), so the sill plate is INTENTIONALLY not aligned
    // with the stud envelope above it — it's aligned with the rim joist.
    closedRect(wallLeftIn,                          midY,                     wallLeftIn + SILL_PLATE_BOARD_WIDTH, stack.sillPlateTopY, 'lumber-x', 'sill-l-top');
    closedRect(wallLeftIn,                          stack.sillPlateBottomY,   wallLeftIn + SILL_PLATE_BOARD_WIDTH, midY,                'lumber-x', 'sill-l-bot');
    closedRect(rWallOutIn - SILL_PLATE_BOARD_WIDTH, midY,                     rWallOutIn,                          stack.sillPlateTopY, 'lumber-x', 'sill-r-top');
    closedRect(rWallOutIn - SILL_PLATE_BOARD_WIDTH, stack.sillPlateBottomY,   rWallOutIn,                          midY,                'lumber-x', 'sill-r-bot');
  }

  // ── First-floor system: rim joists + floor joist band + subfloor ───────
  // Skipped for slab-on-grade — there's no joist band there; the slab IS
  // the first floor and the wall framing seats directly on the sill plate.
  if (s.foundation.type !== 'slab') {
    const joistActual = LUMBER_ACTUAL_DEPTH[s.firstFloor.joistDepth];
    const joistTopY = stack.joistBandBottomY + joistActual;
    const joistBotY = stack.joistBandBottomY;

    // LEFT rim joist (X-block)
    closedRect(wallLeftIn, joistBotY, wallLeftIn + RIM_THICKNESS, joistTopY, 'lumber-x', 'rim-l-1');
    // RIGHT rim joist (X-block)
    closedRect(rWallOutIn - RIM_THICKNESS, joistBotY, rWallOutIn, joistTopY, 'lumber-x', 'rim-r-1');

    // Floor-joist band between the two rim joists
    const fjLeftIn  = wallLeftIn  + RIM_THICKNESS;
    const fjRightIn = rWallOutIn  - RIM_THICKNESS;
    closedRect(fjLeftIn, joistBotY, fjRightIn, joistTopY, 'normal', 'fj-band-1');

    text(
      { x: wallLeftIn + 18, y: (joistTopY + joistBotY) / 2 },
      `${formatJoistLabel(s.firstFloor.joistDepth)} F.J. @ 16 O.C.`,
      { align: 'left', baseline: 'middle' },
      'fj-label-1',
    );

    // Subfloor sandwich — spans the FULL system end to end
    closedRect(wallLeftIn, joistTopY, rWallOutIn, stack.joistBandTopY, 'normal', 'subfloor-1');
  }

  // ── First-floor walls (both sides) ──────────────────────────────────────
  {
    const wallTopY = stack.firstFloorPlateTopY;
    const wallBotY = stack.joistBandTopY;
    const tpTopY   = stack.firstFloorPlateTopY;
    const tpMidY   = stack.firstFloorPlateTopY - PLATE_THICK;
    const tpBotY   = stack.firstFloorPlateTopY - PLATE_THICK * 2;
    const soleTopY = stack.joistBandTopY + PLATE_THICK;
    const soleBotY = stack.joistBandTopY;

    // LEFT envelope, plates, drywall/sheathing
    // LEFT envelope = stud column (3.5"), flush with the rim joist + sill
    // plate below. Sheathing extends 0.5" OUTSIDE the framing (a separate
    // thin line); drywall sits 0.5" INSIDE the framing (another thin line).
    // When this is the TOP floor (no second floor above), the sheathing top
    // is trimmed to the bottom of the birds-mouth plumb cut so it doesn't
    // visually cross into the rafter area.
    closedRect(studLeftIn, wallBotY,  studRightIn, wallTopY, 'normal',   'wall-env-l-1');
    // Sole plate is omitted on slab-on-grade — the studs bear directly on
    // the doubled sill plate, which IS the bottom plate. (Platform framing
    // has a separate sole plate above the subfloor; slab framing does not.)
    if (s.foundation.type !== 'slab') {
      closedRect(studLeftIn, soleBotY,  studRightIn, soleTopY, 'lumber-x', 'sole-l-1');
    }
    closedRect(studLeftIn, tpMidY,    studRightIn, tpTopY,   'lumber-x', 'tp-l-1-top');
    closedRect(studLeftIn, tpBotY,    studRightIn, tpMidY,   'lumber-x', 'tp-l-1-bot');
    // Wall sheathing:
    //   • top floor (no 2nd floor) with pitch → trim to the rafter's natural-
    //                                           slope bottom AT THE SHEATHING X.
    //                                           Sheathing sits 0.5" outside
    //                                           the studs, so the rafter is
    //                                           a touch lower there than at
    //                                           the wall outside — we account
    //                                           for that with (PLATE_WIDTH +
    //                                           WALL_SHEATHING_THICKNESS) × pitch.
    //   • mid floor (2nd floor exists)       → extend UP through the floor
    //                                           band to meet the 2nd-floor
    //                                           wall sheathing (continuous).
    //   • flat roof / no pitch               → stop at wall top.
    // A side is "top floor" (1 story) when there is no second floor above it.
    // For a setback cut each side is decided independently: the one-story wing
    // wall is top-floor even though the building has a second floor over the
    // other side. When not a setback this collapses to the legacy whole-floor
    // `!secondFloor` test, so output is unchanged.
    const leftHas2  = drawSecondFloor && (!setbackCut || upperLeftIn  <= fullLeftIn + 3);
    const rightHas2 = drawSecondFloor && (!setbackCut || upperRightIn >= fullRightIn - 3);
    const sheathTopFor = (has2: boolean) => has2
      ? stack.secondJoistBandTopY!
      : (roofPitchRatio > 0
          ? wallTopY - (PLATE_WIDTH + WALL_SHEATHING_THICKNESS) * roofPitchRatio
          : wallTopY);
    const sheathTopY1L = sheathTopFor(leftHas2);
    const sheathTopY1R = sheathTopFor(rightHas2);
    // First-floor wall sheathing extends DOWN past the sill plate to just
    // past the top of the foundation wall (slab-on-grade now has a stem
    // wall too, so this applies to all foundation types with wallHeight > 0).
    const sheathBotY1 = s.foundation.wallHeight > 0
      ? stack.foundationWallTopY - 2
      : wallBotY;
    // Interior drywall: for slab-on-grade extend it DOWN to the foundation
    // wall top (= slab top), forming a clean inside corner with the slab.
    // For platform framing it stops at the wall bottom (= subfloor top).
    const drywallBotY1 = s.foundation.type === 'slab'
      ? stack.foundationWallTopY
      : wallBotY;
    line({ x: studLeftIn   - WALL_SHEATHING_THICKNESS, y: sheathTopY1L }, { x: studLeftIn   - WALL_SHEATHING_THICKNESS, y: sheathBotY1 }, 'sheathing', 'sheath-l-1');
    line({ x: studRightIn  + SHEETROCK_THICKNESS,      y: wallTopY    }, { x: studRightIn  + SHEETROCK_THICKNESS,      y: drywallBotY1 }, 'sheathing', 'drywall-l-1');

    // RIGHT envelope (mirror)
    closedRect(rStudLeftIn, wallBotY, rStudRightIn, wallTopY, 'normal',   'wall-env-r-1');
    if (s.foundation.type !== 'slab') {
      closedRect(rStudLeftIn, soleBotY, rStudRightIn, soleTopY, 'lumber-x', 'sole-r-1');
    }
    closedRect(rStudLeftIn, tpMidY,   rStudRightIn, tpTopY,   'lumber-x', 'tp-r-1-top');
    closedRect(rStudLeftIn, tpBotY,   rStudRightIn, tpMidY,   'lumber-x', 'tp-r-1-bot');
    line({ x: rStudRightIn + WALL_SHEATHING_THICKNESS, y: sheathTopY1R }, { x: rStudRightIn + WALL_SHEATHING_THICKNESS, y: sheathBotY1 }, 'sheathing', 'sheath-r-1');
    line({ x: rStudLeftIn  - SHEETROCK_THICKNESS,      y: wallTopY    }, { x: rStudLeftIn  - SHEETROCK_THICKNESS,      y: drywallBotY1 }, 'sheathing', 'drywall-r-1');
    // Sheathing termination ticks — tiny horizontal marks at the end(s) of
    // the wall sheathing, pointing INWARD just to the structural face (no
    // overshoot into the framing). Length = sheathing thickness (0.5") so
    // the tick stops exactly at the outside face of the framing/foundation.
    if (roofPitchRatio > 0) {
      const tickLen = WALL_SHEATHING_THICKNESS;
      if (!leftHas2) line(
        { x: studLeftIn  - WALL_SHEATHING_THICKNESS,           y: sheathTopY1L },
        { x: studLeftIn  - WALL_SHEATHING_THICKNESS + tickLen, y: sheathTopY1L },
        'sheathing', 'sheath-l-1-tick-top',
      );
      if (!rightHas2) line(
        { x: rStudRightIn + WALL_SHEATHING_THICKNESS,           y: sheathTopY1R },
        { x: rStudRightIn + WALL_SHEATHING_THICKNESS - tickLen, y: sheathTopY1R },
        'sheathing', 'sheath-r-1-tick-top',
      );
    }
    if (s.foundation.wallHeight > 0) {
      const tickLen = WALL_SHEATHING_THICKNESS;
      line(
        { x: studLeftIn  - WALL_SHEATHING_THICKNESS,           y: sheathBotY1 },
        { x: studLeftIn  - WALL_SHEATHING_THICKNESS + tickLen, y: sheathBotY1 },
        'sheathing', 'sheath-l-1-tick-bot',
      );
      line(
        { x: rStudRightIn + WALL_SHEATHING_THICKNESS,           y: sheathBotY1 },
        { x: rStudRightIn + WALL_SHEATHING_THICKNESS - tickLen, y: sheathBotY1 },
        'sheathing', 'sheath-r-1-tick-bot',
      );
    }
  }

  // ── Interior walls (first floor) ────────────────────────────────────────
  // Cut-driven only — Typical view has no interior walls (interiorWallSectionXs is empty).
  for (let i = 0; i < interiorWallSectionXs.length; i++) {
    addInteriorWallBlock(interiorWallSectionXs[i].x, i, 1);
  }

  // ── Second-floor stack (optional) ───────────────────────────────────────
  if (drawSecondFloor && stack.secondJoistBandTopY !== undefined && stack.secondFloorPlateTopY !== undefined) {
    const joistActual = LUMBER_ACTUAL_DEPTH[secondFloor.joistDepth];
    const joistBotY = stack.secondJoistBandBottomY!;
    const joistTopY = joistBotY + joistActual;

    // Setback: the upper floor (and its floor system) spans only the covered
    // sub-range [upperLeftIn, upperRightIn]; otherwise the full building width.
    // Stud columns are derived from those edges. When not a setback cut these
    // all equal the legacy full-width values, so output is byte-identical.
    const u2WallLeft   = setbackCut ? upperLeftIn  : wallLeftIn;
    const u2WallRight  = setbackCut ? upperRightIn : rWallOutIn;
    const u2StudLeftIn   = u2WallLeft;
    const u2StudRightIn  = u2WallLeft + PLATE_WIDTH;
    const ru2StudRightIn = u2WallRight;
    const ru2StudLeftIn  = u2WallRight - PLATE_WIDTH;

    closedRect(u2WallLeft, joistBotY, u2WallLeft + RIM_THICKNESS, joistTopY, 'lumber-x', 'rim-l-2');
    closedRect(u2WallRight - RIM_THICKNESS, joistBotY, u2WallRight, joistTopY, 'lumber-x', 'rim-r-2');

    const fjLeftIn  = u2WallLeft  + RIM_THICKNESS;
    const fjRightIn = u2WallRight - RIM_THICKNESS;
    closedRect(fjLeftIn, joistBotY, fjRightIn, joistTopY, 'normal', 'fj-band-2');
    text(
      { x: u2WallLeft + 18, y: (joistTopY + joistBotY) / 2 },
      `${formatJoistLabel(secondFloor.joistDepth)} F.J. @ 16 O.C.`,
      { align: 'left', baseline: 'middle' },
      'fj-label-2',
    );
    closedRect(u2WallLeft, joistTopY, u2WallRight, stack.secondJoistBandTopY, 'normal', 'subfloor-2');

    const wallTopY = stack.secondFloorPlateTopY;
    const wallBotY = stack.secondJoistBandTopY;
    const tpTopY = stack.secondFloorPlateTopY;
    const tpMidY = stack.secondFloorPlateTopY - PLATE_THICK;
    const tpBotY = stack.secondFloorPlateTopY - PLATE_THICK * 2;
    const soleTopY = stack.secondJoistBandTopY + PLATE_THICK;
    const soleBotY = stack.secondJoistBandTopY;

    closedRect(u2StudLeftIn, wallBotY,  u2StudRightIn, wallTopY, 'normal',   'wall-env-l-2');
    closedRect(u2StudLeftIn, soleBotY,  u2StudRightIn, soleTopY, 'lumber-x', 'sole-l-2');
    closedRect(u2StudLeftIn, tpMidY,    u2StudRightIn, tpTopY,   'lumber-x', 'tp-l-2-top');
    closedRect(u2StudLeftIn, tpBotY,    u2StudRightIn, tpMidY,   'lumber-x', 'tp-l-2-bot');
    // Second-floor walls always have the rafter above, so the sheathing top
    // is trimmed to the rafter's natural-slope bottom at the sheathing X
    // (one sheathing thickness outside the wall framing).
    const sheathTopY2 = roofPitchRatio > 0
      ? wallTopY - (PLATE_WIDTH + WALL_SHEATHING_THICKNESS) * roofPitchRatio
      : wallTopY;
    line({ x: u2StudLeftIn   - WALL_SHEATHING_THICKNESS, y: sheathTopY2 }, { x: u2StudLeftIn   - WALL_SHEATHING_THICKNESS, y: wallBotY }, 'sheathing', 'sheath-l-2');
    line({ x: u2StudRightIn  + SHEETROCK_THICKNESS,      y: wallTopY    }, { x: u2StudRightIn  + SHEETROCK_THICKNESS,      y: wallBotY }, 'sheathing', 'drywall-l-2');

    closedRect(ru2StudLeftIn, wallBotY, ru2StudRightIn, wallTopY, 'normal',   'wall-env-r-2');
    closedRect(ru2StudLeftIn, soleBotY, ru2StudRightIn, soleTopY, 'lumber-x', 'sole-r-2');
    closedRect(ru2StudLeftIn, tpMidY,   ru2StudRightIn, tpTopY,   'lumber-x', 'tp-r-2-top');
    closedRect(ru2StudLeftIn, tpBotY,   ru2StudRightIn, tpMidY,   'lumber-x', 'tp-r-2-bot');
    line({ x: ru2StudRightIn + WALL_SHEATHING_THICKNESS, y: sheathTopY2 }, { x: ru2StudRightIn + WALL_SHEATHING_THICKNESS, y: wallBotY }, 'sheathing', 'sheath-r-2');
    line({ x: ru2StudLeftIn  - SHEETROCK_THICKNESS,      y: wallTopY    }, { x: ru2StudLeftIn  - SHEETROCK_THICKNESS,      y: wallBotY }, 'sheathing', 'drywall-r-2');
    if (roofPitchRatio > 0) {
      const tickLen = WALL_SHEATHING_THICKNESS;
      line(
        { x: u2StudLeftIn  - WALL_SHEATHING_THICKNESS,           y: sheathTopY2 },
        { x: u2StudLeftIn  - WALL_SHEATHING_THICKNESS + tickLen, y: sheathTopY2 },
        'sheathing', 'sheath-l-2-tick',
      );
      line(
        { x: ru2StudRightIn + WALL_SHEATHING_THICKNESS,           y: sheathTopY2 },
        { x: ru2StudRightIn + WALL_SHEATHING_THICKNESS - tickLen, y: sheathTopY2 },
        'sheathing', 'sheath-r-2-tick',
      );
    }

    // Interior walls (second floor) — same plan positions as first floor in v1.
    // For a setback cut, skip any partition at/outside the upper-floor edges
    // (the step itself is drawn as the upper exterior wall above, and walls in
    // the one-story wing have no second floor over them).
    for (let i = 0; i < interiorWallSectionXs.length; i++) {
      const ix = interiorWallSectionXs[i].x;
      if (setbackCut && (ix <= upperLeftIn + 2 || ix >= upperRightIn - 2)) continue;
      addInteriorWallBlock(ix, i, 2);
    }
  }

  // ── Ceiling joist (full-width band on plates; bevelled outside ends if
  // pitched roof) ─────────────────────────────────────────────────────────
  {
    const cjActual = LUMBER_ACTUAL_DEPTH[s.ceiling.joistDepth];
    const cjBotY = towY;
    const cjTopY = towY + cjActual;
    const pitchForCJ = effectiveRoofPitch / 12;
    if (setbackCut) {
      // Stepped ceiling: the 2-story portion ceils at the top of walls; each
      // one-story wing ceils at the first-floor plate (its own roof springs
      // from there and dies into the 2-story wall). Flat bands — a setback cut
      // uses the honest profile roof (pitch 0 here), so no bevels.
      const cjLabel = `2×${s.ceiling.joistDepth} C.J. @ 16 O.C.`;
      const mainL = upperLeftIn + PLATE_WIDTH;
      const mainR = upperRightIn - PLATE_WIDTH;
      if (mainR - mainL > 1) {
        closedRect(mainL, cjBotY, mainR, cjTopY, 'normal', 'ceiling-joist');
        text({ x: mainL + 8, y: (cjTopY + cjBotY) / 2 }, cjLabel, { align: 'left', baseline: 'middle' }, 'cj-label');
        line(
          { x: mainL + SHEETROCK_THICKNESS, y: cjBotY - SHEETROCK_THICKNESS },
          { x: mainR - SHEETROCK_THICKNESS, y: cjBotY - SHEETROCK_THICKNESS },
          'sheathing', 'ceiling-drywall',
        );
      }
      const wBotY = stack.firstFloorPlateTopY;
      const wTopY = stack.firstFloorPlateTopY + cjActual;
      const wings: [number, number, string][] = [];
      if (upperLeftIn  > fullLeftIn  + 3) wings.push([studRightIn, upperLeftIn,  'wL']);
      if (upperRightIn < fullRightIn - 3) wings.push([upperRightIn, rStudLeftIn, 'wR']);
      for (const [a, b, tag] of wings) {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        closedRect(lo, wBotY, hi, wTopY, 'normal', `ceiling-joist-${tag}`);
        text({ x: lo + 8, y: (wTopY + wBotY) / 2 }, cjLabel, { align: 'left', baseline: 'middle' }, `cj-label-${tag}`);
        line(
          { x: lo + SHEETROCK_THICKNESS, y: wBotY - SHEETROCK_THICKNESS },
          { x: hi - SHEETROCK_THICKNESS, y: wBotY - SHEETROCK_THICKNESS },
          'sheathing', `ceiling-drywall-${tag}`,
        );
      }
    } else if (pitchForCJ > 0) {
      const slopeRunRaw = cjActual / pitchForCJ;
      const slopeRun = Math.min(slopeRunRaw, Math.max(0, halfBuildingWidth - 8));
      // CJ ends at the inside face of the top plate (= studRightIn / rStudLeftIn),
      // where the rafter's natural slope starts. Bevels follow the rafter
      // slope so the CJ top meets the rafter bottom cleanly.
      const cjLeftBotX  = studRightIn;
      const cjLeftTopX  = studRightIn + slopeRun;
      const cjRightBotX = rStudLeftIn;
      const cjRightTopX = rStudLeftIn - slopeRun;
      closedPoly([
        { x: cjLeftTopX,  y: cjTopY },
        { x: cjRightTopX, y: cjTopY },
        { x: cjRightBotX, y: cjBotY },
        { x: cjLeftBotX,  y: cjBotY },
      ], 'normal', 'ceiling-joist');
      text(
        { x: cjLeftTopX + 8, y: (cjTopY + cjBotY) / 2 },
        `2×${s.ceiling.joistDepth} C.J. @ 16 O.C.`,
        { align: 'left', baseline: 'middle' },
        'cj-label',
      );
    } else {
      closedRect(studRightIn, cjBotY, rStudLeftIn, cjTopY, 'normal', 'ceiling-joist');
      text(
        { x: studRightIn + 8, y: (cjTopY + cjBotY) / 2 },
        `2×${s.ceiling.joistDepth} C.J. @ 16 O.C.`,
        { align: 'left', baseline: 'middle' },
        'cj-label',
      );
    }
    // 1/2" sheetrock ceiling line — terminates at each wall's drywall line
    // (studRightIn + SHEETROCK_THICKNESS on the LEFT, rStudLeftIn − SHEETROCK_THICKNESS
    // on the RIGHT), forming a clean inside corner. (Setback drew its own
    // stepped ceiling-drywall lines per portion above.)
    if (!setbackCut) line(
      { x: studRightIn + SHEETROCK_THICKNESS, y: cjBotY - SHEETROCK_THICKNESS },
      { x: rStudLeftIn - SHEETROCK_THICKNESS, y: cjBotY - SHEETROCK_THICKNESS },
      'sheathing', 'ceiling-drywall',
    );
  }

  // ── Roof rafters + ridge board + collar tie + roof sheathing + pitch ──
  {
    const pitch = effectiveRoofPitch;
    const pitchRatio = pitch / 12;
    const overhang = Math.max(0, project.roof.overhang || 0);
    const rafterNom = project.roof.rafterDepth ?? 10;
    const rafterActual = LUMBER_ACTUAL_DEPTH[rafterNom];

    if (roofShape.kind === 'gable' && pitchRatio > 0) {
      const theta = Math.atan(pitchRatio);
      const cosT = Math.cos(theta);
      const rafterVertThick = rafterActual / cosT;
      const RIDGE_BOARD_W = 1.5;
      const halfRidge = RIDGE_BOARD_W / 2;

      const seatY = stack.topOfWallsY;
      const ridgeX = 0;
      // Birds-mouth geometry: each rafter has a plumb cut at the outside
      // face of the wall sheathing and a horizontal seat across the top
      // plate. The natural slope of the rafter "lifts off" the seat at the
      // seat-inside edge (= the inside face of the stud column). The ridge
      // bottom is determined by extending the natural slope from the seat-
      // inside edge inward to the ridge centerline (minus half ridge-board).
      const leftSeatStartX  = wallLeftIn;       // LEFT plumb cut location
      const leftSeatEndX    = studRightIn;      // LEFT seat-inside (rafter lifts off here)
      const rightSeatStartX = rWallOutIn;       // RIGHT plumb cut location
      const rightSeatEndX   = rStudLeftIn;      // RIGHT seat-inside
      const seatWidthIn     = leftSeatEndX - leftSeatStartX;   // = sheathing + stud width
      const leftRafterRX    = ridgeX - halfRidge;
      const rightRafterLX   = ridgeX + halfRidge;
      // Ridge bottom Y: extend slope (pitchRatio) from seat-inside Y (= seatY)
      // inward to the ridge. ridgeBoardBottomY drops by `seatWidthIn × pitch`
      // relative to the legacy no-birds-mouth value, which is correct — the
      // seat depth lowers the rafter (and the ridge it meets).
      const leftRafterRBotY = seatY + (leftRafterRX - leftSeatEndX) * pitchRatio;
      const ridgeBoardBottomY = leftRafterRBotY;
      const ridgeBoardTopY    = ridgeBoardBottomY + rafterVertThick;

      // LEFT rafter — birds mouth notch + LEVEL-CUT tail. The rafter tail is
      // cut horizontally on its underside so only FASCIA_DEPTH of the plumb
      // cut shows as fascia; the pointed triangle below the cut is gone.
      const leftEaveX     = leftSeatStartX - overhang;
      // Natural bottom at wall outside drops below seatY by (seat width × pitch).
      const leftOutsideBotY = seatY - seatWidthIn * pitchRatio;
      const leftEaveBotY    = leftOutsideBotY - overhang * pitchRatio;
      const leftEaveTopY    = leftEaveBotY + rafterVertThick;
      const leftTailCutY    = leftEaveTopY - FASCIA_DEPTH;                 // level-cut height (6" fascia)
      const leftTailInnerX  = leftSeatStartX - (leftOutsideBotY - leftTailCutY) / pitchRatio; // where cut meets underside
      closedPoly([
        { x: leftEaveX,       y: leftTailCutY },                          // tail level-cut bottom (at tip)
        { x: leftTailInnerX,  y: leftTailCutY },                          // level cut in to natural underside
        { x: leftSeatStartX,  y: leftOutsideBotY },                       // plumb cut bottom (birds mouth heel)
        { x: leftSeatStartX,  y: seatY },                                 // plumb cut top (= seat outside)
        { x: leftSeatEndX,    y: seatY },                                 // seat inside (rafter lifts off)
        { x: leftRafterRX,    y: leftRafterRBotY },                       // ridge bottom
        { x: leftRafterRX,    y: leftRafterRBotY + rafterVertThick },     // ridge top
        { x: leftEaveX,       y: leftEaveTopY },                          // eave top (closes down 6" to tail cut)
      ], 'normal', 'rafter-l');

      // RIGHT rafter (mirror, also with birds mouth + level-cut tail)
      const rightEaveX        = rightSeatStartX + overhang;
      const rightOutsideBotY  = seatY - seatWidthIn * pitchRatio;
      const rightEaveBotY     = rightOutsideBotY - overhang * pitchRatio;
      const rightEaveTopY     = rightEaveBotY + rafterVertThick;
      const rightTailCutY     = rightEaveTopY - FASCIA_DEPTH;
      const rightTailInnerX   = rightSeatStartX + (rightOutsideBotY - rightTailCutY) / pitchRatio;
      const rightRafterLBotY  = leftRafterRBotY;   // symmetric
      closedPoly([
        { x: rightRafterLX,   y: rightRafterLBotY },                      // ridge bottom (inner)
        { x: rightSeatEndX,   y: seatY },                                 // seat inside
        { x: rightSeatStartX, y: seatY },                                 // plumb cut top
        { x: rightSeatStartX, y: rightOutsideBotY },                      // plumb cut bottom (birds mouth heel)
        { x: rightTailInnerX, y: rightTailCutY },                         // natural underside down to level cut
        { x: rightEaveX,      y: rightTailCutY },                         // level cut out to tip
        { x: rightEaveX,      y: rightEaveTopY },                         // eave top
        { x: rightRafterLX,   y: rightRafterLBotY + rafterVertThick },    // ridge top
      ], 'normal', 'rafter-r');

      // Ridge board (X-block) between the two rafters
      closedRect(ridgeX - halfRidge, ridgeBoardBottomY, ridgeX + halfRidge, ridgeBoardTopY, 'lumber-x', 'ridge');

      // 5/8" roof sheathing — thin lines above each rafter's top edge. The
      // two sheathing lines extend past the rafter ends and MEET at the
      // ridge centerline (x = 0), forming a peak point. Sheathing in real
      // construction continues across the ridge rather than stopping at
      // the rafter ends. Each sheathing line terminates with a short
      // vertical cap at the eave end (drops from sheathing top down to
      // rafter top, length = sheathing thickness).
      const leftEaveSheathTopY  = leftEaveBotY  + rafterVertThick + ROOF_SHEATHING_THICKNESS;
      const rightEaveSheathTopY = rightEaveBotY + rafterVertThick + ROOF_SHEATHING_THICKNESS;
      // Y of the peak where both sheathing lines meet at x = 0. Extend
      // LEFT slope from (leftRafterRX, …) inward by `halfRidge` at pitchRatio.
      const ridgePeakSheathY =
        leftRafterRBotY + rafterVertThick + ROOF_SHEATHING_THICKNESS + halfRidge * pitchRatio;
      line(
        { x: leftEaveX, y: leftEaveSheathTopY },
        { x: 0,         y: ridgePeakSheathY },
        'sheathing', 'roof-sheath-l',
      );
      line(
        { x: leftEaveX, y: leftEaveBotY + rafterVertThick },
        { x: leftEaveX, y: leftEaveSheathTopY },
        'sheathing', 'roof-sheath-l-cap',
      );
      line(
        { x: 0,          y: ridgePeakSheathY },
        { x: rightEaveX, y: rightEaveSheathTopY },
        'sheathing', 'roof-sheath-r',
      );
      line(
        { x: rightEaveX, y: rightEaveBotY + rafterVertThick },
        { x: rightEaveX, y: rightEaveSheathTopY },
        'sheathing', 'roof-sheath-r-cap',
      );

      // Rafter label — sloped along the inner-slope portion of the LEFT
      // rafter (from seat-end to ridge), positioned 75% along that span so
      // it sits clear of the birds-mouth area at the wall and well below
      // the ridge board. Inner slope is straight at pitchRatio, so the
      // label centers vertically in the rafter via a simple +rafterVertThick/2
      // bump. Angle computed in world coords (Y-up) and negated for canvas
      // rendering (Y-down) so the text reads naturally up the slope.
      const lbx1 = leftSeatEndX + (leftRafterRX - leftSeatEndX) * 0.5;
      const lby1 = seatY + (leftRafterRBotY - seatY) * 0.5;
      const lbx2 = leftRafterRX;
      const lby2 = leftRafterRBotY;
      const midBotX = (lbx1 + lbx2) / 2;
      const midBotY = (lby1 + lby2) / 2;
      text(
        { x: midBotX, y: midBotY + rafterVertThick / 2 },
        `2×${rafterNom} R.R. @ 16 O.C.`,
        {
          align: 'center', baseline: 'middle',
          angle: -Math.atan2(lby2 - lby1, lbx2 - lbx1),
          size: 10,
        },
        'rafter-label',
      );

      // Collar tie (only on attics with room)
      const atticHeight = ridgeBoardTopY - seatY;
      if (atticHeight > 18) {
        const COLLAR_TIE_HEIGHT = 3.5;
        const collarTopY = ridgeBoardTopY - atticHeight / 3;
        const collarBotY = collarTopY - COLLAR_TIE_HEIGHT;
        // Collar ties live high in the attic, in the rafter's natural-slope
        // region above the seat. The rafter bottom in that region is the
        // line from (seatEnd, seatY) up to (rafterRidgeX, rafterRidgeBotY)
        // — anchor X-at-Y at the seat-end, not at the eave (which now lies
        // below seatY due to the birds-mouth notch).
        const leftRafterBotXAt  = (y: number) => leftSeatEndX  + (y - seatY) / pitchRatio;
        const rightRafterBotXAt = (y: number) => rightSeatEndX - (y - seatY) / pitchRatio;
        const ctTopL = leftRafterBotXAt(collarTopY);
        const ctTopR = rightRafterBotXAt(collarTopY);
        const ctBotL = leftRafterBotXAt(collarBotY);
        const ctBotR = rightRafterBotXAt(collarBotY);
        closedPoly([
          { x: ctTopL, y: collarTopY },
          { x: ctTopR, y: collarTopY },
          { x: ctBotR, y: collarBotY },
          { x: ctBotL, y: collarBotY },
        ], 'normal', 'collar-tie');
        text(
          { x: (ctTopL + ctTopR) / 2, y: (collarTopY + collarBotY) / 2 },
          '2×4 C.T. @ 16 O.C.',
          { align: 'center', baseline: 'middle', size: 11 },
          'ct-label',
        );
      }

      // Pitch L-glyph — anchored ABOVE the rafter top at the eave, with the
      // rise arm extending DOWN toward (but clearing) the rafter. World
      // coords; sized in paper pixels (scales with zoom).
      out.push({
        id: id('pitch'),
        kind: 'pitchSymbol',
        anchor: { x: leftEaveX + 6, y: leftEaveBotY + rafterVertThick + 14 },
        // Round the LABEL to a clean ½-pitch (geometry stays exact) — the
        // equal-height back-solve yields values like 6.07 for the primary.
        pitch: Math.round(pitch * 2) / 2,
      });
    } else if (roofShape.kind === 'profile') {
      // Honest sampled roof surface — the cut runs UNDER / PARALLEL to a taller
      // roof, or through an off-center / compound roof, so this plane doesn't
      // bisect a ridge into a symmetric gable. Draw the real roof line from
      // roofHeightAt as a constant-depth rafter band + sheathing, at the true
      // height above the walls (no birds-mouth / ridge board — there is no
      // single in-plane peak to frame).
      // Mirror the sampled surface with the viewing direction, same as the
      // interior walls, so an asymmetric roof stays consistent when flipped.
      const surf = roofShape.surface.map(p => ({ x: p.x * dirSign, y: p.y }));
      if (surf.length >= 2) {
        const topEdge = surf.map(p => ({ x: p.x, y: p.y - ROOF_SHEATHING_THICKNESS }));
        const botEdge = surf.map(p => ({ x: p.x, y: p.y - ROOF_SHEATHING_THICKNESS - rafterActual }));
        out.push({
          id: id('roof-profile'), kind: 'polyline',
          verts: [...topEdge, ...botEdge.reverse()], closed: true, style: 'normal',
        });
        out.push({
          id: id('roof-sheath-profile'), kind: 'polyline',
          verts: surf.map(p => ({ ...p })), closed: false, style: 'sheathing',
        });
        const lbl = surf[Math.floor(surf.length * 0.3)];
        text(
          { x: lbl.x, y: lbl.y - ROOF_SHEATHING_THICKNESS - rafterActual / 2 },
          `2×${rafterNom} R.R. @ 16 O.C.`,
          { align: 'center', baseline: 'middle', size: 10 },
          'roof-label',
        );
      }
    } else {
      // Flat roof — single horizontal lumber band
      const topY = towY + rafterActual;
      const leftIn  = wallLeftIn - overhang;
      const rightIn = rWallOutIn + overhang;
      closedRect(leftIn, towY, rightIn, topY, 'normal', 'roof-flat');
      text(
        { x: wallLeftIn + 18, y: (topY + towY) / 2 },
        `2×${rafterNom} R.R. @ 16 O.C.`,
        { align: 'left', baseline: 'middle' },
        'roof-label',
      );
      line(
        { x: leftIn,  y: topY + ROOF_SHEATHING_THICKNESS },
        { x: rightIn, y: topY + ROOF_SHEATHING_THICKNESS },
        'sheathing', 'roof-sheath-flat',
      );
    }
  }

  // ── T/O elevations + dim chain ─────────────────────────────────────────
  type TO = { y: number; label: string | null };
  const gradeToFirstFloor = s.foundation.gradeToFirstFloor ?? 18;
  const tos: TO[] = [];
  // Slab-on-grade now has a stem wall + footing, so it gets the same
  // bottom-of-footing dim anchor and GRADE line as the other foundation
  // types (with a 10" default grade-to-floor instead of 18").
  tos.push({ y: stack.footingBottomY, label: null });
  tos.push({ y: stack.joistBandTopY - gradeToFirstFloor, label: 'GRADE' });
  tos.push({ y: stack.joistBandTopY, label: 'T/O 1ST FLOOR' });
  tos.push({ y: stack.firstFloorPlateTopY, label: 'T/O 1st FLOOR PLATE' });
  if (drawSecondFloor && stack.secondJoistBandTopY !== undefined && stack.secondFloorPlateTopY !== undefined) {
    tos.push({ y: stack.secondJoistBandTopY, label: 'T/O 2nd FLOOR' });
    tos.push({ y: stack.secondFloorPlateTopY, label: 'T/O 2nd FLOOR PLATE' });
  }
  // T/O ROOF
  {
    const rafterNom = project.roof.rafterDepth ?? 10;
    const rafterActual = LUMBER_ACTUAL_DEPTH[rafterNom];
    if (roofShape.kind === 'gable') {
      const pitchRatio = roofPitchRatio;   // equal-height pitch (see effectiveRoofPitch)
      const cosT = Math.cos(Math.atan(pitchRatio));
      // Matches the birds-mouth geometry in the rafter block: the inner slope
      // anchor is at the seat-inside edge, not the wall outside. The horizontal
      // run from there to the ridge centerline is `halfBuildingWidth - (seat
      // width + half ridge-board)` = `halfBuildingWidth - 4.25` (seat = 3.5"
      // = stud width, half ridge-board = 0.75").
      const ridgeBoardBottomY = stack.topOfWallsY + (halfBuildingWidth - 4.25) * pitchRatio;
      const ridgeBoardTopY = ridgeBoardBottomY + rafterActual / Math.max(cosT, 0.01);
      tos.push({ y: ridgeBoardTopY, label: 'T/O ROOF' });
    } else if (roofShape.kind === 'profile') {
      // True high point of the sampled roof surface (+ rafter depth above it).
      tos.push({ y: towY + roofShape.maxAboveWalls + rafterActual, label: 'T/O ROOF' });
    } else {
      tos.push({ y: towY + rafterActual, label: 'T/O ROOF' });
    }
  }
  tos.sort((a, b) => b.y - a.y);

  // T/O extension lines end SHORT of the structure (instead of touching the
  // wall outside face). This avoids the T/O ROOF line slicing through the
  // rafter overhang at the eave: the rafter quad extends from the eave end
  // (wallLeftIn − overhang) inward, and a horizontal line at the ridge Y
  // would cross it. We end all T/O lines at the same X — a uniform
  // architectural column right-edge — picked as `wallLeftIn − max(overhang+4, 20)`
  // so a fat overhang automatically pushes the line further left.
  const overhang = Math.max(0, project.roof.overhang || 0);
  const toLineLeftXIn  = wallLeftIn - TO_LINE_INSET_IN;
  const toLineRightXIn = wallLeftIn - Math.max(overhang + 4, 20);
  const dimChainXIn    = toLineLeftXIn - DIM_CHAIN_OFFSET_IN;
  const overallDimXIn  = dimChainXIn  - OVERALL_DIM_OFFSET_IN;

  for (const to of tos) {
    if (!to.label) continue;
    out.push({
      id: id('to-line'),
      kind: 'toLine',
      leftXIn: toLineLeftXIn,
      rightXIn: toLineRightXIn,
      yIn: to.y,
      label: to.label,
    });
  }
  for (let i = 0; i < tos.length - 1; i++) {
    const a = tos[i], b = tos[i + 1];
    const isRoofSegment = a.label === 'T/O ROOF';
    const txt = isRoofSegment ? 'pending roof plan' : formatImperial(Math.abs(a.y - b.y));
    out.push({
      id: id('dim'),
      kind: 'dimChain',
      xIn: dimChainXIn,
      y1In: a.y,
      y2In: b.y,
      text: txt,
    });
  }
  if (tos.length >= 2) {
    const top = tos[0].y;
    const gradeEntry = tos.find(t => t.label === 'GRADE');
    const bot = gradeEntry ? gradeEntry.y : tos[tos.length - 1].y;
    out.push({
      id: id('dim-overall'),
      kind: 'dimChain',
      xIn: overallDimXIn,
      y1In: top,
      y2In: bot,
      text: 'pending roof plan',
    });
  }

  return out;
}

// ── Renderer ────────────────────────────────────────────────────────────────
// Walks a primitive list and draws it to a canvas. Pure function of
// (primitives, projector) — no React state, no project access. The same
// function renders Auto mode and Drafting mode.

const COLOR_BY_KEY: Record<TextColor, string> = {
  ink: T.ink, inkSoft: T.inkSoft, inkMuted: T.inkMuted,
};

export function renderSectionPrimitives(
  ctx: CanvasRenderingContext2D,
  primitives: SectionPrimitive[],
  proj: Projector,
) {
  for (const p of primitives) {
    switch (p.kind) {
      case 'line':       drawPrimLine(ctx, p, proj); break;
      case 'polyline':   drawPrimPolyline(ctx, p, proj); break;
      case 'hatch':      drawPrimHatch(ctx, p, proj); break;
      case 'text':       drawPrimText(ctx, p, proj); break;
      case 'toLine':     drawPrimTOLine(ctx, p, proj); break;
      case 'dimChain':   drawPrimDimChain(ctx, p, proj); break;
      case 'dimLinear':  drawPrimDimLinear(ctx, p, proj); break;
      case 'pitchSymbol': drawPrimPitchSymbol(ctx, p, proj); break;
    }
  }
}

// Dash pattern (in paper pixels at zoom 1.0) per user-facing line style. Empty
// = solid. Values are scaled by `proj.zoom` at render time so patterns stay
// visually consistent across zoom levels (same "look" as text/ticks).
const LINE_DASH_PATTERN: Record<SectionLineStyle, number[]> = {
  normal:    [],
  sheathing: [],
  solid:     [],
  dashed:    [8, 4],
  dotted:    [1.5, 3],
  center:    [12, 3, 2, 3],
  hidden:    [4, 4],
  arrow:     [],
  thin:      [],
  thick:     [],
  ridge:     [],     // bold solid — primary roof framing
  valley:    [10, 4],// bold dashed — architectural convention for valleys
  hip:       [],     // bold solid — hip rafter (ridge end → eave corner)
};

function drawPrimLine(ctx: CanvasRenderingContext2D, p: PrimLine, proj: Projector) {
  ctx.strokeStyle = p.style === 'sheathing' ? T.inkSoft : T.ink;
  ctx.lineWidth =
      p.style === 'sheathing'                          ? 0.7
    : p.style === 'thin'                               ? 0.7
    : p.style === 'thick' || p.style === 'ridge' || p.style === 'hip' ? 2.2
    : p.style === 'valley'                             ? 1.8
    : 1.1;
  const pattern = LINE_DASH_PATTERN[p.style];
  if (pattern.length > 0) {
    ctx.setLineDash(pattern.map(d => d * proj.zoom));
  } else {
    ctx.setLineDash([]);
  }
  const ax = proj.sx(p.a.x), ay = proj.sy(p.a.y);
  const bx = proj.sx(p.b.x), by = proj.sy(p.b.y);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  if (pattern.length > 0) ctx.setLineDash([]);

  // Arrow line style: filled arrowhead at endpoint B (the second-click end).
  // Drawn in screen space so the tip stays a fixed size regardless of zoom.
  if (p.style === 'arrow') {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;
    const headLen = 10 * proj.zoom;
    const headWidth = 5 * proj.zoom;
    const baseX = bx - ux * headLen;
    const baseY = by - uy * headLen;
    const perpX = -uy;
    const perpY =  ux;
    ctx.fillStyle = T.ink;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(baseX + perpX * headWidth, baseY + perpY * headWidth);
    ctx.lineTo(baseX - perpX * headWidth, baseY - perpY * headWidth);
    ctx.closePath();
    ctx.fill();
  }
}

// Interior colour for a closed filled polygon (window glass, door slab, trim/
// white wall-shell). Matches the elevation SVG's `fillColor`.
function polyFillColor(fill: DrawingFillStyle | undefined): string | null {
  switch (fill) {
    case 'trim':  return '#ffffff';
    case 'glass': return '#d6dff3';
    case 'panel': return '#eae6db';
    case 'door':  return '#cdd2d9';
    default:      return null;   // 'none' / undefined
  }
}

function drawPrimPolyline(ctx: CanvasRenderingContext2D, p: PrimPolyline, proj: Projector) {
  if (p.verts.length < 2) return;
  // Fill closed polygons that carry a fill colour BEFORE stroking — this is
  // what brings the elevation's window/door colours and white wall shell into
  // the canvas (the SVG renderer fills; this one used to only stroke).
  const fillC = p.closed ? polyFillColor(p.fill) : null;
  if (fillC) {
    ctx.beginPath();
    ctx.moveTo(proj.sx(p.verts[0].x), proj.sy(p.verts[0].y));
    for (let i = 1; i < p.verts.length; i++) ctx.lineTo(proj.sx(p.verts[i].x), proj.sy(p.verts[i].y));
    ctx.closePath();
    ctx.fillStyle = fillC;
    ctx.fill();
  }
  ctx.strokeStyle = p.style === 'sheathing' ? T.inkSoft : T.ink;
  ctx.lineWidth   = p.style === 'sheathing' ? 0.7 : (p.style === 'lumber-x' ? 1.0 : 1.1);
  ctx.beginPath();
  ctx.moveTo(proj.sx(p.verts[0].x), proj.sy(p.verts[0].y));
  for (let i = 1; i < p.verts.length; i++) ctx.lineTo(proj.sx(p.verts[i].x), proj.sy(p.verts[i].y));
  if (p.closed) ctx.closePath();
  ctx.stroke();

  // Lumber X — only meaningful on closed 4-vertex polylines (rect outline).
  if (p.style === 'lumber-x' && p.closed && p.verts.length === 4) {
    const v = p.verts;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(proj.sx(v[0].x), proj.sy(v[0].y));
    ctx.lineTo(proj.sx(v[2].x), proj.sy(v[2].y));
    ctx.moveTo(proj.sx(v[1].x), proj.sy(v[1].y));
    ctx.lineTo(proj.sx(v[3].x), proj.sy(v[3].y));
    ctx.stroke();
  }
}

// Material hatches. The elevation SVG uses <pattern> fills; on canvas we clip to
// the polygon, lay a WHITE BACKING (so the hatch hides whatever's beneath — the
// reason it masks small outline gaps), then tile the pattern's strokes in WORLD
// inches and project each one (so it stays locked to the geometry at any
// pan/zoom). Spacings/colours mirror HatchDefs in ElevationsView.
const HATCH_LINE = '#565c75';
// Smallest feature spacing (inches) per pattern — used to skip the strokes when
// they'd be sub-readable (zoomed out), keeping just the clean white backing.
const HATCH_BASE_STEP: Record<HatchPattern, number> = {
  'lap-siding': 6, 'board-batten': 16, 'brick': 2.5, 'stone': 8,
  'stucco': 6, 'shake': 4, 'roof-shingles': 6, 'blank': 0,
};

function drawPrimHatch(ctx: CanvasRenderingContext2D, p: PrimHatch, proj: Projector) {
  const v = p.verts;
  if (v.length < 3) return;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(proj.sx(v[0].x), proj.sy(v[0].y));
    for (let i = 1; i < v.length; i++) ctx.lineTo(proj.sx(v[i].x), proj.sy(v[i].y));
    ctx.closePath();
  };
  ctx.save();
  // Opaque white backing (also the entirety of a 'blank' mask).
  path();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  if (p.pattern === 'blank' || HATCH_BASE_STEP[p.pattern] * proj.px < 3) { ctx.restore(); return; }
  // Clip to the polygon, then tile the pattern across its world bbox.
  path();
  ctx.clip();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of v) { minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y); }
  ctx.strokeStyle = HATCH_LINE;
  ctx.fillStyle = HATCH_LINE;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([]);
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath(); ctx.moveTo(proj.sx(x1), proj.sy(y1)); ctx.lineTo(proj.sx(x2), proj.sy(y2)); ctx.stroke();
  };
  const dotR = Math.max(0.4, 0.25 * proj.px);
  const dot = (x: number, y: number) => { ctx.beginPath(); ctx.arc(proj.sx(x), proj.sy(y), dotR, 0, Math.PI * 2); ctx.fill(); };
  const fl = (val: number, step: number) => Math.floor(val / step) * step;
  switch (p.pattern) {
    case 'lap-siding':
      for (let y = fl(minY, 6); y <= maxY; y += 6) seg(minX, y, maxX, y);
      break;
    case 'board-batten':
      for (let x = fl(minX, 16); x <= maxX; x += 16) seg(x, minY, x, maxY);
      break;
    case 'brick': {
      const rh = 2.5, bw = 8;
      let row = 0;
      for (let y = fl(minY, rh); y <= maxY; y += rh, row++) {
        seg(minX, y, maxX, y);
        const off = (((row % 2) + 2) % 2) ? bw / 2 : 0;
        for (let x = fl(minX - off, bw) + off; x <= maxX; x += bw) seg(x, y, x, Math.min(y + rh, maxY));
      }
      break;
    }
    case 'stone': {
      const tw = 24, th = 16;
      for (let ty = fl(minY, th); ty < maxY; ty += th)
        for (let tx = fl(minX, tw); tx < maxX; tx += tw) {
          seg(tx, ty, tx + tw, ty); seg(tx, ty + 8, tx + tw, ty + 8); seg(tx, ty, tx, ty + th);
          seg(tx + 10, ty, tx + 10, ty + 8);
          seg(tx + 7, ty + 8, tx + 7, ty + 16); seg(tx + 16, ty + 8, tx + 16, ty + 16);
        }
      break;
    }
    case 'stucco':
      for (let ty = fl(minY, 6); ty < maxY; ty += 6)
        for (let tx = fl(minX, 6); tx < maxX; tx += 6) { dot(tx + 1.5, ty + 1.5); dot(tx + 4, ty + 3); dot(tx + 2, ty + 5); }
      break;
    case 'shake': {
      const tw = 10, th = 8;
      for (let ty = fl(minY, th); ty < maxY; ty += th)
        for (let tx = fl(minX, tw); tx < maxX; tx += tw) {
          seg(tx, ty, tx + tw, ty); seg(tx, ty + 4, tx + tw, ty + 4);
          seg(tx, ty, tx, ty + 4); seg(tx + 5, ty, tx + 5, ty + 4); seg(tx + 10, ty, tx + 10, ty + 4);
          seg(tx + 2.5, ty + 4, tx + 2.5, ty + 8); seg(tx + 7.5, ty + 4, tx + 7.5, ty + 8);
        }
      break;
    }
    case 'roof-shingles': {
      const tw = 24, th = 12;
      for (let ty = fl(minY, th); ty < maxY; ty += th)
        for (let tx = fl(minX, tw); tx < maxX; tx += tw) {
          seg(tx, ty, tx + tw, ty); seg(tx, ty + 6, tx + tw, ty + 6);
          seg(tx, ty, tx, ty + 6); seg(tx + 12, ty, tx + 12, ty + 6);
          seg(tx + 6, ty + 6, tx + 6, ty + 12); seg(tx + 18, ty + 6, tx + 18, ty + 12);
        }
      break;
    }
  }
  ctx.restore();
}

function drawPrimText(ctx: CanvasRenderingContext2D, p: PrimText, proj: Projector) {
  // Text size scales with zoom — it's a real drawing element, not a UI
  // overlay. At extreme zoom-out it becomes unreadably tiny (intentional).
  const size = (p.size ?? 11) * proj.zoom;
  if (size < 1) return;
  ctx.fillStyle = COLOR_BY_KEY[p.color ?? 'ink'];
  ctx.font = `${size}px ui-sans-serif, system-ui`;
  ctx.textAlign = p.align ?? 'left';
  ctx.textBaseline = p.baseline ?? 'middle';
  const sx = proj.sx(p.at.x);
  const sy = proj.sy(p.at.y);
  if (p.angle) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(p.angle);
    ctx.fillText(p.content, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(p.content, sx, sy);
  }
}

function drawPrimTOLine(ctx: CanvasRenderingContext2D, p: PrimTOLine, proj: Projector) {
  const leftPx = proj.sx(p.leftXIn);
  const rightPx = proj.sx(p.rightXIn);
  const y = proj.sy(p.yIn);
  ctx.strokeStyle = T.inkSoft; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(leftPx, y); ctx.lineTo(rightPx, y); ctx.stroke();
  const fontSize = 10 * proj.zoom;
  if (fontSize < 1) return;
  ctx.fillStyle = T.ink;
  ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(p.label, leftPx, y - 2 * proj.zoom);
}

function drawPrimDimChain(ctx: CanvasRenderingContext2D, p: PrimDimChain, proj: Projector) {
  const xPx = proj.sx(p.xIn);
  const y1 = proj.sy(p.y1In);
  const y2 = proj.sy(p.y2In);
  ctx.strokeStyle = T.inkSoft; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(xPx, y1); ctx.lineTo(xPx, y2);
  ctx.stroke();
  // Tick marks scale with zoom so the dim chain stays proportional to the
  // drawing — matches text behavior and avoids the ticks looking giant at
  // low zoom.
  const TICK = 4 * proj.zoom;
  ctx.beginPath();
  ctx.moveTo(xPx - TICK, y1); ctx.lineTo(xPx + TICK, y1);
  ctx.moveTo(xPx - TICK, y2); ctx.lineTo(xPx + TICK, y2);
  ctx.stroke();
  const fontSize = 10 * proj.zoom;
  if (Math.abs(y2 - y1) < 22 * proj.zoom || fontSize < 1) return;
  ctx.save();
  ctx.translate(xPx - 5 * proj.zoom, (y1 + y2) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = T.ink;
  ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.text, 0, 0);
  ctx.restore();
}

// Linear dimension: extension lines from A and B, a dim line parallel to
// AB at the perpendicular `offset`, tick marks at the dim-line endpoints,
// and a label centered on the dim line (rotated to match AB so the text
// reads naturally up-the-slope). Sizes scale with zoom.
function drawPrimDimLinear(ctx: CanvasRenderingContext2D, p: PrimDimLinear, proj: Projector) {
  const dx = p.b.x - p.a.x;
  const dy = p.b.y - p.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  // Unit perpendicular (CCW from A→B in world Y-up).
  const nx = -dy / len;
  const ny =  dx / len;
  // Dim-line endpoints — offset from A and B in the perpendicular direction.
  const da = { x: p.a.x + nx * p.offset, y: p.a.y + ny * p.offset };
  const db = { x: p.b.x + nx * p.offset, y: p.b.y + ny * p.offset };
  // Extension-line endpoints — extend past the dim line by a small bump.
  const extBump = 3 / proj.px * proj.zoom; // ≈ 3 paper-px past the dim line
  const eaBeyond = { x: p.a.x + nx * (p.offset + Math.sign(p.offset || 1) * extBump),
                     y: p.a.y + ny * (p.offset + Math.sign(p.offset || 1) * extBump) };
  const ebBeyond = { x: p.b.x + nx * (p.offset + Math.sign(p.offset || 1) * extBump),
                     y: p.b.y + ny * (p.offset + Math.sign(p.offset || 1) * extBump) };

  ctx.save();
  ctx.strokeStyle = T.inkSoft;
  ctx.lineWidth = 0.7;

  // Extension lines (from anchors to just past the dim line).
  ctx.beginPath();
  ctx.moveTo(proj.sx(p.a.x), proj.sy(p.a.y));
  ctx.lineTo(proj.sx(eaBeyond.x), proj.sy(eaBeyond.y));
  ctx.moveTo(proj.sx(p.b.x), proj.sy(p.b.y));
  ctx.lineTo(proj.sx(ebBeyond.x), proj.sy(ebBeyond.y));
  ctx.stroke();

  // Dim line.
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(proj.sx(da.x), proj.sy(da.y));
  ctx.lineTo(proj.sx(db.x), proj.sy(db.y));
  ctx.stroke();

  // Tick marks at the dim-line endpoints — short slope-aligned ticks at
  // 45° (architectural convention).
  const TICK = 4 * proj.zoom;
  const sxA = proj.sx(da.x), syA = proj.sy(da.y);
  const sxB = proj.sx(db.x), syB = proj.sy(db.y);
  const screenAngle = Math.atan2(syB - syA, sxB - sxA);
  const tickAngle = screenAngle + Math.PI / 4;  // 45° from the dim line
  const tdx = Math.cos(tickAngle) * TICK;
  const tdy = Math.sin(tickAngle) * TICK;
  ctx.beginPath();
  ctx.moveTo(sxA - tdx, syA - tdy); ctx.lineTo(sxA + tdx, syA + tdy);
  ctx.moveTo(sxB - tdx, syB - tdy); ctx.lineTo(sxB + tdx, syB + tdy);
  ctx.stroke();

  // Label — centered on the dim line, rotated to match. Flip 180° if the
  // text would otherwise read upside-down (when AB direction is in the
  // left half-plane on screen).
  const fontSize = 10 * proj.zoom;
  if (fontSize >= 1) {
    const cxScr = (sxA + sxB) / 2;
    const cyScr = (syA + syB) / 2;
    let labelAngle = screenAngle;
    // Keep text right-reading: if cos(angle) < 0, flip.
    if (Math.cos(labelAngle) < 0) labelAngle += Math.PI;
    ctx.save();
    ctx.translate(cxScr, cyScr);
    ctx.rotate(labelAngle);
    // Lift the text just above the dim line so it doesn't sit on top of it.
    ctx.translate(0, -fontSize * 0.4);
    ctx.fillStyle = T.ink;
    ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatImperial(len), 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawPrimPitchSymbol(ctx: CanvasRenderingContext2D, p: PrimPitchSymbol, proj: Projector) {
  // L-glyph + rise number scale with zoom together so the pitch indicator
  // stays proportional to the rafter it's referencing.
  const W = 26 * proj.zoom;
  const RISE = (p.pitch / 12) * W;
  const anchorX = proj.sx(p.anchor.x);
  const anchorY = proj.sy(p.anchor.y);
  ctx.strokeStyle = T.inkSoft; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(anchorX + W, anchorY);
  ctx.lineTo(anchorX,     anchorY);
  ctx.lineTo(anchorX,     anchorY + RISE);
  ctx.stroke();
  const fontSize = 11 * proj.zoom;
  if (fontSize < 1) return;
  ctx.fillStyle = T.inkSoft;
  ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(String(p.pitch), anchorX - 2 * proj.zoom, anchorY - 2 * proj.zoom);
}
