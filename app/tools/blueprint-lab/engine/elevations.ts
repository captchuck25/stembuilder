// Exterior elevations engine.
//
// Given a Project, produce the geometry for a North/South/East/West
// elevation drawing: outline, grade line, roof profile, and projected
// door/window openings. Output is in elevation-world inches with Y-up
// (Y=0 = top of first-floor subfloor — same convention as SectionStack).
// The view layer flips Y for SVG.

import {
  Door, ExteriorMaterial, Level, Project, Vec2, Window,
} from './types';
import {
  GRADE_TO_FIRST_FLOOR_DEFAULT,
} from './types';
import {
  buildSectionStack, computeLevelElevation, computeRoofFrame, getStructural,
  PLATE_WIDTH, SectionStack,
} from './structural';
import { buildRoofTiers, buildRoofTopology, hasSetback, perpDistanceToRidgeSegment, pointInPolygon, roofHeightAt, RoofRidge, RoofTopology } from './roofTopology';
import { wallPolygon } from './geometry';
import { buildRoofFootprint } from './roof';

export type ElevationDirection = 'north' | 'south' | 'east' | 'west';

export const ELEVATION_DIRECTIONS: { id: ElevationDirection; label: string }[] = [
  { id: 'north', label: 'North' },
  { id: 'east',  label: 'East'  },
  { id: 'south', label: 'South' },
  { id: 'west',  label: 'West'  },
];

// World→elevation basis. `axis` is the world axis the viewer looks along;
// `sign` is +1 if the viewer sits at the positive end (looking toward -axis).
// `rightAxis`/`rightSign` map the perpendicular world axis onto the drawing's
// left→right (drawing-X positive).
interface DirectionBasis {
  axis: 'x' | 'y';        // viewer's sight line axis
  sign: 1 | -1;           // viewer is on +ve (1) or -ve (-1) side of that axis
  rightAxis: 'x' | 'y';
  rightSign: 1 | -1;
}

// IMPORTANT: the plan/world uses screen-down Y — NORTH = −Y, SOUTH = +Y
// (see Canvas2D: "World Y is screen-down, 90° = north up"). EAST = +X,
// WEST = −X. Each elevation is drawn as seen from OUTSIDE the building,
// looking at the named face.
const DIRECTION_BASIS: Record<ElevationDirection, DirectionBasis> = {
  // North wall is at min-Y. Observer stands north (−Y), looks south (+Y).
  // Facing south, East (+X) is on the left → drawing-X = −world.x.
  north: { axis: 'y', sign: -1, rightAxis: 'x', rightSign: -1 },
  // South wall is at max-Y. Observer stands south (+Y), looks north (−Y).
  // Facing north, East (+X) is on the right → drawing-X = +world.x.
  south: { axis: 'y', sign:  1, rightAxis: 'x', rightSign:  1 },
  // East wall is at max-X. Observer stands east (+X), looks west (−X).
  // Facing west, North (−Y) is on the right → drawing-X = −world.y.
  east:  { axis: 'x', sign:  1, rightAxis: 'y', rightSign: -1 },
  // West wall is at min-X. Observer stands west (−X), looks east (+X).
  // Facing east, North (−Y) is on the left → drawing-X = +world.y.
  west:  { axis: 'x', sign: -1, rightAxis: 'y', rightSign:  1 },
};

export interface ElevationOpening {
  id: string;
  kind: 'door' | 'window';
  // Elevation-world coords (inches, Y-up, Y=0 at top of first-floor subfloor).
  x: number;       // left edge of opening on drawing-X axis
  width: number;
  bottomY: number; // sill (windows) or floor (doors)
  topY: number;    // head height
  // For labeling / variant-specific glyphs later.
  doorType?: Door['doorType'];
  windowType?: Window['windowType'];
  // Entry-door sidelights (narrow glass panels flanking the door). Stored on
  // the source Door — surfaced here so the renderer can draw them outside
  // the main casing.
  sidePanels?: 'none' | 'left' | 'right' | 'both';
  sidePanelWidth?: number;
}

export interface ElevationScene {
  direction: ElevationDirection;
  // Drawing extents along drawing-X (left→right). Both can be negative.
  xMin: number;
  xMax: number;
  // Vertical reference Ys (inches, Y-up, Y=0 at top of first-floor subfloor).
  // All come from buildSectionStack so the section + elevation stay aligned.
  gradeY: number;          // grade plane (top of dirt)
  footingBottomY: number;
  topOfWallsY: number;
  ridgeY: number;          // roof peak (= topOfWalls for flat roofs)
  // Roof profile points in elevation-world coords (Y-up). Drawn as a polyline.
  // Includes the eave overhang on either side.
  roofProfile: Vec2[];
  // Outline of the wall shell (rectangle x ∈ [xMin, xMax], y ∈ [footingBottomY, topOfWallsY])
  // — drawn separately from the roof so the renderer can hatch the wall area
  // independently of the roof.
  wallLeftX: number;       // = xMin
  wallRightX: number;      // = xMax
  // Projected openings.
  openings: ElevationOpening[];
  // Floor plate heights (drawing reference lines).
  firstFloorY: number;     // 0
  secondFloorY?: number;
  // Building-shell polygon (clockwise from bottom-left). Top follows the
  // gable triangle / hip trapezoid / flat eave depending on the view. Used
  // both as the wall-shell shape and as the clip region for siding so the
  // pattern fills the gable peak. NO overhangs included.
  wallOutline: Vec2[];
  // Gable trim pieces — rake boards along the slope + soffit return +
  // eave fascia at each wall corner. Drawn white-with-black-stroke. Empty
  // for views without a visible gable (flat / eave-side / hip).
  gableTrim: Vec2[][];
  // Roof surface to fill with the shingle hatch (eave-side views — the roof
  // plane is visible there). Undefined on gable ends (you see the gable WALL,
  // not the roof surface).
  roofHatch?: Vec2[];
  // Extra roof-edge outlines (closed or open polylines, drawn as plain edge
  // lines, no fill). Used by the cross-gable composite to stroke the shingle
  // field's ridge / eave / rake edges and any secondary roof boundaries that
  // the single `roofProfile` polyline can't express. Empty/undefined for the
  // simple single-gable + eave-side cases.
  roofOutlines?: Vec2[][];
  // Project-wide exterior cladding — drives the wall-body siding pattern.
  exteriorMaterial: ExteriorMaterial;
  // Section stack for downstream consumers (dim lines, label resolution).
  stack: SectionStack;
  // SETBACK tier sub-scenes: suppress the corner board on an edge that abuts a
  // taller tier (the upper tier's board covers the shared wall — otherwise two
  // 5" boards sit side-by-side at the junction).
  suppressCornerL?: boolean;
  suppressCornerR?: boolean;
  // SETBACK: when a wing abuts this (taller) tier, its corner board is only
  // VISIBLE between the wing-roof tie-in (crossover) and the wing/block soffit —
  // below it's covered by the wing in front, above by the block's own eave. When
  // set, the corner board is drawn clipped to [y0, y1] instead of full height (or
  // suppressed). Overrides suppressCornerL/R.
  cornerLClipY?: [number, number];
  cornerRClipY?: [number, number];
  // SETBACK gable-side: convex silhouettes of NEARER tiers to subtract from this
  // (farther) tier's drawables (wall shell, siding, corner boards, gable trim,
  // roof outline) — hidden-line removal where the near gable overlaps the far one.
  subtractPolys?: Vec2[][];
  // SETBACK only: one fully-rendered sub-scene per floor tier (low→high). Each
  // is a normal single-building elevation at that tier's footprint + height, so
  // the renderer draws them back-to-front (upper opaque block occludes the lower
  // roof behind it = the stepped two-roof look). The wall/roof fields above are
  // left empty on the composite; openings/grade/floor refs live here and draw
  // once on top. Undefined for non-setback (the normal single-mass path).
  tiers?: ElevationScene[];
}

// ── Footprint bounding box of the project, in world coords ────────────────
// We bbox ALL walls across ALL levels so the elevation matches the building
// even when a 2nd floor footprint differs slightly from the 1st.
//
// IMPORTANT: bbox the wall POLYGONS (exterior faces, thickness included), not
// the centerlines. The elevation outline/corner boards are drawn at these
// extents, and the floor-plan dims measure to the exterior corner — so using
// centerlines made the elevation ~half-a-wall too narrow on each side,
// pulling the corner in toward openings (which are placed by centerline).
function buildingBBox(project: Project): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let any = false;
  for (const level of project.levels) {
    for (const w of level.walls) {
      any = true;
      for (const p of wallPolygon(w)) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  if (!any) return null;
  return { minX, maxX, minY, maxY };
}

// Map a world point to its drawing-X coord under the chosen direction.
function projectX(p: Vec2, basis: DirectionBasis): number {
  const v = basis.rightAxis === 'x' ? p.x : p.y;
  return v * basis.rightSign;
}

// Decide whether a wall belongs on the viewer-facing face. A wall is
// "facing" the viewer when its centerline sits within `proximityTolerance`
// of the bbox face on that side AND its run is roughly perpendicular to
// the sight line (so we draw the long face of the wall, not its end-cap).
const PROXIMITY_TOLERANCE_IN = 12;   // 1 ft slop so slightly-offset walls still count
const PERPENDICULAR_TOLERANCE = 0.35; // ~20° off-axis still counts as perpendicular

function wallFacesDirection(
  wallStart: Vec2, wallEnd: Vec2,
  basis: DirectionBasis,
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  // Wall direction vector — for "facing the viewer" we want this to be
  // roughly perpendicular to the sight line (so the wall runs sideways
  // across the drawing).
  const dx = wallEnd.x - wallStart.x;
  const dy = wallEnd.y - wallStart.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return false;
  // Sight line component of the wall direction — small means perpendicular.
  const sightComponent = basis.axis === 'x'
    ? Math.abs(dx) / len
    : Math.abs(dy) / len;
  if (sightComponent > PERPENDICULAR_TOLERANCE) return false;

  // Proximity to the viewer-side bbox face.
  const midAlongSight = basis.axis === 'x'
    ? (wallStart.x + wallEnd.x) / 2
    : (wallStart.y + wallEnd.y) / 2;
  const face = basis.axis === 'x'
    ? (basis.sign === 1 ? bbox.maxX : bbox.minX)
    : (basis.sign === 1 ? bbox.maxY : bbox.minY);
  return Math.abs(midAlongSight - face) <= PROXIMITY_TOLERANCE_IN;
}

// Footprint-aware "does this wall face the viewer" test (for openings). A wall
// faces the viewer when it runs ACROSS the view (perpendicular to the sight
// line) AND a small step OUTWARD from its midpoint (toward the viewer) lands
// OUTSIDE the building footprint. Unlike the bbox-proximity test this keeps
// RECESSED facing walls (behind a bump-out) — their openings still belong on
// this elevation — while still dropping interior partitions (which step out
// into another room, i.e. inside the footprint).
function wallFacesViewer(
  wallStart: Vec2, wallEnd: Vec2,
  basis: DirectionBasis,
  footprint: Vec2[],
): boolean {
  const dx = wallEnd.x - wallStart.x;
  const dy = wallEnd.y - wallStart.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return false;
  const sightComponent = basis.axis === 'x' ? Math.abs(dx) / len : Math.abs(dy) / len;
  if (sightComponent > PERPENDICULAR_TOLERANCE) return false;
  const mid = { x: (wallStart.x + wallEnd.x) / 2, y: (wallStart.y + wallEnd.y) / 2 };
  const STEP = 8;   // inches outward — clears the half-thickness wallOuter offset
  const outward = basis.axis === 'x'
    ? { x: mid.x + basis.sign * STEP, y: mid.y }
    : { x: mid.x, y: mid.y + basis.sign * STEP };
  return !pointInPolygon(outward, footprint);
}

// Topology-driven roof profile — sampled in PLAN space, then projected.
//
// We rasterize a grid of plan points inside the eave polygon, compute the
// 3D roof height at each via `roofHeightAt` (max over ridges, with gable
// vs hip endpoint treatment), project the points into the elevation's
// drawing-X axis, and take the max projected Y per drawing-X bin. The
// silhouette polyline is the upper envelope of those bins.
//
// This is the architecturally-correct approach: it understands that a
// ridge's slope only applies inside the arm of the building governed by
// that ridge, and reverses / cross-gables / hips read correctly because
// the heights are computed in plan space before projection.
//
// When the user hasn't drawn any ridges (`topology.hasRoof === false`),
// we return a FLAT line at topOfWalls — the chosen fallback: elevations
// show no roof until the plan is done.
function buildRoofProfile(
  topology: RoofTopology,
  basis: DirectionBasis,
  topOfWallsY: number,
  xMin: number,
  xMax: number,
): { profile: Vec2[]; ridgeY: number } {
  const overhang = topology.overhang;

  if (!topology.hasRoof || !topology.eave) {
    return {
      profile: [
        { x: xMin - overhang, y: topOfWallsY },
        { x: xMax + overhang, y: topOfWallsY },
      ],
      ridgeY: topOfWallsY,
    };
  }

  return sampleRoofProfile(topology, basis, topOfWallsY, xMin, xMax, /*clipToWallOuter*/ false);
}

// Per-bin sampler. For each drawing-X bin, walk the PERPENDICULAR plan
// axis (the one collapsed by the view) and find the max roof height at
// any plan point inside the sampling polygon that projects to this bin.
// This guarantees every bin gets a value when ANY part of the building
// projects to it — no zig-zag artefacts from empty bins.
//
// When `clipToWallOuter` is true, samples are limited to the wall-outer
// polygon (no eave drip extension) — that's the wall shell used for the
// siding clip + outline. When false, samples cover the full eave polygon
// including the overhang drop past the walls.
function sampleRoofProfile(
  topology: RoofTopology,
  basis: DirectionBasis,
  topOfWallsY: number,
  xMinDraw: number,
  xMaxDraw: number,
  clipToWallOuter: boolean,
  // Horizontal padding (inches) added on each side of [xMinDraw, xMaxDraw].
  // The roof PROFILE needs this so the eave/rake overhang extends past the
  // wall corners. The WALL SHELL must pass 0 — otherwise its top edge runs
  // wider than its grade-line bottom and the walls render splayed instead of
  // vertical. Defaults to the overhang extent for the profile case.
  padIn?: number,
): { profile: Vec2[]; ridgeY: number } {
  const overhang = topology.overhang;
  const samplingPoly = clipToWallOuter ? topology.wallOuter : topology.eave;
  if (!samplingPoly) {
    return {
      profile: [
        { x: xMinDraw - overhang, y: topOfWallsY },
        { x: xMaxDraw + overhang, y: topOfWallsY },
      ],
      ridgeY: topOfWallsY,
    };
  }

  // Plan-bbox of the sampling polygon — bounds for the perpendicular sweep.
  let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
  for (const v of samplingPoly) {
    if (v.x < pMinX) pMinX = v.x;
    if (v.x > pMaxX) pMaxX = v.x;
    if (v.y < pMinY) pMinY = v.y;
    if (v.y > pMaxY) pMaxY = v.y;
  }

  // Resolution. 200 drawing-X bins is enough to read slope changes
  // smoothly at the standard 1/4" = 1'-0" elevation scale. The plan-
  // perpendicular sweep at 4" is fine enough to catch ridge / valley
  // local maxima without slowing things down.
  const BINS = 200;
  const SWEEP_STEP_IN = 4;
  const PADDING_IN = padIn ?? (overhang + 6);
  const xStart = xMinDraw - PADDING_IN;
  const xEnd   = xMaxDraw + PADDING_IN;
  const binStep = (xEnd - xStart) / BINS;

  // Floor for bins where no plan point projects in. Without overhang,
  // that's topOfWalls; with overhang, the eave drips below by the rake
  // amount.
  const pitchRR = topology.pitch / 12;
  const eaveDrop = overhang * pitchRR;
  const yFloor = clipToWallOuter ? topOfWallsY : (topOfWallsY - eaveDrop);

  let maxY = topOfWallsY;
  const raw: Vec2[] = [];

  for (let i = 0; i <= BINS; i++) {
    const drawingX = xStart + i * binStep;

    // Map drawing-X back to the plan axis the view's right-axis is built
    // from. The PERPENDICULAR plan axis is the one we sweep.
    let bestY = yFloor;

    if (basis.rightAxis === 'x') {
      // drawingX = world.x * rightSign → world.x = drawingX / rightSign
      const planX = drawingX / basis.rightSign;
      for (let py = pMinY; py <= pMaxY; py += SWEEP_STEP_IN) {
        const p: Vec2 = { x: planX, y: py };
        if (!pointInPolygon(p, samplingPoly)) continue;
        const h = roofHeightAt(topology, p);
        if (h === null) continue;
        const y = topOfWallsY + h;
        if (y > bestY) bestY = y;
      }
    } else {
      // basis.rightAxis === 'y': drawingX = world.y * rightSign
      const planY = drawingX / basis.rightSign;
      for (let px = pMinX; px <= pMaxX; px += SWEEP_STEP_IN) {
        const p: Vec2 = { x: px, y: planY };
        if (!pointInPolygon(p, samplingPoly)) continue;
        const h = roofHeightAt(topology, p);
        if (h === null) continue;
        const y = topOfWallsY + h;
        if (y > bestY) bestY = y;
      }
    }

    if (bestY > maxY) maxY = bestY;
    raw.push({ x: drawingX, y: bestY });
  }

  return { profile: simplifyCollinear(raw), ridgeY: maxY };
}

// Wall-shell top edge: the roof height sampled along the VIEWER-FACING wall
// plane — NOT the max across the building depth. On a gable end this traces
// the gable triangle (the roof profile at the gable wall); on an eave side it
// stays flat at the eave (top of walls), so the siding stops at the eave with
// roof above, instead of climbing all the way to the ridge behind the wall.
function buildWallTop(
  topology: RoofTopology, basis: DirectionBasis, topOfWallsY: number,
  xMin: number, xMax: number,
): Vec2[] {
  const poly = topology.wallOuter;
  if (!poly || poly.length < 3) {
    return [{ x: xMin, y: topOfWallsY }, { x: xMax, y: topOfWallsY }];
  }
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  for (const v of poly) {
    if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
    if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
  }
  // The wall plane nearest the viewer along the sight axis.
  const facing = basis.axis === 'x' ? (basis.sign > 0 ? mxX : mnX)
                                     : (basis.sign > 0 ? mxY : mnY);
  const BINS = 160;
  const raw: Vec2[] = [];
  for (let i = 0; i <= BINS; i++) {
    const drawingX = xMin + (xMax - xMin) * (i / BINS);
    const perp = drawingX / basis.rightSign;   // plan coord on the drawing-X axis
    const p: Vec2 = basis.rightAxis === 'x' ? { x: perp, y: facing } : { x: facing, y: perp };
    const h = roofHeightAt(topology, p);
    raw.push({ x: drawingX, y: topOfWallsY + Math.max(0, h ?? 0) });
  }
  return simplifyCollinear(raw);
}

// Drops interior points that lie on the straight line between their
// neighbors. Output reads as a clean polyline whose vertex count grows with
// the number of slope changes, not the sample count.
function simplifyCollinear(points: Vec2[], eps = 0.05): Vec2[] {
  if (points.length <= 2) return points.slice();
  const out: Vec2[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > eps) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

// Roof-edge trim band depth (inches) — the visible width of the rake board /
// fascia measured perpendicular to the roof edge.
const ROOF_TRIM_DEPTH = 6;

// True when the view looks at the EAVE side of a gable (the ridge runs ACROSS
// the drawing) rather than the gable END (ridge runs into the drawing). On the
// eave side the roof reads as a rectangle; on the gable end as a triangle.
function isEaveSideView(topology: RoofTopology, basis: DirectionBasis): boolean {
  if (!topology.hasRoof || topology.ridges.length === 0) return false;
  // Use the longest ridge to decide orientation.
  const r = topology.ridges.reduce((a, b) =>
    Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) > Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) ? b : a);
  const ridgeAxis: 'x' | 'y' = Math.abs(r.b.x - r.a.x) >= Math.abs(r.b.y - r.a.y) ? 'x' : 'y';
  return ridgeAxis === basis.rightAxis;   // ridge parallel to the drawing's horizontal → eave side
}

// Plan axis a ridge runs along: 'x' = E–W ridge (gable ends face E/W),
// 'y' = N–S ridge (gable ends face N/S).
function ridgeAxisOf(r: { a: Vec2; b: Vec2 }): 'x' | 'y' {
  return Math.abs(r.b.x - r.a.x) >= Math.abs(r.b.y - r.a.y) ? 'x' : 'y';
}

// A cross-gable (reverse gable) is present when the roof plan has ridges on
// BOTH plan axes — at least one E–W ridge AND one N–S ridge. Such a view can't
// be drawn as a single gable end OR a single eave-side rectangle; it needs the
// composite (eave-side shingle field + the facing gable + any bump-out),
// built front-to-back. A single gable (any orientation) has ridges on one axis
// only, so this is false and the locked single-gable paths run unchanged.
function isCrossGable(topology: RoofTopology): boolean {
  if (!topology.hasRoof || topology.ridges.length < 2) return false;
  let hasX = false, hasY = false;
  for (const r of topology.ridges) {
    if (ridgeAxisOf(r) === 'x') hasX = true; else hasY = true;
  }
  return hasX && hasY;
}

// Corner-board width (inches) — matches EP_TRIM_WIDTH in elevationPrimitives.
// The eave soffit runs IN to the inside edge of the corner board (not stopping
// at the building corner / wall return), which is how soffit meets corner trim
// in real construction and reads much cleaner.
const CORNER_BOARD_W = 5;

// Build constant-width trim bands hugging the underside of the roof
// silhouette `profile` (an OPEN polyline, left eave → ridge → right eave).
//
// The profile is first split into RUNS at any horizontal segment sitting at
// the ridge top — those are the flat ridge lines on eave-side elevations, and
// there's no fascia there. What remains is the sloped rake runs (each carrying
// its eave-tail fascia + soffit-return corner). On a gable-end view the whole
// profile is one run (peak is a point, not a flat ridge), so it yields a
// single continuous rake-fascia band. Each run is offset inward (toward the
// building, biased to −Y) by `depth` and closed as [outer…, inner reversed…].
// Flatten EAVE overhangs (the portions of the roof outline past the wall that
// sit LOW, near the top of walls) to a level line at the eave height, so the
// fascia/soffit read horizontal — matching how an eave projects in a gable-end
// elevation. RAKE overhangs (high, climbing to the ridge) are left sloped.
// Returns a new outline: [leftTip, leftWall, …rake…, rightWall, rightTip].
function levelEaveOverhang(
  profile: Vec2[], xMin: number, xMax: number, topOfWallsY: number, overhang: number,
): Vec2[] {
  if (profile.length < 2) return profile;
  const near = ROOF_TRIM_DEPTH * 3;
  const eaveYL = runYatX(profile, xMin, true);
  const eaveYR = runYatX(profile, xMax, false);
  // Does the roof outline actually extend past each wall (i.e. there's an
  // overhang to level)? Detect from the profile extent…
  const profMinX = Math.min(...profile.map(p => p.x));
  const profMaxX = Math.max(...profile.map(p => p.x));
  const leftEave  = eaveYL != null && profMinX < xMin - 1e-6 && Math.abs(eaveYL - topOfWallsY) < near;
  const rightEave = eaveYR != null && profMaxX > xMax + 1e-6 && Math.abs(eaveYR - topOfWallsY) < near;

  // The roof EDGE keeps SLOPING out over the overhang (it does NOT go level —
  // only the soffit, built later in the trim, is level). Extrapolate the rake
  // slope just inside each wall and continue it `overhang` past the wall to
  // the eave tip, terminating at exactly the overhang (not the padding extent).
  const SAMPLE_IN = 24;
  const slopeAt = (wallX: number, wallY: number, dir: 1 | -1): number => {
    const inner = runYatX(profile, wallX + dir * SAMPLE_IN, dir > 0);
    return inner == null ? 0 : (inner - wallY) / SAMPLE_IN;   // rise per inch going inward
  };
  const tipL = xMin - overhang;
  const tipR = xMax + overhang;
  const tipYL = leftEave  ? eaveYL! - overhang * slopeAt(xMin,  eaveYL!,  1) : 0;
  const tipYR = rightEave ? eaveYR! - overhang * slopeAt(xMax,  eaveYR!, -1) : 0;

  const out: Vec2[] = [];
  if (leftEave)  out.push({ x: tipL, y: tipYL }, { x: xMin, y: eaveYL! });
  // Keep the rake interior + any un-shaped (rake) overhang points, in order.
  for (const p of profile) {
    if (leftEave && p.x < xMin) continue;
    if (rightEave && p.x > xMax) continue;
    out.push(p);
  }
  if (rightEave) out.push({ x: xMax, y: eaveYR! }, { x: tipR, y: tipYR });
  return out.length >= 2 ? out : profile;
}

// Gable-end trim as ONE clean closed outline (no overlapping rake-band +
// eave-box pieces, which left stray line-stubs inside the soffit). Traces:
// outer roof edge (tipL → peak → tipR) → fascia R → level soffit R → short
// wall return → inner rake (offset down by `depth`) across to the left wall →
// wall return → level soffit L → fascia L (closes to tipL).
function gableTrimOutline(
  run: Vec2[], xMin: number, xMax: number, rakeDepth: number, eaveDepth: number,
): Vec2[] | null {
  if (run.length < 3) return null;
  const wallYL = runYatX(run, xMin, true);
  const wallYR = runYatX(run, xMax, false);
  if (wallYL == null || wallYR == null) return null;
  const tipL = run[0];
  const tipR = run[run.length - 1];
  // Eave soffit drops the full rafter face (eaveDepth) below the eave tip; the
  // sloped rake/barge offsets by the slimmer rakeDepth.
  const soffitYL = tipL.y - eaveDepth;
  const soffitYR = tipR.y - eaveDepth;
  // Inner rake = the within-wall roof edge offset straight down by `rakeDepth`,
  // walked right wall → peak(s) → left wall. Its ends stop at the corner-board
  // INNER edge (xMax−CW / xMin+CW) — same x as the soffit's inner end — so the
  // wall return between them is a clean VERTICAL line, not an angled one.
  const innerYR = (runYatX(run, xMax - CORNER_BOARD_W, false) ?? wallYR) - rakeDepth;
  const innerYL = (runYatX(run, xMin + CORNER_BOARD_W, true) ?? wallYL) - rakeDepth;
  const innerRake: Vec2[] = [
    { x: xMax - CORNER_BOARD_W, y: innerYR },
    ...run.filter(p => p.x > xMin + CORNER_BOARD_W + 1e-6 && p.x < xMax - CORNER_BOARD_W - 1e-6)
          .map(p => ({ x: p.x, y: p.y - rakeDepth })).reverse(),
    { x: xMin + CORNER_BOARD_W, y: innerYL },
  ];
  // The level soffit runs IN to the INSIDE EDGE of the corner board (xMax−CW /
  // xMin+CW), not to the building corner — so the wall-return junction tucks
  // behind the corner board and the soffit reads clean (matches real trim).
  return [
    ...run,                              // outer roof edge: tipL → … peak … → tipR
    { x: tipR.x, y: soffitYR },          // fascia R
    { x: xMax - CORNER_BOARD_W, y: soffitYR }, // soffit R (level, in to corner-board inner edge)
    ...innerRake,                        // wall return R + inner rake + down to left wall
    { x: xMin + CORNER_BOARD_W, y: soffitYL }, // soffit L inner end (corner-board inner edge)
    { x: tipL.x, y: soffitYL },          // soffit L (level, out to tip) → closes (fascia L)
  ];
}

// `rakeDepth` = width of the sloped rake/barge board; `eaveDepth` = depth of
// the horizontal eave fascia/soffit (the full rafter face, deeper than the
// rake). On a gable end the two meet at a corner transition.
function buildRoofTrim(
  profile: Vec2[], rakeDepth: number, eaveDepth: number,
  xMin: number, xMax: number, topOfWallsY: number,
): Vec2[][] {
  if (profile.length < 2) return [];
  const maxY = Math.max(...profile.map(p => p.y));
  const ridgeBand = rakeDepth * 2;   // "near the ridge top" tolerance

  // Split into runs, dropping flat ridge-top edges (no fascia at the ridge).
  const runs: Vec2[][] = [];
  let cur: Vec2[] = [profile[0]];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    const isFlatRidge = Math.abs(a.y - b.y) < 0.5 && Math.min(a.y, b.y) > maxY - ridgeBand;
    if (isFlatRidge) {
      if (cur.length >= 2) runs.push(cur);
      cur = [b];
    } else {
      cur.push(b);
    }
  }
  if (cur.length >= 2) runs.push(cur);

  // An overhang is an EAVE (horizontal soffit) when the roof meets the wall
  // LOW — within ~3×fascia of the top of walls. When it meets the wall HIGH
  // (a rake run climbing to the ridge, as on an eave-side elevation) the
  // overhang is a RAKE and its soffit follows the slope.
  const EAVE_NEAR = eaveDepth * 3;

  const out: Vec2[][] = [];
  for (const run of runs) {
    if (run.length < 2) continue;

    const wallYL = runYatX(run, xMin, true);
    const wallYR = runYatX(run, xMax, false);
    const eaveL = wallYL != null && Math.abs(wallYL - topOfWallsY) < EAVE_NEAR;
    const eaveR = wallYR != null && Math.abs(wallYR - topOfWallsY) < EAVE_NEAR;

    // Gable end (eave overhang on BOTH sides): one clean combined outline so
    // the soffit area has no overlapping/stray lines.
    if (eaveL && eaveR) {
      const g = gableTrimOutline(run, xMin, xMax, rakeDepth, eaveDepth);
      if (g && g.length >= 3) out.push(g);
      continue;
    }

    // Otherwise: sloped rake/barge band + a horizontal soffit box per eave.
    const lo = eaveL ? xMin : -Infinity;
    const hi = eaveR ? xMax : Infinity;
    const within = clipPolylineX(run, lo, hi);
    if (within.length >= 2) {
      const inner = within.map(p => ({ x: p.x, y: p.y - rakeDepth }));
      out.push([...within, ...inner.slice().reverse()]);
    }
    if (eaveL) { const r = eaveReturn(run, xMin, 'left', eaveDepth);  if (r) out.push(r); }
    if (eaveR) { const r = eaveReturn(run, xMax, 'right', eaveDepth); if (r) out.push(r); }
  }

  return out.filter(b => b.length >= 3);
}

// Roof-top Y where `run` crosses vertical line x. `fromLeft` picks the
// lowest-index crossing (for the left wall) vs the highest (right wall) when
// a non-monotonic run (gable peak) crosses the same x twice.
function runYatX(run: Vec2[], x: number, fromLeft: boolean): number | null {
  const ys: number[] = [];
  for (let i = 0; i < run.length - 1; i++) {
    const a = run[i], b = run[i + 1];
    if ((a.x <= x && x <= b.x) || (b.x <= x && x <= a.x)) {
      const t = Math.abs(b.x - a.x) < 1e-9 ? 0 : (x - a.x) / (b.x - a.x);
      ys.push(a.y + (b.y - a.y) * t);
    }
  }
  if (ys.length === 0) return null;
  return fromLeft ? ys[0] : ys[ys.length - 1];
}

// Clip segment a→b to x ∈ [lo,hi] (either bound may be ±Infinity). Liang–
// Barsky on the x axis. Returns the clipped endpoints or null if fully out.
function clipSegX(a: Vec2, b: Vec2, lo: number, hi: number): [Vec2, Vec2] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x;
  const checks: [number, number][] = [];
  if (lo !== -Infinity) checks.push([-dx, a.x - lo]);  // x >= lo
  if (hi !==  Infinity) checks.push([ dx, hi - a.x]);  // x <= hi
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else       { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  const lerp = (t: number): Vec2 => ({ x: a.x + dx * t, y: a.y + (b.y - a.y) * t });
  return [lerp(t0), lerp(t1)];
}

function clipPolylineX(run: Vec2[], lo: number, hi: number): Vec2[] {
  const out: Vec2[] = [];
  const push = (p: Vec2) => {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 1e-6) out.push(p);
  };
  for (let i = 0; i < run.length - 1; i++) {
    const seg = clipSegX(run[i], run[i + 1], lo, hi);
    if (seg) { push(seg[0]); push(seg[1]); }
  }
  return out;
}

// Build a horizontal soffit + fascia "boxed return" for the overhang of `run`
// past the wall at `boundaryX`. The roof slopes over the top; a vertical
// fascia drops at the tip; the soffit runs level back to the wall, where a
// short vertical return closes against the wall. `depth` sets the fascia height.
function eaveReturn(run: Vec2[], boundaryX: number, side: 'left' | 'right', depth: number): Vec2[] | null {
  const overhang = run.filter(p => side === 'left' ? p.x < boundaryX - 1e-6 : p.x > boundaryX + 1e-6);
  if (overhang.length === 0) return null;
  const roofAtWall = runYatX(run, boundaryX, side === 'left');
  if (roofAtWall == null) return null;
  // Top edge: the wall point, then the overhang roofline ordered outward.
  const sorted = [...overhang].sort((a, b) => side === 'left' ? b.x - a.x : a.x - b.x);
  const topEdge: Vec2[] = [{ x: boundaryX, y: roofAtWall }, ...sorted];
  const tip = sorted[sorted.length - 1];
  const soffitY = Math.min(...topEdge.map(p => p.y)) - depth;   // level, below the whole top edge
  // topEdge → fascia (tip down) → soffit (level back to wall); auto-closes up the wall.
  return [...topEdge, { x: tip.x, y: soffitY }, { x: boundaryX, y: soffitY }];
}

// Project doors and windows that live on viewer-facing walls into elevation
// coords. We only emit openings on walls that passed wallFacesDirection().
function projectOpenings(
  project: Project,
  basis: DirectionBasis,
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
): ElevationOpening[] {
  const out: ElevationOpening[] = [];

  for (let levelIdx = 0; levelIdx < project.levels.length; levelIdx++) {
    const level = project.levels[levelIdx];
    const floorElevationY = levelIdx === 0 ? 0 : computeLevelElevation(project, levelIdx);

    // Wall id → wall, for quick lookup.
    const wallById = new Map(level.walls.map(w => [w.id, w]));

    // Door/window helper: given a wall + positionAlong + width, return the
    // opening's center point in WORLD coords (we use this for the drawing-X
    // mapping via projectX()).
    const openingCenterWorld = (wallId: string, positionAlong: number): Vec2 | null => {
      const w = wallById.get(wallId);
      if (!w) return null;
      const dx = w.end.x - w.start.x;
      const dy = w.end.y - w.start.y;
      const L = Math.hypot(dx, dy);
      if (L < 0.001) return null;
      const ux = dx / L, uy = dy / L;
      return {
        x: w.start.x + ux * positionAlong,
        y: w.start.y + uy * positionAlong,
      };
    };

    // A wall shows its openings on THIS elevation when it faces the viewer —
    // i.e. it runs across the view (perpendicular to the sight line) AND its
    // OUTWARD side is outside the building. Using the footprint (not bbox
    // proximity) means a RECESSED facing wall — a main body wall behind a
    // bump-out — still shows its windows, drawn at their plan-X position, just
    // like a conventional elevation (no depth shown). Interior partitions step
    // OUT into another room, so they're excluded.
    const fp = buildRoofFootprint(level, 0)?.wallOuter ?? null;
    const facingWallIds = new Set<string>();
    for (const w of level.walls) {
      const faces = fp
        ? wallFacesViewer(w.start, w.end, basis, fp)
        : wallFacesDirection(w.start, w.end, basis, bbox);
      if (faces) facingWallIds.add(w.id);
    }

    for (const d of level.doors) {
      if (!facingWallIds.has(d.wallId)) continue;
      const c = openingCenterWorld(d.wallId, d.positionAlong);
      if (!c) continue;
      const cx = projectX(c, basis);
      out.push({
        id: d.id, kind: 'door',
        x: cx - d.width / 2,
        width: d.width,
        bottomY: floorElevationY,
        topY: floorElevationY + d.height,
        doorType: d.doorType,
        sidePanels: d.sidePanels,
        sidePanelWidth: d.sidePanelWidth,
      });
    }
    for (const win of level.windows) {
      if (!facingWallIds.has(win.wallId)) continue;
      const c = openingCenterWorld(win.wallId, win.positionAlong);
      if (!c) continue;
      const cx = projectX(c, basis);
      out.push({
        id: win.id, kind: 'window',
        x: cx - win.width / 2,
        width: win.width,
        bottomY: floorElevationY + win.headHeight - win.height,
        topY: floorElevationY + win.headHeight,
        windowType: win.windowType,
      });
    }
  }
  return out;
}

// ── Vertical-line clip helpers (for setback tier occlusion) ─────────────────
function intersectAtX(p: Vec2, q: Vec2, a: number): Vec2 {
  const t = (a - p.x) / (q.x - p.x);
  return { x: a, y: p.y + t * (q.y - p.y) };
}
// Sutherland–Hodgman clip of a CLOSED polygon to a half-plane (x≤a or x≥a).
function clipClosedHalf(poly: Vec2[], a: number, keepLE: boolean): Vec2[] {
  if (poly.length < 3) return [];
  const inside = (p: Vec2) => (keepLE ? p.x <= a + 1e-6 : p.x >= a - 1e-6);
  const out: Vec2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i], prev = poly[(i + n - 1) % n];
    const ci = inside(cur), pi = inside(prev);
    if (ci) { if (!pi) out.push(intersectAtX(prev, cur, a)); out.push(cur); }
    else if (pi) { out.push(intersectAtX(prev, cur, a)); }
  }
  return out.length >= 3 ? out : [];
}
// Clip an OPEN polyline to a half-plane, keeping the inside run(s).
function clipOpenHalf(pts: Vec2[], a: number, keepLE: boolean): Vec2[] {
  if (pts.length < 2) return [];
  const inside = (p: Vec2) => (keepLE ? p.x <= a + 1e-6 : p.x >= a - 1e-6);
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    if (i > 0) {
      const prev = pts[i - 1];
      if (inside(prev) !== inside(cur)) out.push(intersectAtX(prev, cur, a));
    }
    if (inside(cur)) out.push(cur);
  }
  return out.length >= 2 ? out : [];
}
// Clip every drawable field of a tier sub-scene to one half-plane. `wallA` clips
// the WALL/siding (butts the taller wall); `roofA` clips the ROOF — set a bit
// past `wallA` so the lower roof keeps its overhang and ties INTO the taller
// wall. Returns null if nothing visible remains.
function clipSceneHalf(
  sc: ElevationScene, wallA: number, roofA: number, keepLE: boolean,
  suppress: 'L' | 'R' | 'none' = 'none',
): ElevationScene | null {
  const wallOutline = clipClosedHalf(sc.wallOutline, wallA, keepLE);
  const roofProfile = clipOpenHalf(sc.roofProfile, roofA, keepLE);
  const gableTrim = sc.gableTrim.map(p => clipClosedHalf(p, roofA, keepLE)).filter(p => p.length >= 3);
  const hatch = sc.roofHatch ? clipClosedHalf(sc.roofHatch, roofA, keepLE) : [];
  const roofOutlines = (sc.roofOutlines ?? []).map(p => clipClosedHalf(p, roofA, keepLE)).filter(p => p.length >= 3);
  if (wallOutline.length < 3 && roofProfile.length < 2 && gableTrim.length === 0) return null;
  return {
    ...sc,
    wallOutline, roofProfile, gableTrim,
    roofHatch: hatch.length >= 3 ? hatch : undefined,
    roofOutlines,
    wallLeftX: keepLE ? sc.wallLeftX : Math.max(sc.wallLeftX, wallA),
    wallRightX: keepLE ? Math.min(sc.wallRightX, wallA) : sc.wallRightX,
    xMin: keepLE ? sc.xMin : wallA,
    xMax: keepLE ? wallA : sc.xMax,
    suppressCornerL: sc.suppressCornerL || suppress === 'L',
    suppressCornerR: sc.suppressCornerR || suppress === 'R',
  };
}

// ── Polygon subtraction (hidden-line for gable-side setback) ────────────────
// Intersection of segment p→q with the INFINITE line a→b.
function lineHit(p: Vec2, q: Vec2, a: Vec2, b: Vec2): Vec2 {
  const rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return p;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denom;
  return { x: p.x + t * rx, y: p.y + t * ry };
}
// Clip a (possibly non-convex) simple polygon to one half-plane of edge a→b.
// `keepInside` keeps the side containing `ref`; otherwise the far side.
function clipHalfPlane(poly: Vec2[], a: Vec2, b: Vec2, keepInside: boolean, ref: Vec2): Vec2[] {
  const refSide = (b.x - a.x) * (ref.y - a.y) - (b.y - a.y) * (ref.x - a.x);
  const sgn = (refSide >= 0 ? 1 : -1) * (keepInside ? 1 : -1);
  const inside = (p: Vec2) => sgn * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= -1e-7;
  const out: Vec2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i], prev = poly[(i + n - 1) % n];
    const ci = inside(cur), pi = inside(prev);
    if (ci) { if (!pi) out.push(lineHit(prev, cur, a, b)); out.push(cur); }
    else if (pi) out.push(lineHit(prev, cur, a, b));
  }
  return out.length >= 3 ? out : [];
}
// subject \ clip, for a CONVEX clip polygon. Returns disjoint convex pieces:
// for each clip edge, the part of the remainder OUTSIDE that edge is final; the
// part inside is carried to the next edge. What's inside ALL edges = inside the
// clip = removed. Empty result ⇒ subject fully hidden.
function polyAbsArea(p: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; }
  return Math.abs(a) / 2;
}
export function subtractConvexPoly(subject: Vec2[], clip: Vec2[]): Vec2[][] {
  if (subject.length < 3) return [];
  if (clip.length < 3) return [subject];
  const cc = { x: clip.reduce((s, p) => s + p.x, 0) / clip.length, y: clip.reduce((s, p) => s + p.y, 0) / clip.length };
  const pieces: Vec2[][] = [];
  let remaining = subject;
  const n = clip.length;
  for (let i = 0; i < n && remaining.length >= 3; i++) {
    const a = clip[i], b = clip[(i + 1) % n];
    const outside = clipHalfPlane(remaining, a, b, false, cc);
    if (outside.length >= 3 && polyAbsArea(outside) > 0.5) pieces.push(outside); // drop slivers
    remaining = clipHalfPlane(remaining, a, b, true, cc);
  }
  return pieces;
}
// An OPEN polyline minus a convex polygon: the runs of the polyline OUTSIDE the
// clip. Each segment is split at its crossings with the clip's edges and the
// pieces whose midpoint is outside are kept — so a segment that runs from outside
// INTO the clip keeps its outside part up to the exact crossing point (the old
// version dropped whole points and lost the crossing, e.g. a roof rake dying into
// the wall lost its slope). Used to drop the hidden part of a roof rake/outline.
export function subtractConvexPolyline(pts: Vec2[], clip: Vec2[]): Vec2[][] {
  if (pts.length < 2 || clip.length < 3) return pts.length >= 2 ? [pts] : [];
  const n = clip.length;
  const cc = { x: clip.reduce((s, p) => s + p.x, 0) / n, y: clip.reduce((s, p) => s + p.y, 0) / n };
  const inside = (p: Vec2) => {
    for (let i = 0; i < n; i++) {
      const a = clip[i], b = clip[(i + 1) % n];
      const refSide = (b.x - a.x) * (cc.y - a.y) - (b.y - a.y) * (cc.x - a.x);
      const sgn = refSide >= 0 ? 1 : -1;
      if (sgn * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < -1e-7) return false;
    }
    return true;
  };
  const lerp = (A: Vec2, B: Vec2, t: number): Vec2 => ({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) });
  // t along A→B where it crosses segment C→D (within both), or null.
  const crossT = (A: Vec2, B: Vec2, C: Vec2, D: Vec2): number | null => {
    const rx = B.x - A.x, ry = B.y - A.y, sx = D.x - C.x, sy = D.y - C.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    const t = ((C.x - A.x) * sy - (C.y - A.y) * sx) / den;
    const u = ((C.x - A.x) * ry - (C.y - A.y) * rx) / den;
    return (u < -1e-9 || u > 1 + 1e-9 || t < -1e-9 || t > 1 + 1e-9) ? null : t;
  };
  const runs: Vec2[][] = [];
  let cur: Vec2[] = [];
  const flush = () => { if (cur.length >= 2) runs.push(cur); cur = []; };
  const add = (p: Vec2) => { if (!cur.length || Math.hypot(p.x - cur[cur.length - 1].x, p.y - cur[cur.length - 1].y) > 1e-6) cur.push(p); };
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1];
    const ts = [0, 1];
    for (let j = 0; j < n; j++) { const t = crossT(A, B, clip[j], clip[(j + 1) % n]); if (t !== null && t > 1e-9 && t < 1 - 1e-9) ts.push(t); }
    ts.sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      if (!inside(lerp(A, B, (t0 + t1) / 2))) { add(lerp(A, B, t0)); add(lerp(A, B, t1)); }
      else flush();
    }
  }
  flush();
  return runs;
}

// Coordinate of the eave-side ridge along the SIGHT axis (constant, because an
// eave-side ridge runs perpendicular to the view). Returns null if no ridge runs
// mostly perpendicular to the view (i.e. this is a gable-end view of the tier).
function ridgeAxisCoord(
  ridges: { kind: string; a?: Vec2; b?: Vec2 }[], basis: DirectionBasis,
): number | null {
  let best: number | null = null, bestPerp = -1;
  for (const r of ridges) {
    if (r.kind !== 'line' || !r.a || !r.b) continue;
    const along = basis.axis === 'x' ? Math.abs(r.b.x - r.a.x) : Math.abs(r.b.y - r.a.y);
    const perp = basis.axis === 'x' ? Math.abs(r.b.y - r.a.y) : Math.abs(r.b.x - r.a.x);
    if (perp > along && perp > bestPerp) {
      bestPerp = perp;
      best = basis.axis === 'x' ? (r.a.x + r.b.x) / 2 : (r.a.y + r.b.y) / 2;
    }
  }
  return best;
}

// The wall coordinate of a level NEAREST the viewer along the sight axis.
function levelNearDepth(level: Level, basis: DirectionBasis): number {
  const cs = level.walls.flatMap(w => [
    basis.axis === 'x' ? w.start.x : w.start.y,
    basis.axis === 'x' ? w.end.x : w.end.y,
  ]);
  if (!cs.length) return 0;
  return basis.sign > 0 ? Math.max(...cs) : Math.min(...cs);
}

const polyMinX = (p?: Vec2[]) => (p && p.length ? Math.min(...p.map(v => v.x)) : NaN);
const polyMaxX = (p?: Vec2[]) => (p && p.length ? Math.max(...p.map(v => v.x)) : NaN);
const polyMinY = (p?: Vec2[]) => (p && p.length ? Math.min(...p.map(v => v.y)) : NaN);
const polyMaxY = (p?: Vec2[]) => (p && p.length ? Math.max(...p.map(v => v.y)) : NaN);

// Bottom of a tier's eave/rake soffit (the underside of the roof overhang). Used
// as the height where a roof overhang's shadow on a behind-roof transitions to
// the wall's shadow. gableTrim holds the eave/soffit band; fall back to the roof
// hatch eave if absent.
function tierSoffitY(sc: ElevationScene): number {
  let m = Infinity;
  for (const g of sc.gableTrim) for (const v of g) if (v.y < m) m = v.y;
  if (Number.isFinite(m)) return m;
  return sc.roofHatch && sc.roofHatch.length ? polyMinY(sc.roofHatch) : sc.topOfWallsY;
}

// Hidden-line removal for an eave-side wing roof occluded by a TALLER block at
// their junction. The wing's roof rises away from its eave; above the depth
// CROSSOVER height (where the rising roof passes behind the block's near wall)
// the block hides it, so the wing roof is notched at the block's near silhouette
// (block roof edge above the block eave, block wall edge below it). Below the
// crossover the wing roof is in front and keeps its full overhang. Returns a new
// scene with notched roofHatch / roofProfile, or the scene unchanged if the
// crossover sits at/above the ridge (nothing hidden).
function occludeEaveRoof(
  sc: ElevationScene, opts: {
    wingOnLeft: boolean; crossZ: number;
    blockRoofX: number; blockWallX: number; blockSoffitZ: number;
  },
): ElevationScene {
  const hatch = sc.roofHatch;
  if (!hatch || hatch.length < 3) return sc;
  const zEave = polyMinY(hatch), zTop = polyMaxY(hatch);
  if (!(zTop > zEave)) return sc;
  const crossZ = Math.min(zTop, Math.max(zEave, opts.crossZ));
  if (crossZ >= zTop - 1e-3) return sc; // crossover at/above ridge ⇒ nothing hidden
  const blockEaveZ = Math.min(zTop, Math.max(crossZ, opts.blockSoffitZ));

  const xFar = opts.wingOnLeft ? polyMinX(hatch) : polyMaxX(hatch);
  const xNear = opts.wingOnLeft ? polyMaxX(hatch) : polyMinX(hatch);
  // Clamp the block's near edges to lie within the wing-roof span on the block
  // side; if the block doesn't reach into the wing roof, there's nothing to cut.
  const inSpan = (x: number) => opts.wingOnLeft
    ? Math.min(xNear, Math.max(xFar, x))
    : Math.max(xNear, Math.min(xFar, x));
  const roofX = inSpan(opts.blockRoofX);
  const wallX = inSpan(opts.blockWallX);
  const reaches = opts.wingOnLeft ? roofX < xNear - 1e-3 : roofX > xNear + 1e-3;
  if (!reaches) return sc;

  const verts: Vec2[] = [
    { x: xFar, y: zEave }, { x: xFar, y: zTop },
    { x: roofX, y: zTop }, { x: roofX, y: blockEaveZ },
    { x: wallX, y: blockEaveZ }, { x: wallX, y: crossZ },
    { x: xNear, y: crossZ }, { x: xNear, y: zEave },
  ];
  // roofProfile = the visible outline (everything but the bottom eave edge,
  // which is the wall top and drawn by the shell).
  const profile = verts.slice();
  return { ...sc, roofHatch: verts, roofProfile: profile, roofOutlines: [] };
}

// ── Setback elevation (per-floor roof tiers, composited) ────────────────────
// Each floor tier is rendered as its OWN normal single-building elevation (its
// footprint, raised to its full height, with only its ridges) by recursing into
// buildElevation on a one-level sub-project — so the upper roof is literally the
// polished single-roof code path, unchanged. The tiers are returned low→high in
// `scene.tiers`; the renderer draws them back-to-front, so the taller upper
// block's opaque siding occludes the lower roof behind it (= "the lower roof
// dies into the two-story wall"). Openings / grade / floor refs live on the
// composite and draw once on top. Only reached when hasSetback(project) is true.
function buildTieredElevation(
  project: Project, basis: DirectionBasis,
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  stack: SectionStack, s: ReturnType<typeof getStructural>,
  gradeY: number, xMin: number, xMax: number, direction: ElevationDirection,
): ElevationScene {
  const tiers = buildRoofTiers(project);
  const structural = getStructural(project);
  const otherDrafting = (project.roof.drafting ?? []).filter(
    p => p.kind === 'line' && (p.style === 'valley' || p.style === 'hip'),
  );

  const overhang = Math.max(0, project.roof?.overhang ?? 12);
  // Shared-wall thickness (most common across the building). A wing abutting a
  // taller block shares the wall plane, but its OWN exterior face is one wall-
  // thickness toward the wing from the block's face — clipping the wing exactly at
  // the block's face puts the wing's wall/corner/overhang a wall-thickness too far
  // toward the block. Shift the clip by this so the corner trims stack across floors.
  const thkCounts = new Map<number, number>();
  for (const w of project.levels.flatMap(l => l.walls)) thkCounts.set(w.thickness, (thkCounts.get(w.thickness) ?? 0) + 1);
  let jointThk = 4.5, bestThkN = 0;
  for (const [t, n] of thkCounts) if (n > bestThkN) { bestThkN = n; jointThk = t; }
  // Facing depth: the wall coord nearest the viewer along the sight axis. Bigger
  // ⇒ closer ⇒ drawn LATER, so a wing projecting toward the viewer occludes the
  // set-back block.
  const depthKey = (lvl: Level): number => {
    const cs = lvl.walls.flatMap(w => [
      basis.axis === 'x' ? w.start.x : w.start.y,
      basis.axis === 'x' ? w.end.x : w.end.y,
    ]);
    return cs.length === 0 ? 0 : (basis.sign > 0 ? Math.max(...cs) : -Math.min(...cs));
  };

  const pitch = Math.max(0.5, project.roof?.pitch ?? 6);
  const slopeRun = 12 / pitch; // run (inches) per inch of rise

  type Built = {
    scene: ElevationScene; depth: number; plate: number;
    ridgeCoord: number | null; nearDepth: number;
  };
  const built: Built[] = [];
  let ridgeY = stack.topOfWallsY;
  for (const tier of tiers) {
    const lvl = project.levels.find(l => l.id === tier.levelId);
    if (!lvl) continue;
    const sub: Project = {
      ...project,
      levels: [{ ...lvl, elevation: 0 }],
      activeLevelId: lvl.id,
      roof: { ...project.roof, drafting: [...tier.ridges, ...otherDrafting] },
      structural: {
        ...structural,
        secondFloor: undefined,
        firstFloor: { ...structural.firstFloor, plateHeight: tier.plateTopY },
      },
    };
    const sc = buildElevation(sub, direction);
    if (sc) {
      built.push({
        scene: sc, depth: depthKey(lvl), plate: tier.plateTopY,
        ridgeCoord: ridgeAxisCoord(tier.ridges, basis),
        nearDepth: levelNearDepth(lvl, basis),
      });
      if (sc.ridgeY > ridgeY) ridgeY = sc.ridgeY;
    }
  }

  // Geometric notching (no draw-order occlusion — hatches don't cover). Two passes:
  const EPS = 1;

  // ── GABLE-SIDE view (E/W here) — every tier is a gable END (ridge ∥ view, so
  // ridgeCoord == null). Tiers overlap in drawing-X; the NEARER tier is drawn
  // whole and the farther tier has the nearer silhouette SUBTRACTED (true hidden-
  // line between two gables). No eave-side clip/notch applies. Draw far→near.
  const composite = (tierScenes: ElevationScene[]): ElevationScene => ({
    direction, xMin, xMax, gradeY,
    footingBottomY: stack.footingBottomY,
    topOfWallsY: stack.topOfWallsY,
    ridgeY,
    roofProfile: [],
    wallLeftX: xMin, wallRightX: xMax,
    openings: projectOpenings(project, basis, bbox),
    firstFloorY: 0,
    secondFloorY: stack.secondJoistBandTopY,
    wallOutline: [],
    gableTrim: [],
    exteriorMaterial: s.exteriorMaterial,
    stack,
    tiers: tierScenes,
  });
  const isGableView = built.length >= 2 && built.every(b => b.ridgeCoord == null);
  if (isGableView) {
    const sorted = [...built].sort((a, b) => a.depth - b.depth); // far → near
    const overlapX = (p: ElevationScene, q: ElevationScene) => p.xMin < q.xMax - EPS && q.xMin < p.xMax - EPS;
    // Clip a (far) tier's roof to a half-plane — used to stop its eave overhang
    // poking past a nearer tier on a FLUSH (shared-wall) side.
    const clipRoofHalf = (sc: ElevationScene, x: number, keepLE: boolean): ElevationScene => {
      const hatch = sc.roofHatch ? clipClosedHalf(sc.roofHatch, x, keepLE) : [];
      return {
        ...sc,
        roofProfile: clipOpenHalf(sc.roofProfile, x, keepLE),
        roofHatch: hatch.length >= 3 ? hatch : undefined,
        gableTrim: sc.gableTrim.map(g => clipClosedHalf(g, x, keepLE)).filter(g => g.length >= 3),
      };
    };
    const gableTiers = sorted.map((b, i) => {
      const nearer = sorted.slice(i + 1).filter(o => overlapX(b.scene, o.scene));
      if (!nearer.length) return b.scene;
      let sc: ElevationScene = { ...b.scene, subtractPolys: nearer.map(o => o.scene.wallOutline) };
      for (const o of nearer) {
        // Only clip the far tier's flush-side overhang when it's HIDDEN behind a
        // TALLER nearer tier (e.g. West wing behind the block). When the far tier
        // is taller (East block above the shorter wing), its rake overhang + soffit
        // return are visible and must NOT be clipped.
        if (o.plate <= b.plate + EPS) continue;
        if (Math.abs(sc.wallRightX - o.scene.wallRightX) < jointThk + EPS) sc = clipRoofHalf(sc, o.scene.wallRightX, true);
        if (Math.abs(sc.wallLeftX - o.scene.wallLeftX) < jointThk + EPS) sc = clipRoofHalf(sc, o.scene.wallLeftX, false);
      }
      return sc;
    });
    return composite(gableTiers);
  }

  // PASS 1 — clip each tier that's SHORTER than an overlapping tier to its own
  // footprint side of that taller tier's wall, with its roof tying IN (+overhang).
  // (Stops a wing's roof banding across the taller block.) Keep corners.
  const pass1 = built.map(b => {
    let sc: ElevationScene | null = b.scene;
    for (const o of built) {
      if (o === b || !sc) continue;
      if (o.plate <= b.plate + EPS) continue; // only a TALLER tier clips this one
      // FLUSH (facing walls coplanar — no bump on this face, e.g. the flat south of
      // an L that only bumps north): the wing wall is continuous with the block, so
      // NO first-floor corner trim and the wing roof dies straight into the block
      // wall (no overhang past, no thickness shift). STEPPED (a real bump): the
      // wing keeps its own exterior face (block face + wall thickness) so its
      // wall/corner/overhang stack with the block's corner above.
      const flush = Math.abs(b.depth - o.depth) < EPS;
      const shift = flush ? 0 : jointThk;
      const oh = flush ? 0 : overhang;
      if (sc.wallLeftX < o.scene.wallLeftX - EPS && sc.wallRightX <= o.scene.wallRightX + EPS) {
        const face = o.scene.wallLeftX + shift;
        sc = clipSceneHalf(sc, face, face + oh, true, flush ? 'R' : 'none');
      } else if (sc.wallRightX > o.scene.wallRightX + EPS && sc.wallLeftX >= o.scene.wallLeftX - EPS) {
        const face = o.scene.wallRightX - shift;
        sc = clipSceneHalf(sc, face, face - oh, false, flush ? 'L' : 'none');
      }
    }
    return sc ? { ...b, scene: sc } : null;
  }).filter((x): x is Built => x !== null);

  // PASS 1.5 — HIDDEN-LINE removal of an eave-side wing roof behind a taller
  // block. Where the shorter wing's roof rises toward its ridge, it passes BEHIND
  // the block above the depth-crossover height; notch it at the block's near
  // silhouette there. Below the crossover the wing roof is in front and stays
  // whole (so its eave overhang into the block is preserved).
  const occluded = pass1.map(b => {
    let sc = b.scene;
    if (b.ridgeCoord == null || !sc.roofHatch) return b; // gable-end view ⇒ no eave roof
    for (const o of pass1) {
      if (o === b) continue;
      if (o.plate <= b.plate + EPS) continue;            // o must be the TALLER block
      const wingOnLeft = sc.wallRightX <= o.scene.wallLeftX + overhang + EPS && sc.wallLeftX < o.scene.wallLeftX - EPS;
      const wingOnRight = sc.wallLeftX >= o.scene.wallRightX - overhang - EPS && sc.wallRightX > o.scene.wallRightX + EPS;
      if (!wingOnLeft && !wingOnRight) continue;
      const blockSoffitZ = tierSoffitY(o.scene); // underside of block roof overhang
      // Crossover height. STEPPED (bump in front): the wing roof rises BEHIND the
      // block's 2-story wall above z = ridgeTop − |ridgeDepth − blockNear|/slopeRun.
      // FLUSH (coplanar): the wall doesn't occlude (it's beside, not behind) — only
      // the block's ROOF OVERHANG clips the wing roof's top corner, so the cut
      // starts at the block soffit.
      const flush = Math.abs(b.depth - o.depth) < EPS;
      const crossZ = flush ? blockSoffitZ : sc.ridgeY - Math.abs(b.ridgeCoord - o.nearDepth) / slopeRun;
      const blockRoofX = wingOnLeft ? polyMinX(o.scene.roofHatch) : polyMaxX(o.scene.roofHatch);
      const blockWallX = wingOnLeft ? o.scene.wallLeftX : o.scene.wallRightX;
      sc = occludeEaveRoof(sc, {
        wingOnLeft,
        crossZ,
        blockRoofX: Number.isNaN(blockRoofX) ? blockWallX : blockRoofX,
        blockWallX,
        blockSoffitZ,
      });
    }
    return { ...b, scene: sc };
  });

  // PASS 2 — junction corner trim, with FLUSH-vs-STEPPED handling.
  //  • STEPPED (a real bump): the wing is in front; the block's corner board shows
  //    only between the wing-roof tie-in (crossover) and the block's soffit (below
  //    it's behind the wing, above it's behind the block's own eave) — clip it.
  //  • FLUSH (coplanar — the flat south of an L that bumps only north): the first-
  //    floor wall is CONTINUOUS, so MERGE the wing's wall into the block as one
  //    L-shaped outline (no spurious first-floor junction line), give the wing's
  //    far edge a wing-height corner board, and add the junction corner trim
  //    spanning [wing soffit (fascia bottom) → block soffit].
  const TRIM = 5; // matches EP_TRIM_WIDTH
  const mergedAway = new Set<Built>();
  const withTrim = occluded.map(b => {
    let sc: ElevationScene = b.scene;
    for (const o of occluded) {
      if (o === b) continue;
      if (!(o.plate < b.plate - EPS && o.depth >= b.depth - EPS)) continue; // o = shorter wing
      const wingOnRight = Math.abs(o.scene.wallLeftX - sc.wallRightX) < overhang + EPS && o.scene.wallLeftX > sc.wallLeftX;
      const wingOnLeft = Math.abs(o.scene.wallRightX - sc.wallLeftX) < overhang + EPS && o.scene.wallRightX < sc.wallRightX;
      if (!wingOnLeft && !wingOnRight) continue;
      const blockSoffit = tierSoffitY(sc);
      const wingSoffit = tierSoffitY(o.scene);
      const flush = Math.abs(o.depth - b.depth) < EPS;
      if (flush) {
        const bL = sc.wallLeftX, bR = sc.wallRightX, bTop = sc.topOfWallsY, g = sc.gradeY, oTop = o.scene.topOfWallsY;
        const jBand: [number, number] = [Math.max(g, wingSoffit), blockSoffit];
        // The wing's FAR corner board runs grade → the wing fascia bottom (its
        // soffit), so it meets the underside of the fascia board, not the plate.
        const farTop = Math.min(oTop, wingSoffit);
        if (wingOnRight) {
          const oR = o.scene.wallRightX, jx = o.scene.wallLeftX;
          sc = { ...sc, wallRightX: oR, cornerRClipY: [g, farTop],
            wallOutline: [{ x: bL, y: g }, { x: bL, y: bTop }, { x: bR, y: bTop }, { x: bR, y: oTop }, { x: oR, y: oTop }, { x: oR, y: g }],
            gableTrim: jBand[1] > jBand[0] ? [...sc.gableTrim, [{ x: jx - TRIM, y: jBand[0] }, { x: jx, y: jBand[0] }, { x: jx, y: jBand[1] }, { x: jx - TRIM, y: jBand[1] }]] : sc.gableTrim };
        } else {
          const oL = o.scene.wallLeftX, jx = o.scene.wallRightX;
          sc = { ...sc, wallLeftX: oL, cornerLClipY: [g, farTop],
            wallOutline: [{ x: oL, y: g }, { x: oL, y: oTop }, { x: bL, y: oTop }, { x: bL, y: bTop }, { x: bR, y: bTop }, { x: bR, y: g }],
            gableTrim: jBand[1] > jBand[0] ? [...sc.gableTrim, [{ x: jx, y: jBand[0] }, { x: jx + TRIM, y: jBand[0] }, { x: jx + TRIM, y: jBand[1] }, { x: jx, y: jBand[1] }]] : sc.gableTrim };
        }
        mergedAway.add(o);
      } else {
        const crossZ = o.ridgeCoord != null ? o.scene.ridgeY - Math.abs(o.ridgeCoord - b.nearDepth) / slopeRun : sc.gradeY;
        const band: [number, number] = [Math.max(sc.gradeY, crossZ), blockSoffit];
        if (band[1] > band[0]) sc = wingOnRight ? { ...sc, cornerRClipY: band } : { ...sc, cornerLClipY: band };
      }
    }
    return { b, scene: sc };
  });
  // Wings merged into a block keep only their ROOF — clear their wall shell.
  const clipped = withTrim.map(t => ({
    scene: mergedAway.has(t.b) ? { ...t.scene, wallOutline: [] } : t.scene,
    depth: t.b.depth,
  }));

  // Draw FAR → NEAR so a front wing (and its tie-in roof overhang) occludes the
  // set-back block behind it.
  clipped.sort((a, b) => a.depth - b.depth);

  return {
    direction, xMin, xMax, gradeY,
    footingBottomY: stack.footingBottomY,
    topOfWallsY: stack.topOfWallsY,
    ridgeY,
    roofProfile: [],
    wallLeftX: xMin, wallRightX: xMax,
    openings: projectOpenings(project, basis, bbox),
    firstFloorY: 0,
    secondFloorY: stack.secondJoistBandTopY,
    wallOutline: [],
    gableTrim: [],
    exteriorMaterial: s.exteriorMaterial,
    stack,
    tiers: clipped.map(c => c.scene),
  };
}

// ── Main entry point ──────────────────────────────────────────────────────
export function buildElevation(
  project: Project,
  direction: ElevationDirection,
): ElevationScene | null {
  const bbox = buildingBBox(project);
  if (!bbox) return null;

  const basis = DIRECTION_BASIS[direction];
  const stack = buildSectionStack(project);
  const s = getStructural(project);

  // Grade plane Y in elevation-world.
  // gradeToFirstFloor = inches from grade UP to top of first-floor subfloor.
  // Y=0 is top of first-floor subfloor; grade sits BELOW that.
  const gradeToFloor = s.foundation.gradeToFirstFloor
    ?? GRADE_TO_FIRST_FLOOR_DEFAULT[s.foundation.type];
  const gradeY = -gradeToFloor;

  // Drawing-X extents span the FULL building footprint (all walls' exterior
  // faces), so a cross-gable's projecting wing / bump-out is included — you see
  // it from a gable-end view even though it isn't part of the facing wall. For
  // a rectangular footprint this is just the bbox, so single gables are
  // unchanged.
  const allWalls = project.levels.flatMap(l => l.walls);
  const facingWalls = allWalls.filter(w => wallFacesDirection(w.start, w.end, basis, bbox));
  const exs = allWalls.flatMap(wallPolygon).map(p => projectX(p, basis));
  const xMin = Math.min(...exs);
  const xMax = Math.max(...exs);
  // Gable span for the ridge height = the FACING wall's CENTERLINE extent (the
  // width of the gable that actually faces this view, e.g. the west-end gable),
  // NOT the full footprint — so the projecting wing doesn't inflate the ridge
  // height. Centerline (not exterior) keeps it consistent with the eave side.
  const facingCl = facingWalls.flatMap(w => [projectX(w.start, basis), projectX(w.end, basis)]);
  const gableSpan = facingCl.length ? (Math.max(...facingCl) - Math.min(...facingCl)) : (xMax - xMin);

  // Roof topology from the user-drawn roof plan. When this is empty
  // (`hasRoof === false`), buildRoofProfile / sampleRoofEnvelope produce a
  // flat top — elevations stay roof-less until the user draws ridges.
  const topology = buildRoofTopology(project);

  // ── SETBACK (smaller upper floor) ───────────────────────────────────────
  // A multi-tier building can't be drawn as one roof mass at one height: the
  // one-story wing must step DOWN below the two-story block. Build the stepped
  // silhouette from per-floor roof tiers (each at its own plate height) and
  // return early. The single-roof paths below are untouched, so single-story
  // and identical-footprint two-story render exactly as before.
  if (hasSetback(project)) {
    return buildTieredElevation(project, basis, bbox, stack, s, gradeY, xMin, xMax, direction);
  }

  // ── CROSS-GABLE composite ───────────────────────────────────────────────
  // When the roof has ridges on both plan axes, no single gable-end OR eave-
  // side drawing is right: the view must composite the perpendicular ridge's
  // eave-side shingle FIELD (behind) with the facing ridge's GABLE (in front)
  // and any bump-out. Built front-to-back in its own routine; the single-gable
  // paths below are untouched.
  if (topology.hasRoof && isCrossGable(topology)) {
    const composite = buildCrossGableElevation(
      project, direction, basis, bbox, stack, topology,
      xMin, xMax, gradeY, gableSpan,
    );
    if (composite) return composite;
  }

  const { profile: roofProfileRaw, ridgeY } = buildRoofProfile(
    topology, basis, stack.topOfWallsY, xMin, xMax,
  );

  // ── EAVE-SIDE view (ridge runs across the view) ─────────────────────────
  // On the long side of a single-gable roof the roof reads as a RECTANGLE:
  // ridge line straight across the top, eave fascia straight across the bottom
  // (at the same height as the gable-end eaves), vertical ends at the rake
  // overhang, wall/siding below. This is geometrically distinct from the
  // gable-end triangle, so it gets its own builder.
  if (topology.hasRoof && isEaveSideView(topology, basis)) {
    // Heights come straight from the section's rafter frame so the eave,
    // fascia and ridge always match the cross-section.
    const frame = computeRoofFrame(project, stack)!;
    const OH = frame.overhang;
    const eaveTopY = frame.eaveRoofEdgeY;   // roof edge / fascia top
    const soffitY  = frame.eaveSoffitY;     // fascia bottom (level soffit)
    const eaveRidgeY = frame.ridgeTopY;     // ridge top (= T/O ROOF)
    const rL = xMin - OH, rR = xMax + OH;                   // rake overhang on each gable end
    // The roof surface is filled by the SHINGLE HATCH (roofHatch), NOT a white
    // polygon — a white fill here gets painted over the hatch by the renderer's
    // hatch-to-background paint order, leaving the roof blank. The roof edges
    // (ridge + the two vertical rake ends) are drawn as the open roofProfile
    // outline; the eave line + soffit come from the fascia band.
    const roofRect: Vec2[] = [
      { x: rL, y: eaveRidgeY }, { x: rR, y: eaveRidgeY },
      { x: rR, y: eaveTopY }, { x: rL, y: eaveTopY },
    ];
    const roofOutline: Vec2[] = [
      { x: rL, y: eaveTopY }, { x: rL, y: eaveRidgeY },
      { x: rR, y: eaveRidgeY }, { x: rR, y: eaveTopY },
    ];
    const fasciaBand: Vec2[] = [
      { x: rL, y: eaveTopY }, { x: rR, y: eaveTopY },
      { x: rR, y: soffitY }, { x: rL, y: soffitY },
    ];
    const wallOutlineE: Vec2[] = [
      { x: xMin, y: gradeY }, { x: xMin, y: stack.topOfWallsY },
      { x: xMax, y: stack.topOfWallsY }, { x: xMax, y: gradeY },
    ];
    return {
      direction, xMin, xMax, gradeY,
      footingBottomY: stack.footingBottomY, topOfWallsY: stack.topOfWallsY, ridgeY: eaveRidgeY,
      roofProfile: roofOutline,
      wallLeftX: xMin, wallRightX: xMax,
      openings: projectOpenings(project, basis, bbox),
      firstFloorY: 0, secondFloorY: stack.secondJoistBandTopY,
      wallOutline: wallOutlineE,
      gableTrim: [fasciaBand],   // fascia only — roof surface is the shingle hatch, not white fill
      roofHatch: roofRect,       // fill the roof surface with shingles
      exteriorMaterial: s.exteriorMaterial,
      stack,
    };
  }

  // EAVE overhangs read level in elevation (the fascia/soffit run horizontal),
  // unlike the sloped rakes. Flatten the eave overhang portions to the eave
  // line so the soffit box is a clean rectangle that meets the rake cleanly.
  const roofProfileLevel = topology.hasRoof
    ? levelEaveOverhang(roofProfileRaw, xMin, xMax, stack.topOfWallsY, topology.overhang)
    : roofProfileRaw;

  // Lift the roof-plane profile to the section's RAFTER frame: the rafters sit
  // on the plate, so the roof edge / ridge live a rafter-thickness above the
  // roof plane (less the birds-mouth seat drop). This makes the gable-end eave
  // edge, fascia and ridge line up with the section AND with the eave-side
  // (N/S) elevations at the building corners. `eaveDepth` deepens the eave
  // soffit/fascia to the full rafter face (matching the section); the sloped
  // rake/barge board keeps its slimmer ROOF_TRIM_DEPTH.
  // Anchor the sampled roof-plane profile onto the section's rafter frame:
  // remap Y so the eave tips land exactly on `eaveRoofEdgeY` and the peak on
  // `ridgeTopY`. This removes the ~1" sampling/centerline drift so the gable-
  // end eave matches the eave-side (N/S) at the building corners, and deepens
  // the eave soffit to the full rafter face (eaveDepth).
  // Span = the facing-wall width of THIS gable, so a wing's gable (e.g. the
  // main gable of a cross-gable) gets a ridge height matched to its own width,
  // not the whole building's.
  const frame = computeRoofFrame(project, stack, gableSpan);
  const eaveDepth = frame ? (frame.eaveRoofEdgeY - frame.eaveSoffitY) : ROOF_TRIM_DEPTH;
  let remapRoofY = (y: number) => y;
  if (frame && topology.hasRoof && roofProfileLevel.length >= 2) {
    let oldEave = Infinity, oldPeak = -Infinity;
    for (const p of roofProfileLevel) { if (p.y < oldEave) oldEave = p.y; if (p.y > oldPeak) oldPeak = p.y; }
    const span = oldPeak - oldEave;
    if (span > 1) {
      const scale = (frame.ridgeTopY - frame.eaveRoofEdgeY) / span;
      remapRoofY = (y: number) => frame.eaveRoofEdgeY + (y - oldEave) * scale;
    }
  }
  const roofProfile = roofProfileLevel.map(p => ({ x: p.x, y: remapRoofY(p.y) }));
  const ridgeYframe = remapRoofY(ridgeY);

  // Floor reference lines.
  const firstFloorY = 0;
  const secondFloorY = stack.secondJoistBandTopY;

  // ── Wall-shell polygon ─────────────────────────────────────────────────
  // Same slopes as the roof, but WITHOUT the eave/rake overhangs — the
  // siding fills this shape including the gable triangle / hip trapezoid.
  // We sample the same upper-envelope as roofProfile but clipped to [xMin,
  // xMax], so the wall hatch follows the actual roof topology regardless of
  // whether the user drew one gable, cross-gables, a hip, etc.
  const wallTop = (topology.hasRoof
    ? buildWallTop(topology, basis, stack.topOfWallsY, xMin, xMax)
    : [{ x: xMin, y: stack.topOfWallsY }, { x: xMax, y: stack.topOfWallsY }])
    .map(p => ({ x: p.x, y: remapRoofY(p.y) }));   // follow the lifted roof edge

  const wallOutline: Vec2[] = [
    { x: xMin, y: gradeY },
    ...wallTop,
    { x: xMax, y: gradeY },
  ];

  // ── Roof-edge trim (rake boards + eave fascia + soffit return) ──────────
  // A constant-width band hugging the underside of the roof silhouette.
  // Along the sloped runs it reads as the rake/barge board; along the flat
  // eave overhangs it reads as the fascia; the corner where a rake meets an
  // eave tail is the soffit return. Generated straight from the corrected
  // roofProfile, so it follows whatever the roof plan produces (single gable,
  // cross-gable, hip) instead of assuming a centered symmetric gable.
  const gableTrim: Vec2[][] = topology.hasRoof
    ? buildRoofTrim(roofProfile, ROOF_TRIM_DEPTH, eaveDepth, xMin, xMax, stack.topOfWallsY)
    : [];

  return {
    direction,
    xMin, xMax,
    gradeY,
    footingBottomY: stack.footingBottomY,
    topOfWallsY: stack.topOfWallsY,
    ridgeY: ridgeYframe,
    roofProfile,
    wallLeftX: xMin,
    wallRightX: xMax,
    openings: projectOpenings(project, basis, bbox),
    firstFloorY,
    secondFloorY,
    wallOutline,
    gableTrim,
    exteriorMaterial: s.exteriorMaterial,
    stack,
  };
}

// A facing gable resolved for one view: peak + valley-bounded base + per-foot
// flags. A FREE-END foot (the gable terminates at the building's outer edge —
// nothing of the footprint continues past it) gets the boxed eave return + 1'
// overhang. Any other foot is a VALLEY: the footprint continues past it (a
// bump-out junction) OR it meets the perpendicular roof mid-wall, so the rake
// just dies into the shingle field — NO return/overhang. A wall-corner foot
// (footprint vertex) that is interior also gets a vertical corner board.
interface CrossGable {
  peakX: number;   // drawing-X of the ridge (gable apex)
  gMin: number;    // siding base extent (drawing-X)
  gMax: number;
  retL: boolean;   // left foot is a FREE gable end (building edge) → return + overhang
  retR: boolean;
  wallL: boolean;  // left foot is a footprint corner → corner board if interior
  wallR: boolean;
}

// The rake silhouette of a gable for THIS view: feet + peak. A WALL-CORNER foot
// extends 1' to its overhang TIP, which sits at the SECTION eave roof edge
// (`eaveY` = eaveRoofEdgeY) — the rake then RISES inward through the wall corner
// (higher, on this same line) to the peak, exactly like the single gable. A
// VALLEY foot stops at the wall corner at the eave. Used for the field notch,
// the wall-top envelope, and the trim.
function gableRun(g: CrossGable, eaveY: number, H: number, overhang: number): Vec2[] {
  return [
    { x: g.retL ? g.gMin - overhang : g.gMin, y: eaveY },
    { x: g.peakX, y: H },
    { x: g.retR ? g.gMax + overhang : g.gMax, y: eaveY },
  ];
}

// Gable-end trim as ONE closed polygon — the LOCKED single-gable recipe. For a
// two-wall-corner gable this is byte-for-byte `gableTrimOutline`: outer rake
// (tips at the section eave roof edge) → vertical fascia at the tip → level
// soffit (section depth `eaveDepth`) IN to the corner-board inner edge → wall
// return → inner rake → peak. Heights are the SECTION frame's, so the gable
// fascia lines up with the eave/field fascia (NOT a dip off a low tip). A VALLEY
// foot (not a wall corner) just drops the rake board to the wall corner — no
// overhang/return — so it dies cleanly into the shingle field.
function cgGableTrim(
  g: CrossGable, run: Vec2[], eaveY: number, H: number,
  rakeDepth: number, eaveDepth: number, cornerW: number,
): Vec2[] {
  const [footL, peak, footR] = run;
  const wallYL = runYatX(run, g.gMin, true) ?? eaveY;
  const wallYR = runYatX(run, g.gMax, false) ?? eaveY;
  const poly: Vec2[] = [footL, peak, footR];   // outer rake (tips on the section eave roof edge)
  // Right closure → right inner-rake end.
  if (g.retR) {
    const soffitYR = footR.y - eaveDepth;                              // = section eave soffit
    const innerYR = (runYatX(run, g.gMax - cornerW, false) ?? wallYR) - rakeDepth;
    poly.push({ x: footR.x, y: soffitYR });                           // fascia R (vertical at the tip)
    poly.push({ x: g.gMax - cornerW, y: soffitYR });                  // level soffit IN to corner-board inner edge
    poly.push({ x: g.gMax - cornerW, y: innerYR });                   // wall return up to the inner rake
  } else {
    poly.push({ x: g.gMax, y: wallYR - rakeDepth });                  // valley: rake board dies at the wall corner
  }
  poly.push({ x: g.peakX, y: H - rakeDepth });                        // inner rake peak
  // Left closure (mirror).
  if (g.retL) {
    const soffitYL = footL.y - eaveDepth;
    const innerYL = (runYatX(run, g.gMin + cornerW, true) ?? wallYL) - rakeDepth;
    poly.push({ x: g.gMin + cornerW, y: innerYL });                   // inner rake L end
    poly.push({ x: g.gMin + cornerW, y: soffitYL });                  // wall return down
    poly.push({ x: footL.x, y: soffitYL });                           // level soffit OUT to the tip (closes as fascia L)
  } else {
    poly.push({ x: g.gMin, y: wallYL - rakeDepth });                  // valley: rake board dies at the wall corner
  }
  return poly;
}

// ── Cross-gable composite builder ───────────────────────────────────────────
// Builds an elevation for a roof with ridges on BOTH plan axes (reverse/cross
// gable). EQUAL-HEIGHT model (user-chosen): every ridge is drawn at one height
// H — the tallest ridge's section-frame height — so the look matches the West
// draft and stays consistent across all four faces.
//
// For THIS view it composites, front-to-back:
//   • the perpendicular (eave-side) ridge as a shingle FIELD (behind) — a
//     rectangle eave→H over the eave ridge's coverage;
//   • each facing (gable-end) ridge as a siding GABLE triangle (in front),
//     base = where that ridge's roof actually reaches the facing wall (valley-
//     bounded), apex tied to H. A gable whose facing end is a HIP (it ties into
//     another ridge, e.g. the E–W ridge seen from the East) raises NO gable.
//   • the gable rake triangle is NOTCHED out of the field so the two tile
//     without overlap (the renderer paints all hatches together — opaque
//     occlusion isn't possible, so we cut).
// Returns null if the view shows neither a gable nor a field.
function buildCrossGableElevation(
  project: Project,
  direction: ElevationDirection,
  basis: DirectionBasis,
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  stack: SectionStack,
  topology: RoofTopology,
  xMin: number,
  xMax: number,
  gradeY: number,
  gableSpan: number,
): ElevationScene | null {
  const s = getStructural(project);

  // ── Equal height: H = the tallest ridge's frame height ──────────────────
  // Each ridge's own (valley-bounded) half-span is min(spanLeft,spanRight);
  // the widest governs the main roof. All ridges are then drawn at that H.
  const minSpans = topology.ridges
    .map(r => Math.min(r.spanLeft, r.spanRight))
    .filter(v => Number.isFinite(v) && v > 0);
  const mainSpan = minSpans.length ? 2 * Math.max(...minSpans) : gableSpan;
  const frame = computeRoofFrame(project, stack, mainSpan) ?? computeRoofFrame(project, stack, gableSpan);
  if (!frame) return null;
  const OH = frame.overhang;
  const eaveY   = frame.eaveRoofEdgeY;   // roof edge at the eave (field bottom)
  const soffitY = frame.eaveSoffitY;     // fascia bottom / level soffit
  const H       = frame.ridgeTopY;       // equal ridge height for every ridge
  const topOfWallsY = stack.topOfWallsY;
  const pitchRR = topology.pitch / 12;

  const fMin = xMin - OH, fMax = xMax + OH;

  // The wall plane the viewer faces (max/min of the sight axis).
  const facingPlane = basis.axis === 'x'
    ? (basis.sign > 0 ? bbox.maxX : bbox.minX)
    : (basis.sign > 0 ? bbox.maxY : bbox.minY);

  // ── Eave-side FIELD coverage ────────────────────────────────────────────
  // Each ridge running ACROSS the view contributes a field spanning its own
  // projected length; union them, clamp to the building+overhang. A ridge END
  // that carries an explicit HIP rafter makes that side of the field a HIP: the
  // eave runs out to the corner while the ridge stops short, so the field edge
  // SLOPES from the ridge end down to the corner (instead of a vertical gable
  // cliff). The hip only counts in THIS view when the rafter's far corner sits
  // on the FACING wall — the corner is shared by two walls, so a hip to the NE
  // corner shows on North + East but NOT South/West (where that ridge end is a
  // gable). Keyed on the hip LINE, so interior hips (no rafter) stay as before.
  const HIP_TOL = 18;
  // A hip slopes the field in THIS view only when the rafter's far corner is on
  // the VIEWER'S side of the ridge it springs from (along the sight axis). The
  // corner is shared by two walls, so an NE-corner hip shows on North + East,
  // never South/West. Comparing to the ridge (not a single facing wall plane)
  // is robust for STEPPED footprints — a bump-out elsewhere doesn't move the
  // reference. Keyed on the hip LINE, so interior hips (no rafter) stay as is.
  const hipSlopes = (wp: Vec2, ridgeSight: number): boolean => {
    for (const h of topology.hips) {
      let corner: Vec2 | null = null;
      if (Math.hypot(h.a.x - wp.x, h.a.y - wp.y) <= HIP_TOL) corner = h.b;
      else if (Math.hypot(h.b.x - wp.x, h.b.y - wp.y) <= HIP_TOL) corner = h.a;
      if (!corner) continue;
      const cs = basis.axis === 'x' ? corner.x : corner.y;
      if (basis.sign > 0 ? cs > ridgeSight + 1 : cs < ridgeSight - 1) return true;
    }
    return false;
  };
  let eMin = Infinity, eMax = -Infinity;
  let hipAtMin = false, hipAtMax = false;
  for (const r of topology.ridges) {
    if (ridgeAxisOf(r) !== basis.rightAxis) continue;
    const pa = projectX(r.a, basis), pb = projectX(r.b, basis);
    const ridgeSight = basis.axis === 'x' ? r.a.x : r.a.y;   // ridge's constant sight coord
    const aHip = r.endA === 'hip' && hipSlopes(r.a, ridgeSight);
    const bHip = r.endB === 'hip' && hipSlopes(r.b, ridgeSight);
    for (const e of [{ x: pa, hip: aHip }, { x: pb, hip: bHip }]) {
      if (e.x < eMin) { eMin = e.x; hipAtMin = e.hip; }
      if (e.x > eMax) { eMax = e.x; hipAtMax = e.hip; }
    }
  }
  const hasField = eMin <= eMax;
  if (hasField) { eMin = Math.max(eMin, fMin); eMax = Math.min(eMax, fMax); }

  // ── FACING-axis hip end ─────────────────────────────────────────────────
  // A ridge whose FACING end is a hip (you look straight down its length)
  // shows its hip plane as a triangle that reads like a GABLE end — rake from
  // the ridge end down to the soffit corners — but shingled, no returns. It
  // EXTENDS this view's eave field out to the hip's OUTER corner; where the
  // hip plane meets the perpendicular field it leaves an internal hip-RIDGE
  // line (apex → the inner corner).
  const facingHipLines: Vec2[][] = [];
  if (hasField) for (const r of topology.ridges) {
    if (ridgeAxisOf(r) !== basis.axis) continue;
    const ca = basis.axis === 'x' ? r.a.x : r.a.y;
    const cb = basis.axis === 'x' ? r.b.x : r.b.y;
    const aFaces = basis.sign > 0 ? ca >= cb : ca <= cb;
    const facingEnd = aFaces ? r.a : r.b;
    if ((aFaces ? r.endA : r.endB) !== 'hip') continue;
    const corners: Vec2[] = [];
    for (const h of topology.hips) {
      if (Math.hypot(h.a.x - facingEnd.x, h.a.y - facingEnd.y) <= HIP_TOL) corners.push(h.b);
      else if (Math.hypot(h.b.x - facingEnd.x, h.b.y - facingEnd.y) <= HIP_TOL) corners.push(h.a);
    }
    if (!corners.length) continue;
    const apexX = projectX(facingEnd, basis);
    for (const c of corners) {
      const cx = projectX(c, basis);
      if (cx < eMin - 1) hipAtMin = true;        // hip rake extends the min side
      else if (cx > eMax + 1) hipAtMax = true;   // …or the max side
      // internal hip ridge + the short fascia joint where the west-facing
      // fascia board ends, as TWO separate 2-point segments (roofOutlines are
      // rendered CLOSED — a single 3-point polyline would close back to the
      // peak and draw a spurious diagonal; a 2-point line closes on itself).
      else {
        facingHipLines.push([{ x: apexX, y: H }, { x: cx, y: eaveY }]);   // hip ridge
        facingHipLines.push([{ x: cx, y: eaveY }, { x: cx, y: soffitY }]); // 6" fascia joint
      }
    }
  }

  // Where the eave runs past the ridge end (a hip), the field reaches the
  // building corner + overhang; otherwise it stops at the ridge projection.
  const leftBottomX  = hipAtMin ? fMin : eMin;
  const rightBottomX = hipAtMax ? fMax : eMax;

  // ── Facing GABLES ───────────────────────────────────────────────────────
  // A ridge running INTO the view raises a gable ONLY if the end nearest the
  // viewer is an actual gable end (not a hip that ties into another ridge).
  // Base = where that ridge's roof reaches the facing wall plane (sampled, so
  // valleys bound it); apex over the ridge's own drawing-X, tied to H.
  const sweepLo = basis.rightAxis === 'x' ? bbox.minX : bbox.minY;
  const sweepHi = basis.rightAxis === 'x' ? bbox.maxX : bbox.maxY;
  const worldAt = (sight: number, right: number): Vec2 =>
    basis.axis === 'x' ? { x: sight, y: right } : { x: right, y: sight };

  const endNearFacingIsGable = (r: RoofRidge): boolean => {
    // The endpoint with the larger (sign>0) / smaller (sign<0) sight-axis coord
    // is the one facing the viewer.
    const ca = basis.axis === 'x' ? r.a.x : r.a.y;
    const cb = basis.axis === 'x' ? r.b.x : r.b.y;
    const aFaces = basis.sign > 0 ? ca >= cb : ca <= cb;
    return (aFaces ? r.endA : r.endB) === 'gable';
  };

  const gables: CrossGable[] = [];
  for (const r of topology.ridges) {
    if (ridgeAxisOf(r) !== basis.axis) continue;
    if (!endNearFacingIsGable(r)) continue;   // hip end → no gable this view
    // Sample at THIS ridge's OWN facing-end plane, not the global bbox face. A
    // shorter wing's gable ends BEFORE the bbox face (e.g. an east bump-out that
    // stops short of a deeper SW bump-out); sampling at the bbox plane projects
    // every point beyond the ridge's gable end → perpDistanceToRidgeSegment
    // returns Infinity → the gable is wrongly dropped. The ridge runs along the
    // sight axis, so a plane just INSIDE its facing end keeps every perpendicular
    // foot on-segment. Where the gable's slope still clears the plate is the base.
    const ca = basis.axis === 'x' ? r.a.x : r.a.y;
    const cb = basis.axis === 'x' ? r.b.x : r.b.y;
    const aFaces = basis.sign > 0 ? ca >= cb : ca <= cb;
    const facingEndS = aFaces ? ca : cb;
    const interiorS  = aFaces ? cb : ca;
    const gablePlane = facingEndS + Math.sign(interiorS - facingEndS) * 3;
    let loW = Infinity, hiW = -Infinity;
    for (let w = sweepLo; w <= sweepHi; w += 2) {
      const d = perpDistanceToRidgeSegment(worldAt(gablePlane, w), r);
      if (!Number.isFinite(d)) continue;
      if (r.heightAboveWalls - d * pitchRR > 0) { if (w < loW) loW = w; if (w > hiW) hiW = w; }
    }
    if (loW > hiW) continue;
    // EVERY gable end gets the identical full boxed return + 1' overhang on
    // BOTH feet (user rule 2026-06-02 — "the same full return at both sides of
    // every and any gable end"). The inside foot is NOT special: it returns
    // just like the free end, and the main-roof field fascia RUNS OFF THE END
    // to meet that return's overhang tip (handled in the field-fascia band
    // below). We still snap each foot to the nearest footprint corner (`wall`)
    // so an INTERIOR wall step (bump-out junction) also gets a corner board.
    const FOOT_TOL = 16;
    const snapFoot = (worldRight: number): { x: number; wall: boolean } => {
      // Snap at THIS gable's own end plane (not the global bbox face) — a
      // shorter wing's interior-step corner sits at its own facing wall, far
      // from the bbox face, so the bbox plane never finds it (→ no corner board
      // at the step). Same fix as the base sweep above.
      const p = worldAt(gablePlane, worldRight);
      let best = Infinity, bestV: Vec2 | null = null;
      for (const v of (topology.wallOuter ?? [])) {
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d < best) { best = d; bestV = v; }
      }
      return bestV && best <= FOOT_TOL
        ? { x: projectX(bestV, basis), wall: true }
        : { x: projectX(p, basis), wall: false };
    };
    const fLo = snapFoot(loW), fHi = snapFoot(hiW);
    const loIsMin = fLo.x <= fHi.x;
    gables.push({
      peakX: projectX({ x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 }, basis),
      gMin: Math.min(fLo.x, fHi.x),
      gMax: Math.max(fLo.x, fHi.x),
      retL: true,   // both feet always get the identical boxed return + overhang
      retR: true,
      wallL: loIsMin ? fLo.wall : fHi.wall,
      wallR: loIsMin ? fHi.wall : fLo.wall,
    });
  }

  if (gables.length === 0 && !hasField) return null;

  // Outer rake silhouette of each gable (peak + feet, on the rake line).
  const runs = gables.map(g => gableRun(g, eaveY, H, OH));
  // Top of the rake at drawing-X (eave elsewhere). Siding stops here; field
  // starts here — the two share this line and the rake board covers the seam.
  const rakeTopAt = (px: number): number => {
    let h = eaveY;
    for (const run of runs) { const y = runYatX(run, px, true); if (y != null && y > h) h = y; }
    return h;
  };

  // ── Wall siding silhouette: full width, raised under each gable ─────────
  // Break at the rake TIPS (run feet) + peak, NOT the wall feet: rakeTopAt only
  // drops back to eaveY at the tip, so breaking at the foot leaves the siding
  // top floating as a diagonal above the eave fascia on the field side.
  const wxs = new Set<number>([xMin, xMax]);
  for (let i = 0; i < gables.length; i++)
    for (const x of [runs[i][0].x, gables[i].peakX, runs[i][2].x]) if (x > xMin && x < xMax) wxs.add(x);
  const wallTop = [...wxs].sort((a, b) => a - b).map(x => ({ x, y: rakeTopAt(x) }));
  const wallOutline: Vec2[] = [
    { x: xMin, y: gradeY }, ...wallTop, { x: xMax, y: gradeY },
  ];

  // ── Field polygon: ridge top, eave bottom, hip slopes at the ends ───────
  // Top edge spans the ridge projection [eMin,eMax] at H. Bottom edge spans
  // [leftBottomX,rightBottomX] at the eave — which reaches the building corner
  // on a HIP side, so the end edge slopes from the ridge end down to the
  // corner. Interior gable rakes still notch the bottom (rakeTopAt).
  let field: Vec2[] | undefined;
  if (hasField) {
    const notchXs = new Set<number>();
    for (let i = 0; i < gables.length; i++) for (const x of [runs[i][0].x, gables[i].peakX, runs[i][2].x]) {
      if (x > eMin && x < eMax) notchXs.add(x);
    }
    // Bottom corner Y follows rakeTopAt: eaveY at a hip foot / plain eave, but
    // it rises to the ridge where a facing gable notches the field there (so
    // the gable's siding triangle stays cut out of the shingle field).
    field = [{ x: eMin, y: H }, { x: eMax, y: H }, { x: rightBottomX, y: rakeTopAt(rightBottomX) }];
    for (const x of [...notchXs].sort((a, b) => b - a)) field.push({ x, y: rakeTopAt(x) });
    field.push({ x: leftBottomX, y: rakeTopAt(leftBottomX) });
  }

  // ── Trim: gable returns (locked recipe), field eave fascia, corner boards ─
  const eaveDepth = eaveY - soffitY;
  const gableTrim: Vec2[][] = gables.map((g, i) =>
    cgGableTrim(g, runs[i], eaveY, H, ROOF_TRIM_DEPTH, eaveDepth, CORNER_BOARD_W));
  // Field eave fascia: level white band (soffit→eave) on flank runs where no
  // gable rake is in front (the rake top sits at the eave). Break at each
  // gable's overhang TIP (the run feet, = foot ± overhang when it returns),
  // NOT at the wall foot — so the field fascia RUNS OFF THE END and meets the
  // gable return's fascia exactly at its tip (no vertical-cap jog at the foot).
  if (hasField) {
    // Span the hip feet (leftBottomX/rightBottomX), not just the ridge ends, so
    // the eave fascia RUNS STRAIGHT out under a hip slope to the corner.
    const tipXs = runs.flatMap(run => [run[0].x, run[2].x]).filter(x => x > leftBottomX && x < rightBottomX);
    const bxs = [leftBottomX, ...tipXs, rightBottomX].sort((a, b) => a - b);
    for (let i = 0; i < bxs.length - 1; i++) {
      const x0 = bxs[i], x1 = bxs[i + 1];
      if (x1 - x0 < 1) continue;
      if (rakeTopAt((x0 + x1) / 2) <= eaveY + 0.5) {
        gableTrim.push([
          { x: x0, y: eaveY }, { x: x1, y: eaveY }, { x: x1, y: soffitY }, { x: x0, y: soffitY },
        ]);
      }
    }
  }
  // Corner boards at INTERIOR wall-corner feet (a wall step / bump-out
  // junction — a footprint corner away from the building's outer edge). The
  // board sits on the GABLE side. Building-edge corners already get their boards
  // from the primitive builder; pure valleys (no footprint corner) get none.
  const EDGE_EPS = 10;
  // Top at the SOFFIT (underside of the gable return), NOT the eave roof edge —
  // the board tucks under the return's soffit; capping at eaveY pokes it 1
  // fascia-depth up through the return.
  const cornerBoard = (x0: number, x1: number): Vec2[] =>
    [{ x: x0, y: gradeY }, { x: x1, y: gradeY }, { x: x1, y: soffitY }, { x: x0, y: soffitY }];
  for (const g of gables) {
    if (g.wallL && g.gMin > xMin + EDGE_EPS && g.gMin < xMax - EDGE_EPS) {
      gableTrim.push(cornerBoard(g.gMin, g.gMin + CORNER_BOARD_W));
    }
    if (g.wallR && g.gMax > xMin + EDGE_EPS && g.gMax < xMax - EDGE_EPS) {
      gableTrim.push(cornerBoard(g.gMax - CORNER_BOARD_W, g.gMax));
    }
  }

  // Vertical trim at INTERIOR wall STEPS: a footprint edge seen EDGE-ON in this
  // view (the main-body↔bump-out jog runs along the sight line) projects to a
  // single drawing-X between the building's outer edges. The board belongs ONLY
  // at a real EXTERIOR-SHAPE jog — the edge-on wall must be flanked by two walls
  // that BOTH face the viewer (so the staggered facing walls actually step in
  // this view). Otherwise the edge-on wall sits entirely on the far side (e.g.
  // the bump-out's west wall in the North/East views) and is NOT a corner here.
  // Skip a step a gable foot already boarded (South gets it from the bump-out
  // gable; a hip view — West — has no gable there and needs this).
  const STEP_TOL = 8;
  const gableFeetXs = gables.flatMap(g => [g.gMin, g.gMax]);
  const stepXs: number[] = [];
  const outer = topology.wallOuter ?? [];
  const N = outer.length;
  for (let i = 0; i < N; i++) {
    const a = outer[i], b = outer[(i + 1) % N];
    const sight = basis.axis === 'x' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    const perp  = basis.axis === 'x' ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
    if (sight < 4 || perp > 4) continue;                         // must run EDGE-ON
    const px = projectX(a, basis);
    if (px <= xMin + EDGE_EPS || px >= xMax - EDGE_EPS) continue; // building edge, not a step
    // Both perimeter-adjacent walls must FACE the viewer — else it's not a step
    // in this view's silhouette (no exterior-shape change here).
    const prev = outer[(i - 1 + N) % N], next = outer[(i + 2) % N];
    if (!wallFacesViewer(prev, a, basis, outer) || !wallFacesViewer(b, next, basis, outer)) continue;
    if (gableFeetXs.some(gx => Math.abs(gx - px) <= STEP_TOL)) continue;
    if (stepXs.some(sx => Math.abs(sx - px) <= STEP_TOL)) continue;
    stepXs.push(px);
  }
  for (const px of stepXs) gableTrim.push(cornerBoard(px - CORNER_BOARD_W, px));

  // ── Multi-wing DEPTH REVEALS ────────────────────────────────────────────
  // Where a viewer-facing wall ENDS along the sight axis and a recessed wing
  // continues further (the near-face depth JUMPS), a conventional elevation
  // marks it: a vertical reveal trim at the wall end + the ending wing's roof
  // rake. Heights/silhouette stay flat (no true depth shown) — just reveal
  // LINES at the discontinuity. Tying the roof rake to a wall reveal keeps it
  // OCCLUSION-correct: a wing shows a rake only on the side where it actually
  // presents an end face to THIS viewer, so the same gable — occluded by a
  // nearer equal-height wing on the opposite view — draws nothing there.
  const sightOf = (p: Vec2) => (basis.axis === 'x' ? p.x : p.y);
  const perpOf  = (p: Vec2) => (basis.rightAxis === 'x' ? p.x : p.y);
  const nearer  = (s0: number, s1: number) => (basis.sign > 0 ? Math.max(s0, s1) : Math.min(s0, s1));
  // Near-face depth (extreme sight-coord of the footprint) at perp = t.
  const depthAt = (t: number): number | null => {
    let best = basis.sign > 0 ? -Infinity : Infinity, hit = false;
    for (let i = 0; i < N; i++) {
      const a = outer[i], b = outer[(i + 1) % N];
      const pa = perpOf(a), pb = perpOf(b);
      if ((pa - t) * (pb - t) > 1e-9 || Math.abs(pa - pb) < 1e-6) continue;   // no straddle / edge-on
      const s = sightOf(a) + (sightOf(b) - sightOf(a)) * (t - pa) / (pb - pa);
      best = nearer(best, s); hit = true;
    }
    return hit ? best : null;
  };
  const REVEAL_TOL = 24;                  // ≥2' depth jump = a real wing reveal
  const revealRoofEdges: Vec2[][] = [];
  const revealXs: number[] = [];
  let prevT = sweepLo, prevD = depthAt(sweepLo + 0.5);
  for (let t = sweepLo + 2; t <= sweepHi; t += 2) {
    const d = depthAt(t);
    if (d != null && prevD != null && Math.abs(d - prevD) > REVEAL_TOL) {
      // Measurement-exact: snap the reveal to the actual footprint vertex in the
      // sample gap (the wall end), NOT the ±step midpoint. The drawing silhouette
      // is wallOuter, so the reveal lands on the wall-outer corner.
      const mid = (prevT + t) / 2;
      const lo = Math.min(prevT, t) - 3, hi = Math.max(prevT, t) + 3;
      let revPerp = mid, bestd = Infinity;
      for (const v of outer) {
        const vp = perpOf(v);
        if (vp >= lo && vp <= hi && Math.abs(vp - mid) < bestd) { bestd = Math.abs(vp - mid); revPerp = vp; }
      }
      const px = revPerp * basis.rightSign;
      const dup = gableFeetXs.some(gx => Math.abs(gx - px) <= STEP_TOL)
               || stepXs.some(sx => Math.abs(sx - px) <= STEP_TOL)
               || revealXs.some(rx => Math.abs(rx - px) <= STEP_TOL);
      if (!dup && px > xMin + EDGE_EPS && px < xMax - EDGE_EPS) {
        revealXs.push(px);
        // The board caps the NEAR wall's end, extending into the near wing (the
        // side whose face is closer to the viewer) — so the wing reads as ending
        // here and the recessed wing begins beyond.
        const nearDrawX = (nearer(prevD, d) === prevD ? prevT : t) * basis.rightSign;
        gableTrim.push(nearDrawX > px ? cornerBoard(px, px + CORNER_BOARD_W)
                                      : cornerBoard(px - CORNER_BOARD_W, px));
        // Ending wing's roof rake: a field ridge with a GABLE end within an
        // overhang of the reveal. Rake (soffit→ridge) + eave return toward the
        // ridge body. Interior-only (a ridge end at the field extreme is the
        // building edge, already outlined).
        for (const r of topology.ridges) {
          if (ridgeAxisOf(r) !== basis.rightAxis) continue;
          for (const end of [r.endA === 'gable' ? r.a : null, r.endB === 'gable' ? r.b : null]) {
            if (!end || Math.abs(perpOf(end) - revPerp) > OH + 10) continue;
            const ex = projectX(end, basis);
            if (ex <= eMin + EDGE_EPS || ex >= eMax - EDGE_EPS) continue;
            const dir = Math.sign(projectX(end === r.a ? r.b : r.a, basis) - ex) || 1;
            revealRoofEdges.push([{ x: ex, y: soffitY }, { x: ex, y: H }]);              // rake
            revealRoofEdges.push([{ x: ex, y: soffitY }, { x: ex + dir * OH, y: soffitY }]); // eave return
          }
        }
      }
    }
    prevT = t; prevD = d;
  }

  // Roof outlines: the field boundary (stroked) + any internal hip-ridge lines
  // where a facing hip plane meets the perpendicular field + multi-wing depth
  // reveal rakes. The gable rakes are already outlined by their trim polygons.
  const roofOutlines: Vec2[][] = [...(field ? [field] : []), ...facingHipLines, ...revealRoofEdges];

  return {
    direction, xMin, xMax, gradeY,
    footingBottomY: stack.footingBottomY,
    topOfWallsY,
    ridgeY: H,
    roofProfile: gables.length ? runs[0] : (field ?? []),
    wallLeftX: xMin, wallRightX: xMax,
    openings: projectOpenings(project, basis, bbox),
    firstFloorY: 0,
    secondFloorY: stack.secondJoistBandTopY,
    wallOutline,
    gableTrim,
    roofHatch: field,
    roofOutlines,
    exteriorMaterial: s.exteriorMaterial,
    stack,
  };
}
