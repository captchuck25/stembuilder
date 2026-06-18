'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DimAnchor, Dimension, Door, DoorType, DoorTypeSettings, FurnitureItem, FurnitureKind,
  Level, LineColor, LineEntity, LineStyle, LineWeight, RoomLabel, SectionCut, Selection, TextLabel,
  Stair, StairShape, ToolId, Vec2, Wall, WallStatus, WallType,
  Window, WindowType, WindowTypeSettings,
  formatImperial, makeId,
} from '../engine/types';
import {
  HandleHit, StairCornerHit, WallEnd,
  dist, extractWallFace, hitDimension, hitDoor, hitFurniture, hitHandle, hitLine, hitRoomLabel, hitStair, hitText,
  hitSectionCut, hitStairCorner, hitWall, hitWallForOpening, hitWindow,
  lineFullyInsideBox, lineTouchesBox,
  normalizeBox, openingRect, pointInsideBox,
  polygonAreaSqFt,
  refineFirstAnchorToSecondsWall, resolveDimAnchor,
  rotatedRectFullyInsideBox, rotatedRectTouchesBox,
  segmentIntersection,
  quantizeInches, quantizeToBase,
  snapDimOffsetToParallel,
  snapOrtho, snapToDimAnchor, snapToGrid,
  snapToLineFeatures, snapToWallCorner, snapToWallEdge, snapToWallEndpoint, snapToWallMidpoint, stairHalfExtents,
  rectHandlePoints, nearestPoint,
  wallFullyInsideBox, wallPolygon, wallTouchesBox,
  LineSnapHit,
} from '../engine/geometry';
import {
  Viewport, drawBoundaryDraft, drawDimension, drawDoor, drawFurniture, drawHandles, drawLine, drawRoomLabel,
  drawScene, drawSectionCutSymbol, drawStair, drawStairCornerHandles, drawWallPreview, drawWindow,
  screenToWorld, worldToScreen, stairStepEdgePoints,
} from '../engine/renderer';
// Shared drafting math — the SAME extend/mirror used by the section, roof,
// elevation, and sandbox surfaces, so the tools behave identically here.
import { ExtendBoundary, extendEndpoint, filletEndpoint, infiniteLineIntersection, mirrorReflector } from '../engine/sectionEdit';
import { T } from '../engine/theme';

interface CanvasState {
  pan: Vec2;
  pxPerInch: number;
  width: number;
  height: number;
}

interface DrawingWall {
  start: Vec2;
  cursor: Vec2;
}

interface MouseDown {
  worldStart: Vec2;
  screenStart: Vec2;
  hitWallId: string | null;
  hitDoorId: string | null;
  hitWindowId: string | null;
  hitDimId: string | null;
  // For free-translate drag of furniture / stairs / labels / lines / walls in
  // the Select tool — set when the click hits one of these so the threshold
  // crossing can transition into a directDrag.
  hitDragKind: 'wall' | 'furniture' | 'stair' | 'roomLabel' | 'text' | 'line' | 'sectionCut' | null;
  hitDragId: string | null;
  shift: boolean;
}

interface OpeningDrag {
  kind: 'door' | 'window';
  openingId: string;
  startPositionAlong: number;
  startCursorU: number;
  wallId: string;
}

interface DragBox {
  start: Vec2; // world
  end: Vec2;   // world
  additive: boolean;
}

export interface Canvas2DProps {
  level: Level;
  // The floor directly below the active one (next-lower elevation), or null if
  // none. Rendered as a ghost underlay when "Show floor below" is on.
  floorBelow: Level | null;
  tool: ToolId;
  selections: Selection[];
  gridInches: number;
  gridVisible: boolean;
  snapToGridOn: boolean;
  orthoOn: boolean;
  defaultWallThickness: number;
  defaultWallHeight: number;
  defaultWallType: WallType;
  defaultWallStatus: WallStatus;
  offsetDistance: number;
  activeDoorType: DoorType;
  doorTypeSettings: Record<DoorType, DoorTypeSettings>;
  activeWindowType: WindowType;
  windowTypeSettings: Record<WindowType, WindowTypeSettings>;
  onAddWall: (w: Wall) => void;
  // Bulk wall add for the Mirror tool — reflected copies as ONE undoable edit,
  // no intersection auto-split.
  onAddWalls: (ws: Wall[]) => void;
  onUpdateWalls: (ids: string[], patch: Partial<Wall>) => void;
  onAddDoor: (d: Door) => void;
  onUpdateDoors: (ids: string[], patch: Partial<Door>) => void;
  onAddWindow: (w: Window) => void;
  onUpdateWindows: (ids: string[], patch: Partial<Window>) => void;
  dimensionOffset: number;
  roomLabelDefaultName: string;
  textDefaultText: string;
  stairDefaults: { width: number; length: number; direction: 'up' | 'down'; shape: StairShape };
  activeFurnitureKind: FurnitureKind;
  furnitureSettings: Record<FurnitureKind, { width: number; depth: number }>;
  onAddDimension: (d: Dimension) => void;
  onAddRoomLabel: (r: RoomLabel) => void;
  onAddText: (t: TextLabel) => void;
  onAddStair: (s: Stair) => void;
  onAddFurniture: (f: FurnitureItem) => void;
  onAddLine: (l: LineEntity) => void;
  // Bulk line add for the Mirror tool — reflected copies committed as ONE
  // undoable edit, with no intersection auto-split.
  onAddLines: (ls: LineEntity[]) => void;
  onUpdateStairs: (ids: string[], patch: Partial<Stair>) => void;
  onUpdateDimensions: (ids: string[], patch: Partial<Dimension>) => void;
  onUpdateRoomLabels: (ids: string[], patch: Partial<RoomLabel>) => void;
  onUpdateTexts: (ids: string[], patch: Partial<TextLabel>) => void;
  onUpdateFurniture: (ids: string[], patch: Partial<FurnitureItem>) => void;
  onUpdateLines: (ids: string[], patch: Partial<LineEntity>) => void;
  // Trim tool: click on any piece of a wall/line that's been cut by other
  // walls/lines and that piece is removed. Click point is needed so we know
  // WHICH piece between the cuts to remove.
  onTrimWall: (wallId: string, clickPoint: Vec2) => void;
  onTrimLine: (lineId: string, clickPoint: Vec2) => void;
  defaultLineStyle: LineStyle;
  defaultLineWeight: LineWeight;
  defaultLineColor: LineColor;
  onChangeTool: (t: ToolId) => void;
  onBeginLiveOp: () => void;
  onEndLiveOp: () => void;
  onCancelLiveOp: () => void;
  onSelectionsChange: (s: Selection[]) => void;
  onDeleteSelections: () => void;
  onCursorChange: (worldPos: Vec2 | null) => void;
  onZoomChange: (pxPerInch: number) => void;
  onOffsetDistanceChange: (inches: number) => void;
  // Section cuts (project-wide; render on every floor at the same plan
  // position). The Section tool places a new cut via onAddSectionCut.
  sectionCuts: SectionCut[];
  onAddSectionCut: (c: SectionCut) => void;
  onUpdateSectionCuts: (ids: string[], patch: Partial<SectionCut>) => void;
  // Auto-place the primary section (transverse across the main ridge, widest
  // clear bay). Computed in the parent (needs roof topology); the Section tool
  // hint surfaces it as a one-click action on the plan.
  onAutoPlaceSection?: () => void;
  // Room-boundary drafting. When `boundaryDraftRoomId` is non-null the canvas
  // enters polyline-input mode for that room: clicks add vertices, clicking
  // near the first vertex (or hitting Enter) commits the polygon as the
  // room's `boundary` and recomputes its squareFeet. Esc cancels.
  boundaryDraftRoomId: string | null;
  onCommitBoundary: (roomId: string, points: Vec2[]) => void;
  onCancelBoundaryDraft: () => void;
}

// True if a free-anchor point `p` rests on wall `w`'s body — within `tol`
// inches of its faces and between its ends. Used so a free dim endpoint the
// user placed on a wall travels with that wall when it's moved (otherwise the
// wall-anchored end follows and the free end stays, skewing the dim).
function pointOnWallBody(p: Vec2, w: Wall, tol: number): boolean {
  const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) return false;
  const ux = dx / L, uy = dy / L;
  const along = (p.x - w.start.x) * ux + (p.y - w.start.y) * uy;
  if (along < -tol || along > L + tol) return false;
  const perp = Math.abs((p.x - w.start.x) * -uy + (p.y - w.start.y) * ux);
  return perp <= w.thickness / 2 + tol;
}

// Parse "12", "12.5", "12'", "12'6", "12'6\""  → inches. Null if invalid.
function parseLengthInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const ftIn = t.match(/^(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)?\s*"?$/);
  if (ftIn) {
    const ft = parseFloat(ftIn[1]);
    const inch = ftIn[2] ? parseFloat(ftIn[2]) : 0;
    const total = ft * 12 + inch;
    return total > 0 ? total : null;
  }
  const num = t.match(/^(\d+(?:\.\d+)?)\s*"?$/);
  if (num) {
    const v = parseFloat(num[1]);
    return v > 0 ? v : null;
  }
  return null;
}

// Parse polar input: "12", "12'6", "12@45", "12'6 @ 45", "10<-30"
// Separator is @ or <. Angle is degrees, math convention (0° = east,
// 90° = north / up on screen). When only length is present, the angle
// is undefined and the caller falls back to cursor direction.
function parseLengthAngleInput(s: string): { length: number; angle?: number } | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^([^@<]+)[@<](.*)$/);
  if (m) {
    const length = parseLengthInput(m[1].trim());
    if (length == null) return null;
    const angleStr = m[2].trim().replace(/°/g, '').replace(/deg/i, '').trim();
    if (angleStr === '' || angleStr === '-') return { length }; // separator typed but angle not yet
    const angle = parseFloat(angleStr);
    if (isNaN(angle)) return null;
    return { length, angle };
  }
  const length = parseLengthInput(t);
  if (length == null) return null;
  return { length };
}

const DRAG_THRESHOLD_PX = 4;

// CAD-style "aperture" cursor used for the line tool — a hollow circle in
// the middle for snap targeting with four short crosshair lines around it.
// Drawn at 32×32 with the hotspot dead center. Encoded as a data URL so the
// browser can use it directly via the CSS `cursor` property.
const LINE_APERTURE_CURSOR = (() => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>` +
    `<circle cx='16' cy='16' r='7' fill='none' stroke='#1f2540' stroke-width='1.4'/>` +
    `<line x1='16' y1='1' x2='16' y2='7' stroke='#1f2540' stroke-width='1.4'/>` +
    `<line x1='16' y1='25' x2='16' y2='31' stroke='#1f2540' stroke-width='1.4'/>` +
    `<line x1='1' y1='16' x2='7' y2='16' stroke='#1f2540' stroke-width='1.4'/>` +
    `<line x1='25' y1='16' x2='31' y2='16' stroke='#1f2540' stroke-width='1.4'/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 16 16, crosshair`;
})();

// Picks the next unused section-cut name. Returns 'A' for the first cut, 'B'
// for the second, etc. Walks the alphabet to find an unused letter (gaps are
// reused, so deleting cut 'B' then adding a new one re-uses 'B').
function nextSectionCutName(existing: { name: string }[]): string {
  const used = new Set(existing.map(c => c.name));
  for (let i = 0; i < 26; i++) {
    const name = String.fromCharCode(65 + i);
    if (!used.has(name)) return name;
  }
  // 27th cut and beyond — A1, A2, … (uncommon for real plans).
  return `A${existing.length - 25}`;
}

export default function Canvas2D({
  level, floorBelow, tool, selections, gridInches, gridVisible, snapToGridOn, orthoOn,
  defaultWallThickness, defaultWallHeight, defaultWallType, defaultWallStatus,
  activeDoorType, doorTypeSettings,
  activeWindowType, windowTypeSettings,
  onAddWall, onAddWalls, onUpdateWalls, onAddDoor, onUpdateDoors,
  onAddWindow, onUpdateWindows,
  dimensionOffset, roomLabelDefaultName, textDefaultText, stairDefaults, activeFurnitureKind, furnitureSettings,
  defaultLineStyle, defaultLineWeight, defaultLineColor,
  onAddDimension, onAddRoomLabel, onAddText, onAddStair, onAddFurniture, onAddLine, onAddLines, onUpdateStairs,
  onUpdateDimensions, onUpdateRoomLabels, onUpdateTexts, onUpdateFurniture, onUpdateLines,
  onTrimWall, onTrimLine,
  onChangeTool,
  onBeginLiveOp, onEndLiveOp, onCancelLiveOp,
  onSelectionsChange, onDeleteSelections, onCursorChange, onZoomChange,
  onOffsetDistanceChange,
  sectionCuts, onAddSectionCut, onUpdateSectionCuts, onAutoPlaceSection,
  boundaryDraftRoomId, onCommitBoundary, onCancelBoundaryDraft,
}: Canvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [vp, setVp] = useState<CanvasState>({
    pan: { x: 0, y: 0 }, pxPerInch: 2, width: 800, height: 600,
  });
  const [drawing, setDrawing] = useState<DrawingWall | null>(null);
  const [typedLength, setTypedLength] = useState('');
  const [panning, setPanning] = useState<{ from: Vec2; pan0: Vec2 } | null>(null);
  const [hoverWorld, setHoverWorld] = useState<Vec2 | null>(null);
  const [mouseDown, setMouseDown] = useState<MouseDown | null>(null);
  const [dragBox, setDragBox] = useState<DragBox | null>(null);
  const [handleDrag, setHandleDrag] = useState<{ wallId: string; end: WallEnd } | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<HandleHit | null>(null);
  // Offset source — either a wall or a line. The preview adapts accordingly.
  type OffsetSource =
    | { kind: 'wall'; wall: Wall }
    | { kind: 'line'; line: LineEntity };
  const [offsetSource, setOffsetSource] = useState<OffsetSource | null>(null);
  const [doorDrag, setDoorDrag] = useState<OpeningDrag | null>(null);
  // Section cut click-drag draft. `start` is the press point, `cursor` is the
  // current pointer position in world inches. On mouse-up the drag is
  // committed to a SectionCut (auto-orthogonal: whichever axis has the larger
  // delta wins). Null when idle.
  const [sectionDraft, setSectionDraft] = useState<{ start: Vec2; cursor: Vec2 } | null>(null);
  // Drag a selected dimension perpendicular to its axis to change its offset
  // (and snap to a parallel existing dim for alignment).
  const [dimOffsetDrag, setDimOffsetDrag] = useState<{ dimId: string } | null>(null);
  // Show a ghost silhouette of the floor below for cross-floor alignment
  // (walls + staircase). Defaults on so it appears as soon as there's a floor
  // below; the toggle only shows when one exists.
  const [showFloorBelow, setShowFloorBelow] = useState(true);

  // Free 2D translate of furniture/stairs/labels/lines/walls in the Select
  // tool — click + drag past the threshold. Captures the originals so the
  // delta is from the click point, not incremental cursor moves.
  interface DirectDragOriginals {
    walls:        Map<string, { start: Vec2; end: Vec2 }>;
    furniture:    Map<string, Vec2>;
    stairs:       Map<string, Vec2>;
    roomLabels:   Map<string, Vec2>;
    texts:        Map<string, Vec2>;
    lines:        Map<string, { start: Vec2; end: Vec2 }>;
    // Free dim endpoints resting on a dragged wall — ride along per endpoint.
    dimensions:   Map<string, { start: Vec2; end: Vec2; moveStart: boolean; moveEnd: boolean }>;
    // Section cuts capture their three positional numbers (position is the
    // perpendicular coordinate; start/end bound the parallel axis). axis
    // doesn't change during a drag, so it isn't captured here.
    sectionCuts:  Map<string, { position: number; start: number; end: number; axis: 'x' | 'y' }>;
  }
  const [directDrag, setDirectDrag] = useState<{ worldStart: Vec2; originals: DirectDragOriginals } | null>(null);

  // Mirror tool: y = vertical axis (flip L/R), x = horizontal (flip top/bottom).
  // Same convention as the section / roof / elevation / sandbox mirror.
  const [mirrorAxis, setMirrorAxis] = useState<'x' | 'y'>('y');
  // Fillet tool: the first picked wall/line (and the point clicked on it). The
  // second click joins them into a corner. Cleared after the join or on Esc.
  const [filletFirst, setFilletFirst] = useState<{ kind: 'wall' | 'line'; id: string; pick: Vec2 } | null>(null);

  // Endpoints (centerline for walls) of the wall/line with this id, or null.
  const filletEnds = useCallback((kind: 'wall' | 'line', id: string): { a: Vec2; b: Vec2 } | null => {
    if (kind === 'wall') {
      const w = level.walls.find(x => x.id === id);
      return w ? { a: w.start, b: w.end } : null;
    }
    const l = (level.lines ?? []).find(x => x.id === id);
    return l ? { a: l.start, b: l.end } : null;
  }, [level.walls, level.lines]);

  // Compute how the WALL or LINE under the cursor would EXTEND — its nearer end
  // grown to the closest boundary. Shared math with the other drafting surfaces
  // (sectionEdit.extendEndpoint). Walls take priority over lines for the hit
  // (same as Trim). Boundaries: for a line, every OTHER line + every wall face;
  // for a wall, every OTHER wall centerline + every line (so a wall extends to
  // meet another wall's run). Returns the target kind/id, the moved end
  // ('a' = start, 'b' = end), the from point, and the landing point.
  const computeExtendAt = useCallback((world: Vec2, tol: number): {
    kind: 'wall' | 'line'; id: string; end: 'a' | 'b'; from: Vec2; point: Vec2;
  } | null => {
    const wallHit = hitWall(level.walls, world, tol);
    if (wallHit) {
      const boundaries: ExtendBoundary[] = [];
      for (const other of level.walls) {
        if (other.id === wallHit.id) continue;
        boundaries.push({ c: other.start, d: other.end, infinite: false });
      }
      for (const ln of level.lines ?? []) boundaries.push({ c: ln.start, d: ln.end, infinite: false });
      const res = extendEndpoint(wallHit.start, wallHit.end, boundaries, world);
      if (!res) return null;
      return { kind: 'wall', id: wallHit.id, end: res.end, from: res.end === 'b' ? wallHit.end : wallHit.start, point: res.point };
    }
    const lineId = hitLine(level.lines ?? [], world, tol);
    if (!lineId) return null;
    const line = (level.lines ?? []).find(l => l.id === lineId);
    if (!line) return null;
    const boundaries: ExtendBoundary[] = [];
    for (const other of level.lines ?? []) {
      if (other.id === line.id) continue;
      boundaries.push({ c: other.start, d: other.end, infinite: false });
    }
    for (const w of level.walls) {
      const poly = wallPolygon(w);
      for (let i = 0; i < poly.length; i++) boundaries.push({ c: poly[i], d: poly[(i + 1) % poly.length], infinite: false });
    }
    const res = extendEndpoint(line.start, line.end, boundaries, world);
    if (!res) return null;
    return { kind: 'line', id: line.id, end: res.end, from: res.end === 'b' ? line.end : line.start, point: res.point };
  }, [level.lines, level.walls]);

  // Extend tool hover ghost — derived from the cursor (same pattern as
  // trimHover). Shows where the hovered wall/line's end would land.
  const extendHover = useMemo(() => {
    if (tool !== 'extend' || !hoverWorld) return null;
    const r = computeExtendAt(hoverWorld, 10 / vp.pxPerInch);
    return r ? { from: r.from, to: r.point } : null;
  }, [tool, hoverWorld, vp.pxPerInch, computeExtendAt]);

  // Cross-floor stair move warning: shown at most ONCE per session. Returns
  // true if the move may proceed (already warned, the stair isn't linked, or
  // the user confirmed); false if the user cancelled.
  const linkedStairWarnedRef = useRef(false);
  const confirmStairLink = (stairId: string | undefined): boolean => {
    if (!stairId) return true;
    const s = level.stairs.find(x => x.id === stairId);
    if (!s?.linkGroup || linkedStairWarnedRef.current) return true;
    const ok = window.confirm(
      'This staircase is linked across floors. Moving it also moves the matching flight on the other floor so they stay aligned. (You won’t be asked again this session.)',
    );
    if (ok) linkedStairWarnedRef.current = true;
    return ok;
  };

  // Trim tool: hover preview (which entity will be cut) for the user to see
  // what their click will hit. Single-click splits at every crossing.
  const trimHover = useMemo(() => {
    if (tool !== 'trim' || !hoverWorld) return null;
    const tol = 10 / vp.pxPerInch;
    const wallHit = hitWall(level.walls, hoverWorld, tol);
    if (wallHit) return { kind: 'wall' as const, id: wallHit.id };
    const lineId = hitLine(level.lines ?? [], hoverWorld, tol);
    if (lineId) return { kind: 'line' as const, id: lineId };
    return null;
  }, [tool, hoverWorld, level.walls, level.lines, vp.pxPerInch]);
  // Dimension drafting: 3-click placement (start, end, offset). Anchors hold
  // a reference to the snap target so the dim follows when that target moves.
  const [dimDraft, setDimDraft] = useState<{ start: DimAnchor | null; end: DimAnchor | null }>({ start: null, end: null });
  // Stair-corner drag: the user grabs a corner of a selected stair and the
  // entire stair translates so the corner follows the cursor.
  const [stairCornerDrag, setStairCornerDrag] = useState<StairCornerHit | null>(null);
  const [hoveredStairCorner, setHoveredStairCorner] = useState<StairCornerHit | null>(null);

  // Move command state. Walls track per-endpoint move flags so that
  // non-selected walls connected to a moved wall STRETCH instead of
  // disconnecting: only the endpoint that matches the moved wall translates.
  // `stretch` marks a connected wall that follows the move on its shared
  // endpoint only: it keeps its orientation (the far endpoint shifts by the
  // perpendicular component of the move) so it slides/extends without skewing
  // into a diagonal. Selected walls translate rigidly (stretch=false).
  interface WallMoveSpec { start: Vec2; end: Vec2; moveStart: boolean; moveEnd: boolean; stretch: boolean }
  // Openings (doors/windows) slide ALONG their host wall — the cursor delta is
  // projected onto the wall's unit vector and added to the original
  // positionAlong, clamped so the opening stays on the wall.
  interface OpeningMoveSpec {
    wallId: string;
    positionAlong: number; // original
    ux: number; uy: number;
    wallLen: number;
    clearance: number;     // min/max positionAlong distance from the wall's ends
  }
  interface MoveOriginals {
    walls:      Map<string, WallMoveSpec>;
    doors:      Map<string, OpeningMoveSpec>;
    windows:    Map<string, OpeningMoveSpec>;
    // moveStart/moveEnd flag which free endpoint should travel with the move:
    // a SELECTED dim moves both; a dim merely resting a free endpoint on a
    // moving wall moves only that endpoint.
    dimensions: Map<string, { start: Vec2; end: Vec2; moveStart: boolean; moveEnd: boolean }>;
    labels:     Map<string, Vec2>;
    stairs:     Map<string, Vec2>;
    furniture:  Map<string, Vec2>;
    lines:      Map<string, { start: Vec2; end: Vec2 }>;
  }
  const [moveState, setMoveState] = useState<{ basePoint: Vec2; originals: MoveOriginals } | null>(null);

  // Room-boundary polyline draft. Vertices are world inches; cleared whenever
  // `boundaryDraftRoomId` goes null (commit or cancel from outside).
  const [boundaryPoints, setBoundaryPoints] = useState<Vec2[]>([]);
  const [prevBoundaryRoomId, setPrevBoundaryRoomId] = useState<string | null>(null);
  if (prevBoundaryRoomId !== boundaryDraftRoomId) {
    setPrevBoundaryRoomId(boundaryDraftRoomId);
    setBoundaryPoints([]);
  }

  // Boundary-measure snap. A room is measured along wall faces and into its
  // corners, so the cursor must lock STRONGLY to those: corners/endpoints,
  // then face midpoints, then on-edge perpendicular projection — on both the
  // visible wall outline and annotation lines. Generous tolerance (≥6 in, or
  // ~26 screen px) so an imprecise mouse still lands exactly on the corner or
  // edge. When nothing is within reach we're measuring across open space, so
  // the segment is locked horizontal/vertical relative to the previous vertex
  // (intentional clicks onto a corner override this, since the feature snap
  // wins first).
  // Other rooms' already-measured boundaries on this level (excluding the one
  // being drafted). Their corners/edges/midpoints become snap targets so two
  // adjacent rooms with no dividing wall can be aligned exactly.
  const otherRoomBoundaries = useMemo<Vec2[][]>(() => {
    if (!boundaryDraftRoomId) return [];
    return level.roomLabels
      .filter(r => r.id !== boundaryDraftRoomId && r.boundary && r.boundary.length >= 2)
      .map(r => r.boundary as Vec2[]);
  }, [boundaryDraftRoomId, level.roomLabels]);

  const snapBoundaryPoint = useCallback((world: Vec2): Vec2 => {
    const hit = snapToLineFeatures(level.lines ?? [], world, Math.max(26 / vp.pxPerInch, 6), level.walls, otherRoomBoundaries);
    if (hit) return hit.point;
    const prev = boundaryPoints[boundaryPoints.length - 1];
    if (prev) return snapOrtho(prev, world);
    return snapToGridOn ? snapToGrid(world, gridInches) : world;
  }, [level.lines, level.walls, otherRoomBoundaries, boundaryPoints, vp.pxPerInch, snapToGridOn, gridInches]);

  // The discrete snap target under the cursor (corner / midpoint), if any —
  // drives the CAD-style snap marker so the user can see the lock.
  const boundarySnapHit: LineSnapHit | null = useMemo(() => {
    if (!boundaryDraftRoomId || !hoverWorld) return null;
    return snapToLineFeatures(level.lines ?? [], hoverWorld, Math.max(26 / vp.pxPerInch, 6), level.walls, otherRoomBoundaries);
  }, [boundaryDraftRoomId, hoverWorld, level.lines, level.walls, otherRoomBoundaries, vp.pxPerInch]);

  // Where the next vertex would land — used for both the live preview line and
  // the close-on-start detection so all three (preview, marker, commit) agree.
  const boundaryPreviewPoint = useMemo(() => {
    if (!boundaryDraftRoomId || !hoverWorld) return hoverWorld;
    return snapBoundaryPoint(hoverWorld);
  }, [boundaryDraftRoomId, hoverWorld, snapBoundaryPoint]);

  // Pixel distance from the snapped preview point to the start vertex — when
  // < CLOSE_SNAP_PX the next click commits (and the start vertex visually pulses).
  const CLOSE_SNAP_PX = 14;
  const boundaryCloseHover = useMemo(() => {
    if (!boundaryDraftRoomId || boundaryPoints.length < 3 || !boundaryPreviewPoint) return false;
    const dxIn = boundaryPreviewPoint.x - boundaryPoints[0].x;
    const dyIn = boundaryPreviewPoint.y - boundaryPoints[0].y;
    const distPx = Math.hypot(dxIn, dyIn) * vp.pxPerInch;
    return distPx <= CLOSE_SNAP_PX;
  }, [boundaryDraftRoomId, boundaryPoints, boundaryPreviewPoint, vp.pxPerInch]);

  // Clear transient per-tool state when switching tools.
  // (Set-state-during-render guard pattern — React's recommended way to reset
  // state when a prop changes.)
  const [prevTool, setPrevTool] = useState(tool);
  if (prevTool !== tool) {
    setPrevTool(tool);
    setDrawing(null);
    setTypedLength('');
    setOffsetSource(null);
    setDragBox(null);
    setMouseDown(null);
    setHandleDrag(null);
    setHoveredHandle(null);
    setDoorDrag(null);
    setDimOffsetDrag(null);
    setDirectDrag(null);
    setDimDraft({ start: null, end: null });
    setStairCornerDrag(null);
    setHoveredStairCorner(null);
    setMoveState(null);
    setFilletFirst(null);
  }

  // Driving dimensions (type a value to move the selected element so the
  // dimension reads that value) are edited in the Properties panel when an
  // element and a dimension are co-selected — see driveDimension() in
  // geometry.ts and DrivingDimensionEditor in PropertiesPanel.tsx.


  // Door tool ghost preview: snap cursor to the nearest wall (if within
  // tolerance) and synthesize a placeholder Door object to render.
  const doorGhost: { door: Door; wall: Wall; atCenter: boolean } | null = useMemo(() => {
    if (tool !== 'door' || !hoverWorld) return null;
    const hit = hitWallForOpening(level.walls, hoverWorld, 18 / vp.pxPerInch);
    if (!hit) return null;
    const s = doorTypeSettings[activeDoorType];
    // Clamp so the full opening (door + sidelites) fits inside the wall.
    let clearance = s.width / 2;
    if (activeDoorType === 'entry' && s.sidePanels && s.sidePanels !== 'none') {
      const sw = s.sidePanelWidth ?? 14;
      const left = (s.sidePanels === 'left' || s.sidePanels === 'both') ? sw : 0;
      const right = (s.sidePanels === 'right' || s.sidePanels === 'both') ? sw : 0;
      clearance = Math.max(s.width / 2 + left, s.width / 2 + right);
    }
    const wallLen = Math.hypot(hit.wall.end.x - hit.wall.start.x, hit.wall.end.y - hit.wall.start.y);
    // Snap to the wall's center when the cursor is near it, so an opening
    // drops dead-center on a click in the middle of the wall.
    let raw = hit.t;
    const mid = wallLen / 2;
    const atCenter = Math.abs(raw - mid) < 12 / vp.pxPerInch;
    if (atCenter) raw = mid;
    else raw = quantizeInches(raw); // off-center placement lands on the 1/8" base
    const t = Math.max(clearance, Math.min(wallLen - clearance, raw));
    const ghost: Door = {
      kind: 'door',
      id: '__ghost__',
      levelId: hit.wall.levelId,
      wallId: hit.wall.id,
      positionAlong: t,
      width: s.width,
      height: s.height,
      doorType: activeDoorType,
      hingeSide: 'start',
      flipped: false,
      openAngle: 90,
      ...(s.panels         != null ? { panels: s.panels } : {}),
      ...(s.sidePanels     != null ? { sidePanels: s.sidePanels } : {}),
      ...(s.sidePanelWidth != null ? { sidePanelWidth: s.sidePanelWidth } : {}),
      ...(s.slideStyle     != null ? { slideStyle: s.slideStyle } : {}),
    };
    return { door: ghost, wall: hit.wall, atCenter };
  }, [tool, hoverWorld, level.walls, vp.pxPerInch, activeDoorType, doorTypeSettings]);

  // Window tool ghost preview (mirrors doorGhost).
  const windowGhost: { window: Window; wall: Wall; atCenter: boolean } | null = useMemo(() => {
    if (tool !== 'window' || !hoverWorld) return null;
    const hit = hitWallForOpening(level.walls, hoverWorld, 18 / vp.pxPerInch);
    if (!hit) return null;
    const s = windowTypeSettings[activeWindowType];
    const wallLen = Math.hypot(hit.wall.end.x - hit.wall.start.x, hit.wall.end.y - hit.wall.start.y);
    // Snap to the wall's center when the cursor is near it (see doorGhost).
    let raw = hit.t;
    const mid = wallLen / 2;
    const atCenter = Math.abs(raw - mid) < 12 / vp.pxPerInch;
    if (atCenter) raw = mid;
    else raw = quantizeInches(raw); // off-center placement lands on the 1/8" base
    const t = Math.max(s.width / 2, Math.min(wallLen - s.width / 2, raw));
    const ghost: Window = {
      kind: 'window',
      id: '__ghost__',
      levelId: hit.wall.levelId,
      wallId: hit.wall.id,
      positionAlong: t,
      width: s.width,
      height: s.height,
      headHeight: s.headHeight,
      windowType: activeWindowType,
      hingeSide: 'start',
      flipped: false,
      ...(s.panels         != null ? { panels: s.panels } : {}),
      ...(s.bayProjection  != null ? { bayProjection: s.bayProjection } : {}),
    };
    return { window: ghost, wall: hit.wall, atCenter };
  }, [tool, hoverWorld, level.walls, vp.pxPerInch, activeWindowType, windowTypeSettings]);

  // Compute the preview offset (wall or line, depending on source) given a
  // hovered point.
  type OffsetPreview =
    | { kind: 'wall'; start: Vec2; end: Vec2; thickness: number; height: number; type: WallType; side: 1|-1; distance: number; snapped: boolean; snapPoint: Vec2 | null }
    | { kind: 'line'; start: Vec2; end: Vec2; style: LineStyle; weight: LineWeight; color: LineColor; side: 1|-1; distance: number; snapped: boolean; snapPoint: Vec2 | null };
  const offsetPreview: OffsetPreview | null = useMemo(() => {
    if (tool !== 'offset' || !offsetSource || !hoverWorld) return null;
    const src = offsetSource.kind === 'wall' ? offsetSource.wall : offsetSource.line;
    const dx = src.end.x - src.start.x, dy = src.end.y - src.start.y;
    const L = Math.hypot(dx, dy);
    if (L === 0) return null;
    const nx = -dy / L, ny = dx / L;
    const thickness = offsetSource.kind === 'wall' ? offsetSource.wall.thickness : 0;

    // `centerShift` is how far to move the centerline (always positive). Two
    // modes: a typed value pins the edge-to-edge distance; otherwise the new
    // wall free-drags to the cursor — and the cursor snaps onto nearby walls'
    // endpoints/midpoints so the wall can be placed exactly at those points.
    const typed = parseLengthInput(typedLength);
    let centerShift: number;
    let side: 1 | -1;
    let snapped = false;
    let snapPoint: Vec2 | null = null;
    if (typed != null) {
      const cross = (hoverWorld.x - src.start.x) * nx + (hoverWorld.y - src.start.y) * ny;
      side = cross >= 0 ? 1 : -1;
      centerShift = typed + thickness; // typed is edge-to-edge (faces D apart)
    } else {
      // Snap the cursor to a nearby wall endpoint/midpoint (excluding the source).
      const otherWalls = level.walls.filter(w => !(offsetSource.kind === 'wall' && w.id === offsetSource.wall.id));
      const snapTol = 12 / vp.pxPerInch;
      let target = hoverWorld;
      const ep = snapToWallEndpoint(hoverWorld, otherWalls, snapTol);
      if (ep !== hoverWorld) target = ep;
      else {
        const mid = snapToWallMidpoint(hoverWorld, otherWalls, snapTol);
        if (mid !== hoverWorld) target = mid;
      }
      const cross = (target.x - src.start.x) * nx + (target.y - src.start.y) * ny;
      side = cross >= 0 ? 1 : -1;
      const raw = Math.abs(cross);
      if (target !== hoverWorld) { centerShift = raw; snapped = true; snapPoint = target; }
      else centerShift = snapToGridOn ? Math.round(raw / gridInches) * gridInches : quantizeInches(raw);
    }
    const D = Math.max(0, centerShift - thickness); // edge-to-edge for display
    const shiftX = side * centerShift * nx, shiftY = side * centerShift * ny;
    const start = { x: src.start.x + shiftX, y: src.start.y + shiftY };
    const end   = { x: src.end.x   + shiftX, y: src.end.y   + shiftY };
    if (offsetSource.kind === 'wall') {
      const w = offsetSource.wall;
      return { kind: 'wall', start, end, thickness: w.thickness, height: w.height, type: w.type, side, distance: D, snapped, snapPoint };
    } else {
      const l = offsetSource.line;
      return { kind: 'line', start, end, style: l.style, weight: l.weight, color: l.color ?? 'black', side, distance: centerShift, snapped, snapPoint };
    }
  }, [tool, offsetSource, hoverWorld, typedLength, level.walls, vp.pxPerInch, snapToGridOn, gridInches]);

  // Commit the current offset preview (used by both the mouse click and Enter).
  // Recreated when the preview changes; the keydown effect lists it as a dep so
  // the Enter handler always commits the latest preview.
  const commitOffset = useCallback(() => {
    if (!offsetSource || !offsetPreview) return;
    if (offsetPreview.kind === 'wall' && offsetSource.kind === 'wall') {
      onAddWall({
        id: makeId('wall'), levelId: offsetSource.wall.levelId,
        start: offsetPreview.start, end: offsetPreview.end,
        thickness: offsetPreview.thickness, height: offsetPreview.height, type: offsetPreview.type,
        // Inherit status from the source — typical renovation workflow.
        status: offsetSource.wall.status ?? 'proposed',
      });
    } else if (offsetPreview.kind === 'line' && offsetSource.kind === 'line') {
      onAddLine({
        id: makeId('line'), levelId: offsetSource.line.levelId,
        start: offsetPreview.start, end: offsetPreview.end,
        style: offsetPreview.style, weight: offsetPreview.weight, color: offsetPreview.color,
      });
    } else {
      return;
    }
    onOffsetDistanceChange(offsetPreview.distance);
    setOffsetSource(null);
    setTypedLength('');
  }, [offsetSource, offsetPreview, onAddWall, onAddLine, onOffsetDistanceChange]);

  // Wall IDs currently selected — used for handle hit-testing.
  const selectedWallIds = useMemo(
    () => new Set(selections.filter(s => s.kind === 'wall').map(s => s.id)),
    [selections],
  );
  const selectedStairIds = useMemo(
    () => new Set(selections.filter(s => s.kind === 'stair').map(s => s.id)),
    [selections],
  );
  const selectedStairs = useMemo(
    () => level.stairs.filter(s => selectedStairIds.has(s.id)),
    [level.stairs, selectedStairIds],
  );
  const selectedFurniture = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'furniture').map(s => s.id));
    return level.furniture.filter(f => ids.has(f.id));
  }, [level.furniture, selections]);

  // ─── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setVp(s => ({ ...s, width: r.width, height: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Snap pipeline (wall drawing) ─────────────────────────────────────────
  // Returns the snapped point plus whether it locked onto a real feature (vs a
  // grid/base fallback) — the caller draws a marker only on feature locks.
  const snapWithInfo = useCallback((p: Vec2, drawingStart?: Vec2): { point: Vec2; feature: boolean } => {
    let q = p;
    if (orthoOn && drawingStart) q = snapOrtho(drawingStart, q);
    // Line tool: snap to the VISIBLE wall outline (polygon corners + face
    // midpoints + mitered junction corners) rather than the wall centerline.
    if (tool === 'line') {
      const lineHit = snapToLineFeatures(level.lines ?? [], q, 18 / vp.pxPerInch, level.walls);
      if (lineHit) return { point: lineHit.point, feature: true };
      return { point: snapToGridOn ? snapToGrid(q, gridInches) : quantizeToBase(q), feature: false };
    }
    const TOL = 9 / vp.pxPerInch;
    // Current floor first.
    let s = snapToWallEndpoint(q, level.walls, TOL);
    if (s !== q) return { point: s, feature: true };
    s = snapToWallMidpoint(q, level.walls, TOL);
    if (s !== q) return { point: s, feature: true };
    // Staircase OUTSIDE edges — a snap point on each long edge at every step
    // (tread line) plus the corners, so a wall can be traced down the side of a
    // stair and stop flush at any individual step (and stay straight via ortho).
    // The points are pushed OUTWARD by half the wall thickness, so the wall's
    // centerline lands outside and its inside face sits flush on the stair edge
    // (wall fully outside the stair, not straddling the edge).
    const stairPts = level.stairs.flatMap(st => stairStepEdgePoints(st, defaultWallThickness / 2));
    const sp = nearestPoint(q, stairPts, TOL);
    if (sp) return { point: sp, feature: true };
    // Then the floor-below ghost (when shown) so walls stack on the floor below.
    if (showFloorBelow && floorBelow) {
      s = snapToWallEndpoint(q, floorBelow.walls, TOL);
      if (s !== q) return { point: s, feature: true };
      s = snapToWallMidpoint(q, floorBelow.walls, TOL);
      if (s !== q) return { point: s, feature: true };
    }
    return { point: snapToGridOn ? snapToGrid(q, gridInches) : quantizeToBase(q), feature: false };
  }, [orthoOn, snapToGridOn, gridInches, level.walls, level.lines, level.stairs, vp.pxPerInch, tool, showFloorBelow, floorBelow, defaultWallThickness]);

  const snap = useCallback((p: Vec2, drawingStart?: Vec2): Vec2 => snapWithInfo(p, drawingStart).point, [snapWithInfo]);

  // Move tool DROP snap: where the grabbed handle lands. Priority — discrete
  // points first (wall outline corners + face midpoints + line endpoints/
  // midpoints), then wall centerline endpoint/midpoint, then SLIDE along a wall
  // face/edge, else free. `feature` is true when it locked onto real geometry.
  const moveDropSnap = useCallback((p: Vec2): { point: Vec2; feature: boolean } => {
    const tol = 9 / vp.pxPerInch;
    const lf = snapToLineFeatures(level.lines ?? [], p, tol, level.walls);
    if (lf) return { point: lf.point, feature: true };
    let s = snapToWallEndpoint(p, level.walls, tol);
    if (s !== p) return { point: s, feature: true };
    s = snapToWallMidpoint(p, level.walls, tol);
    if (s !== p) return { point: s, feature: true };
    s = snapToWallEdge(p, level.walls, tol);
    if (s !== p) return { point: s, feature: true };
    return { point: p, feature: false };
  }, [level.lines, level.walls, vp.pxPerInch]);

  // The selected stair/furniture "grab handles" (own corners + edge midpoints)
  // the Move tool picks the piece up by.
  const moveGrabHandles = useCallback((): Vec2[] => [
    ...selectedStairs.flatMap(s => { const { hx, hy } = stairHalfExtents(s); return rectHandlePoints(s.position, hx, hy, s.rotation); }),
    ...selectedFurniture.flatMap(f => rectHandlePoints(f.position, f.width / 2, f.depth / 2, f.rotation)),
  ], [selectedStairs, selectedFurniture]);

  // Move-tool snap marker: BEFORE the grab click it rings the nearest object
  // handle (the point you'd pick up); DURING the move it rings the drop snap.
  const moveSnapMarker = useMemo((): { p: Vec2; kind: 'grab' | 'drop' } | null => {
    if (tool !== 'move' || !hoverWorld) return null;
    if (moveState) {
      let q = hoverWorld;
      if (orthoOn) q = snapOrtho(moveState.basePoint, q);
      const ds = moveDropSnap(q);
      return ds.feature ? { p: ds.point, kind: 'drop' } : null;
    }
    if (selections.length === 0) return null;
    const g = nearestPoint(hoverWorld, moveGrabHandles(), 14 / vp.pxPerInch);
    return g ? { p: g, kind: 'grab' } : null;
  }, [tool, hoverWorld, moveState, orthoOn, moveDropSnap, moveGrabHandles, selections.length, vp.pxPerInch]);

  // Wall tool: marker on the endpoint/corner the cursor has locked onto
  // (current floor or the floor-below ghost), so you can place walls exactly on
  // the floor below.
  const wallSnapMarker = useMemo(() => {
    if (tool !== 'wall' || !hoverWorld) return null;
    const info = snapWithInfo(hoverWorld, drawing?.start);
    return info.feature ? info.point : null;
  }, [tool, hoverWorld, drawing, snapWithInfo]);

  // Open wall corners: a "looks-joined-but-isn't" CORNER — two walls that meet
  // at an angle near a point but whose endpoints don't actually connect. Thick
  // walls hide the gap, which silently breaks footprint tracing (roof/
  // elevations), so we flag it. Deliberately NOT flagged: an opening in a wall
  // (the two segments are COLLINEAR), or an interior wall that simply ends in a
  // room (no other endpoint nearby). A clean closed loop has none, so known-
  // good plans look unchanged.
  const openEndpoints = useMemo<Vec2[]>(() => {
    const TOL = 1.5;  // inches — endpoints this close already count as joined
    const NEAR = 24;  // inches — a near-miss this close reads as a "meant-to-meet" corner
    const COLLINEAR_COS = Math.cos((15 * Math.PI) / 180); // ≥ this ⇒ same line (an opening, not a corner)
    const walls = level.walls;
    const dirOf = (w: Wall): Vec2 | null => {
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
      const L = Math.hypot(dx, dy);
      return L < 1e-6 ? null : { x: dx / L, y: dy / L };
    };
    const onBody = (p: Vec2, a: Vec2, b: Vec2): boolean => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      if (L < 1e-6) return false;
      const ux = dx / L, uy = dy / L;
      const along = (p.x - a.x) * ux + (p.y - a.y) * uy;
      if (along < TOL || along > L - TOL) return false;
      return Math.abs((p.x - a.x) * -uy + (p.y - a.y) * ux) <= TOL;
    };
    const out: Vec2[] = [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const wd = dirOf(w);
      if (!wd) continue;
      for (const ep of [w.start, w.end]) {
        let joined = false;
        let brokenCorner = false;
        for (let j = 0; j < walls.length; j++) {
          if (j === i) continue;
          const o = walls[j];
          const od = dirOf(o);
          if (Math.hypot(o.start.x - ep.x, o.start.y - ep.y) <= TOL
           || Math.hypot(o.end.x - ep.x, o.end.y - ep.y) <= TOL
           || onBody(ep, o.start, o.end)) { joined = true; break; }
          if (!od) continue;
          // A nearby endpoint on a wall at an ANGLE = a corner that didn't close.
          const collinear = Math.abs(wd.x * od.x + wd.y * od.y) >= COLLINEAR_COS;
          if (collinear) continue; // collinear gap = an opening, not a broken corner
          const dStart = Math.hypot(o.start.x - ep.x, o.start.y - ep.y);
          const dEnd = Math.hypot(o.end.x - ep.x, o.end.y - ep.y);
          if (Math.min(dStart, dEnd) <= NEAR) brokenCorner = true;
        }
        if (!joined && brokenCorner) out.push(ep);
      }
    }
    return out;
  }, [level.walls]);

  // User-dismissed open-corner warnings (session-scoped), keyed by rounded
  // position. Clicking a red ring adds it here so the false alarm goes away.
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const warnKey = (p: Vec2) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const visibleWarnings = useMemo(
    () => openEndpoints.filter(ep => !dismissedWarnings.has(warnKey(ep))),
    [openEndpoints, dismissedWarnings],
  );

  // While the line tool is active, expose the CURRENT snap hit so the
  // renderer can draw a CAD-style marker (square = endpoint, triangle =
  // midpoint, X = on-edge). Computed from hoverWorld so it lives even
  // before the first click of a draft. Tolerance is generous (16 screen
  // pixels) so the snap is easy to find by feel.
  const lineSnapHit: LineSnapHit | null = useMemo(() => {
    if (tool !== 'line' || !hoverWorld) return null;
    return snapToLineFeatures(level.lines ?? [], hoverWorld, 20 / vp.pxPerInch, level.walls);
  }, [tool, hoverWorld, level.lines, level.walls, vp.pxPerInch]);

  // ─── Effective wall end (typed-length override) ──────────────────────────
  const effectiveEnd: Vec2 | null = useMemo(() => {
    if (!drawing) return null;
    const cursor = drawing.cursor;
    const parsed = parseLengthAngleInput(typedLength);
    if (parsed != null) {
      let dirX: number, dirY: number;
      if (parsed.angle != null) {
        // Polar input: 0° = east, 90° = north (up on screen). World Y is
        // screen-down, so flip the Y component.
        const a = -parsed.angle * Math.PI / 180;
        dirX = Math.cos(a);
        dirY = Math.sin(a);
      } else {
        // Length-only: direction comes from cursor (ortho-snapped if Right
        // Angle is on).
        const orthoCursor = orthoOn ? snapOrtho(drawing.start, cursor) : cursor;
        const dx = orthoCursor.x - drawing.start.x;
        const dy = orthoCursor.y - drawing.start.y;
        const L = Math.hypot(dx, dy);
        if (L > 0) {
          dirX = dx / L;
          dirY = dy / L;
        } else {
          dirX = 1; dirY = 0; // cursor on start: default to east
        }
      }
      return {
        x: drawing.start.x + dirX * parsed.length,
        y: drawing.start.y + dirY * parsed.length,
      };
    }
    return snap(cursor, drawing.start);
  }, [drawing, typedLength, snap, orthoOn]);

  // Hit-test a normalized box against every selectable entity in the level.
  // Window-mode (L→R) requires the entity's plan footprint fully inside;
  // crossing-mode (R→L) accepts any touch/overlap. Mirrors the existing
  // wall semantics, extended to openings, furniture, stairs, room labels.
  const computeBoxHits = useCallback((box: ReturnType<typeof normalizeBox>, windowMode: boolean): Selection[] => {
    const hits: Selection[] = [];
    for (const w of level.walls) {
      if (windowMode ? wallFullyInsideBox(w, box) : wallTouchesBox(w, box)) {
        hits.push({ kind: 'wall', id: w.id });
      }
    }
    for (const d of level.doors) {
      const r = openingRect(d, level.walls);
      if (!r) continue;
      const inside = windowMode
        ? rotatedRectFullyInsideBox(r.cx, r.cy, r.halfW, r.halfH, r.rot, box)
        : rotatedRectTouchesBox(r.cx, r.cy, r.halfW, r.halfH, r.rot, box);
      if (inside) hits.push({ kind: 'door', id: d.id });
    }
    for (const win of level.windows) {
      const r = openingRect(win, level.walls);
      if (!r) continue;
      const inside = windowMode
        ? rotatedRectFullyInsideBox(r.cx, r.cy, r.halfW, r.halfH, r.rot, box)
        : rotatedRectTouchesBox(r.cx, r.cy, r.halfW, r.halfH, r.rot, box);
      if (inside) hits.push({ kind: 'window', id: win.id });
    }
    for (const f of level.furniture) {
      const inside = windowMode
        ? rotatedRectFullyInsideBox(f.position.x, f.position.y, f.width / 2, f.depth / 2, f.rotation, box)
        : rotatedRectTouchesBox(f.position.x, f.position.y, f.width / 2, f.depth / 2, f.rotation, box);
      if (inside) hits.push({ kind: 'furniture', id: f.id });
    }
    for (const s of level.stairs) {
      const { hx, hy } = stairHalfExtents(s);
      const inside = windowMode
        ? rotatedRectFullyInsideBox(s.position.x, s.position.y, hx, hy, s.rotation, box)
        : rotatedRectTouchesBox(s.position.x, s.position.y, hx, hy, s.rotation, box);
      if (inside) hits.push({ kind: 'stair', id: s.id });
    }
    // Room labels and text labels are point objects — either mode accepts a
    // label whose position is inside the box.
    for (const r of level.roomLabels) {
      if (pointInsideBox(r.position, box)) hits.push({ kind: 'roomLabel', id: r.id });
    }
    for (const t of (level.texts ?? [])) {
      if (pointInsideBox(t.position, box)) hits.push({ kind: 'text', id: t.id });
    }
    for (const l of (level.lines ?? [])) {
      const inside = windowMode ? lineFullyInsideBox(l, box) : lineTouchesBox(l, box);
      if (inside) hits.push({ kind: 'line', id: l.id });
    }
    for (const dm of level.dimensions) {
      const a = resolveDimAnchor(dm.start, level);
      const b = resolveDimAnchor(dm.end, level);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      if (L === 0) continue;
      // Test the visible (offset) dim line. The box helpers only read .start/.end.
      const nx = -dy / L, ny = dx / L;
      const seg = {
        start: { x: a.x + nx * dm.offset, y: a.y + ny * dm.offset },
        end:   { x: b.x + nx * dm.offset, y: b.y + ny * dm.offset },
      } as LineEntity;
      const inside = windowMode ? lineFullyInsideBox(seg, box) : lineTouchesBox(seg, box);
      if (inside) hits.push({ kind: 'dimension', id: dm.id });
    }
    return hits;
  }, [level]);

  // ─── Selection augmented with drag-box candidates (for live highlight) ────
  const displaySelections: Selection[] = useMemo(() => {
    if (!dragBox) return selections;
    const windowMode = dragBox.end.x >= dragBox.start.x;
    const box = normalizeBox(dragBox.start, dragBox.end);
    const candidates = computeBoxHits(box, windowMode);
    if (dragBox.additive) {
      // Merge candidates into the existing selection, de-duped by (kind,id).
      const key = (s: Selection) => `${s.kind}:${s.id}`;
      const seen = new Set(selections.map(key));
      const merged: Selection[] = [...selections];
      for (const c of candidates) if (!seen.has(key(c))) merged.push(c);
      return merged;
    }
    return candidates;
  }, [dragBox, selections, computeBoxHits]);

  // ─── Render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = vp.width * dpr;
    c.height = vp.height * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const viewport: Viewport = { pan: vp.pan, pxPerInch: vp.pxPerInch, width: vp.width, height: vp.height };
    drawScene(ctx, level, viewport, gridInches, gridVisible, displaySelections,
      showFloorBelow ? floorBelow : null);

    // Endpoint grips on selected walls (only in Select tool, not while drawing).
    if (tool === 'select' && !drawing) {
      drawHandles(
        ctx, level.walls, selectedWallIds, viewport,
        hoveredHandle?.wallId ?? null, hoveredHandle?.end ?? null,
      );
      // Corner handles on selected stairs.
      for (const s of selectedStairs) {
        const hovered = hoveredStairCorner?.stairId === s.id ? hoveredStairCorner.cornerIndex : null;
        drawStairCornerHandles(ctx, s, viewport, hovered);
      }
    }

    if (drawing && effectiveEnd) {
      if (tool === 'line') {
        ctx.save();
        ctx.globalAlpha = 0.7;
        drawLine(ctx, {
          id: '__ghost__', levelId: level.id,
          start: drawing.start, end: effectiveEnd,
          style: defaultLineStyle, weight: defaultLineWeight,
          color: defaultLineColor,
        }, viewport, false);
        ctx.restore();
      } else {
        drawWallPreview(ctx, drawing.start, effectiveEnd, defaultWallThickness, viewport);
      }
    }

    // ── Section cuts: existing + drag ghost ──────────────────────────────
    // Existing cuts always render (they're project-wide annotations visible
    // on every floor). During an active section drag we additionally render
    // the ghost, auto-orthogonalized to the dominant drag axis.
    const selectedCutIds = new Set(
      displaySelections.filter(s => s.kind === 'sectionCut').map(s => s.id),
    );
    for (const cut of sectionCuts) {
      drawSectionCutSymbol(ctx, cut, viewport, false, selectedCutIds.has(cut.id));
    }
    if (sectionDraft) {
      const { start, cursor } = sectionDraft;
      const dxAbs = Math.abs(cursor.x - start.x);
      const dyAbs = Math.abs(cursor.y - start.y);
      const horizontal = dxAbs >= dyAbs;
      const a = horizontal ? start.x  : start.y;
      const b = horizontal ? cursor.x : cursor.y;
      const ghost: SectionCut = {
        id: '__ghost__',
        name: nextSectionCutName(sectionCuts),
        axis: horizontal ? 'x' : 'y',
        position: horizontal ? start.y : start.x,
        start: Math.min(a, b),
        end:   Math.max(a, b),
        facing: 1,
      };
      drawSectionCutSymbol(ctx, ghost, viewport, true);
    }

    // Line snap indicator (CAD-style): square = END, triangle = MID. On-edge
    // snaps happen silently — the cursor still locks to the wall face, but no
    // marker is shown so the canvas stays quiet while drag-tracing along a
    // wall. END and MID get a halo + label because they're discrete points.
    if (tool === 'line' && lineSnapHit && lineSnapHit.kind !== 'edge') {
      const s = worldToScreen(lineSnapHit.point, viewport);
      const r = 7;
      ctx.save();
      // Halo
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      // Marker
      ctx.strokeStyle = T.accent;
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 2;
      if (lineSnapHit.kind === 'endpoint') {
        ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
        ctx.strokeRect(s.x - r, s.y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - r);
        ctx.lineTo(s.x + r, s.y + r * 0.8);
        ctx.lineTo(s.x - r, s.y + r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Text label
      const label = lineSnapHit.kind === 'endpoint' ? 'END' : 'MID';
      ctx.font = '600 10px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tx = s.x + r + 6;
      const ty = s.y - r - 4;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(tx - 3, ty - 8, tw + 6, 16);
      ctx.fillStyle = T.accentInk;
      ctx.fillText(label, tx, ty);
      ctx.restore();
    }

    // Trim tool: highlight the entity currently under the cursor so the
    // user sees exactly what will be split on click.
    if (tool === 'trim' && trimHover) {
      ctx.save();
      ctx.strokeStyle = T.warm;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([5, 4]);
      if (trimHover.kind === 'wall') {
        const w = level.walls.find(x => x.id === trimHover.id);
        if (w) {
          const corners = wallPolygon(w).map(p => worldToScreen(p, viewport));
          ctx.beginPath();
          ctx.moveTo(corners[0].x, corners[0].y);
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
          ctx.closePath();
          ctx.stroke();
        }
      } else {
        const l = (level.lines ?? []).find(x => x.id === trimHover.id);
        if (l) {
          const a = worldToScreen(l.start, viewport);
          const b = worldToScreen(l.end, viewport);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Extend tool: green dashed ghost from the line's current end to the
    // boundary it would reach + a marker at the landing point.
    if (tool === 'extend' && extendHover) {
      const f = worldToScreen(extendHover.from, viewport);
      const t = worldToScreen(extendHover.to, viewport);
      ctx.save();
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#16A34A'; ctx.fill();
      ctx.restore();
    }

    // Fillet tool: highlight the first picked wall/line (amber). When a valid
    // second target is hovered, ghost the resulting corner — both adjusted
    // centerlines meeting at the intersection + a dot at the corner.
    if (tool === 'fillet' && filletFirst) {
      const e1 = filletEnds(filletFirst.kind, filletFirst.id);
      if (e1) {
        const a = worldToScreen(e1.a, viewport), b = worldToScreen(e1.b, viewport);
        ctx.save();
        ctx.strokeStyle = T.warm;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        // Live corner preview against the hovered second target.
        if (hoverWorld) {
          const tol = 10 / vp.pxPerInch;
          const wh = hitWall(level.walls, hoverWorld, tol);
          const lh = wh ? null : hitLine(level.lines ?? [], hoverWorld, tol);
          const hover = wh ? { kind: 'wall' as const, id: wh.id } : lh ? { kind: 'line' as const, id: lh } : null;
          if (hover && !(hover.kind === filletFirst.kind && hover.id === filletFirst.id)) {
            const e2 = filletEnds(hover.kind, hover.id);
            const corner = e2 ? infiniteLineIntersection(e1.a, e1.b, e2.a, e2.b) : null;
            if (e2 && corner) {
              const cs = worldToScreen(corner, viewport);
              const m1 = filletEndpoint(e1.a, e1.b, filletFirst.pick, corner);
              const m2 = filletEndpoint(e2.a, e2.b, hoverWorld, corner);
              const keep1 = m1 === 'a' ? e1.b : e1.a;   // the endpoint that stays
              const keep2 = m2 === 'a' ? e2.b : e2.a;
              const k1 = worldToScreen(keep1, viewport), k2 = worldToScreen(keep2, viewport);
              ctx.strokeStyle = T.accent;
              ctx.setLineDash([6, 4]);
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(k1.x, k1.y); ctx.lineTo(cs.x, cs.y);
              ctx.moveTo(k2.x, k2.y); ctx.lineTo(cs.x, cs.y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath(); ctx.arc(cs.x, cs.y, 4, 0, Math.PI * 2);
              ctx.fillStyle = T.accent; ctx.fill();
            }
          }
        }
        ctx.restore();
      }
    }

    // Mirror tool: violet axis line at the cursor + a ghost of the reflected
    // selected walls + lines, so the user sees where the copies land.
    if (tool === 'mirror' && hoverWorld) {
      const selWallIds = new Set(selections.filter(s => s.kind === 'wall').map(s => s.id));
      const selLineIds = new Set(selections.filter(s => s.kind === 'line').map(s => s.id));
      if (selWallIds.size > 0 || selLineIds.size > 0) {
        const pos = mirrorAxis === 'x' ? hoverWorld.y : hoverWorld.x;
        const R = mirrorReflector(mirrorAxis, pos);
        ctx.save();
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        if (mirrorAxis === 'x') { const y = worldToScreen({ x: 0, y: pos }, viewport).y; ctx.moveTo(0, y); ctx.lineTo(vp.width, y); }
        else { const x = worldToScreen({ x: pos, y: 0 }, viewport).x; ctx.moveTo(x, 0); ctx.lineTo(x, vp.height); }
        ctx.stroke();
        ctx.strokeStyle = T.accent;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        // Reflected wall ghosts (outline of the mirrored wall polygon).
        for (const w of level.walls) {
          if (!selWallIds.has(w.id)) continue;
          const corners = wallPolygon({ ...w, start: R(w.start), end: R(w.end) }).map(p => worldToScreen(p, viewport));
          ctx.beginPath();
          ctx.moveTo(corners[0].x, corners[0].y);
          for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
          ctx.closePath();
          ctx.stroke();
        }
        // Reflected line ghosts.
        for (const l of level.lines ?? []) {
          if (!selLineIds.has(l.id)) continue;
          const a = worldToScreen(R(l.start), viewport), b = worldToScreen(R(l.end), viewport);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Offset tool: dashed orange outline on source, ghost preview on cursor side.
    if (offsetSource) {
      ctx.strokeStyle = T.warm;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      if (offsetSource.kind === 'wall') {
        const corners = wallPolygon(offsetSource.wall).map(p => worldToScreen(p, viewport));
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.stroke();
      } else {
        const a = worldToScreen(offsetSource.line.start, viewport);
        const b = worldToScreen(offsetSource.line.end, viewport);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (offsetPreview) {
      if (offsetPreview.kind === 'wall') {
        drawWallPreview(ctx, offsetPreview.start, offsetPreview.end, offsetPreview.thickness, viewport);
      } else {
        ctx.save();
        ctx.globalAlpha = 0.7;
        drawLine(ctx, {
          id: '__ghost__', levelId: level.id,
          start: offsetPreview.start, end: offsetPreview.end,
          style: offsetPreview.style, weight: offsetPreview.weight, color: offsetPreview.color,
        }, viewport, false);
        ctx.restore();
      }
      // Snap marker: a ring on the endpoint/midpoint the cursor locked onto.
      if (offsetPreview.snapPoint) {
        const sp = worldToScreen(offsetPreview.snapPoint, viewport);
        ctx.save();
        ctx.strokeStyle = T.accent;
        ctx.fillStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Door tool ghost preview.
    if (doorGhost) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      drawDoor(ctx, doorGhost.door, doorGhost.wall, viewport, false);
      ctx.restore();
    }

    // Window tool ghost preview.
    if (windowGhost) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      drawWindow(ctx, windowGhost.window, windowGhost.wall, viewport, false);
      ctx.restore();
    }

    // Center-snap indicator: when a door/window ghost has snapped to the
    // wall's midpoint, draw a triangle "MID" marker at the wall center so the
    // user can see they're placing it dead-center (mirrors the line-tool snap).
    const centerWall =
      (doorGhost?.atCenter && doorGhost.wall) ||
      (windowGhost?.atCenter && windowGhost.wall) || null;
    if (centerWall) {
      const mid = {
        x: (centerWall.start.x + centerWall.end.x) / 2,
        y: (centerWall.start.y + centerWall.end.y) / 2,
      };
      const s = worldToScreen(mid, viewport);
      const r = 7;
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = T.accent;
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x + r, s.y + r * 0.8);
      ctx.lineTo(s.x - r, s.y + r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const label = 'MID';
      ctx.font = '600 10px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tx = s.x + r + 6, ty = s.y - r - 4;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(tx - 3, ty - 8, tw + 6, 16);
      ctx.fillStyle = T.accentInk;
      ctx.fillText(label, tx, ty);
      ctx.restore();
    }

    // Dimension placement preview.
    if (tool === 'dimension' && hoverWorld) {
      const aStart = dimDraft.start ? resolveDimAnchor(dimDraft.start, level) : null;
      const aEnd   = dimDraft.end   ? resolveDimAnchor(dimDraft.end,   level) : null;
      if (aStart && !aEnd) {
        // Stage 2: ghost line from start to cursor.
        const sa = worldToScreen(aStart, viewport);
        const sb = worldToScreen(hoverWorld, viewport);
        ctx.save();
        ctx.strokeStyle = T.accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.accent;
        ctx.beginPath(); ctx.arc(sa.x, sa.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (aStart && aEnd) {
        // Stage 3: full ghost dim with offset computed from cursor. If the
        // cursor's offset is near the dim-line of an existing parallel dim,
        // snap so the dims align visually.
        const dx = aEnd.x - aStart.x;
        const dy = aEnd.y - aStart.y;
        const L = Math.hypot(dx, dy);
        if (L > 0) {
          const nx = -dy / L, ny = dx / L;
          let offset = (hoverWorld.x - aStart.x) * nx + (hoverWorld.y - aStart.y) * ny;
          const snapTolIn = 10 / vp.pxPerInch;
          offset = snapDimOffsetToParallel(aStart, aEnd, offset, level.dimensions, level, snapTolIn);
          ctx.save();
          ctx.globalAlpha = 0.7;
          drawDimension(ctx, {
            id: '__ghost__', levelId: level.id,
            start: dimDraft.start!, end: dimDraft.end!,
            offset,
          }, level, viewport, false);
          ctx.restore();
        }
      }
    }

    // Click-to-place ghosts for the simple tools.
    if (tool === 'stair' && hoverWorld) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawStair(ctx, {
        id: '__ghost__', levelId: level.id, position: hoverWorld,
        width: stairDefaults.width, length: stairDefaults.length,
        rotation: 0, direction: stairDefaults.direction,
        shape: stairDefaults.shape,
      }, viewport, false);
      ctx.restore();
    }
    if (tool === 'furniture' && hoverWorld) {
      const s = furnitureSettings[activeFurnitureKind];
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawFurniture(ctx, {
        id: '__ghost__', levelId: level.id, kind: activeFurnitureKind,
        position: hoverWorld, rotation: 0, width: s.width, depth: s.depth,
      }, viewport, false);
      ctx.restore();
    }
    if (tool === 'room-label' && hoverWorld) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      drawRoomLabel(ctx, {
        id: '__ghost__', levelId: level.id, position: hoverWorld,
        name: roomLabelDefaultName,
      }, viewport, false);
      ctx.restore();
    }

    if (dragBox) {
      const isWindow = dragBox.end.x >= dragBox.start.x;
      const a = worldToScreen(dragBox.start, viewport);
      const b = worldToScreen(dragBox.end, viewport);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
      if (isWindow) {
        ctx.fillStyle = 'rgba(79,124,255,0.10)';
        ctx.strokeStyle = T.accent;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = 'rgba(43,182,115,0.10)';
        ctx.strokeStyle = T.good;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
      }
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Room-boundary polyline draft preview. The rubber-band tracks the
    // SNAPPED point so what you see is what you'll commit.
    if (boundaryDraftRoomId && boundaryPoints.length > 0) {
      drawBoundaryDraft(ctx, boundaryPoints, boundaryPreviewPoint, viewport, boundaryCloseHover);
    }

    // Boundary snap marker — square = END (corner), triangle = MID. Mirrors
    // the line tool so the user sees exactly which corner/midpoint is locked.
    // On-edge projections snap silently (no marker) so tracing a wall face
    // stays quiet.
    if (boundaryDraftRoomId && boundarySnapHit && boundarySnapHit.kind !== 'edge' && !boundaryCloseHover) {
      const s = worldToScreen(boundarySnapHit.point, viewport);
      const r = 7;
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = T.accent;
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 2;
      if (boundarySnapHit.kind === 'endpoint') {
        ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
        ctx.strokeRect(s.x - r, s.y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - r);
        ctx.lineTo(s.x + r, s.y + r * 0.8);
        ctx.lineTo(s.x - r, s.y + r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Open-corner warning markers: hollow red rings on wall endpoints that
    // aren't actually connected. Click one to dismiss the false alarm. Drawn
    // under the snap marker so an active snap still reads on top.
    if (visibleWarnings.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.fillStyle = 'rgba(220,38,38,0.12)';
      ctx.lineWidth = 1.6;
      for (const ep of visibleWarnings) {
        const s = worldToScreen(ep, viewport);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Wall-tool snap marker: a ring on the endpoint/corner the cursor locked
    // onto (current floor or floor-below ghost). Drawn last so it's always visible.
    if (wallSnapMarker) {
      const s = worldToScreen(wallSnapMarker, viewport);
      ctx.save();
      ctx.strokeStyle = T.accent;
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Move-tool snap marker — green ring on the grab handle (before pickup) or
    // the drop snap (during the move), so the user can see what it's locking to.
    if (moveSnapMarker) {
      const s = worldToScreen(moveSnapMarker.p, viewport);
      ctx.save();
      ctx.strokeStyle = moveSnapMarker.kind === 'grab' ? '#16A34A' : T.accent;
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [vp, level, floorBelow, showFloorBelow, gridInches, gridVisible, displaySelections, drawing, effectiveEnd,
      defaultWallThickness, dragBox, tool, selectedWallIds, hoveredHandle,
      offsetSource, offsetPreview, doorGhost, windowGhost, wallSnapMarker, moveSnapMarker, visibleWarnings,
      dimDraft, hoverWorld, stairDefaults, activeFurnitureKind, furnitureSettings,
      defaultLineStyle, defaultLineWeight, defaultLineColor, lineSnapHit, trimHover,
      extendHover, mirrorAxis, selections, filletFirst, filletEnds,
      roomLabelDefaultName, selectedStairs, hoveredStairCorner,
      sectionCuts, sectionDraft, boundaryDraftRoomId, boundaryPoints, boundaryCloseHover,
      boundaryPreviewPoint, boundarySnapHit]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getWorld = useCallback((e: React.MouseEvent | MouseEvent): Vec2 => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
    const viewport: Viewport = { pan: vp.pan, pxPerInch: vp.pxPerInch, width: vp.width, height: vp.height };
    return screenToWorld(screen, viewport);
  }, [vp]);

  const getScreen = useCallback((e: React.MouseEvent | MouseEvent): Vec2 => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  // ─── Mouse: down ──────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setPanning({ from: { x: e.clientX, y: e.clientY }, pan0: vp.pan });
      return;
    }
    if (e.button !== 0) return;

    const world = getWorld(e);

    // Click a red open-corner warning ring (Select tool) to dismiss it — for
    // false alarms where the walls really do meet. Checked first so the small
    // ring is easy to hit; it doesn't interfere with the drawing tools.
    if (tool === 'select' && visibleWarnings.length > 0) {
      const ringTol = 9 / vp.pxPerInch;
      const hit = visibleWarnings.find(ep => Math.hypot(ep.x - world.x, ep.y - world.y) <= ringTol);
      if (hit) {
        setDismissedWarnings(prev => { const n = new Set(prev); n.add(warnKey(hit)); return n; });
        return;
      }
    }

    // Boundary-draft mode short-circuits every tool: every left-click is a
    // vertex on the polyline (or a close-on-start commit).
    if (boundaryDraftRoomId) {
      // Snap the click the same way the live preview did, so the committed
      // vertex lands exactly where the marker showed (corner / midpoint /
      // wall-edge, else ortho across open space).
      const snapped = snapBoundaryPoint(world);
      // Close-on-start: ≥3 vertices and the snapped point near the first one
      // → commit. Using the snapped point keeps this consistent with the
      // pulsing close highlight.
      if (boundaryPoints.length >= 3) {
        const dxIn = snapped.x - boundaryPoints[0].x;
        const dyIn = snapped.y - boundaryPoints[0].y;
        const distPx = Math.hypot(dxIn, dyIn) * vp.pxPerInch;
        if (distPx <= CLOSE_SNAP_PX) {
          onCommitBoundary(boundaryDraftRoomId, boundaryPoints);
          setBoundaryPoints([]);
          return;
        }
      }
      setBoundaryPoints(prev => [...prev, snapped]);
      return;
    }

    if (tool === 'wall') {
      if (!drawing) {
        const start = snap(world);
        setDrawing({ start, cursor: start });
        setTypedLength('');
      } else if (effectiveEnd) {
        const end = effectiveEnd;
        if (dist(drawing.start, end) > 0.5) {
          onAddWall({
            id: makeId('wall'), levelId: level.id,
            start: drawing.start, end,
            thickness: defaultWallThickness, height: defaultWallHeight, type: defaultWallType, status: defaultWallStatus,
          });
        }
        setDrawing({ start: end, cursor: end });
        setTypedLength('');
      }
      return;
    }

    if (tool === 'trim') {
      // Single-click trim: the entity is split at every crossing with another
      // wall or line, and the piece UNDER THE CURSOR is removed. Walls take
      // priority over lines for the hit test (walls are usually the bigger
      // visual target). Click point is passed through so the handler knows
      // which interval (between two cuts, or between an endpoint and a cut)
      // to delete.
      const tol = 10 / vp.pxPerInch;
      const wallHit = hitWall(level.walls, world, tol);
      if (wallHit) { onTrimWall(wallHit.id, world); return; }
      const lineId = hitLine(level.lines ?? [], world, tol);
      if (lineId) { onTrimLine(lineId, world); return; }
      return;
    }

    if (tool === 'extend') {
      // Counterpart to Trim: click a WALL or LINE near the end you want to grow
      // — it extends to the nearest boundary. Walls take priority over lines
      // (same as Trim).
      const tol = 10 / vp.pxPerInch;
      const r = computeExtendAt(world, tol);
      if (r) {
        const patch = r.end === 'a' ? { start: r.point } : { end: r.point };
        if (r.kind === 'wall') onUpdateWalls([r.id], patch);
        else onUpdateLines([r.id], patch);
      }
      return;
    }

    if (tool === 'mirror') {
      // Reflect the SELECTED walls + lines across an X/Y axis placed at the
      // click, ADDING mirrored copies (originals kept). Wall copies carry their
      // geometry/type/thickness but NOT their openings (doors/windows are a
      // later refinement). Needs a wall or line selection.
      const selWallIds = new Set(selections.filter(s => s.kind === 'wall').map(s => s.id));
      const selLineIds = new Set(selections.filter(s => s.kind === 'line').map(s => s.id));
      if (selWallIds.size > 0 || selLineIds.size > 0) {
        const pos = mirrorAxis === 'x' ? world.y : world.x;
        const R = mirrorReflector(mirrorAxis, pos);
        const wallCopies: Wall[] = level.walls
          .filter(w => selWallIds.has(w.id))
          .map(w => ({ ...w, id: makeId('wall'), start: R(w.start), end: R(w.end) }));
        const lineCopies: LineEntity[] = (level.lines ?? [])
          .filter(l => selLineIds.has(l.id))
          .map(l => ({ ...l, id: makeId('line'), start: R(l.start), end: R(l.end) }));
        if (wallCopies.length > 0 || lineCopies.length > 0) {
          // Collapse both adds into one undo entry.
          onBeginLiveOp();
          if (wallCopies.length > 0) onAddWalls(wallCopies);
          if (lineCopies.length > 0) onAddLines(lineCopies);
          onEndLiveOp();
          onSelectionsChange([
            ...wallCopies.map(w => ({ kind: 'wall' as const, id: w.id })),
            ...lineCopies.map(l => ({ kind: 'line' as const, id: l.id })),
          ]);
        }
      }
      return;
    }

    if (tool === 'fillet') {
      // Two-click corner join: click the first wall/line (the side to keep),
      // then the second. Both near ends move to the intersection of their
      // centerlines — extending the short one and trimming the long one — so
      // they meet at a clean corner AND share that point (clears the
      // disconnected-wall warning). Walls take priority over lines for the hit.
      const tol = 10 / vp.pxPerInch;
      const wallHit = hitWall(level.walls, world, tol);
      const lineId = wallHit ? null : hitLine(level.lines ?? [], world, tol);
      const hit = wallHit ? { kind: 'wall' as const, id: wallHit.id }
        : lineId ? { kind: 'line' as const, id: lineId } : null;
      if (!hit) return;   // missed — keep the first pick (if any) so the user can retry
      if (!filletFirst || (filletFirst.kind === hit.kind && filletFirst.id === hit.id)) {
        // First pick, or re-picking the same entity → (re)set it as the first.
        setFilletFirst({ ...hit, pick: world });
        return;
      }
      const e1 = filletEnds(filletFirst.kind, filletFirst.id);
      const e2 = filletEnds(hit.kind, hit.id);
      const corner = e1 && e2 ? infiniteLineIntersection(e1.a, e1.b, e2.a, e2.b) : null;
      if (e1 && e2 && corner) {
        const m1 = filletEndpoint(e1.a, e1.b, filletFirst.pick, corner);
        const m2 = filletEndpoint(e2.a, e2.b, world, corner);
        const apply = (kind: 'wall' | 'line', id: string, end: 'a' | 'b') => {
          const patch = end === 'a' ? { start: corner } : { end: corner };
          if (kind === 'wall') onUpdateWalls([id], patch); else onUpdateLines([id], patch);
        };
        onBeginLiveOp();
        apply(filletFirst.kind, filletFirst.id, m1);
        apply(hit.kind, hit.id, m2);
        onEndLiveOp();
      }
      setFilletFirst(null);
      return;
    }

    if (tool === 'erase') {
      // Single click deletes whatever's under the cursor. Generous click
      // radius (~14 screen px) so the user doesn't have to be pixel-precise.
      // Hit-test priority mirrors the Select tool: openings before walls.
      const tol = 14 / vp.pxPerInch;
      // Section cuts have higher visual priority than walls (they're blue
      // overlays on top), so test them first.
      const cutId = hitSectionCut(sectionCuts, world, tol);
      if (cutId) { onSelectionsChange([{ kind: 'sectionCut', id: cutId }]); onDeleteSelections(); return; }
      const wallById = new Map(level.walls.map(w => [w.id, w]));
      const doorId = hitDoor(level.doors, wallById, world, tol);
      if (doorId) { onSelectionsChange([{ kind: 'door', id: doorId }]); onDeleteSelections(); return; }
      const winId = hitWindow(level.windows, wallById, world, tol);
      if (winId) { onSelectionsChange([{ kind: 'window', id: winId }]); onDeleteSelections(); return; }
      const dimId = hitDimension(level.dimensions, level, world, tol);
      if (dimId) { onSelectionsChange([{ kind: 'dimension', id: dimId }]); onDeleteSelections(); return; }
      const lblId = hitRoomLabel(level.roomLabels, world, tol);
      if (lblId) { onSelectionsChange([{ kind: 'roomLabel', id: lblId }]); onDeleteSelections(); return; }
      const txtId = hitText(level.texts ?? [], world, tol);
      if (txtId) { onSelectionsChange([{ kind: 'text', id: txtId }]); onDeleteSelections(); return; }
      const stairId = hitStair(level.stairs, world, tol);
      if (stairId) { onSelectionsChange([{ kind: 'stair', id: stairId }]); onDeleteSelections(); return; }
      const furnId = hitFurniture(level.furniture, world, tol);
      if (furnId) { onSelectionsChange([{ kind: 'furniture', id: furnId }]); onDeleteSelections(); return; }
      const lineId = hitLine(level.lines ?? [], world, tol);
      if (lineId) { onSelectionsChange([{ kind: 'line', id: lineId }]); onDeleteSelections(); return; }
      const hit = hitWall(level.walls, world, tol);
      if (hit) { onSelectionsChange([{ kind: 'wall', id: hit.id }]); onDeleteSelections(); return; }
      return;
    }

    if (tool === 'line') {
      // Reuses the wall draft state (`drawing` + `effectiveEnd`) for the
      // same length@angle typing behavior; commits a LineEntity instead.
      if (!drawing) {
        const start = snap(world);
        setDrawing({ start, cursor: start });
        setTypedLength('');
      } else if (effectiveEnd) {
        const end = effectiveEnd;
        if (dist(drawing.start, end) > 0.5) {
          onAddLine({
            id: makeId('line'), levelId: level.id,
            start: drawing.start, end,
            style: defaultLineStyle, weight: defaultLineWeight, color: defaultLineColor,
          });
        }
        setDrawing({ start: end, cursor: end });
        setTypedLength('');
      }
      return;
    }

    if (tool === 'section') {
      // Press starts the section drag — cursor and start coincide. On
      // subsequent mousemoves the cursor updates; mouseup commits as a
      // SectionCut. Use the snapped world so the cut endpoints can clip
      // to grid / wall corners when those snaps are active.
      const start = snap(world);
      setSectionDraft({ start, cursor: start });
      return;
    }

    if (tool === 'door') {
      if (doorGhost) {
        onAddDoor({
          ...doorGhost.door,
          id: makeId('door'),
        });
      }
      return;
    }

    if (tool === 'window') {
      if (windowGhost) {
        onAddWindow({
          ...windowGhost.window,
          id: makeId('win'),
        });
      }
      return;
    }

    if (tool === 'dimension') {
      // Snap to ANCHOR points: wall corners, opening jambs, furniture
      // corners, stair corners. The anchor remembers what we snapped to so
      // the dim follows when that object moves later.
      //
      // For the SECOND click, bias the snap toward candidates on the same
      // wall+face as the first anchor — this is what keeps a dim along a
      // wall from coming out crooked when start and end snap to different
      // faces (the visual tilt without this equals the wall thickness).
      const prefer = dimDraft.start ? extractWallFace(dimDraft.start, level) : null;
      const anchor = snapToDimAnchor(world, level, 18 / vp.pxPerInch, prefer);
      if (dimDraft.start == null) {
        setDimDraft({ start: anchor, end: null });
      } else if (dimDraft.end == null) {
        const a = resolveDimAnchor(dimDraft.start, level);
        const b = resolveDimAnchor(anchor, level);
        if (a && b && dist(a, b) < 0.5) return;
        // If the first click landed on a different wall than the second
        // (typical at a shared room corner), swap the first onto the
        // second's wall+face so the dim line stays parallel to that wall.
        const refinedStart = refineFirstAnchorToSecondsWall(dimDraft.start, anchor, level);
        setDimDraft({ start: refinedStart, end: anchor });
      } else {
        // Commit: cursor's perpendicular projection sets the offset, then
        // snap to a parallel existing dim's line if close enough.
        const a = resolveDimAnchor(dimDraft.start, level);
        const b = resolveDimAnchor(dimDraft.end, level);
        if (a && b) {
          const dx = b.x - a.x, dy = b.y - a.y;
          const L = Math.hypot(dx, dy);
          if (L > 0) {
            const nx = -dy / L, ny = dx / L;
            let offset = (world.x - a.x) * nx + (world.y - a.y) * ny;
            const snapTolIn = 10 / vp.pxPerInch;
            offset = snapDimOffsetToParallel(a, b, offset, level.dimensions, level, snapTolIn);
            if (Math.abs(offset) < 2) offset = offset >= 0 ? dimensionOffset : -dimensionOffset;
            onAddDimension({
              id: makeId('dim'),
              levelId: level.id,
              start: dimDraft.start,
              end: dimDraft.end,
              offset,
            });
          }
        }
        setDimDraft({ start: null, end: null });
      }
      return;
    }

    if (tool === 'room-label') {
      onAddRoomLabel({
        id: makeId('rm'),
        levelId: level.id,
        position: world,
        name: roomLabelDefaultName,
      });
      return;
    }

    if (tool === 'text') {
      // Place a free-form text annotation and auto-select it so the user
      // can type immediately in the properties panel.
      const id = makeId('txt');
      onAddText({
        id,
        levelId: level.id,
        position: world,
        text: textDefaultText,
      });
      onSelectionsChange([{ kind: 'text', id }]);
      return;
    }

    if (tool === 'stair') {
      onAddStair({
        id: makeId('stair'),
        levelId: level.id,
        position: world,
        width: stairDefaults.width,
        length: stairDefaults.length,
        rotation: 0,
        direction: stairDefaults.direction,
        shape: stairDefaults.shape,
      });
      return;
    }

    if (tool === 'furniture') {
      const s = furnitureSettings[activeFurnitureKind];
      onAddFurniture({
        id: makeId('furn'),
        levelId: level.id,
        kind: activeFurnitureKind,
        position: world,
        rotation: 0,
        width: s.width,
        depth: s.depth,
      });
      return;
    }

    if (tool === 'move' && selections.length > 0) {
      // First click captures the GRAB point. Prefer one of the selected
      // object's OWN handles (a stair/furniture corner or edge midpoint) so the
      // user picks the piece up by that point; fall back to a wall corner /
      // endpoint. Second click drops that grab point at the target.
      const grabTol = 14 / vp.pxPerInch;
      const snapped = moveState
        ? moveDropSnap(world).point
        : (nearestPoint(world, moveGrabHandles(), grabTol)
            ?? snapToWallCorner(snapToWallEndpoint(world, level.walls, 10 / vp.pxPerInch), level.walls, 10 / vp.pxPerInch));
      if (!moveState) {
        // Linked staircase in the selection → warn once before starting a move.
        const linkedStair = selectedStairs.find(s => s.linkGroup);
        if (linkedStair && !confirmStairLink(linkedStair.id)) return;
        const originals: MoveOriginals = {
          walls: new Map(), doors: new Map(), windows: new Map(),
          dimensions: new Map(),
          labels: new Map(), stairs: new Map(), furniture: new Map(),
          lines: new Map(),
        };
        const selectedWallIds = new Set<string>();
        // First pass: collect selected walls so opening capture below can
        // skip openings whose host wall is also being moved (they ride
        // along — sliding them along the wall too would double-move).
        for (const sel of selections) {
          if (sel.kind === 'wall') selectedWallIds.add(sel.id);
        }
        for (const sel of selections) {
          if (sel.kind === 'wall') {
            const w = level.walls.find(x => x.id === sel.id);
            if (w) originals.walls.set(w.id, {
              start: { ...w.start }, end: { ...w.end },
              moveStart: true, moveEnd: true, stretch: false,
            });
          } else if (sel.kind === 'door' || sel.kind === 'window') {
            const op = sel.kind === 'door'
              ? level.doors.find(d => d.id === sel.id)
              : level.windows.find(w => w.id === sel.id);
            if (!op) continue;
            if (selectedWallIds.has(op.wallId)) continue; // wall is moving; door rides along
            const wall = level.walls.find(w => w.id === op.wallId);
            if (!wall) continue;
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const L = Math.hypot(dx, dy);
            if (L === 0) continue;
            const ux = dx / L, uy = dy / L;
            // Clearance: keep the opening fully inside the wall (entry doors
            // with sidelites need extra room).
            let clearance = op.width / 2;
            if (sel.kind === 'door') {
              const door = op as Door;
              if (door.doorType === 'entry' && door.sidePanels && door.sidePanels !== 'none') {
                const sw = door.sidePanelWidth ?? 14;
                const left = (door.sidePanels === 'left' || door.sidePanels === 'both') ? sw : 0;
                const right = (door.sidePanels === 'right' || door.sidePanels === 'both') ? sw : 0;
                clearance = Math.max(door.width / 2 + left, door.width / 2 + right);
              }
            }
            const spec: OpeningMoveSpec = {
              wallId: wall.id, positionAlong: op.positionAlong,
              ux, uy, wallLen: L, clearance,
            };
            if (sel.kind === 'door') originals.doors.set(op.id, spec);
            else                     originals.windows.set(op.id, spec);
          } else if (sel.kind === 'dimension') {
            const d = level.dimensions.find(x => x.id === sel.id);
            if (d) {
              // Resolve both anchors to capture their current world positions;
              // a selected dim moves both free endpoints (anchored ones follow
              // their referenced objects, so we skip those at apply time).
              const a = resolveDimAnchor(d.start, level);
              const b = resolveDimAnchor(d.end, level);
              if (a && b) originals.dimensions.set(d.id, { start: a, end: b, moveStart: true, moveEnd: true });
            }
          } else if (sel.kind === 'roomLabel') {
            const r = level.roomLabels.find(x => x.id === sel.id);
            if (r) originals.labels.set(r.id, { ...r.position });
          } else if (sel.kind === 'stair') {
            const s = level.stairs.find(x => x.id === sel.id);
            if (s) originals.stairs.set(s.id, { ...s.position });
          } else if (sel.kind === 'furniture') {
            const f = level.furniture.find(x => x.id === sel.id);
            if (f) originals.furniture.set(f.id, { ...f.position });
          } else if (sel.kind === 'line') {
            const l = (level.lines ?? []).find(x => x.id === sel.id);
            if (l) originals.lines.set(l.id, { start: { ...l.start }, end: { ...l.end } });
          }
        }

        // STRETCH: non-selected walls whose endpoint coincides with a
        // selected wall's endpoint follow on that endpoint, keeping the joint
        // connected as the wall is moved. They keep their orientation (see the
        // apply loop) so they slide/extend rather than skew into a diagonal.
        const EPS = 0.01;
        const selectedWallEndpoints: Vec2[] = [];
        for (const id of selectedWallIds) {
          const w = level.walls.find(x => x.id === id);
          if (w) { selectedWallEndpoints.push(w.start, w.end); }
        }
        const coincides = (p: Vec2) =>
          selectedWallEndpoints.some(q => Math.hypot(p.x - q.x, p.y - q.y) < EPS);
        for (const w of level.walls) {
          if (selectedWallIds.has(w.id)) continue;
          const moveStart = coincides(w.start);
          const moveEnd = coincides(w.end);
          if (!moveStart && !moveEnd) continue;
          originals.walls.set(w.id, {
            start: { ...w.start }, end: { ...w.end },
            // Both endpoints joined to the selection ⇒ translate rigidly;
            // a single joined endpoint ⇒ orientation-preserving stretch.
            moveStart, moveEnd, stretch: !(moveStart && moveEnd),
          });
        }

        // STICKY DIMS: a free dim endpoint resting on a wall that fully
        // translates should ride along with it (and update its readout live),
        // so the dim doesn't skew when only its anchored end follows. Only
        // fully-moving walls qualify — a stretched wall (one endpoint) would
        // shift the body non-uniformly. Per-endpoint flags so a dim with one
        // free end off the wall keeps that end put.
        const fullyMovingWalls: Wall[] = [];
        for (const [id, spec] of originals.walls) {
          if (spec.moveStart && spec.moveEnd) {
            const w = level.walls.find(x => x.id === id);
            if (w) fullyMovingWalls.push(w);
          }
        }
        if (fullyMovingWalls.length > 0) {
          const TOL = 2; // inches of slop beyond the wall face/ends
          const onMovingWall = (p: Vec2) =>
            fullyMovingWalls.some(w => pointOnWallBody(p, w, TOL));
          for (const d of level.dimensions) {
            const startFree = d.start.kind === 'free' && onMovingWall(d.start.point);
            const endFree = d.end.kind === 'free' && onMovingWall(d.end.point);
            if (!startFree && !endFree) continue;
            const existing = originals.dimensions.get(d.id);
            const a = resolveDimAnchor(d.start, level);
            const b = resolveDimAnchor(d.end, level);
            if (!a || !b) continue;
            originals.dimensions.set(d.id, {
              start: a, end: b,
              moveStart: (existing?.moveStart ?? false) || startFree,
              moveEnd: (existing?.moveEnd ?? false) || endFree,
            });
          }
        }

        onBeginLiveOp();
        setMoveState({ basePoint: snapped, originals });
        setTypedLength('');
      } else {
        // Second click: commit (entities already at their new positions).
        onEndLiveOp();
        setMoveState(null);
        setTypedLength('');
      }
      return;
    }

    if (tool === 'offset') {
      if (!offsetSource) {
        // Walls first (drawn under lines visually); fall back to lines.
        const wallHit = hitWall(level.walls, world, 6 / vp.pxPerInch);
        if (wallHit) { setOffsetSource({ kind: 'wall', wall: wallHit }); return; }
        const lineId = hitLine(level.lines ?? [], world, 6 / vp.pxPerInch);
        const line = lineId ? (level.lines ?? []).find(l => l.id === lineId) : null;
        if (line) setOffsetSource({ kind: 'line', line });
      } else if (offsetPreview) {
        // Click-to-place (free drag with snapping). Typing + Enter is the other path.
        commitOffset();
      }
      return;
    }

    // Move tool falls through to Select-tool behavior when nothing is selected.
    if (tool === 'select' || (tool === 'move' && selections.length === 0)) {
      // Handles (grips) on selected walls take priority.
      const handle = hitHandle(level.walls, selectedWallIds, world, 8 / vp.pxPerInch);
      if (handle) {
        onBeginLiveOp();
        setHandleDrag({ wallId: handle.wallId, end: handle.end });
        return;
      }
      // Stair corner handles next.
      const cornerHit = hitStairCorner(selectedStairs, world, 8 / vp.pxPerInch);
      if (cornerHit) {
        // No blocking confirm here — see the stair body-drag note above.
        onBeginLiveOp();
        setStairCornerDrag(cornerHit);
        return;
      }
      // Then check doors and windows (they sit on top of walls visually).
      const wallById = new Map(level.walls.map(w => [w.id, w]));
      const doorId = hitDoor(level.doors, wallById, world, 6 / vp.pxPerInch);
      if (doorId) {
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: doorId, hitWindowId: null, hitDimId: null,
          hitDragKind: null, hitDragId: null,
          shift: e.shiftKey,
        });
        return;
      }
      const winId = hitWindow(level.windows, wallById, world, 6 / vp.pxPerInch);
      if (winId) {
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: winId, hitDimId: null,
          hitDragKind: null, hitDragId: null,
          shift: e.shiftKey,
        });
        return;
      }
      // Small objects: dimension/label/stair/furniture/line. Selection happens
      // on click; drag-past-threshold also free-translates them (Select tool).
      const tol = 6 / vp.pxPerInch;
      // Section cuts are blue annotation overlays — high visual priority,
      // so test them BEFORE walls/etc. Cut clicks behave like other small
      // objects: select on click, drag past threshold to translate.
      const cutId = hitSectionCut(sectionCuts, world, tol);
      if (cutId) {
        if (e.shiftKey) {
          const exists = selections.some(s => s.kind === 'sectionCut' && s.id === cutId);
          onSelectionsChange(exists
            ? selections.filter(s => !(s.kind === 'sectionCut' && s.id === cutId))
            : [...selections, { kind: 'sectionCut', id: cutId }]);
        } else if (!selections.some(sel => sel.kind === 'sectionCut' && sel.id === cutId)) {
          onSelectionsChange([{ kind: 'sectionCut', id: cutId }]);
        }
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: null, hitDimId: null,
          hitDragKind: 'sectionCut', hitDragId: cutId, shift: e.shiftKey,
        });
        return;
      }
      const click = (kind: 'dimension' | 'roomLabel' | 'text' | 'stair' | 'furniture' | 'line', id: string) => {
        if (e.shiftKey) {
          const exists = selections.some(s => s.kind === kind && s.id === id);
          onSelectionsChange(exists
            ? selections.filter(s => !(s.kind === kind && s.id === id))
            : [...selections, { kind, id }]);
        } else if (!selections.some(sel => sel.kind === kind && sel.id === id)) {
          // Don't replace selection if the hit is already part of it — that
          // way grabbing one of multiple selected items drags them all.
          onSelectionsChange([{ kind, id }]);
        }
      };
      // Dimension lines are thin — give them a more generous click tolerance
      // (and the number sits a little off the line) so they're easy to grab.
      const dimId = hitDimension(level.dimensions, level, world, Math.max(tol, 14 / vp.pxPerInch));
      if (dimId) {
        // Plain selection. Shift+click adds the dim to the selection so it can be
        // co-selected with an element and driven from the Properties panel.
        click('dimension', dimId);
        // Set mouseDown WITH the dim id so a subsequent drag-past-threshold
        // can re-offset the dim (snap-to-parallel for alignment with others).
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: null, hitDimId: dimId,
          hitDragKind: null, hitDragId: null,
          shift: e.shiftKey,
        });
        return;
      }
      const lblId = hitRoomLabel(level.roomLabels, world, tol);
      if (lblId) {
        click('roomLabel', lblId);
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: null, hitDimId: null,
          hitDragKind: 'roomLabel', hitDragId: lblId, shift: e.shiftKey,
        });
        return;
      }
      const txtId = hitText(level.texts ?? [], world, tol);
      if (txtId) {
        click('text', txtId);
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: null, hitDimId: null,
          hitDragKind: 'text', hitDragId: txtId, shift: e.shiftKey,
        });
        return;
      }
      const stairId = hitStair(level.stairs, world, tol);
      if (stairId) {
        click('stair', stairId);
        // NB: no blocking confirm here — a window.confirm() inside mousedown
        // eats the mouseup, stranding the drag (stair stuck to the cursor with
        // no way to drop, Esc included). The cross-floor move warning lives in
        // the Move tool's click-to-commit flow instead, which is Esc-cancellable.
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: null, hitDimId: null,
          hitDragKind: 'stair', hitDragId: stairId, shift: e.shiftKey,
        });
        return;
      }
      const furnId = hitFurniture(level.furniture, world, tol);
      if (furnId) {
        click('furniture', furnId);
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: null, hitDimId: null,
          hitDragKind: 'furniture', hitDragId: furnId, shift: e.shiftKey,
        });
        return;
      }
      const lineId = hitLine(level.lines ?? [], world, tol);
      if (lineId) {
        click('line', lineId);
        setMouseDown({
          worldStart: world, screenStart: getScreen(e),
          hitWallId: null, hitDoorId: null, hitWindowId: null, hitDimId: null,
          hitDragKind: 'line', hitDragId: lineId, shift: e.shiftKey,
        });
        return;
      }
      const hit = hitWall(level.walls, world, 6 / vp.pxPerInch);
      setMouseDown({
        worldStart: world, screenStart: getScreen(e),
        hitWallId: hit ? hit.id : null, hitDoorId: null, hitWindowId: null, hitDimId: null,
        hitDragKind: hit ? 'wall' : null, hitDragId: hit ? hit.id : null,
        shift: e.shiftKey,
      });
      return;
    }
  };

  // ─── Mouse: move ──────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      setVp(s => ({
        ...s,
        pan: { x: panning.pan0.x + (e.clientX - panning.from.x), y: panning.pan0.y + (e.clientY - panning.from.y) },
      }));
      return;
    }
    const world = getWorld(e);
    setHoverWorld(world);
    onCursorChange(world);

    // Handle drag: snap and update the dragged wall's endpoint (non-sticky —
    // we do NOT move other walls that share the original endpoint).
    if (handleDrag) {
      const wall = level.walls.find(w => w.id === handleDrag.wallId);
      if (wall) {
        const otherEnd = handleDrag.end === 'start' ? wall.end : wall.start;
        let q = world;
        if (orthoOn) q = snapOrtho(otherEnd, q);
        const otherWalls = level.walls.filter(w => w.id !== handleDrag.wallId);
        const epSnapped = snapToWallEndpoint(q, otherWalls, 8 / vp.pxPerInch);
        if (epSnapped !== q) q = epSnapped;
        else {
          const midSnapped = snapToWallMidpoint(q, otherWalls, 8 / vp.pxPerInch);
          if (midSnapped !== q) q = midSnapped;
          else q = snapToGridOn ? snapToGrid(q, gridInches) : quantizeToBase(q);
        }
        onUpdateWalls([handleDrag.wallId], { [handleDrag.end]: q });
      }
      return;
    }

    if (drawing) {
      // Apply the same snap pipeline as the first click so the cursor end
      // snaps to wall endpoints, line features, etc. — gives the user a
      // sticky feel as they hover near snap targets.
      const snappedCursor = snap(world, drawing.start);
      setDrawing({ start: drawing.start, cursor: snappedCursor });
      return;
    }

    if (sectionDraft) {
      // Use the same snap pipeline so the section line endpoints can stick
      // to wall corners and the grid. The auto-orthogonal projection happens
      // at render time and at commit time — we keep the raw cursor here so
      // the user can see the dominant axis change as they cross over it.
      setSectionDraft({ start: sectionDraft.start, cursor: snap(world, sectionDraft.start) });
      return;
    }

    // Stair corner drag: translate the stair so the grabbed corner follows
    // the cursor. Optional snap to wall endpoints.
    if (stairCornerDrag) {
      const s = level.stairs.find(st => st.id === stairCornerDrag.stairId);
      if (s) {
        // Snap target to nearest wall endpoint within tolerance, else the 1/8" base.
        const epSnap = snapToWallEndpoint(world, level.walls, 10 / vp.pxPerInch);
        const snapped = epSnap === world ? quantizeToBase(world) : epSnap;
        // Rotate localCorner by stair.rotation to get the world offset from center.
        const cs = Math.cos(s.rotation), si = Math.sin(s.rotation);
        const lc = stairCornerDrag.localCorner;
        const offX = cs * lc.x - si * lc.y;
        const offY = si * lc.x + cs * lc.y;
        const newCenter = { x: snapped.x - offX, y: snapped.y - offY };
        onUpdateStairs([s.id], { position: newCenter });
      }
      return;
    }

    // Move tool: live-translate all selected entities so the dimensions
    // update in real time.
    if (moveState && tool === 'move') {
      // Compute the move delta. Typed length overrides cursor magnitude
      // (and angle if length@angle was typed).
      const parsed = parseLengthAngleInput(typedLength);
      let dx: number, dy: number;
      if (parsed != null) {
        let dirX: number, dirY: number;
        if (parsed.angle != null) {
          const a = -parsed.angle * Math.PI / 180;
          dirX = Math.cos(a); dirY = Math.sin(a);
        } else {
          const cursor = orthoOn ? snapOrtho(moveState.basePoint, world) : world;
          const cdx = cursor.x - moveState.basePoint.x;
          const cdy = cursor.y - moveState.basePoint.y;
          const L = Math.hypot(cdx, cdy);
          if (L > 0) { dirX = cdx / L; dirY = cdy / L; }
          else       { dirX = 1; dirY = 0; }
        }
        dx = dirX * parsed.length;
        dy = dirY * parsed.length;
      } else {
        // Snap target: wall outline corner / face midpoint / line endpoint /
        // midpoint, then wall centerline endpoint/midpoint, then SLIDE along a
        // wall face — so the grabbed handle drops onto a corner/endpoint or
        // slides flush down a wall edge. With no feature lock the delta is
        // quantized to 1/8" so moved entities stay on the base grid.
        let target = world;
        if (orthoOn) target = snapOrtho(moveState.basePoint, target);
        const ds = moveDropSnap(target);
        if (!ds.feature) {
          // free move — quantize the delta
          dx = quantizeInches(target.x - moveState.basePoint.x);
          dy = quantizeInches(target.y - moveState.basePoint.y);
        } else {
          // locked to existing geometry — keep the exact landing
          dx = ds.point.x - moveState.basePoint.x;
          dy = ds.point.y - moveState.basePoint.y;
        }
      }
      // Apply delta to each entity from its ORIGINAL position. Selected walls
      // translate rigidly. A stretched (connected) wall keeps its orientation:
      // its joined endpoint follows the full move while its far endpoint shifts
      // by only the PERPENDICULAR component of the move — so the wall slides
      // and changes length but never skews into a diagonal, and the joint
      // stays connected.
      const o = moveState.originals;
      for (const [id, spec] of o.walls) {
        if (spec.stretch) {
          const wdx = spec.end.x - spec.start.x, wdy = spec.end.y - spec.start.y;
          const wL = Math.hypot(wdx, wdy);
          let perpX = dx, perpY = dy;
          if (wL > 0) {
            const ux = wdx / wL, uy = wdy / wL;
            const along = dx * ux + dy * uy;
            perpX = dx - along * ux;
            perpY = dy - along * uy;
          }
          const newStart = spec.moveStart
            ? { x: spec.start.x + dx,    y: spec.start.y + dy }
            : { x: spec.start.x + perpX, y: spec.start.y + perpY };
          const newEnd = spec.moveEnd
            ? { x: spec.end.x + dx,    y: spec.end.y + dy }
            : { x: spec.end.x + perpX, y: spec.end.y + perpY };
          onUpdateWalls([id], { start: newStart, end: newEnd });
        } else {
          const newStart = spec.moveStart ? { x: spec.start.x + dx, y: spec.start.y + dy } : spec.start;
          const newEnd   = spec.moveEnd   ? { x: spec.end.x   + dx, y: spec.end.y   + dy } : spec.end;
          onUpdateWalls([id], { start: newStart, end: newEnd });
        }
      }
      // Dimensions: only translate the flagged 'free' anchors. Anchored ones
      // follow their referenced objects automatically — don't double-move
      // them. moveStart/moveEnd let a sticky dim move just its on-wall end.
      for (const [id, orig] of o.dimensions) {
        const dim = level.dimensions.find(d => d.id === id);
        if (!dim) continue;
        const newStart: DimAnchor = dim.start.kind === 'free' && orig.moveStart
          ? { kind: 'free', point: { x: orig.start.x + dx, y: orig.start.y + dy } }
          : dim.start;
        const newEnd: DimAnchor = dim.end.kind === 'free' && orig.moveEnd
          ? { kind: 'free', point: { x: orig.end.x + dx, y: orig.end.y + dy } }
          : dim.end;
        onUpdateDimensions([id], { start: newStart, end: newEnd });
      }
      for (const [id, orig] of o.labels)     onUpdateRoomLabels([id], { position: { x: orig.x + dx, y: orig.y + dy } });
      for (const [id, orig] of o.stairs)     onUpdateStairs([id],     { position: { x: orig.x + dx, y: orig.y + dy } });
      for (const [id, orig] of o.furniture)  onUpdateFurniture([id],  { position: { x: orig.x + dx, y: orig.y + dy } });
      for (const [id, orig] of o.lines) {
        onUpdateLines([id], {
          start: { x: orig.start.x + dx, y: orig.start.y + dy },
          end:   { x: orig.end.x   + dx, y: orig.end.y   + dy },
        });
      }
      // Openings slide ALONG their host wall — project the move delta onto
      // the wall's unit vector and add to positionAlong, clamped to the wall.
      const slideAlong = (spec: OpeningMoveSpec): number => {
        const proj = dx * spec.ux + dy * spec.uy;
        const proposed = spec.positionAlong + proj;
        return Math.max(spec.clearance, Math.min(spec.wallLen - spec.clearance, proposed));
      };
      for (const [id, spec] of o.doors)   onUpdateDoors([id],   { positionAlong: slideAlong(spec) });
      for (const [id, spec] of o.windows) onUpdateWindows([id], { positionAlong: slideAlong(spec) });
      return;
    }

    // Hover detection for grip cursor feedback.
    if ((tool === 'select' || (tool === 'move' && selections.length === 0)) && !mouseDown) {
      const handle = hitHandle(level.walls, selectedWallIds, world, 8 / vp.pxPerInch);
      if (handle?.wallId !== hoveredHandle?.wallId || handle?.end !== hoveredHandle?.end) {
        setHoveredHandle(handle);
      }
      // Hover detection for stair corners.
      const cornerHit = hitStairCorner(selectedStairs, world, 8 / vp.pxPerInch);
      if (cornerHit?.stairId !== hoveredStairCorner?.stairId ||
          cornerHit?.cornerIndex !== hoveredStairCorner?.cornerIndex) {
        setHoveredStairCorner(cornerHit);
      }
    }

    // Dim re-offset drag: cursor's perpendicular projection sets the new
    // offset, snapped to a parallel existing dim when close enough.
    if (dimOffsetDrag) {
      const d = level.dimensions.find(x => x.id === dimOffsetDrag.dimId);
      if (d) {
        const a = resolveDimAnchor(d.start, level);
        const b = resolveDimAnchor(d.end, level);
        if (a && b) {
          const dx = b.x - a.x, dy = b.y - a.y;
          const L = Math.hypot(dx, dy);
          if (L > 0) {
            const nx = -dy / L, ny = dx / L;
            let offset = (world.x - a.x) * nx + (world.y - a.y) * ny;
            const snapTolIn = 10 / vp.pxPerInch;
            const others = level.dimensions.filter(x => x.id !== d.id);
            offset = snapDimOffsetToParallel(a, b, offset, others, level, snapTolIn);
            onUpdateDimensions([d.id], { offset });
          }
        }
      }
      return;
    }

    // Opening (door or window) drag along its host wall.
    if (doorDrag) {
      const wall = level.walls.find(w => w.id === doorDrag.wallId);
      const opening = doorDrag.kind === 'door'
        ? level.doors.find(d => d.id === doorDrag.openingId)
        : level.windows.find(w => w.id === doorDrag.openingId);
      if (wall && opening) {
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const L = Math.hypot(dx, dy);
        if (L > 0) {
          const ux = dx / L, uy = dy / L;
          const cursorU = (world.x - wall.start.x) * ux + (world.y - wall.start.y) * uy;
          const proposed = doorDrag.startPositionAlong + (cursorU - doorDrag.startCursorU);
          let clearance = opening.width / 2;
          if (doorDrag.kind === 'door') {
            const door = opening as Door;
            if (door.doorType === 'entry' && door.sidePanels && door.sidePanels !== 'none') {
              const sw = door.sidePanelWidth ?? 14;
              const left = (door.sidePanels === 'left' || door.sidePanels === 'both') ? sw : 0;
              const right = (door.sidePanels === 'right' || door.sidePanels === 'both') ? sw : 0;
              clearance = Math.max(door.width / 2 + left, door.width / 2 + right);
            }
          }
          const clamped = Math.max(clearance, Math.min(L - clearance, proposed));
          // Snap to line-wall intersections: any line that crosses the host
          // wall produces a candidate positionAlong. Snap if the cursor is
          // within ~12 screen px of one.
          const snapTolIn = 12 / vp.pxPerInch;
          let snapped = clamped;
          let bestDelta = snapTolIn;
          for (const lineObj of (level.lines ?? [])) {
            const ix = segmentIntersection(wall.start, wall.end, lineObj.start, lineObj.end);
            if (!ix) continue;
            const t = (ix.x - wall.start.x) * ux + (ix.y - wall.start.y) * uy;
            if (t < clearance || t > L - clearance) continue;
            const delta = Math.abs(t - clamped);
            if (delta < bestDelta) { bestDelta = delta; snapped = t; }
          }
          // No line-intersection snap: coarse 6" grid if the toggle is on,
          // else the 1/8" base — then re-clamp so quantizing can't push the
          // opening past its clearance at the wall ends.
          if (snapped === clamped) {
            snapped = snapToGridOn ? Math.round(clamped / 6) * 6 : quantizeInches(clamped);
            snapped = Math.max(clearance, Math.min(L - clearance, snapped));
          }
          if (doorDrag.kind === 'door') onUpdateDoors([doorDrag.openingId], { positionAlong: snapped });
          else                          onUpdateWindows([doorDrag.openingId], { positionAlong: snapped });
        }
      }
      return;
    }

    if (mouseDown && (tool === 'select' || (tool === 'move' && selections.length === 0))) {
      const cur = getScreen(e);
      const moved = Math.hypot(cur.x - mouseDown.screenStart.x, cur.y - mouseDown.screenStart.y);
      if (moved > DRAG_THRESHOLD_PX) {
        // Dim drag-to-re-offset.
        if (mouseDown.hitDimId) {
          onBeginLiveOp();
          setDimOffsetDrag({ dimId: mouseDown.hitDimId });
          setMouseDown(null);
          return;
        }
        // Door or window drag along its host wall.
        const draggedOpening = mouseDown.hitDoorId
          ? { kind: 'door' as const,   opening: level.doors  .find(d => d.id === mouseDown.hitDoorId),   id: mouseDown.hitDoorId }
          : mouseDown.hitWindowId
          ? { kind: 'window' as const, opening: level.windows.find(w => w.id === mouseDown.hitWindowId), id: mouseDown.hitWindowId }
          : null;
        if (draggedOpening && draggedOpening.opening) {
          const op = draggedOpening.opening;
          const wall = level.walls.find(w => w.id === op.wallId);
          if (wall) {
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const L = Math.hypot(dx, dy);
            if (L > 0) {
              const ux = dx / L, uy = dy / L;
              const startU = (mouseDown.worldStart.x - wall.start.x) * ux + (mouseDown.worldStart.y - wall.start.y) * uy;
              onBeginLiveOp();
              setDoorDrag({
                kind: draggedOpening.kind,
                openingId: draggedOpening.id,
                wallId: wall.id,
                startPositionAlong: op.positionAlong,
                startCursorU: startU,
              });
              if (!selections.some(s => s.kind === draggedOpening.kind && s.id === draggedOpening.id)) {
                onSelectionsChange([{ kind: draggedOpening.kind, id: draggedOpening.id }]);
              }
            }
          }
        } else if (mouseDown.hitDragKind && mouseDown.hitDragId) {
          // Free-translate drag for furniture/stair/roomLabel/line/wall.
          // Walls aren't selected on mousedown (that happens on mouseup-as-
          // click), so make sure the wall is in the selection before drag.
          let sel = selections;
          const hitInSelection = sel.some(s => s.kind === mouseDown.hitDragKind && s.id === mouseDown.hitDragId);
          if (!hitInSelection) {
            sel = [{ kind: mouseDown.hitDragKind, id: mouseDown.hitDragId }];
            onSelectionsChange(sel);
          }
          // Capture originals for every selected entity that can free-translate.
          const originals: DirectDragOriginals = {
            walls: new Map(), furniture: new Map(), stairs: new Map(),
            roomLabels: new Map(), texts: new Map(), lines: new Map(), sectionCuts: new Map(),
            dimensions: new Map(),
          };
          for (const s of sel) {
            if (s.kind === 'wall') {
              const w = level.walls.find(x => x.id === s.id);
              if (w) originals.walls.set(w.id, { start: { ...w.start }, end: { ...w.end } });
            } else if (s.kind === 'furniture') {
              const f = level.furniture.find(x => x.id === s.id);
              if (f) originals.furniture.set(f.id, { ...f.position });
            } else if (s.kind === 'stair') {
              const st = level.stairs.find(x => x.id === s.id);
              if (st) originals.stairs.set(st.id, { ...st.position });
            } else if (s.kind === 'roomLabel') {
              const r = level.roomLabels.find(x => x.id === s.id);
              if (r) originals.roomLabels.set(r.id, { ...r.position });
            } else if (s.kind === 'text') {
              const t = (level.texts ?? []).find(x => x.id === s.id);
              if (t) originals.texts.set(t.id, { ...t.position });
            } else if (s.kind === 'line') {
              const ln = (level.lines ?? []).find(x => x.id === s.id);
              if (ln) originals.lines.set(ln.id, { start: { ...ln.start }, end: { ...ln.end } });
            } else if (s.kind === 'sectionCut') {
              const c = sectionCuts.find(x => x.id === s.id);
              if (c) originals.sectionCuts.set(c.id, {
                position: c.position, start: c.start, end: c.end, axis: c.axis,
              });
            }
          }
          // STICKY DIMS: free dim endpoints resting on a dragged wall ride
          // along (and update live), so the dim doesn't skew when only its
          // anchored end follows. Walls free-translate fully here, so a
          // point-on-wall test is enough; flags keep an off-wall free end put.
          const draggedWalls: Wall[] = [];
          for (const id of originals.walls.keys()) {
            const w = level.walls.find(x => x.id === id);
            if (w) draggedWalls.push(w);
          }
          if (draggedWalls.length > 0) {
            const TOL = 2; // inches of slop beyond the wall face/ends
            const onDraggedWall = (p: Vec2) =>
              draggedWalls.some(w => pointOnWallBody(p, w, TOL));
            for (const d of level.dimensions) {
              const startFree = d.start.kind === 'free' && onDraggedWall(d.start.point);
              const endFree = d.end.kind === 'free' && onDraggedWall(d.end.point);
              if (!startFree && !endFree) continue;
              const a = resolveDimAnchor(d.start, level);
              const b = resolveDimAnchor(d.end, level);
              if (a && b) originals.dimensions.set(d.id, { start: a, end: b, moveStart: startFree, moveEnd: endFree });
            }
          }
          onBeginLiveOp();
          setDirectDrag({ worldStart: mouseDown.worldStart, originals });
          setMouseDown(null);
          return;
        } else if (mouseDown.hitWallId == null) {
          setDragBox({ start: mouseDown.worldStart, end: world, additive: mouseDown.shift });
        }
      }
    }

    // Active direct drag: apply delta to every captured entity.
    if (directDrag) {
      const dx = world.x - directDrag.worldStart.x;
      const dy = world.y - directDrag.worldStart.y;
      for (const [id, orig] of directDrag.originals.walls) {
        onUpdateWalls([id], {
          start: { x: orig.start.x + dx, y: orig.start.y + dy },
          end:   { x: orig.end.x   + dx, y: orig.end.y   + dy },
        });
      }
      for (const [id, orig] of directDrag.originals.furniture)
        onUpdateFurniture([id], { position: { x: orig.x + dx, y: orig.y + dy } });
      for (const [id, orig] of directDrag.originals.stairs)
        onUpdateStairs([id], { position: { x: orig.x + dx, y: orig.y + dy } });
      for (const [id, orig] of directDrag.originals.texts)
        onUpdateTexts([id], { position: { x: orig.x + dx, y: orig.y + dy } });
      for (const [id, orig] of directDrag.originals.roomLabels)
        onUpdateRoomLabels([id], { position: { x: orig.x + dx, y: orig.y + dy } });
      for (const [id, orig] of directDrag.originals.lines)
        onUpdateLines([id], {
          start: { x: orig.start.x + dx, y: orig.start.y + dy },
          end:   { x: orig.end.x   + dx, y: orig.end.y   + dy },
        });
      for (const [id, orig] of directDrag.originals.dimensions) {
        const dim = level.dimensions.find(d => d.id === id);
        if (!dim) continue;
        const newStart: DimAnchor = dim.start.kind === 'free' && orig.moveStart
          ? { kind: 'free', point: { x: orig.start.x + dx, y: orig.start.y + dy } }
          : dim.start;
        const newEnd: DimAnchor = dim.end.kind === 'free' && orig.moveEnd
          ? { kind: 'free', point: { x: orig.end.x + dx, y: orig.end.y + dy } }
          : dim.end;
        onUpdateDimensions([id], { start: newStart, end: newEnd });
      }
      for (const [id, orig] of directDrag.originals.sectionCuts) {
        // Orthogonal cuts translate as a unit: the perpendicular axis
        // shifts `position`, and the parallel axis shifts both `start` and
        // `end` equally (preserves the cut's length).
        const para = orig.axis === 'x' ? dx : dy;
        const perp = orig.axis === 'x' ? dy : dx;
        onUpdateSectionCuts([id], {
          position: orig.position + perp,
          start:    orig.start    + para,
          end:      orig.end      + para,
        });
      }
    }

    if (dragBox) setDragBox({ ...dragBox, end: world });
  };

  // ─── Mouse: up ────────────────────────────────────────────────────────────
  const handleMouseUp = () => {
    if (panning) { setPanning(null); return; }

    if (sectionDraft) {
      // Commit the section draft as a SectionCut, auto-orthogonalized to
      // whichever axis (X or Y) has the larger drag delta. The cut line
      // is placed at the start's perpendicular coordinate, spans from
      // start to cursor along the parallel axis, and faces +1 by default
      // (the user can flip facing later via a per-cut flip control).
      const { start, cursor } = sectionDraft;
      const dxAbs = Math.abs(cursor.x - start.x);
      const dyAbs = Math.abs(cursor.y - start.y);
      const minSpan = 12; // inches — discard zero/near-zero drags
      if (Math.max(dxAbs, dyAbs) >= minSpan) {
        // dxAbs >= dyAbs ⇒ horizontal cut line ⇒ axis='x' (runs along X at
        // fixed Y = start.y). Otherwise vertical cut line at fixed X.
        const horizontal = dxAbs >= dyAbs;
        const axis: 'x' | 'y' = horizontal ? 'x' : 'y';
        const position = horizontal ? start.y : start.x;
        const a = horizontal ? start.x  : start.y;
        const b = horizontal ? cursor.x : cursor.y;
        const cut: SectionCut = {
          id: makeId('cut'),
          name: nextSectionCutName(sectionCuts),
          axis,
          position,
          start: Math.min(a, b),
          end:   Math.max(a, b),
          facing: 1,
        };
        onAddSectionCut(cut);
      }
      setSectionDraft(null);
      return;
    }

    if (handleDrag) {
      onEndLiveOp();
      setHandleDrag(null);
      return;
    }
    if (stairCornerDrag) {
      onEndLiveOp();
      setStairCornerDrag(null);
      return;
    }

    if (doorDrag) {
      onEndLiveOp();
      setDoorDrag(null);
      setMouseDown(null);
      return;
    }

    if (dimOffsetDrag) {
      onEndLiveOp();
      setDimOffsetDrag(null);
      return;
    }

    if (directDrag) {
      onEndLiveOp();
      setDirectDrag(null);
      setMouseDown(null);
      return;
    }

    if (dragBox) {
      const windowMode = dragBox.end.x >= dragBox.start.x;
      const box = normalizeBox(dragBox.start, dragBox.end);
      const hits = computeBoxHits(box, windowMode);
      if (dragBox.additive) {
        const key = (s: Selection) => `${s.kind}:${s.id}`;
        const seen = new Set(selections.map(key));
        const merged: Selection[] = [...selections];
        for (const c of hits) if (!seen.has(key(c))) merged.push(c);
        onSelectionsChange(merged);
      } else {
        onSelectionsChange(hits);
      }
      setDragBox(null);
      setMouseDown(null);
      return;
    }

    // No drag → treat as a click.
    if (mouseDown && (tool === 'select' || (tool === 'move' && selections.length === 0))) {
      const click = (kind: 'wall' | 'door' | 'window', id: string) => {
        if (mouseDown.shift) {
          const exists = selections.some(s => s.kind === kind && s.id === id);
          onSelectionsChange(exists
            ? selections.filter(s => !(s.kind === kind && s.id === id))
            : [...selections, { kind, id }]);
        } else {
          onSelectionsChange([{ kind, id }]);
        }
      };
      if      (mouseDown.hitDoorId)   click('door',   mouseDown.hitDoorId);
      else if (mouseDown.hitWindowId) click('window', mouseDown.hitWindowId);
      else if (mouseDown.hitWallId)   click('wall',   mouseDown.hitWallId);
      // hitDragKind covers furniture/stair/roomLabel/line/sectionCut — those
      // were already added to the selection on mousedown, so a click-without-
      // drag is a no-op here (DON'T fall through into the "empty space"
      // branch below or we'd wipe out the selection we just made).
      else if (mouseDown.hitDragKind) { /* no-op: selection already set */ }
      // Dimensions are selected on mousedown (so a drag can re-offset them);
      // a click-without-drag must preserve that, not fall through and clear it.
      else if (mouseDown.hitDimId)    { /* no-op: dim selection already set */ }
      else if (!mouseDown.shift)      onSelectionsChange([]);
    }
    setMouseDown(null);
  };

  const handleMouseLeave = () => {
    setHoverWorld(null);
    onCursorChange(null);
    if (panning) setPanning(null);
    setDragBox(null);
    setMouseDown(null);
    setHandleDrag(null);
    setHoveredHandle(null);
    setDoorDrag(null);
    setStairCornerDrag(null);
    setHoveredStairCorner(null);
    if (directDrag) { onEndLiveOp(); setDirectDrag(null); }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (drawing) { setDrawing(null); setTypedLength(''); }
  };

  // ─── Zoom ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
      setVp(s => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newPxPerInch = Math.min(20, Math.max(0.25, s.pxPerInch * factor));
        const worldX = (screen.x - s.pan.x - s.width / 2) / s.pxPerInch;
        const worldY = (screen.y - s.pan.y - s.height / 2) / s.pxPerInch;
        const newPanX = screen.x - worldX * newPxPerInch - s.width / 2;
        const newPanY = screen.y - worldY * newPxPerInch - s.height / 2;
        onZoomChange(newPxPerInch);
        return { ...s, pxPerInch: newPxPerInch, pan: { x: newPanX, y: newPanY } };
      });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onZoomChange]);

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;

      // Boundary-draft input: Enter commits, Backspace pops the last vertex.
      if (boundaryDraftRoomId) {
        if (e.key === 'Enter' && boundaryPoints.length >= 3) {
          onCommitBoundary(boundaryDraftRoomId, boundaryPoints);
          setBoundaryPoints([]);
          e.preventDefault();
          return;
        }
        if (e.key === 'Backspace' && boundaryPoints.length > 0) {
          setBoundaryPoints(p => p.slice(0, -1));
          e.preventDefault();
          return;
        }
      }

      // Global Esc: clear any transient state, then drop back to Select.
      if (e.key === 'Escape') {
        // Safety: cancel any armed body/corner drag so nothing can get stuck
        // following the cursor (e.g. if a drag's mouseup was ever lost).
        if (mouseDown || stairCornerDrag) {
          if (stairCornerDrag) onCancelLiveOp();
          setMouseDown(null);
          setStairCornerDrag(null);
          return;
        }
        if (boundaryDraftRoomId) {
          setBoundaryPoints([]);
          onCancelBoundaryDraft();
          return;
        }
        if (typedLength) { setTypedLength(''); return; }
        if (drawing) { setDrawing(null); return; }
        if (filletFirst) { setFilletFirst(null); return; }
        if (offsetSource) { setOffsetSource(null); return; }
        if (dimDraft.start || dimDraft.end) { setDimDraft({ start: null, end: null }); return; }
        if (moveState) {
          // Cancel: restore every tracked entity (incl. stretched walls).
          // The cancel itself shouldn't create a history entry — drop the
          // pre-move snapshot we pushed at beginLiveOp.
          onCancelLiveOp();
          const o = moveState.originals;
          for (const [id, spec] of o.walls)      onUpdateWalls([id],      { start: spec.start, end: spec.end });
          for (const [id, orig] of o.dimensions) {
            const dim = level.dimensions.find(d => d.id === id);
            if (!dim) continue;
            const restoredStart: DimAnchor = dim.start.kind === 'free' ? { kind: 'free', point: orig.start } : dim.start;
            const restoredEnd:   DimAnchor = dim.end.kind === 'free'   ? { kind: 'free', point: orig.end   } : dim.end;
            onUpdateDimensions([id], { start: restoredStart, end: restoredEnd });
          }
          for (const [id, orig] of o.labels)     onUpdateRoomLabels([id], { position: orig });
          for (const [id, orig] of o.stairs)     onUpdateStairs([id],     { position: orig });
          for (const [id, orig] of o.furniture)  onUpdateFurniture([id],  { position: orig });
          for (const [id, orig] of o.lines)      onUpdateLines([id], { start: orig.start, end: orig.end });
          setMoveState(null);
          return;
        }
        if (tool !== 'select') onChangeTool('select');
        return;
      }

      if (drawing) {
        if (e.key === 'Enter' && effectiveEnd) {
          if (dist(drawing.start, effectiveEnd) > 0.5) {
            if (tool === 'line') {
              onAddLine({
                id: makeId('line'), levelId: level.id,
                start: drawing.start, end: effectiveEnd,
                style: defaultLineStyle, weight: defaultLineWeight, color: defaultLineColor,
              });
            } else {
              onAddWall({
                id: makeId('wall'), levelId: level.id,
                start: drawing.start, end: effectiveEnd,
                thickness: defaultWallThickness, height: defaultWallHeight, type: defaultWallType, status: defaultWallStatus,
              });
            }
          }
          setDrawing({ start: effectiveEnd, cursor: effectiveEnd });
          setTypedLength('');
          return;
        }
        if (e.key === 'Backspace') {
          setTypedLength(s => s.slice(0, -1));
          e.preventDefault();
          return;
        }
        // Digits, decimal point, feet/inches marks, polar syntax (@, <, -, space).
        if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === "'" || e.key === '"' ||
            e.key === '@' || e.key === '<' || e.key === '-' || e.key === ' ') {
          setTypedLength(s => s + e.key);
          return;
        }
        return;
      }

      // Move tool: digits feed the move distance (and @angle if provided).
      if (tool === 'move' && moveState) {
        if (e.key === 'Backspace') { setTypedLength(s => s.slice(0, -1)); e.preventDefault(); return; }
        if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === "'" || e.key === '"' ||
            e.key === '@' || e.key === '<' || e.key === '-' || e.key === ' ') {
          setTypedLength(s => s + e.key);
          return;
        }
        if (e.key === 'Enter') {
          // Commit at current position (already updated live).
          onEndLiveOp();
          setMoveState(null);
          setTypedLength('');
          return;
        }
      }

      // Offset tool: digits feed the distance.
      if (tool === 'offset' && offsetSource) {
        // Enter places the offset at the current distance (typed or dragged) —
        // no mouse click needed.
        if (e.key === 'Enter') { e.preventDefault(); commitOffset(); return; }
        if (e.key === 'Backspace') {
          setTypedLength(s => s.slice(0, -1));
          e.preventDefault();
          return;
        }
        if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === "'" || e.key === '"') {
          setTypedLength(s => s + e.key);
          return;
        }
      }

      // F: flip the facing of every selected section cut (no-op if none).
      if (e.key === 'f' || e.key === 'F') {
        const cutIds = selections.filter(s => s.kind === 'sectionCut').map(s => s.id);
        if (cutIds.length > 0) {
          for (const cid of cutIds) {
            const c = sectionCuts.find(x => x.id === cid);
            if (!c) continue;
            onUpdateSectionCuts([cid], { facing: (c.facing === 1 ? -1 : 1) });
          }
          e.preventDefault();
          return;
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selections.length > 0) onDeleteSelections();

      // Arrow-key nudge for selected entities. 1" per press, 12" with Shift.
      // Walls, furniture, stairs, room labels, and lines all translate;
      // doors/windows are anchored to walls and dimensions follow their
      // anchors, so they're skipped (they ride along automatically when a
      // host wall is nudged).
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (selections.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 12 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
        for (const s of selections) {
          if (s.kind === 'wall') {
            const w = level.walls.find(x => x.id === s.id);
            if (w) onUpdateWalls([w.id], {
              start: { x: w.start.x + dx, y: w.start.y + dy },
              end:   { x: w.end.x   + dx, y: w.end.y   + dy },
            });
          } else if (s.kind === 'furniture') {
            const f = level.furniture.find(x => x.id === s.id);
            if (f) onUpdateFurniture([f.id], { position: { x: f.position.x + dx, y: f.position.y + dy } });
          } else if (s.kind === 'stair') {
            const st = level.stairs.find(x => x.id === s.id);
            if (st) onUpdateStairs([st.id], { position: { x: st.position.x + dx, y: st.position.y + dy } });
          } else if (s.kind === 'roomLabel') {
            const r = level.roomLabels.find(x => x.id === s.id);
            if (r) onUpdateRoomLabels([r.id], { position: { x: r.position.x + dx, y: r.position.y + dy } });
          } else if (s.kind === 'text') {
            const t = (level.texts ?? []).find(x => x.id === s.id);
            if (t) onUpdateTexts([t.id], { position: { x: t.position.x + dx, y: t.position.y + dy } });
          } else if (s.kind === 'line') {
            const ln = (level.lines ?? []).find(x => x.id === s.id);
            if (ln) onUpdateLines([ln.id], {
              start: { x: ln.start.x + dx, y: ln.start.y + dy },
              end:   { x: ln.end.x   + dx, y: ln.end.y   + dy },
            });
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, effectiveEnd, typedLength, selections, onAddWall, onAddLine, onDeleteSelections,
      defaultWallThickness, defaultWallHeight, defaultWallType, defaultWallStatus, level,
      defaultLineStyle, defaultLineWeight, defaultLineColor,
      tool, offsetSource, dimDraft, onChangeTool, moveState, commitOffset,
      onUpdateWalls, onUpdateDimensions, onUpdateRoomLabels, onUpdateTexts, onUpdateStairs, onUpdateFurniture, onUpdateLines,
      onEndLiveOp, onCancelLiveOp, sectionCuts, onUpdateSectionCuts,
      filletFirst, mouseDown, stairCornerDrag,
      boundaryDraftRoomId, boundaryPoints, onCommitBoundary, onCancelBoundaryDraft]);

  // ─── Typed-length tag ─────────────────────────────────────────────────────
  const tagPos = useMemo(() => {
    if (!drawing || !effectiveEnd) return null;
    const viewport: Viewport = { pan: vp.pan, pxPerInch: vp.pxPerInch, width: vp.width, height: vp.height };
    const mid = { x: (drawing.start.x + effectiveEnd.x) / 2, y: (drawing.start.y + effectiveEnd.y) / 2 };
    return worldToScreen(mid, viewport);
  }, [drawing, effectiveEnd, vp]);

  const liveLength = useMemo(() => {
    if (!drawing || !effectiveEnd) return 0;
    return dist(drawing.start, effectiveEnd);
  }, [drawing, effectiveEnd]);

  // Screen position of the offset preview wall's midpoint, for the floating tag.
  const offsetSourceTagPos = useMemo(() => {
    if (!offsetPreview) return null;
    const viewport: Viewport = { pan: vp.pan, pxPerInch: vp.pxPerInch, width: vp.width, height: vp.height };
    const mid = {
      x: (offsetPreview.start.x + offsetPreview.end.x) / 2,
      y: (offsetPreview.start.y + offsetPreview.end.y) / 2,
    };
    return worldToScreen(mid, viewport);
  }, [offsetPreview, vp]);

  // Move tool: floating tag showing the current move magnitude.
  const moveTagInfo = useMemo(() => {
    if (!moveState || !hoverWorld) return null;
    const viewport: Viewport = { pan: vp.pan, pxPerInch: vp.pxPerInch, width: vp.width, height: vp.height };
    const dx = hoverWorld.x - moveState.basePoint.x;
    const dy = hoverWorld.y - moveState.basePoint.y;
    const distance = Math.hypot(dx, dy);
    return { screen: worldToScreen(hoverWorld, viewport), distance };
  }, [moveState, hoverWorld, vp]);

  const cursor = panning ? 'grabbing'
    : handleDrag ? 'grabbing'
    : stairCornerDrag ? 'grabbing'
    : hoveredHandle ? 'grab'
    : hoveredStairCorner ? 'grab'
    : tool === 'wall' ? 'crosshair'
    : tool === 'offset' ? 'crosshair'
    : tool === 'move' ? 'crosshair'
    : tool === 'door' ? 'crosshair'
    : tool === 'window' ? 'crosshair'
    : tool === 'dimension' ? 'crosshair'
    : tool === 'room-label' ? 'crosshair'
    : tool === 'text' ? 'crosshair'
    : tool === 'stair' ? 'crosshair'
    : tool === 'furniture' ? 'crosshair'
    : tool === 'line' ? LINE_APERTURE_CURSOR
    : tool === 'trim' ? 'crosshair'
    : tool === 'extend' ? 'crosshair'
    : tool === 'fillet' ? 'crosshair'
    : tool === 'mirror' ? 'crosshair'
    : tool === 'section' ? 'crosshair'
    : tool === 'erase' ? 'crosshair'
    : tool === 'select' ? 'default'
    : 'cell';

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{ width: vp.width, height: vp.height, display: 'block', cursor }}
      />

      {floorBelow && (
        <label style={{
          position: 'absolute', top: 12, right: 12,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-sans-serif, system-ui',
          borderRadius: 6, boxShadow: T.shadow, cursor: 'pointer', userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={showFloorBelow}
            onChange={e => setShowFloorBelow(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Show floor below ({floorBelow.name})
        </label>
      )}

      {drawing && tagPos && (
        <div style={{
          position: 'absolute', left: tagPos.x, top: tagPos.y,
          transform: 'translate(-50%, calc(-100% - 12px))',
          padding: '6px 10px',
          background: T.ink, color: '#fff',
          fontSize: 12, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <span style={{
            color: typedLength ? T.warm : '#fff',
            fontWeight: typedLength ? 700 : 500,
          }}>
            {typedLength || formatImperial(liveLength)}
          </span>
          {typedLength && (
            <span style={{ color: 'rgba(255,255,255,0.55)', marginLeft: 8 }}>↵ to set</span>
          )}
        </div>
      )}

      {drawing && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.92)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow,
        }}>
          Click to place · type length or length@angle (e.g. 120@45) + Enter · Right-click or Esc to finish
        </div>
      )}

      {!drawing && tool === 'select' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow, pointerEvents: 'none',
          opacity: dragBox ? 1 : 0.7,
        }}>
          {dragBox
            ? (dragBox.end.x >= dragBox.start.x
                ? 'Window — only fully enclosed walls'
                : 'Crossing — anything the box touches')
            : 'Click a wall · drag a box · shift+click to add'}
        </div>
      )}

      {tool === 'door' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow, pointerEvents: 'none',
        }}>
          {doorGhost
            ? 'Click to place door · select to edit flip/swing afterward'
            : 'Hover over a wall to place a door'}
        </div>
      )}

      {tool === 'window' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow, pointerEvents: 'none',
        }}>
          {windowGhost
            ? 'Click to place window · select to edit afterward'
            : 'Hover over a wall to place a window'}
        </div>
      )}

      {tool === 'section' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 8px 6px 12px',
          background: 'rgba(31,37,64,0.9)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ pointerEvents: 'none' }}>
            {sectionDraft ? 'Release to place the section line' : 'Drag across the building to cut a section'}
          </span>
          {onAutoPlaceSection && (
            <button
              type="button"
              onClick={onAutoPlaceSection}
              title="Place the primary section automatically — transverse across the main ridge, through the widest bay that doesn't run along a parallel wall or cross a valley/hip (and avoids doors/windows where it can)."
              style={{
                pointerEvents: 'auto', cursor: 'pointer', whiteSpace: 'nowrap',
                background: T.accent, color: '#fff', border: 'none', borderRadius: 4,
                padding: '4px 9px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              }}
            >⌖ Auto primary section</button>
          )}
        </div>
      )}

      {tool === 'move' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow, pointerEvents: 'none',
        }}>
          {selections.length === 0
            ? 'Select something first, then click base point'
            : moveState
              ? 'Click to place · type distance (or distance@angle) · Esc to cancel'
              : 'Click a base point to start moving the selection'}
        </div>
      )}

      {tool === 'extend' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow, pointerEvents: 'none',
        }}>
          {extendHover
            ? 'Click to extend to the boundary'
            : 'Hover a wall or line near the end you want to grow'}
        </div>
      )}

      {tool === 'fillet' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow, pointerEvents: 'none',
        }}>
          {filletFirst
            ? 'Click the second wall/line — they join at the corner'
            : 'Click the first wall/line (the side to keep)'}
        </div>
      )}

      {tool === 'mirror' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 8px',
          background: 'rgba(31,37,64,0.9)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ pointerEvents: 'none' }}>Mirror axis:</span>
          {([['y', 'Vertical'], ['x', 'Horizontal']] as const).map(([ax, label]) => (
            <button
              key={ax}
              type="button"
              onClick={() => setMirrorAxis(ax)}
              style={{
                pointerEvents: 'auto', cursor: 'pointer', fontFamily: 'inherit',
                padding: '3px 9px', fontSize: 11, fontWeight: 700, borderRadius: 4,
                border: mirrorAxis === ax ? `1px solid ${T.accent}` : '1px solid rgba(255,255,255,0.3)',
                background: mirrorAxis === ax ? T.accent : 'transparent', color: '#fff',
              }}
            >{label}</button>
          ))}
          <span style={{ pointerEvents: 'none', color: 'rgba(255,255,255,0.6)' }}>
            {selections.some(s => s.kind === 'line' || s.kind === 'wall') ? 'click to place axis' : 'select walls or lines first'}
          </span>
        </div>
      )}

      {moveTagInfo && (
        <div style={{
          position: 'absolute', left: moveTagInfo.screen.x, top: moveTagInfo.screen.y,
          transform: 'translate(-50%, calc(-100% - 12px))',
          padding: '6px 10px',
          background: T.ink, color: '#fff',
          fontSize: 12, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: typedLength ? T.warm : '#fff', fontWeight: typedLength ? 700 : 500 }}>
            {typedLength || formatImperial(moveTagInfo.distance)}
          </span>
          {typedLength && <span style={{ color: 'rgba(255,255,255,0.55)', marginLeft: 8 }}>↵ to set</span>}
        </div>
      )}

      {tool === 'offset' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '6px 12px',
          background: 'rgba(31,37,64,0.85)', color: '#fff',
          fontSize: 11, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow, pointerEvents: 'none',
        }}>
          {offsetSource
            ? 'Drag to set distance (snaps to walls) and click · or type a distance + Enter · Esc to cancel'
            : 'Click a wall or line to offset'}
        </div>
      )}

      {offsetPreview && offsetSourceTagPos && (
        <div style={{
          position: 'absolute', left: offsetSourceTagPos.x, top: offsetSourceTagPos.y,
          transform: 'translate(-50%, calc(-100% - 12px))',
          padding: '6px 10px',
          background: T.ink, color: '#fff',
          fontSize: 12, fontFamily: 'ui-monospace, monospace',
          borderRadius: 6, boxShadow: T.shadow,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <span style={{
            color: typedLength ? T.warm : offsetPreview.snapped ? T.accent : '#fff',
            fontWeight: (typedLength || offsetPreview.snapped) ? 700 : 500,
          }}>
            {formatImperial(offsetPreview.distance)}
          </span>
          {typedLength
            ? <span style={{ color: 'rgba(255,255,255,0.55)', marginLeft: 8 }}>↵ to place</span>
            : offsetPreview.snapped
            ? <span style={{ color: 'rgba(255,255,255,0.55)', marginLeft: 8 }}>aligned</span>
            : null}
        </div>
      )}

      {boundaryDraftRoomId && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 14px',
          background: 'rgba(37,99,235,0.94)', color: '#fff',
          fontSize: 12, fontFamily: 'ui-sans-serif, system-ui',
          borderRadius: 8, boxShadow: T.shadow,
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <strong style={{ marginRight: 8 }}>Draw room boundary</strong>
          Click each corner ·{' '}
          {boundaryPoints.length >= 3
            ? <>click first vertex (or <kbd style={{ background:'#fff', color:'#1f2540', borderRadius:3, padding:'0 4px' }}>Enter</kbd>) to close · </>
            : <>need at least 3 points · </>}
          <kbd style={{ background:'#fff', color:'#1f2540', borderRadius:3, padding:'0 4px' }}>Backspace</kbd> undo ·{' '}
          <kbd style={{ background:'#fff', color:'#1f2540', borderRadius:3, padding:'0 4px' }}>Esc</kbd> cancel
          {boundaryPoints.length >= 3 && (
            <span style={{ marginLeft: 12, padding: '2px 8px', background: 'rgba(255,255,255,0.18)', borderRadius: 4 }}>
              ≈ {polygonAreaSqFt(boundaryPoints).toLocaleString()} sf
            </span>
          )}
        </div>
      )}

      {hoverWorld == null && !drawing && level.walls.length === 0 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          color: T.inkMuted, fontSize: 13, fontFamily: 'ui-sans-serif, system-ui',
          textAlign: 'center', pointerEvents: 'none', lineHeight: 1.6,
        }}>
          Select the <strong style={{ color: T.inkSoft }}>Wall</strong> tool from the palette,<br />
          then click two points on the canvas to draw a wall.
        </div>
      )}
    </div>
  );
}
