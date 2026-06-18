// Roof topology — derives the 3D roof from the user-drawn roof plan.
//
// The Roof Plan view stores ridge beams + valley pads as SectionPrimitive
// PrimLines on `project.roof.drafting`. This engine reads them plus the
// active level's footprint (eave polygon + wall outer face) and produces:
//
//   • Per-ridge height (`heightAboveWalls`) from perpendicular ray-casts.
//     Spans STOP at the first boundary hit — eave, valley pad, OR another
//     ridge — so reverses don't inflate the main ridge's height.
//   • Per-endpoint kind (`endA`/`endB`): GABLE if the endpoint sits at the
//     wall-outer boundary, HIP if interior. Drives whether the slope
//     terminates in a vertical gable wall or continues past at the hip rate.
//   • `roofHeightAt(p)` — the 3D roof height (above topOfWalls) at any plan
//     point. Used by elevations / 3D / sections to project the roof.

import { Level, Project, PrimLine, SectionPrimitive, Vec2 } from './types';
import { buildRoofFootprint, RoofFootprint } from './roof';
import { buildSectionStack } from './structural';

// Gable detection: an endpoint within this many inches of the wall-outer
// polygon counts as "at the wall" → gable. Bigger than the snap tolerance
// so the user doesn't have to be pixel-perfect.
const GABLE_TOL_IN = 6;

// Boundary tolerance — segment intersections within this many inches of
// each other (e.g., ridge-to-ridge tees) are treated as touching.
const BOUNDARY_EPS = 0.5;

export type EndpointType = 'gable' | 'hip';

export interface RoofRidge {
  id: string;
  a: Vec2;                  // plan coords (inches)
  b: Vec2;
  // Span on each side of A→B forward direction, measured from the ridge
  // midpoint to the first boundary (eave / valley / another ridge).
  spanLeft: number;
  spanRight: number;
  // ridge_height = min(spanLeft, spanRight) × pitch/12. The lesser side
  // limits how high the ridge can climb before the slope reaches its
  // closer boundary.
  heightAboveWalls: number;
  // Endpoint kind — GABLE = terminates at wall, slope stops at the endpoint.
  //                  HIP   = interior endpoint, slope continues past.
  endA: EndpointType;
  endB: EndpointType;
}

export interface RoofTopology {
  ridges: RoofRidge[];
  valleys: PrimLine[];
  hips: PrimLine[];         // hip rafters (ridge end → eave corner); mark hip ends
  pitch: number;            // rise per 12" run
  overhang: number;         // inches
  hasRoof: boolean;
  eave: Vec2[] | null;      // eave polygon (closed; first vertex NOT repeated)
  wallOuter: Vec2[] | null; // wall-outer polygon — used for gable detection
}

// Split the global roof drafting primitives into ridge / valley / hip lines.
function extractDrafting(drafting: readonly SectionPrimitive[]): { ridgeLines: PrimLine[]; valleys: PrimLine[]; hips: PrimLine[] } {
  const ridgeLines: PrimLine[] = [];
  const valleys:    PrimLine[] = [];
  const hips:       PrimLine[] = [];
  for (const p of drafting) {
    if (p.kind !== 'line') continue;
    if (p.style === 'ridge')  ridgeLines.push(p);
    if (p.style === 'valley') valleys.push(p);
    if (p.style === 'hip')    hips.push(p);
  }
  return { ridgeLines, valleys, hips };
}

export function buildRoofTopology(project: Project): RoofTopology {
  const roof = project.roof;
  const pitch = roof.pitch ?? 6;
  const overhang = roof.overhang ?? 12;
  const { ridgeLines, valleys, hips } = extractDrafting(roof.drafting ?? []);

  const activeLevel = project.levels.find(l => l.id === project.activeLevelId) ?? project.levels[0];
  const footprint = activeLevel ? buildRoofFootprint(activeLevel, overhang) : null;
  if (!footprint) {
    return { ridges: [], valleys, hips, pitch, overhang, hasRoof: false, eave: null, wallOuter: null };
  }
  return buildTopologyForFootprint(footprint, ridgeLines, valleys, hips, pitch, overhang);
}

// Core topology builder for a SPECIFIC footprint + ridge set at a given pitch.
// `extraBoundaries` are additional segments a ridge's span ray can hit (e.g. a
// taller upper-tier wall the lower roof dies into). Splitting this out lets the
// single-roof path (above) and the per-tier setback path (buildRoofTiers) share
// identical height logic.
function buildTopologyForFootprint(
  footprint: RoofFootprint,
  ridgeLines: PrimLine[], valleys: PrimLine[], hips: PrimLine[],
  pitch: number, overhang: number,
  extraBoundaries: Seg[] = [],
): RoofTopology {
  const pitchRR = pitch / 12;

  // A ridge endpoint is a HIP end when a hip rafter springs from it (either end
  // of a hip line lands on the ridge endpoint). This is the EXPLICIT signal —
  // it overrides the position-based gable/hip guess, so a hip works even when
  // the ridge runs all the way to the wall plate.
  const HIP_ATTACH_TOL = 18;
  const hipAttaches = (pt: Vec2): boolean =>
    hips.some(h => Math.hypot(h.a.x - pt.x, h.a.y - pt.y) <= HIP_ATTACH_TOL
                || Math.hypot(h.b.x - pt.x, h.b.y - pt.y) <= HIP_ATTACH_TOL);
  const endpointKind = (pt: Vec2): EndpointType =>
    hipAttaches(pt) ? 'hip' : detectEndpointKind(pt, footprint.wallOuter);

  // Boundary segments seen during ray-casting: WALL-PLATE edges + valley pads.
  // We measure the ridge run to the wall plate (`wallOuter`), NOT the eave —
  // the rafter birds-mouths at the plate, so `heightAboveWalls` must be the
  // rise over the run from ridge to the OUTSIDE OF THE WALL. Measuring to the
  // eave instead would inflate the ridge by `overhang × pitch` AND leave the
  // computed roof surface sitting at `topOfWalls` at the eave (instead of
  // dropping below it), so the slope never meets the soffit line that
  // elevations draw — the "ridge doesn't tie down to the soffit" artifact.
  // Other ridges get added per-ridge so a ridge doesn't stop at itself.
  const wallPlateEdges = polygonEdges(footprint.wallOuter);

  const ridges: RoofRidge[] = ridgeLines.map(r => {
    // Boundary set for THIS ridge = wall plate + every OTHER ridge.
    //
    // VALLEYS ARE DELIBERATELY EXCLUDED. A valley is where two roof planes
    // MEET, not an eave — it must not cap a ridge's height. Including valleys
    // here mis-limited a cross (reverse) gable: a diagonal valley sits close to
    // the cross ridge's MIDPOINT, so the midpoint ray hit it at ~20" and the
    // ridge computed ~flat. With valleys out, the ridge spans to its walls and
    // gets its true gable height; the valley falls out naturally as the locus
    // where roofHeightAt's per-ridge max switches from one ridge to the other.
    const otherRidgeEdges: Seg[] = ridgeLines
      .filter(o => o.id !== r.id)
      .map(o => ({ a: o.a, b: o.b }));
    const boundaries: Seg[] = [...wallPlateEdges, ...extraBoundaries, ...otherRidgeEdges];

    const { left, right } = perpSpan(r.a, r.b, boundaries);
    const span = Math.min(left, right);
    const heightAboveWalls = Number.isFinite(span) ? span * pitchRR : 0;

    return {
      id: r.id,
      a: r.a, b: r.b,
      spanLeft:  Number.isFinite(left)  ? left  : 0,
      spanRight: Number.isFinite(right) ? right : 0,
      heightAboveWalls,
      endA: endpointKind(r.a),
      endB: endpointKind(r.b),
    };
  });

  return {
    ridges,
    valleys,
    hips,
    pitch,
    overhang,
    hasRoof: ridges.length > 0,
    eave: footprint.eave,
    wallOuter: footprint.wallOuter,
  };
}

// ── 3D roof height at any plan point ──────────────────────────────────────
//
// height(P) = max over all ridges of (ridge.heightAboveWalls - perpDist(P,r) × pitch/12)
//
// where perpDist treats GABLE endpoints as infinitely far (slope doesn't
// reach past) and HIP endpoints as euclidean (hip slope continues past).
//
// Returns null when ALL ridge contributions are negative (point is outside
// any ridge's reach). Callers typically treat that as "below topOfWalls"
// and clamp to the eave drip in elevations.
export function roofHeightAt(topology: RoofTopology, p: Vec2): number | null {
  if (!topology.hasRoof) return null;
  const pitchRR = topology.pitch / 12;
  let best = -Infinity;
  for (const r of topology.ridges) {
    const d = perpDistanceToRidgeSegment(p, r);
    if (!Number.isFinite(d)) continue;
    const h = r.heightAboveWalls - d * pitchRR;
    if (h > best) best = h;
  }
  if (!Number.isFinite(best)) return null;
  // Returned UNCLAMPED — points in the eave overhang area naturally go
  // below topOfWalls (negative h), and elevations consume that as the
  // eave-drip drop past the wall.
  return best;
}

// ── Setback / multi-tier roof (larger 1st floor, smaller 2nd floor) ─────────
// Each level footprint becomes a roof "tier" at that level's plate height. The
// lower tiers receive the higher footprints' wall edges as extra ray-cast
// boundaries, so a lower roof dies into the taller wall above it. ADDITIVE:
// the single-roof and identical-footprint cases must keep using the scalar
// path — `hasSetback` is the gate for callers (see consumers).

export interface RoofTier {
  levelId: string;
  index: number;       // 0 = lowest level
  plateTopY: number;   // absolute top-of-walls Y for this tier (Y-up, 0 = 1st subfloor)
  footprint: RoofFootprint;
  topology: RoofTopology;
  ridges: PrimLine[];  // the drawn ridge lines assigned to THIS tier
}

// Per-level plate-top Y in the section/elevation Y space. index 0 → 1st-floor
// plate; index 1 → 2nd-floor plate; higher indices fall back to the top of walls
// (the stack only models up to a 2nd floor today).
function platesByIndex(project: Project): number[] {
  const stack = buildSectionStack(project);
  return project.levels.map((_, i) =>
    i === 0 ? stack.firstFloorPlateTopY
    : i === 1 ? (stack.secondFloorPlateTopY ?? stack.topOfWallsY)
    : stack.topOfWallsY);
}

// Build a roof tier per level, ordered LOW→HIGH by elevation. Drawn ridges are
// assigned to the highest tier whose wall-outer polygon contains the ridge
// midpoint. Returns [] if no level has a footprint.
export function buildRoofTiers(project: Project): RoofTier[] {
  const roof = project.roof;
  const pitch = roof.pitch ?? 6;
  const overhang = roof.overhang ?? 12;
  const { ridgeLines, valleys, hips } = extractDrafting(roof.drafting ?? []);

  const ordered = [...project.levels].sort((a, b) => a.elevation - b.elevation);
  const plateForLevel = new Map(project.levels.map((l, i) => [l.id, platesByIndex(project)[i]]));

  const built = ordered
    .map((lvl, i) => {
      const fp = buildRoofFootprint(lvl, overhang);
      return fp ? { lvl, i, fp, plateTopY: plateForLevel.get(lvl.id) ?? 0 } : null;
    })
    .filter((x): x is { lvl: Level; i: number; fp: RoofFootprint; plateTopY: number } => x !== null);
  if (built.length === 0) return [];

  const assignTier = (r: PrimLine): number => {
    const mid = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 };
    for (let k = built.length - 1; k >= 0; k--) {
      if (pointInPolygon(mid, built[k].fp.wallOuter)) return built[k].i;
    }
    return built[built.length - 1].i; // default to the top tier
  };
  const ridgesByTier = new Map<number, PrimLine[]>();
  for (const r of ridgeLines) {
    const ti = assignTier(r);
    const arr = ridgesByTier.get(ti);
    if (arr) arr.push(r); else ridgesByTier.set(ti, [r]);
  }

  return built.map(({ lvl, i, fp, plateTopY }) => {
    // Lower tiers die into the walls of every HIGHER tier.
    const extra: Seg[] = [];
    for (const o of built) if (o.i > i) extra.push(...polygonEdges(o.fp.wallOuter));
    const tierRidges = ridgesByTier.get(i) ?? [];
    const topology = buildTopologyForFootprint(fp, tierRidges, valleys, hips, pitch, overhang, extra);
    return { levelId: lvl.id, index: i, plateTopY, footprint: fp, topology, ridges: tierRidges };
  });
}

// True only for an ACTUAL setback: 2+ levels whose footprints differ in plan
// area (upper smaller than lower). Single-story and identical-footprint
// two-story return false so callers keep the unchanged scalar path.
export function hasSetback(project: Project): boolean {
  if (project.levels.length < 2) return false;
  const overhang = project.roof?.overhang ?? 12;
  const areas = project.levels.map(l => {
    const fp = buildRoofFootprint(l, overhang);
    return fp ? polygonArea(fp.wallOuter) : 0;
  });
  const max = Math.max(...areas), min = Math.min(...areas);
  if (max <= 0) return false;
  return (max - min) / max > 0.02; // >2% area difference ⇒ genuine setback
}

// Absolute roof Y at a plan point across all tiers (highest wins). null when no
// tier's roof covers the point.
export function roofHeightAtAbsolute(tiers: RoofTier[], p: Vec2): number | null {
  let best = -Infinity;
  for (const t of tiers) {
    const h = roofHeightAt(t.topology, p);
    if (h == null) continue;
    const y = t.plateTopY + h;
    if (y > best) best = y;
  }
  return Number.isFinite(best) ? best : null;
}

// Top-of-walls Y at a plan point = the highest tier whose wall-outer polygon
// contains it. Falls back to `fallback` (the scalar topOfWallsY) when no tier
// contains the point (e.g. just outside under the eave overhang).
export function topOfWallsAtTiers(tiers: RoofTier[], p: Vec2, fallback: number): number {
  let best = -Infinity;
  for (const t of tiers) {
    if (pointInPolygon(p, t.footprint.wallOuter) && t.plateTopY > best) best = t.plateTopY;
  }
  return Number.isFinite(best) ? best : fallback;
}

function polygonArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(a) / 2;
}

// Perpendicular distance from P to ridge r, accounting for endpoint type:
//   • P projects within the segment → perpendicular distance to the line.
//   • P projects past an endpoint:
//       - endpoint is HIP   → euclidean distance to the endpoint (hip cone).
//       - endpoint is GABLE → Infinity (slope terminates at the gable wall).
export function perpDistanceToRidgeSegment(p: Vec2, r: RoofRidge): number {
  const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return Math.hypot(p.x - r.a.x, p.y - r.a.y);
  const ux = dx / L, uy = dy / L;
  const t = (p.x - r.a.x) * ux + (p.y - r.a.y) * uy;
  if (t < 0) {
    return r.endA === 'gable' ? Infinity : Math.hypot(p.x - r.a.x, p.y - r.a.y);
  }
  if (t > L) {
    return r.endB === 'gable' ? Infinity : Math.hypot(p.x - r.b.x, p.y - r.b.y);
  }
  // Within segment — perpendicular distance to the line.
  const px = -uy, py = ux;
  return Math.abs((p.x - r.a.x) * px + (p.y - r.a.y) * py);
}

// ── Implementation details ────────────────────────────────────────────────

interface Seg { a: Vec2; b: Vec2; }

function polygonEdges(poly: Vec2[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < poly.length; i++) {
    out.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
  }
  return out;
}

// Detect whether a ridge endpoint sits at the wall-outer boundary (= gable
// end with a vertical gable wall) or in the interior (= hip end, slope
// continues past).
function detectEndpointKind(p: Vec2, wallOuter: Vec2[]): EndpointType {
  // A ridge that runs OUT past a wall terminates in a GABLE — students draw
  // the ridge board long so it spans the rake overhang, so the endpoint often
  // sits a foot beyond the wall. Treat any endpoint OUTSIDE the footprint as a
  // gable. Inside the footprint, an endpoint hugging a wall edge is also a
  // gable; only a truly interior endpoint (well away from every wall) is a hip.
  if (!pointInPolygon(p, wallOuter)) return 'gable';
  // Distance from p to nearest edge of the wall-outer polygon. Below
  // GABLE_TOL_IN inches → gable; otherwise hip.
  let minD = Infinity;
  for (let i = 0; i < wallOuter.length; i++) {
    const a = wallOuter[i];
    const b = wallOuter[(i + 1) % wallOuter.length];
    const d = pointSegmentDistance(p, a, b);
    if (d < minD) minD = d;
  }
  return minD <= GABLE_TOL_IN ? 'gable' : 'hip';
}

function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Cast perpendicular rays from the ridge midpoint in BOTH perpendicular
// directions and return the distance to the nearest boundary segment hit
// on each side.
function perpSpan(a: Vec2, b: Vec2, boundaries: Seg[]): { left: number; right: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return { left: 0, right: 0 };
  const ux = dx / L, uy = dy / L;
  // Perpendicular unit vectors. The "left" / "right" labels are arbitrary —
  // the consumer just uses min(L, R) to pick the limiting side.
  const nLeft:  Vec2 = { x: -uy, y:  ux };
  const nRight: Vec2 = { x:  uy, y: -ux };
  const mid:    Vec2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    left:  castRay(mid, nLeft,  boundaries),
    right: castRay(mid, nRight, boundaries),
  };
}

// Distance along `dir` from `origin` to the first hit on any segment in
// `boundaries`. Returns Infinity if nothing is hit.
function castRay(origin: Vec2, dir: Vec2, boundaries: Seg[]): number {
  let minT = Infinity;
  for (const seg of boundaries) {
    const t = rayLineIntersection(origin, dir, seg.a, seg.b);
    if (t != null && t > BOUNDARY_EPS && t < minT) minT = t;
  }
  return minT;
}

// Parametric ray-segment intersection. Returns the ray's `t` if the
// intersection lies on the segment AND in front of the origin; null else.
function rayLineIntersection(origin: Vec2, dir: Vec2, p0: Vec2, p1: Vec2): number | null {
  const sx = p1.x - p0.x, sy = p1.y - p0.y;
  const denom = dir.x * sy - dir.y * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p0.x - origin.x) * sy - (p0.y - origin.y) * sx) / denom;
  const s = ((p0.x - origin.x) * dir.y - (p0.y - origin.y) * dir.x) / denom;
  if (t < 0 || s < 0 || s > 1) return null;
  return t;
}

// Point-in-polygon test (even-odd rule). Exported so the elevations
// sampler can skip plan points outside the footprint.
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersects = ((yi > p.y) !== (yj > p.y))
      && (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}
