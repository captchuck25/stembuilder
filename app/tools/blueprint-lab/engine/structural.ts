// Helpers around project.structural — derivations, defaults, and the
// cross-section coordinate stack used by the Specs view and (eventually)
// the Cross-section tab.

import {
  DEFAULT_STRUCTURAL,
  FOUNDATION_WALL_HEIGHT_DEFAULT,
  LUMBER_ACTUAL_DEPTH,
  type FloorSpecs,
  type FoundationSpecs,
  type FoundationType,
  type Project,
  type StructuralSpecs,
} from './types';

// ── Read with defaults ────────────────────────────────────────────────────
// Older saves don't carry `structural`; merge in defaults so consumers never
// have to null-check.
export function getStructural(project: Project): StructuralSpecs {
  return project.structural ?? DEFAULT_STRUCTURAL;
}

// The second-floor structural spec to USE for the section/elevation stack.
// A building with ≥2 levels (added via the FloorPicker) is two stories even if
// the user never opened the Specs doc to add a "second floor" — so when the
// explicit spec is absent we derive one from the first floor. This keeps the
// roof sitting on top of the TOP story instead of the first-floor plate.
export function effectiveSecondFloor(project: Project): FloorSpecs | undefined {
  const s = getStructural(project);
  if (s.secondFloor) return s.secondFloor;
  if (project.levels.length >= 2) {
    return { joistDepth: s.firstFloor.joistDepth, plateHeight: s.firstFloor.plateHeight };
  }
  return undefined;
}

// ── Footing geometry ──────────────────────────────────────────────────────
// Footing is always 4" wider than the foundation wall on each side, unless
// the user has explicitly overridden it.
export function computeFootingWidth(f: FoundationSpecs): number {
  return f.footingWidthOverride ?? (f.wallThickness + 8);
}

// Keyway is a 4" wide × 1.5" deep groove centered on the top of the footing.
export const KEYWAY_WIDTH = 4;
export const KEYWAY_DEPTH = 1.5;

// ── Sheathing / decking / drywall constants ───────────────────────────────
// Thin material layers that wrap the structural members. Drawn as single
// parallel lines in the section preview, not as filled rectangles.
// Doubled 2×4 sill plate (two boards stacked, each 1.5" thick = 3" total).
// 2×4 actual width = 3.5"; the cross-section preview renders each board as
// an end-cut block (rectangle with X diagonals) stacked vertically.
export const SILL_PLATE_THICKNESS = 3;    // doubled 2×4 sill (2 × 1.5")
export const SILL_PLATE_BOARD_WIDTH = 3.5;// 2×4 actual width
export const SUBFLOOR_THICKNESS = 0.75;   // 3/4" plywood floor decking
export const ROOF_SHEATHING_THICKNESS = 0.625; // 5/8" plywood roof deck
export const SHEETROCK_THICKNESS = 0.5;   // 1/2" gypsum drywall
export const WALL_SHEATHING_THICKNESS = 0.5; // 1/2" exterior wall sheathing

// ── Floor band thickness ──────────────────────────────────────────────────
// A "floor band" sits between two floors and stacks: joist + subfloor decking.
// The deck is a true 3/4" subfloor (no separate finish-flooring allowance), so
// T/O FLOOR = top of subfloor — the standard framing datum.
export function getFloorBandThickness(spec: FloorSpecs): number {
  return LUMBER_ACTUAL_DEPTH[spec.joistDepth] + SUBFLOOR_THICKNESS;
}

// ── Per-foundation-type default wall heights ──────────────────────────────
export function defaultFoundationWallHeight(type: FoundationType): number {
  return FOUNDATION_WALL_HEIGHT_DEFAULT[type];
}

// ── Building width for the section preview ────────────────────────────────
// Returns the outside-to-outside width of the building along the section
// axis. Until the user can place an explicit section line in the 2D plan,
// we use the SHORTER bounding-box dimension of the active level's walls
// (rafters typically span the shorter dimension). With no floor plan yet,
// fall back to a 30 ft default so the preview still has something to draw.
export const DEFAULT_BUILDING_WIDTH = 360; // 30 ft

export function computeBuildingWidth(project: Project): number {
  const level = project.levels.find(l => l.id === project.activeLevelId);
  if (!level || level.walls.length < 2) return DEFAULT_BUILDING_WIDTH;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of level.walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  const shorter = Math.min(maxX - minX, maxY - minY);
  return shorter > 60 ? shorter : DEFAULT_BUILDING_WIDTH;
}

// ── Roof framing geometry (SINGLE SOURCE OF TRUTH) ─────────────────────────
// The cross-section draws actual rafters that sit on the top plate, so the
// roof edge / fascia / ridge live ABOVE the top-of-walls line by the rafter
// depth (less the birds-mouth seat drop). Elevations MUST consume these same
// numbers so the eave/fascia/ridge heights always match the section — change
// the pitch, overhang, rafter depth, plate height or building width and both
// the section and all four elevations move together.
//
// Constants mirror sectionPrimitives' framing model.
export const PLATE_WIDTH = 3.5;     // 2× stud / plate actual width (the seat depth)
export const RIDGE_BOARD_W = 1.5;   // ridge board thickness
export const FASCIA_DEPTH = 6;      // exposed fascia face height — the rafter tail is
                                    // level-cut on its underside so only this much of the
                                    // plumb cut shows (instead of the full rafter depth)

export interface RoofFrame {
  pitchRatio: number;
  overhang: number;
  rafterVertThick: number;  // vertical thickness of a rafter cut at the pitch
  eaveSoffitY: number;      // underside of rafter at the overhang tip (level soffit)
  eaveRoofEdgeY: number;    // top of rafter at the overhang tip (fascia top / roof edge)
  ridgeBottomY: number;     // underside of the ridge board
  ridgeTopY: number;        // top of rafter at the ridge (= section "T/O ROOF")
}

// Returns null for a flat / pitch-less roof.
// `spanOverride` = the span perpendicular to the ridge for THIS gable (the
// gable base width). Pass it for a gable end of a wing whose width differs
// from the whole-building width (e.g. the main gable of a cross-gable). When
// omitted, the whole-building width is used (correct for a simple gable).
export function computeRoofFrame(
  project: Project, stack: SectionStack, spanOverride?: number,
): RoofFrame | null {
  const pitchRatio = (project.roof?.pitch ?? 0) / 12;
  if (pitchRatio <= 0) return null;
  const overhang = Math.max(0, project.roof?.overhang || 0);
  const rafterNom = (project.roof?.rafterDepth ?? 10) as keyof typeof LUMBER_ACTUAL_DEPTH;
  const rafterActual = LUMBER_ACTUAL_DEPTH[rafterNom] ?? LUMBER_ACTUAL_DEPTH[10];
  const rafterVertThick = rafterActual / Math.max(Math.cos(Math.atan(pitchRatio)), 0.01);
  const halfRidge = RIDGE_BOARD_W / 2;
  const halfWidth = (spanOverride && spanOverride > 0 ? spanOverride : computeBuildingWidth(project)) / 2;
  const topOfWalls = stack.topOfWallsY;

  // Eave: natural rafter bottom drops below the plate by (seat + overhang)×pitch
  // as it runs out over the overhang; the rafter top is one rafter-thickness up.
  // The rafter tail is LEVEL-CUT on its underside so only FASCIA_DEPTH of the
  // plumb cut shows — the soffit/fascia bottom rides at (roof edge − fascia),
  // not the full rafter depth.
  const eaveNaturalBotY = topOfWalls - (PLATE_WIDTH + overhang) * pitchRatio;
  const eaveRoofEdgeY = eaveNaturalBotY + rafterVertThick;
  const eaveSoffitY   = eaveRoofEdgeY - FASCIA_DEPTH;
  // Ridge: extend the natural slope from the seat-inside edge to the ridge.
  const ridgeBottomY  = topOfWalls + (halfWidth - PLATE_WIDTH - halfRidge) * pitchRatio;
  const ridgeTopY     = ridgeBottomY + rafterVertThick;

  return { pitchRatio, overhang, rafterVertThick, eaveSoffitY, eaveRoofEdgeY, ridgeBottomY, ridgeTopY };
}

// ── Level elevation derivation ────────────────────────────────────────────
// In the 3D view, each Level renders at a Y position. Historically Level
// stored a hand-set `elevation`; now we derive it from structural specs so
// the building stacks correctly when joist depths or plate heights change.
//
// Convention: Floor 1 sits at Y=0 (top of subfloor). Floor 2 sits at
// `firstFloor.plateHeight + getFloorBandThickness(secondFloor)`. Etc.
export function computeLevelElevation(project: Project, levelIndex: number): number {
  if (levelIndex <= 0) return 0;
  const s = getStructural(project);
  let y = s.firstFloor.plateHeight;
  // For now we support up to a second floor in specs. Extra levels fall back
  // to stacking by repeated firstFloor plate heights — fine for V1.
  const secondFloor = effectiveSecondFloor(project);
  for (let i = 1; i <= levelIndex; i++) {
    const floor = i === 1 ? secondFloor : undefined;
    const band = floor ? getFloorBandThickness(floor) : getFloorBandThickness(s.firstFloor);
    y += band;
    if (i < levelIndex) {
      y += floor?.plateHeight ?? s.firstFloor.plateHeight;
    }
  }
  return y;
}

// ── Cross-section Y stack ─────────────────────────────────────────────────
// Returns the Y-coordinate (inches, with Y=0 at top of first-floor subfloor,
// positive UP) of every structural surface, useful for the Specs cross-section
// preview AND the future Cross-section tab.
//
// Negatives are below the first-floor subfloor (foundation + footing).
// Positives go up through the walls and (eventually) the roof.
export interface SectionStack {
  // Below the first-floor subfloor
  joistBandTopY: number;          // 0
  joistBandBottomY: number;       // -firstFloor band thickness
  // Sill plate sits between top of foundation wall and bottom of joist band.
  // Always defined (slab-on-grade also has a sill plate on top of its stem
  // wall, sitting at the floor finish level since there's no joist band).
  sillPlateTopY: number;
  sillPlateBottomY: number;
  foundationWallTopY: number;     // = sillPlateBottomY (or joistBandBottomY when no sill)
  foundationWallBottomY: number;  // -foundation.wallHeight below wall top
  footingTopY: number;            // = foundationWallBottomY (wall sits on footing)
  footingBottomY: number;         // -foundation.footingThickness below footing top
  slabTopY: number;               // for full-basement: footing top; for slab: =0
  slabBottomY: number;            // slabTop - slabThickness
  // Above the first-floor subfloor
  firstFloorPlateTopY: number;    // = plateHeight (top plate height)
  // Second floor (if present)
  secondJoistBandBottomY?: number;
  secondJoistBandTopY?: number;
  secondFloorPlateTopY?: number;
  // Top of the building above which the roof goes
  topOfWallsY: number;
}

export function buildSectionStack(project: Project): SectionStack {
  const s = getStructural(project);

  // Slab construction has NO floor joist band — the slab itself IS the first
  // floor and the wall framing sits directly on the sill plate. For all
  // other foundation types, the floor band thickness comes from the joist
  // depth + subfloor sandwich.
  const isSlab = s.foundation.type === 'slab';
  const firstBand = isSlab ? 0 : getFloorBandThickness(s.firstFloor);
  const joistBandTopY = 0;
  const joistBandBottomY = -firstBand;

  // Sill plate exists for ALL foundation types — including slab-on-grade,
  // where the stem wall is capped with a sill plate that the wall framing
  // bears on.
  const sillPlateTopY    = joistBandBottomY;
  const sillPlateBottomY = joistBandBottomY - SILL_PLATE_THICKNESS;

  const foundationWallTopY    = sillPlateBottomY;
  const foundationWallBottomY = foundationWallTopY - s.foundation.wallHeight;
  const footingTopY    = foundationWallBottomY;
  const footingBottomY = footingTopY - s.foundation.footingThickness;

  // Slab position depends on foundation type:
  //   • slab-on-grade: slab top is FLUSH with the top of the foundation wall
  //     (= sillPlateBottomY), poured between the two stem walls. Its bottom
  //     hangs `slabThickness` below.
  //   • full-basement: basement floor slab rests on top of the footing.
  //   • crawlspace: no slab (dirt floor); zero-thickness placeholder.
  let slabTopY: number;
  let slabBottomY: number;
  if (isSlab) {
    slabTopY = sillPlateBottomY;
    slabBottomY = slabTopY - s.foundation.slabThickness;
  } else {
    slabBottomY = footingTopY;
    slabTopY = footingTopY + s.foundation.slabThickness;
  }

  const firstFloorPlateTopY = s.firstFloor.plateHeight;
  let topOfWallsY = firstFloorPlateTopY;
  let secondJoistBandBottomY: number | undefined;
  let secondJoistBandTopY: number | undefined;
  let secondFloorPlateTopY: number | undefined;

  // Use the EFFECTIVE second floor so a building with ≥2 levels stacks the roof
  // on top of the second story even without explicit Specs-doc second-floor data.
  const secondFloor = effectiveSecondFloor(project);
  if (secondFloor) {
    const secondBand = getFloorBandThickness(secondFloor);
    secondJoistBandBottomY = firstFloorPlateTopY;
    secondJoistBandTopY = firstFloorPlateTopY + secondBand;
    secondFloorPlateTopY = secondJoistBandTopY + secondFloor.plateHeight;
    topOfWallsY = secondFloorPlateTopY;
  }

  return {
    joistBandTopY, joistBandBottomY,
    sillPlateTopY, sillPlateBottomY,
    foundationWallTopY, foundationWallBottomY,
    footingTopY, footingBottomY,
    slabTopY, slabBottomY,
    firstFloorPlateTopY,
    secondJoistBandBottomY, secondJoistBandTopY, secondFloorPlateTopY,
    topOfWallsY,
  };
}
