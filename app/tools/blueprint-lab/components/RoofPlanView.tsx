'use client';

// Roof Plan view. Starts BLANK — students draw their own ridge beams and
// valley pads on top of the building footprint (perimeter + overhang from
// the spec sheet). Same line / dim / text / offset / trim tools the
// Section view exposes, plus a Ridge Beam tool (bold solid line) and a
// Valley tool (bold dashed line).
//
// All user-drawn marks are SectionPrimitive[] stored on `project.roof.drafting`.
// Snap / hit-test / render reuse the shared engine modules so behaviour
// matches the Section view exactly. Footprint geometry (eave / wallOuter /
// centerline) is injected as synthetic background primitives during snap
// resolution so endpoints, midpoints, and edges of the building snap too.

import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';

import {
  Level, PrimLine, PrimText, Project, SectionLineStyle, SectionPrimitive, ToolId, Vec2,
  formatImperial,
} from '../engine/types';
import { bboxOf, buildRoofFootprint, deriveExteriorWallIds, RoofFootprint } from '../engine/roof';
import { wallPolygon } from '../engine/geometry';
import {
  findSnap, drawSnapIndicator, SnapResult,
} from '../engine/sectionSnap';
import {
  computeBoxSelection,
  drawDimGhost, drawLineGhost, drawLineHandles,
  drawOffsetSource, drawSelectionBox, drawSelectionOverlay,
  hitTestLineHandle, hitTestTopmost,
  makeUserDimLinear, makeUserLine, makeUserPrimId, makeUserText,
  signedPerpendicularOffset,
} from '../engine/sectionEdit';
import { renderSectionPrimitives, Projector } from '../engine/sectionPrimitives';
import { T } from '../engine/theme';

// Plan area of a closed polygon (shoelace), in² — used only to compare floor
// footprint sizes (setback detection / overlay), so absolute units don't matter.
function polygonAreaOf(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(a) / 2;
}

// Line-type sub-tool. The Line tool is one button in the left palette;
// while it's active, the roof toolbar shows a Line-Type picker so the user
// chooses whether they're drawing a Ridge Beam, a Valley Pad, or a plain
// construction line. The choice maps to a `SectionLineStyle` on the
// emitted PrimLine and drives the heavy/dashed rendering in
// `drawPrimLine` (see engine/sectionPrimitives.ts).
type LineType = 'ridge' | 'valley' | 'hip' | 'solid';
const LINE_TYPE_OPTIONS: { id: LineType; label: string; style: SectionLineStyle }[] = [
  { id: 'ridge',  label: 'Ridge Beam', style: 'ridge'  },
  { id: 'valley', label: 'Valley Pad', style: 'valley' },
  { id: 'hip',    label: 'Hip',        style: 'hip'    },
  { id: 'solid',  label: 'Line',       style: 'solid'  },
];

// ── Snap / hit-test tolerances (screen pixels — converted to world via 1/zoom).
const SNAP_PX = 8;
const HANDLE_HIT_PX = 8;
const BODY_HIT_PX = 6;

// Ortho-lock tolerance: lock the cursor to perfectly horizontal/vertical
// from the draft anchor when its angle is within this many degrees of
// an axis. Always-on; the user can hold Shift to disable for free draw.
const ORTHO_DEG = 7;

interface ViewTransform { panX: number; panY: number; zoom: number; }

// In-progress draft state per tool.
//   • line-tool   — between first and second click of a Line draw. The
//     `lineType` snapshot is locked at click 1 so the user can switch the
//     picker mid-draw without changing the in-progress line.
//   • dim-points  — Dim tool: waiting for second pick (a→b), then offset pick
//   • offset      — Offset tool: source line selected, awaiting side click. The
//     LIVE preview ghost is drawn at the typed/sticky distance on the side of
//     the cursor (matches Canvas2D's offset UX).
type Draft =
  | { kind: 'line-tool'; lineType: LineType; a: Vec2; preview: Vec2 }
  | { kind: 'dim-points'; a: Vec2; b: Vec2 | null; preview: Vec2 }
  // STEM Sketch-style offset: a source line has been picked and a small
  // modal is open asking for a signed distance. Positive = LEFT of the
  // directed source (a→b); negative = RIGHT. The dialog draws a live ghost
  // so the user can see which side they're choosing.
  | { kind: 'offset-dialog'; line: PrimLine };

// Parses imperial input like "12", "12.5", "1'6", "1'-6\"". Mirrors the
// Canvas2D parser so the floorplanner and roof view accept the same syntax.
function parseLengthInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const ftIn = t.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*"?$/);
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

// Signed variant for the Offset dialog: accepts a leading minus to mean
// "offset to the right of the directed source instead of the left." Same
// syntax otherwise — number-only or feet-inches.
function parseLengthInputSigned(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const sign = t.startsWith('-') ? -1 : 1;
  const body = t.replace(/^-/, '').trim();
  const magnitude = parseLengthInput(body);
  if (magnitude == null) return null;
  return sign * magnitude;
}

// Endpoint drag of an existing PrimLine.
type HandleDrag = { id: string; end: 'a' | 'b' };

// Body drag of one or more selected primitives.
type BodyDrag = { startWorld: Vec2; lastWorld: Vec2 };

// Currently-selected eave edge for per-wall overhang editing. Indexes into
// `footprint.eave` / `footprint.edgeWallIds`. Mutually exclusive with the
// PrimLine `selection` set — clicking either clears the other.
type EaveSelection = { edgeIndex: number; wallId: string };

// Distance from `point` to the segment a→b, in world units.
function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

// Parameter (0..1, unclamped) of `p` projected onto the infinite line a→b.
function projectParam(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

// Intersection of segment P (p1→p2) with segment Q (q1→q2). Returns the
// parameter `t` (0..1 along P) of the crossing, or null when they're
// parallel / collinear or don't actually cross within both extents.
function segmentIntersectionT(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): number | null {
  const rx = p2.x - p1.x, ry = p2.y - p1.y;
  const sx = q2.x - q1.x, sy = q2.y - q1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;           // parallel or collinear
  const qpx = q1.x - p1.x, qpy = q1.y - p1.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const eps = 1e-6;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return Math.max(0, Math.min(1, t));
}

// Real CAD-style trim of `target` against a set of cutting segments. Splits
// `target` at every segment it crosses, then removes only the span the user
// clicked (the interval between the two crossings that bracket the click).
//   • click before the first crossing → removes that dangling end.
//   • click between two crossings      → removes the middle, returns 2 lines.
//   • no crossings at all              → returns [] (caller deletes the line).
// New ids are minted so repeated trims never collide.
function trimLineAgainst(target: PrimLine, cutters: [Vec2, Vec2][], click: Vec2): PrimLine[] {
  const ts: number[] = [];
  for (const [q1, q2] of cutters) {
    const t = segmentIntersectionT(target.a, target.b, q1, q2);
    if (t != null && t > 1e-4 && t < 1 - 1e-4) ts.push(t);
  }
  if (ts.length === 0) return [];                    // nothing to cut against
  ts.sort((a, b) => a - b);
  const cuts: number[] = [];
  for (const t of ts) if (cuts.length === 0 || t - cuts[cuts.length - 1] > 1e-3) cuts.push(t);

  const clickT = Math.max(0, Math.min(1, projectParam(target.a, target.b, click)));
  const bounds = [0, ...cuts, 1];
  let lo = 0, hi = 1;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (clickT >= bounds[i] && clickT <= bounds[i + 1]) { lo = bounds[i]; hi = bounds[i + 1]; break; }
  }
  const at = (t: number): Vec2 => ({
    x: target.a.x + (target.b.x - target.a.x) * t,
    y: target.a.y + (target.b.y - target.a.y) * t,
  });
  const out: PrimLine[] = [];
  if (lo > 1e-4)     out.push({ ...target, id: makeUserPrimId('user-line'), a: target.a, b: at(lo) });
  if (hi < 1 - 1e-4) out.push({ ...target, id: makeUserPrimId('user-line'), a: at(hi), b: target.b });
  return out;
}

// Hit-test the eave polygon edges. Returns the index of the closest edge
// within `tol`, or null. Edge i runs from eave[i] to eave[(i+1) % n].
function hitTestEaveEdge(fp: RoofFootprint, point: Vec2, tol: number): number | null {
  const n = fp.eave.length;
  let bestIdx = -1;
  let bestDist = tol;
  for (let i = 0; i < n; i++) {
    const a = fp.eave[i];
    const b = fp.eave[(i + 1) % n];
    const d = distanceToSegment(point, a, b);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx >= 0 ? bestIdx : null;
}

// Build virtual PrimLines for the footprint edges so the Offset tool can
// pick them as sources. Each gets a stable `__fp-…` id so it never collides
// with user-drawn primitives. Style is 'solid' so the resulting offset is
// a plain construction line.
function footprintEdgeAsSource(
  fp: RoofFootprint,
  point: Vec2,
  tol: number,
): PrimLine | null {
  type Cand = { name: string; poly: Vec2[] };
  const polys: Cand[] = [
    { name: 'eave',   poly: fp.eave },
    { name: 'wall',   poly: fp.wallOuter },
    { name: 'center', poly: fp.centerline },
  ];
  let best: { name: string; idx: number; a: Vec2; b: Vec2; d: number } | null = null;
  for (const { name, poly } of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const d = distanceToSegment(point, a, b);
      if (d <= tol && (best === null || d < best.d)) {
        best = { name, idx: i, a, b, d };
      }
    }
  }
  if (!best) return null;
  return {
    id: `__fp-${best.name}-${best.idx}`,
    kind: 'line',
    a: best.a,
    b: best.b,
    style: 'solid',
  };
}

// Signed perpendicular offset of a line. Positive = LEFT of the directed
// edge a→b (CCW normal in canvas Y-down); negative = RIGHT. Returns a fresh
// PrimLine carrying the source's style. Used by the STEM Sketch-style
// offset flow where the dialog's sign picks the side.
function offsetLineSigned(source: PrimLine, signedDist: number): PrimLine | null {
  const dx = source.b.x - source.a.x;
  const dy = source.b.y - source.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const nx = -dy / len;
  const ny =  dx / len;
  const ox = nx * signedDist;
  const oy = ny * signedDist;
  return {
    id: makeUserPrimId('user-offset'),
    kind: 'line',
    a: { x: source.a.x + ox, y: source.a.y + oy },
    b: { x: source.b.x + ox, y: source.b.y + oy },
    style: source.style,
  };
}

// Render interior walls of the floor under the active roof in light gray.
// Each wall takes its real thickness (same wallPolygon helper as the 2D
// plan) so the user can read room sizes. All wall rectangles are added to
// a SINGLE path and filled once — canvas's non-zero winding rule paints
// the union, so adjacent / overlapping walls don't show alpha-darkening at
// junctions and there are no internal outline crossings at T-joints. No
// per-wall stroke, by design — the dropped outlines are what was making
// the silhouette look "sloppy" at every wall intersection.
function drawFloorBelow(
  ctx: CanvasRenderingContext2D,
  level: Level,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  const exteriorIds = deriveExteriorWallIds(level);
  const interior = level.walls.filter(w => !exteriorIds.has(w.id));
  ctx.save();
  ctx.setLineDash([]);

  if (interior.length > 0) {
    ctx.fillStyle = 'rgba(120, 128, 152, 0.45)';
    ctx.beginPath();
    for (const w of interior) {
      const corners = wallPolygon(w);
      if (corners.length < 4) continue;
      for (let i = 0; i < corners.length; i++) {
        const s = toScreen(corners[i]);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else         ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
    }
    ctx.fill();
  }

  // Room labels — small all-caps text at each label position.
  ctx.fillStyle = 'rgba(80, 86, 110, 0.85)';
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of level.roomLabels) {
    const s = toScreen(r.position);
    ctx.fillText(r.name.toUpperCase(), s.x, s.y);
  }
  ctx.restore();
}

export default function RoofPlanView({
  project, onChange, tool, onChangeTool, onBeginLiveOp, onEndLiveOp,
}: {
  project: Project;
  onChange: (next: Project) => void;
  // Externally-owned tool state so the left ToolPalette drives roof-plan
  // tool selection (same pattern as Specs view). Defaults to 'select' if the
  // global tool isn't applicable here (see ROOF_APPLICABLE_TOOLS).
  tool: ToolId;
  onChangeTool: (t: ToolId) => void;
  onBeginLiveOp?: () => void;
  onEndLiveOp?: () => void;
}) {
  const activeLevel = useMemo(
    () => project.levels.find(l => l.id === project.activeLevelId) ?? project.levels[0],
    [project.levels, project.activeLevelId],
  );

  const roof = project.roof;
  const overhang = roof.overhang ?? 12;
  const pitch = roof.pitch ?? 6;
  const eaveOverhangs = roof.eaveOverhangs;

  // The roof is designed for the WHOLE building, not one floor — so base the
  // plan on the LOWEST level that traces a footprint (the overall outline),
  // independent of which floor is active. For a single-story or identical-
  // footprint two-story this is the same polygon as the active level, so those
  // cases are unchanged; for a setback it means the roof plan works from any
  // floor and is anchored to the larger ground-floor outline.
  const buildingLevel = useMemo<Level | null>(() => {
    const ordered = [...project.levels].sort((a, b) => a.elevation - b.elevation);
    for (const l of ordered) {
      if (buildRoofFootprint(l, overhang, eaveOverhangs)) return l;
    }
    return activeLevel ?? null;
  }, [project.levels, overhang, eaveOverhangs, activeLevel]);

  // Building footprint underlay — eave/wallOuter/centerline polygons. The
  // eave is built per-edge so a per-wall overhang override pushes that
  // section of the soffit out without disturbing the rest.
  const footprint = useMemo<RoofFootprint | null>(
    () => buildingLevel ? buildRoofFootprint(buildingLevel, overhang, eaveOverhangs) : null,
    [buildingLevel, overhang, eaveOverhangs],
  );

  // Upper-floor footprints (everything above the building level) that differ
  // from the base — drawn as light outlines so the user can place the upper
  // roof's ridges over them. Empty for single-story / identical two-story.
  const upperFootprints = useMemo<RoofFootprint[]>(() => {
    if (!buildingLevel) return [];
    const baseArea = footprint ? polygonAreaOf(footprint.wallOuter) : 0;
    const out: RoofFootprint[] = [];
    for (const l of project.levels) {
      if (l.id === buildingLevel.id) continue;
      const fp = buildRoofFootprint(l, overhang, eaveOverhangs);
      if (!fp) continue;
      // Only overlay when it's meaningfully different from the base outline.
      if (baseArea > 0 && Math.abs(polygonAreaOf(fp.wallOuter) - baseArea) / baseArea <= 0.02) continue;
      out.push(fp);
    }
    return out;
  }, [project.levels, buildingLevel, footprint, overhang, eaveOverhangs]);

  // User-drawn primitives.
  const drafting: SectionPrimitive[] = roof.drafting ?? [];

  // ── Pan / zoom ──────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<ViewTransform>({ panX: 0, panY: 0, zoom: 1 });
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitToCanvas = useCallback(() => {
    if (!footprint) return;
    const bb = bboxOf(footprint.eave);
    if (!bb) return;
    const padding = 60;
    const zoomX = (size.w - padding * 2) / Math.max(1, bb.maxX - bb.minX);
    const zoomY = (size.h - padding * 2) / Math.max(1, bb.maxY - bb.minY);
    const zoom = Math.max(0.05, Math.min(zoomX, zoomY));
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    setView({
      panX: size.w / 2 - cx * zoom,
      panY: size.h / 2 - cy * zoom,
      zoom,
    });
  }, [footprint, size]);

  // Refit when the footprint extents change (different level, big edit).
  const lastFitKeyRef = useRef<string>('');
  useEffect(() => {
    if (!footprint || size.w < 200 || size.h < 200) return;
    const bb = bboxOf(footprint.eave);
    if (!bb) return;
    const key = `${bb.minX.toFixed(0)},${bb.minY.toFixed(0)},${bb.maxX.toFixed(0)},${bb.maxY.toFixed(0)}`;
    if (key !== lastFitKeyRef.current) {
      lastFitKeyRef.current = key;
      fitToCanvas();
    }
  }, [footprint, size, fitToCanvas]);

  const screenToWorld = useCallback((sx: number, sy: number): Vec2 => ({
    x: (sx - view.panX) / view.zoom,
    y: (sy - view.panY) / view.zoom,
  }), [view]);

  const toScreen = useCallback((p: Vec2) => ({
    x: p.x * view.zoom + view.panX,
    y: p.y * view.zoom + view.panY,
  }), [view]);

  // ── Synthetic background primitives for snap ─────────────────────────────
  // Pass the footprint polygons as PrimPolylines so findSnap picks up their
  // vertices (endpoints), edge midpoints, and on-edge nearest points.
  const snapPrimitives: SectionPrimitive[] = useMemo(() => {
    const out: SectionPrimitive[] = [...drafting];
    if (footprint) {
      out.push(
        { id: '__eave',  kind: 'polyline', verts: footprint.eave,        closed: true, style: 'normal' },
        { id: '__wall',  kind: 'polyline', verts: footprint.wallOuter,   closed: true, style: 'normal' },
        { id: '__center',kind: 'polyline', verts: footprint.centerline,  closed: true, style: 'normal' },
      );
    }
    // Upper-floor outlines are snappable too (eave + wall + centerline, mirroring
    // the base footprint) so the upper roof's ridges snap to its edges/midpoints.
    upperFootprints.forEach((fp, i) => out.push(
      { id: `__upper-eave-${i}`,   kind: 'polyline', verts: fp.eave,       closed: true, style: 'normal' },
      { id: `__upper-wall-${i}`,   kind: 'polyline', verts: fp.wallOuter,  closed: true, style: 'normal' },
      { id: `__upper-center-${i}`, kind: 'polyline', verts: fp.centerline, closed: true, style: 'normal' },
    ));
    return out;
  }, [drafting, footprint, upperFootprints]);

  // ── Tool / selection / draft state ───────────────────────────────────────
  // The Line tool's active "type" — Ridge Beam, Valley Pad, or plain Line.
  // Lives outside the Draft so the picker can change between draws without
  // affecting an in-progress line.
  const [lineType, setLineType] = useState<LineType>('ridge');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [handleDrag, setHandleDrag] = useState<HandleDrag | null>(null);
  const [bodyDrag, setBodyDrag] = useState<BodyDrag | null>(null);
  const [boxSel, setBoxSel] = useState<{ start: Vec2; current: Vec2 } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  // Selected eave edge for per-wall overhang editing. Side panel surfaces
  // a numeric input when this is set. Cleared by Esc, by selecting a
  // PrimLine, by box selection, or by clicking empty space.
  const [eaveSel, setEaveSel] = useState<EaveSelection | null>(null);
  // Floor-below silhouette toggle. When ON, the interior walls and room
  // labels of the active level are drawn in light gray under the roof
  // footprint so the user can tell what's underneath each section of roof.
  const [showFloorBelow, setShowFloorBelow] = useState<boolean>(false);

  // ── Offset state (STEM Sketch-style) ─────────────────────────────────────
  // Sticky distance in inches, default 12" (1 ft). `offsetInput` is the
  // current dialog text — accepts signed lengths so the user can flip the
  // side with a leading minus. On commit, the sticky value is updated to
  // the magnitude of whatever the user just confirmed.
  const [offsetDistance, setOffsetDistance] = useState<number>(12);
  const [offsetInput, setOffsetInput] = useState<string>('');

  // ── Snap resolution ──────────────────────────────────────────────────────
  // findSnap → optional ortho lock relative to the active draft anchor.
  // Shift disables ortho so the user can free-draw past it.
  const resolveCursor = useCallback((raw: Vec2): { p: Vec2; snap: SnapResult | null } => {
    const tolWorld = SNAP_PX / view.zoom;
    const gridSize = 12;  // 1 ft grid as the last-resort fallback snap
    const s = findSnap(raw, snapPrimitives, tolWorld, { grid: { size: gridSize, enabled: true } });
    let p = s ? s.point : raw;

    // Ortho-lock from the active draft anchor (auto-engages when close to
    // an axis, unless the user holds Shift).
    const anchor = draft && (draft.kind === 'line-tool' ? draft.a
      : draft.kind === 'dim-points' && draft.b ? draft.b
      : null);
    if (anchor && !shiftHeld) {
      const dx = p.x - anchor.x;
      const dy = p.y - anchor.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const angle = Math.atan2(dy, dx);
        const fromAxis = nearestAxisAngle(angle);
        if (Math.abs(fromAxis) * 180 / Math.PI <= ORTHO_DEG) {
          // Snap onto the nearest H/V axis through the anchor.
          if (Math.abs(dx) >= Math.abs(dy)) p = { x: p.x, y: anchor.y };
          else                              p = { x: anchor.x, y: p.y };
        }
      }
    }
    return { p, snap: s };
  }, [view.zoom, snapPrimitives, draft, shiftHeld]);

  // ── Project mutators (small helpers) ─────────────────────────────────────
  const setDraftingPrims = useCallback((next: SectionPrimitive[]) => {
    onChange({ ...project, roof: { ...roof, drafting: next } });
  }, [onChange, project, roof]);

  const addPrim = useCallback((p: SectionPrimitive) => {
    setDraftingPrims([...(roof.drafting ?? []), p]);
  }, [setDraftingPrims, roof.drafting]);

  const removeIds = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    setDraftingPrims((roof.drafting ?? []).filter(p => !ids.has(p.id)));
  }, [setDraftingPrims, roof.drafting]);

  const updateLine = useCallback((id: string, next: PrimLine) => {
    setDraftingPrims((roof.drafting ?? []).map(p => p.id === id && p.kind === 'line' ? next : p));
  }, [setDraftingPrims, roof.drafting]);

  // Re-label an existing line (Ridge Beam / Valley Pad / Hip / Line) when it's
  // selected — same choices as the draw-time type picker.
  const setLineStyle = useCallback((id: string, style: SectionLineStyle) => {
    setDraftingPrims((roof.drafting ?? []).map(p =>
      p.id === id && p.kind === 'line' ? { ...p, style } : p));
  }, [setDraftingPrims, roof.drafting]);

  // Update the per-wall overhang override. Passing the default value (or
  // null) removes the override so the wall reverts to `roof.overhang`.
  const setWallOverhang = useCallback((wallId: string, inches: number | null) => {
    const current = { ...(roof.eaveOverhangs ?? {}) };
    if (inches == null || !Number.isFinite(inches) || Math.abs(inches - overhang) < 1e-6) {
      delete current[wallId];
    } else {
      current[wallId] = Math.max(0, inches);
    }
    onChange({ ...project, roof: { ...roof, eaveOverhangs: current } });
  }, [onChange, project, roof, overhang]);

  // The eave-edge overhang editor is a Select-tool affordance. We don't
  // clear `eaveSel` on tool change — we just ignore it everywhere when the
  // active tool isn't 'select'. Same end result, no cascading-render effect.
  const effectiveEaveSel: EaveSelection | null = tool === 'select' ? eaveSel : null;

  // Exactly one PrimLine selected → its style can be re-typed (Ridge Beam /
  // Valley Pad / Hip / Line) from the toolbar, right where the draw-time
  // picker lives, so changing an existing line's type is discoverable.
  const soleSelectedLine = useMemo<PrimLine | null>(() => {
    if (selection.size !== 1) return null;
    const id = [...selection][0];
    const p = (roof.drafting ?? []).find(pr => pr.id === id);
    return p && p.kind === 'line' ? p : null;
  }, [selection, roof.drafting]);

  const translateSelected = useCallback((dx: number, dy: number) => {
    if (selection.size === 0 || (dx === 0 && dy === 0)) return;
    const shift = (v: Vec2): Vec2 => ({ x: v.x + dx, y: v.y + dy });
    setDraftingPrims((roof.drafting ?? []).map(p => {
      if (!selection.has(p.id)) return p;
      switch (p.kind) {
        case 'line':      return { ...p, a: shift(p.a), b: shift(p.b) };
        case 'polyline':  return { ...p, verts: p.verts.map(shift) };
        case 'text':      return { ...p, at: shift(p.at) };
        case 'dimLinear': return { ...p, a: shift(p.a), b: shift(p.b) };
        default:          return p;
      }
    }));
  }, [setDraftingPrims, roof.drafting, selection]);

  // ── Mouse handlers ───────────────────────────────────────────────────────
  const panningRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 1 || e.button === 2) {
      panningRef.current = { x: sx, y: sy };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const raw = screenToWorld(sx, sy);
    const { p: world } = resolveCursor(raw);
    const handleTol = HANDLE_HIT_PX / view.zoom;
    const bodyTol = BODY_HIT_PX / view.zoom;

    // Tool dispatch — keyed to the global ToolId from the left palette.
    if (tool === 'line') {
      if (!draft || draft.kind !== 'line-tool' || draft.lineType !== lineType) {
        // First click — snapshot the current lineType so changing the
        // picker mid-draw doesn't repaint the in-progress line.
        setDraft({ kind: 'line-tool', lineType, a: world, preview: world });
      } else {
        const style = LINE_TYPE_OPTIONS.find(o => o.id === draft.lineType)?.style ?? 'solid';
        const line = makeUserLine(draft.a, world, style);
        addPrim(line);
        setSelection(new Set([line.id]));
        setDraft(null);
      }
      return;
    }

    if (tool === 'text') {
      const content = window.prompt('Text:');
      if (content && content.trim().length > 0) {
        addPrim(makeUserText(world, content.trim()));
      }
      return;
    }

    if (tool === 'dimension') {
      if (!draft || draft.kind !== 'dim-points') {
        setDraft({ kind: 'dim-points', a: world, b: null, preview: world });
      } else if (draft.b === null) {
        setDraft({ kind: 'dim-points', a: draft.a, b: world, preview: world });
      } else {
        const offset = signedPerpendicularOffset(draft.a, draft.b, world);
        addPrim(makeUserDimLinear(draft.a, draft.b, offset));
        setDraft(null);
      }
      return;
    }

    if (tool === 'offset') {
      // STEM Sketch flow: pick a source line, then a small modal opens
      // asking for a signed distance. Positive = LEFT of the directed
      // source (a→b); negative = RIGHT. The dialog ghosts the result so the
      // user can see which side the sign picks. No live "click side" pick.
      //
      // Source pick falls through user-drawn primitives → synthetic
      // footprint edges (eave, wallOuter, centerline) so any visible line
      // can be offset.
      if (!draft || draft.kind !== 'offset-dialog') {
        const hit = hitTestTopmost(roof.drafting ?? [], raw, bodyTol);
        if (hit && hit.kind === 'line') {
          setDraft({ kind: 'offset-dialog', line: hit });
          setOffsetInput(offsetDistance.toString());
        } else if (footprint) {
          const fpHit = footprintEdgeAsSource(footprint, raw, bodyTol);
          if (fpHit) {
            setDraft({ kind: 'offset-dialog', line: fpHit });
            setOffsetInput(offsetDistance.toString());
          }
        }
      }
      // While the dialog is open, canvas clicks do nothing — the dialog
      // owns the commit. Esc cancels.
      return;
    }

    if (tool === 'trim') {
      // CAD-style trim: clicking a line removes only the span between the
      // crossings that bracket the click — every OTHER drafting line plus the
      // footprint edges (eave / wallOuter / centerline) act as cutting edges.
      // So a ridge drawn across a valley can be trimmed back to the valley
      // instead of deleting the whole ridge. With NO crossings it falls back
      // to deleting the line (same as before). Polylines split at the clicked
      // segment as before.
      const hit = hitTestTopmost(roof.drafting ?? [], raw, bodyTol);
      if (hit) {
        if (hit.kind === 'line') {
          const cutters: [Vec2, Vec2][] = [];
          for (const p of roof.drafting ?? []) {
            if (p.id === hit.id) continue;
            if (p.kind === 'line') {
              cutters.push([p.a, p.b]);
            } else if (p.kind === 'polyline') {
              const n = p.verts.length;
              const segCount = p.closed ? n : n - 1;
              for (let i = 0; i < segCount; i++) cutters.push([p.verts[i], p.verts[(i + 1) % n]]);
            }
          }
          const cutterPolys: Vec2[][] = [];
          if (footprint) cutterPolys.push(footprint.eave, footprint.wallOuter, footprint.centerline);
          // Upper-floor (setback) outlines cut too, so a ridge can be trimmed
          // back to the upper roof's edge.
          for (const fp of upperFootprints) cutterPolys.push(fp.eave, fp.wallOuter, fp.centerline);
          for (const poly of cutterPolys) {
            for (let i = 0; i < poly.length; i++) cutters.push([poly[i], poly[(i + 1) % poly.length]]);
          }
          const replacements = trimLineAgainst(hit, cutters, raw);
          const next = (roof.drafting ?? []).flatMap(p => (p.id === hit.id ? replacements : [p]));
          setDraftingPrims(next);
          setSelection(prev => {
            const n = new Set(prev);
            n.delete(hit.id);
            for (const r of replacements) n.add(r.id);
            return n;
          });
        } else if (hit.kind === 'polyline') {
          // Find the clicked segment and split / open the polyline.
          const tol = bodyTol;
          const n = hit.verts.length;
          const segCount = hit.closed ? n : n - 1;
          let cutIdx = -1;
          for (let i = 0; i < segCount; i++) {
            const a = hit.verts[i];
            const b = hit.verts[(i + 1) % n];
            if (distanceToSegment(raw, a, b) <= tol) { cutIdx = i; break; }
          }
          if (cutIdx >= 0) {
            const current = roof.drafting ?? [];
            let next: SectionPrimitive[];
            if (hit.closed) {
              const reordered = hit.verts.slice(cutIdx + 1).concat(hit.verts.slice(0, cutIdx + 1));
              next = current.map(p => p.id === hit.id
                ? { ...hit, verts: reordered, closed: false }
                : p);
            } else {
              const left = hit.verts.slice(0, cutIdx + 1);
              const right = hit.verts.slice(cutIdx + 1);
              next = current.flatMap(p => {
                if (p.id !== hit.id) return [p];
                const out: SectionPrimitive[] = [];
                if (left.length >= 2)  out.push({ ...hit, id: `${hit.id}-L`, verts: left,  closed: false });
                if (right.length >= 2) out.push({ ...hit, id: `${hit.id}-R`, verts: right, closed: false });
                return out;
              });
            }
            setDraftingPrims(next);
          }
        }
      }
      return;
    }

    if (tool === 'erase') {
      // STEM Sketch eraser: click any drafting entity to delete it. Hits
      // lines, polylines, text, dims — anything in the drafting array.
      const hit = hitTestTopmost(roof.drafting ?? [], raw, bodyTol);
      if (hit) removeIds(new Set([hit.id]));
      return;
    }

    // Select tool ----------------------------------------------------------
    // 1. Endpoint drag on a selected line.
    for (const p of roof.drafting ?? []) {
      if (p.kind !== 'line') continue;
      if (!selection.has(p.id)) continue;
      const handle = hitTestLineHandle(p, raw, handleTol);
      if (handle) {
        onBeginLiveOp?.();
        setHandleDrag({ id: p.id, end: handle });
        return;
      }
    }
    // 2. Body click — single / multi / box select.
    const topmost = hitTestTopmost(roof.drafting ?? [], raw, bodyTol);
    if (topmost) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const nextSel = new Set(selection);
      if (additive) {
        if (nextSel.has(topmost.id)) nextSel.delete(topmost.id); else nextSel.add(topmost.id);
      } else if (!nextSel.has(topmost.id)) {
        nextSel.clear();
        nextSel.add(topmost.id);
      }
      setSelection(nextSel);
      setEaveSel(null);
      // Body drag is wired up so a hold-and-move translates the selection.
      onBeginLiveOp?.();
      setBodyDrag({ startWorld: raw, lastWorld: raw });
      return;
    }
    // 3. Eave-edge click — promote to per-wall overhang editor in the side
    //    panel. Mutually exclusive with PrimLine selection.
    if (footprint) {
      const eaveHit = hitTestEaveEdge(footprint, raw, bodyTol);
      if (eaveHit != null) {
        const wallId = footprint.edgeWallIds[eaveHit];
        if (wallId) {
          setSelection(new Set());
          setEaveSel({ edgeIndex: eaveHit, wallId });
          return;
        }
      }
    }
    // 4. Empty space — start a box selection.
    setBoxSel({ start: raw, current: raw });
    if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
      setSelection(new Set());
      setEaveSel(null);
    }
  }, [tool, draft, roof.drafting, selection, screenToWorld, resolveCursor, view.zoom, addPrim, removeIds, setDraftingPrims, offsetDistance, lineType, onBeginLiveOp, footprint, upperFootprints]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panningRef.current) {
      const dx = sx - panningRef.current.x;
      const dy = sy - panningRef.current.y;
      panningRef.current = { x: sx, y: sy };
      setView(v => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
      return;
    }

    const raw = screenToWorld(sx, sy);
    const { p: world, snap: s } = resolveCursor(raw);
    setCursorWorld(world);
    setSnap(s);

    if (handleDrag) {
      const line = (roof.drafting ?? []).find(p => p.id === handleDrag.id);
      if (line && line.kind === 'line') {
        updateLine(line.id, { ...line, [handleDrag.end]: world });
      }
      return;
    }

    if (bodyDrag) {
      const dx = world.x - bodyDrag.lastWorld.x;
      const dy = world.y - bodyDrag.lastWorld.y;
      if (dx !== 0 || dy !== 0) {
        translateSelected(dx, dy);
        setBodyDrag({ startWorld: bodyDrag.startWorld, lastWorld: world });
      }
      return;
    }

    if (boxSel) {
      setBoxSel({ start: boxSel.start, current: raw });
      return;
    }

    if (draft?.kind === 'line-tool')  setDraft({ ...draft, preview: world });
    if (draft?.kind === 'dim-points') setDraft({ ...draft, preview: world });
    // Offset doesn't need preview state — the cursor position drives the
    // ghost rendering via `cursorWorld` directly.
  }, [draft, handleDrag, bodyDrag, boxSel, screenToWorld, resolveCursor, roof.drafting, updateLine, translateSelected]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (panningRef.current && (e.button === 1 || e.button === 2)) {
      panningRef.current = null;
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    if (handleDrag) {
      setHandleDrag(null);
      onEndLiveOp?.();
      return;
    }
    if (bodyDrag) {
      setBodyDrag(null);
      onEndLiveOp?.();
      return;
    }
    if (boxSel) {
      // Commit the box selection.
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const result = computeBoxSelection(roof.drafting ?? [], boxSel.start, boxSel.current);
      setSelection(prev => {
        const next = additive ? new Set(prev) : new Set<string>();
        for (const id of result.ids) next.add(id);
        return next;
      });
      setBoxSel(null);
      return;
    }
  }, [handleDrag, bodyDrag, boxSel, roof.drafting, onEndLiveOp]);

  const onMouseLeave = useCallback(() => {
    panningRef.current = null;
    setCursorWorld(null);
    setSnap(null);
    if (handleDrag) { setHandleDrag(null); onEndLiveOp?.(); }
    if (bodyDrag)   { setBodyDrag(null);   onEndLiveOp?.(); }
    if (boxSel)     setBoxSel(null);
  }, [handleDrag, bodyDrag, boxSel, onEndLiveOp]);

  // Non-passive wheel listener for cursor-anchored zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setView(v => {
        const factor = Math.pow(1.0015, -e.deltaY);
        const newZoom = Math.max(0.02, Math.min(50, v.zoom * factor));
        const wx = (sx - v.panX) / v.zoom;
        const wy = (sy - v.panY) / v.zoom;
        return {
          zoom: newZoom,
          panX: sx - wx * newZoom,
          panY: sy - wy * newZoom,
        };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard: tool hotkeys, Esc cancel, Delete, Shift tracking, Fit.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Shift') setShiftHeld(true);

      if (e.key === 'Escape') {
        if (handleDrag) { setHandleDrag(null); onEndLiveOp?.(); return; }
        if (bodyDrag)   { setBodyDrag(null);   onEndLiveOp?.(); return; }
        if (boxSel)     { setBoxSel(null); return; }
        if (draft)      { setDraft(null); setOffsetInput(''); return; }
        if (eaveSel)    { setEaveSel(null); return; }
        setSelection(new Set());
        onChangeTool('select');
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0) {
        removeIds(selection);
        setSelection(new Set());
        e.preventDefault();
        return;
      }
      if (e.key === 'f' || e.key === 'F') { fitToCanvas(); return; }
      // Tool hotkeys (the global left-palette hotkeys are handled elsewhere
      // — here we only intercept F for Fit and Esc).
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [draft, handleDrag, bodyDrag, boxSel, selection, eaveSel, removeIds, fitToCanvas, onChangeTool, onEndLiveOp]);

  // ── Canvas rendering ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // 1. Background grid.
    drawGrid(ctx, size, view);

    // 2. Optional floor-below silhouette — interior walls + room labels of
    //    the active level in light gray, so the user can see what rooms lie
    //    under each section of the roof while drawing.
    if (showFloorBelow && activeLevel) drawFloorBelow(ctx, activeLevel, toScreen);

    // 3. Footprint underlay (eave / wall outer / centerline).
    if (footprint) drawFootprint(ctx, footprint, toScreen);

    // 3b. Setback upper roof tier(s): draw the upper EAVE (wall + overhang — the
    //     actual upper roof edge) as a solid accent line, plus the upper WALL
    //     line dashed underneath so the user sees both the roof extent and the
    //     wall it sits on. (Empty for single-story / identical two-story.)
    for (const fp of upperFootprints) {
      ctx.save();
      const strokePoly = (poly: typeof fp.eave, dashed: boolean) => {
        ctx.beginPath();
        poly.map(toScreen).forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.closePath();
        ctx.setLineDash(dashed ? [4, 4] : []);
        ctx.stroke();
      };
      ctx.strokeStyle = T.accent;
      ctx.lineWidth = 1.6;
      strokePoly(fp.eave, false);       // upper roof edge (with overhang)
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      strokePoly(fp.wallOuter, true);   // upper wall line beneath the eave
      ctx.restore();
    }

    // 4. Highlight the selected eave edge so the user can see which segment
    //    of the soffit they're editing in the side panel.
    if (footprint && effectiveEaveSel) {
      const a = footprint.eave[effectiveEaveSel.edgeIndex];
      const b = footprint.eave[(effectiveEaveSel.edgeIndex + 1) % footprint.eave.length];
      if (a && b) {
        const sA = toScreen(a), sB = toScreen(b);
        ctx.save();
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. User primitives via the shared renderer.
    const projector: Projector = {
      px: 1,
      zoom: view.zoom,
      sx: (x: number) => x * view.zoom + view.panX,
      sy: (y: number) => y * view.zoom + view.panY,
    };
    renderSectionPrimitives(ctx, drafting, projector);

    // 3b. Type label drawn parallel to each ridge / valley / hip line so the
    //     framing reads at a glance without selecting it.
    drawRoofLineLabels(ctx, drafting, p => toScreen(p));

    // 4. Selection overlay + endpoint handles.
    drawSelectionOverlay(ctx, drafting, selection, p => toScreen(p));
    drawLineHandles(ctx, drafting, selection, p => toScreen(p));

    // 5. Tool overlays.
    if (draft?.kind === 'line-tool') {
      drawLineGhost(ctx, draft.a, draft.preview, p => toScreen(p));
    }
    if (draft?.kind === 'dim-points') {
      if (draft.b === null) drawLineGhost(ctx, draft.a, draft.preview, p => toScreen(p));
      else {
        const offset = signedPerpendicularOffset(draft.a, draft.b, draft.preview);
        drawDimGhost(ctx, draft.a, draft.b, offset, view.zoom, p => toScreen(p));
      }
    }
    if (draft?.kind === 'offset-dialog') {
      drawOffsetSource(ctx, draft.line, p => toScreen(p));
      const signedDist = parseLengthInputSigned(offsetInput) ?? offsetDistance;
      const ghost = offsetLineSigned(draft.line, signedDist);
      if (ghost) {
        const a = toScreen(ghost.a), b = toScreen(ghost.b);
        ctx.save();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    if (boxSel) {
      drawSelectionBox(ctx, boxSel.start, boxSel.current, p => toScreen(p));
    }

    // 6. Snap indicator (top-most so it's always visible).
    if (snap) drawSnapIndicator(ctx, snap, p => toScreen(p));
  }, [size, view, footprint, upperFootprints, drafting, selection, draft, boxSel, snap, toScreen, cursorWorld, offsetInput, offsetDistance, showFloorBelow, activeLevel, effectiveEaveSel]);

  // ── UI ──────────────────────────────────────────────────────────────────
  const hint = useMemo(() => {
    if (draft?.kind === 'line-tool') {
      const label = draft.lineType === 'ridge' ? 'ridge beam end' : draft.lineType === 'valley' ? 'valley pad end' : draft.lineType === 'hip' ? 'hip end' : 'line end';
      return `Click the ${label} — Esc cancels, Shift disables ortho lock`;
    }
    if (draft?.kind === 'dim-points' && !draft.b) return 'Click the dim endpoint';
    if (draft?.kind === 'dim-points')             return 'Click the dim line offset';
    if (draft?.kind === 'offset-dialog')          return 'Type the offset distance — positive / negative pick the side';
    if (tool === 'offset')                        return 'Click a line to offset';
    if (tool === 'trim')                          return 'Click a line span to trim it back to the nearest crossing (no crossing = removes the line)';
    if (tool === 'erase')                         return 'Click any shape to delete it';
    if (tool === 'text')                          return 'Click where to place text';
    if (tool === 'dimension')                     return 'Click the first dim point';
    if (tool === 'line') {
      const label = lineType === 'ridge' ? 'ridge beam' : lineType === 'valley' ? 'valley pad' : lineType === 'hip' ? 'hip' : 'line';
      return `Click ${label} start point`;
    }
    if (effectiveEaveSel)                         return 'Soffit edge selected — edit overhang in the side panel';
    if (selection.size > 0)                       return `${selection.size} selected — drag to move, Delete to remove`;
    return 'Pick a tool from the left palette — Wheel zooms, Right-drag pans';
  }, [draft, tool, selection.size, lineType, effectiveEaveSel]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px', background: T.panel, borderBottom: `1px solid ${T.line}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
          color: T.accent, textTransform: 'uppercase',
        }}>Roof plan</div>

        {/* Line-Type picker — only visible while the Line tool is active. The
            selected type drives the SectionLineStyle on the next drawn
            PrimLine (ridge beam = bold solid, valley pad = bold dashed,
            line = thin solid). */}
        {tool === 'line' && (
          <div style={{
            display: 'flex', gap: 2, padding: 3, background: T.bg,
            border: `1px solid ${T.line}`, borderRadius: 8,
          }}>
            {LINE_TYPE_OPTIONS.map(o => (
              <LineTypeButton
                key={o.id}
                label={o.label}
                active={lineType === o.id}
                onClick={() => setLineType(o.id)}
              />
            ))}
          </div>
        )}

        {/* Re-type picker — shown when the Select tool has exactly one line
            grabbed. Mirrors the draw-time picker's spot so changing an existing
            line's type (Ridge Beam / Valley Pad / Hip / Line) is found in the
            same place. Also mirrored in the side panel. */}
        {tool !== 'line' && soleSelectedLine && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 11, color: T.inkSoft }}>Change type:</span>
            <div style={{
              display: 'flex', gap: 2, padding: 3, background: T.bg,
              border: `1px solid ${T.line}`, borderRadius: 8,
            }}>
              {LINE_TYPE_OPTIONS.map(o => (
                <LineTypeButton
                  key={o.id}
                  label={o.label}
                  active={soleSelectedLine.style === o.style}
                  onClick={() => setLineStyle(soleSelectedLine.id, o.style)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Roof type is COMPOSED from the ridge / hip / valley lines the drafter
            draws — there is no separate Gable/Hip/Flat mode (it would contradict
            the lines). A ridge that runs to the wall is a gable end; a ridge end
            with a hip rafter is a hip end; a valley pad joins two roof planes. */}

        <LabeledField label="Pitch (rise / 12)">
          <input
            type="number" min={0} max={24} step={0.5} value={pitch}
            onChange={e => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange({ ...project, roof: { ...roof, pitch: Math.max(0, v) } });
            }}
            style={{ ...inputStyle, width: 64 }}
          />
        </LabeledField>

        <LabeledField label="Eave overhang (in)">
          <input
            type="number" min={0} max={48} step={1} value={overhang}
            onChange={e => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange({ ...project, roof: { ...roof, overhang: Math.max(0, v) } });
            }}
            style={{ ...inputStyle, width: 64 }}
          />
        </LabeledField>

        <span style={{ flex: 1 }} />

        {/* Floor-below silhouette toggle — when on, the active level's
            interior walls + room labels are drawn in light gray under the
            roof footprint so the user can tell what's under each part of
            the roof while drawing ridges and valleys. */}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: T.inkSoft, cursor: 'pointer', userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={showFloorBelow}
            onChange={e => setShowFloorBelow(e.target.checked)}
          />
          Show floor below
        </label>

        <button onClick={fitToCanvas} style={miniButtonStyle} title="Fit to canvas (F)">Fit</button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          ref={wrapRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.bg }}
          onContextMenu={e => e.preventDefault()}
        >
          {footprint ? (
            <canvas
              ref={canvasRef}
              width={size.w}
              height={size.h}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                cursor:
                  tool === 'line' || tool === 'dimension' || tool === 'text' ? 'crosshair'
                  : tool === 'offset' || tool === 'trim' || tool === 'erase' ? 'pointer' : 'default',
                display: 'block',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
            />
          ) : (
            <EmptyState />
          )}

          {footprint && (
            <div style={{
              position: 'absolute', left: 12, bottom: 12,
              padding: '6px 10px', background: T.panel,
              border: `1px solid ${T.line}`, borderRadius: 6,
              fontSize: 11, color: T.inkSoft, boxShadow: T.shadow,
              pointerEvents: 'none', maxWidth: '70%',
            }}>
              {hint}
              {cursorWorld && (
                <span style={{ marginLeft: 8, color: T.inkMuted }}>
                  ({formatImperial(cursorWorld.x)}, {formatImperial(cursorWorld.y)})
                </span>
              )}
            </div>
          )}

          {/* Offset dialog — STEM Sketch flow: source line picked, modal
              asks for a signed distance. Positive = LEFT of source.a→b;
              negative = RIGHT. Live ghost on canvas updates as user types. */}
          {draft?.kind === 'offset-dialog' && (
            <OffsetDialog
              defaultText={offsetInput}
              defaultDistance={offsetDistance}
              onChange={setOffsetInput}
              onCancel={() => { setDraft(null); setOffsetInput(''); }}
              onConfirm={() => {
                const signed = parseLengthInputSigned(offsetInput);
                if (signed == null || signed === 0) return;
                const copy = offsetLineSigned(draft.line, signed);
                if (copy) {
                  addPrim(copy);
                  setOffsetDistance(Math.abs(signed));
                }
                setDraft(null);
                setOffsetInput('');
              }}
            />
          )}
        </div>

        <SidePanel
          drafting={drafting}
          selection={selection}
          eaveSel={effectiveEaveSel}
          defaultOverhang={overhang}
          eaveOverhangs={roof.eaveOverhangs}
          onSetWallOverhang={setWallOverhang}
          onClearEaveSel={() => setEaveSel(null)}
          onSetLineStyle={setLineStyle}
        />
      </div>
    </div>
  );
}

// ── Background drawers ─────────────────────────────────────────────────────

// Human-readable label for each roof-framing line style.
const ROOF_LINE_LABELS: Partial<Record<SectionLineStyle, string>> = {
  ridge:  'Ridge Beam',
  valley: 'Valley Pad',
  hip:    'Hip Rafter',
};

// Draw the framing-type label parallel to each ridge / valley / hip line,
// centered on the line and sitting just above it (rotated to match the line,
// always upright).
function drawRoofLineLabels(
  ctx: CanvasRenderingContext2D,
  drafting: SectionPrimitive[],
  toScreen: (p: Vec2) => Vec2,
) {
  ctx.save();
  ctx.font = '600 10px ui-sans-serif, system-ui';
  ctx.fillStyle = 'rgba(80, 86, 110, 0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const p of drafting) {
    if (p.kind !== 'line') continue;
    const text = ROOF_LINE_LABELS[p.style];
    if (!text) continue;
    const a = toScreen(p.a), b = toScreen(p.b);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 24) continue; // too short to label
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang >  Math.PI / 2) ang -= Math.PI;   // keep text upright
    if (ang < -Math.PI / 2) ang += Math.PI;
    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.rotate(ang);
    ctx.fillText(text, 0, -5);                 // 5px above the line
    ctx.restore();
  }
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, size: { w: number; h: number }, v: ViewTransform) {
  const gridInches = 12;
  const stepPx = gridInches * v.zoom;
  if (stepPx < 8) return;
  ctx.strokeStyle = '#e6e8f1';
  ctx.lineWidth = 0.5;
  const startX = Math.ceil((-v.panX) / stepPx) * stepPx + v.panX;
  const startY = Math.ceil((-v.panY) / stepPx) * stepPx + v.panY;
  ctx.beginPath();
  for (let x = startX; x < size.w; x += stepPx) { ctx.moveTo(x, 0); ctx.lineTo(x, size.h); }
  for (let y = startY; y < size.h; y += stepPx) { ctx.moveTo(0, y); ctx.lineTo(size.w, y); }
  ctx.stroke();
}

function drawFootprint(
  ctx: CanvasRenderingContext2D,
  fp: RoofFootprint,
  toScreen: (p: Vec2) => { x: number; y: number },
) {
  // Eave — light blue fill + dashed stroke.
  drawClosedPoly(ctx, fp.eave, toScreen, { fill: 'rgba(79,124,255,0.07)', stroke: '#4f7cff', strokeWidth: 1, dash: [6, 4] });
  // Wall outer face — solid medium gray.
  drawClosedPoly(ctx, fp.wallOuter, toScreen, { stroke: '#5a607a', strokeWidth: 1.25 });
  // Wall centerline — thin dotted.
  drawClosedPoly(ctx, fp.centerline, toScreen, { stroke: '#9aa0b8', strokeWidth: 0.75, dash: [2, 3] });
}

function drawClosedPoly(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[],
  toScreen: (p: Vec2) => { x: number; y: number },
  o: { fill?: string; stroke?: string; strokeWidth?: number; dash?: number[] },
) {
  if (poly.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const s = toScreen(poly[i]);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.strokeWidth ?? 1;
    ctx.setLineDash(o.dash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ── Geometry helpers ───────────────────────────────────────────────────────

// Returns the signed angle (radians) between `angle` and the nearest of the
// four cardinal axes (0, π/2, π, -π/2). Used by the ortho-lock test.
function nearestAxisAngle(angle: number): number {
  const a = ((angle % Math.PI) + Math.PI) % Math.PI;  // collapse to [0, π)
  const candidates = [0, Math.PI / 2, Math.PI];
  let best = candidates[0];
  let bestDist = Math.abs(a - candidates[0]);
  for (const c of candidates) {
    const d = Math.abs(a - c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return a - best;
}

// ── Side panel ─────────────────────────────────────────────────────────────

function SidePanel({
  drafting, selection, eaveSel, defaultOverhang, eaveOverhangs,
  onSetWallOverhang, onClearEaveSel, onSetLineStyle,
}: {
  drafting: SectionPrimitive[];
  selection: Set<string>;
  eaveSel: EaveSelection | null;
  defaultOverhang: number;
  eaveOverhangs?: Record<string, number>;
  onSetWallOverhang: (wallId: string, inches: number | null) => void;
  onClearEaveSel: () => void;
  onSetLineStyle: (id: string, style: SectionLineStyle) => void;
}) {
  // Tally per kind for the summary card.
  let ridges = 0, valleys = 0, hips = 0, lines = 0, texts = 0, dims = 0;
  for (const p of drafting) {
    if (p.kind === 'line') {
      if (p.style === 'ridge') ridges++;
      else if (p.style === 'valley') valleys++;
      else if (p.style === 'hip') hips++;
      else lines++;
    } else if (p.kind === 'text') texts++;
    else if (p.kind === 'dimLinear') dims++;
  }

  const selectedPrims = drafting.filter(p => selection.has(p.id));
  const showSelection = selectedPrims.length > 0;
  // Exactly one line selected → offer the same type picker as drawing, so its
  // label (Ridge Beam / Valley Pad / Hip / Line) can be changed.
  const soleLine = selectedPrims.length === 1 && selectedPrims[0].kind === 'line'
    ? selectedPrims[0] as PrimLine
    : null;
  const showEave = !showSelection && eaveSel != null;

  const headerLabel =
      showEave      ? 'Soffit edge'
    : showSelection ? `${selectedPrims.length} selected`
    :                 'Roof summary';

  return (
    <aside style={{
      width: 240, background: T.panel, borderLeft: `1px solid ${T.line}`,
      padding: 14, overflow: 'auto', fontSize: 12, color: T.ink,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
        color: T.inkMuted, textTransform: 'uppercase', marginBottom: 10,
      }}>
        {headerLabel}
      </div>

      {showEave && eaveSel ? (
        <EaveEdgePanel
          wallId={eaveSel.wallId}
          defaultOverhang={defaultOverhang}
          currentOverride={eaveOverhangs?.[eaveSel.wallId]}
          onSetOverhang={(v) => onSetWallOverhang(eaveSel.wallId, v)}
          onClear={onClearEaveSel}
        />
      ) : showSelection ? (
        <>
          {soleLine && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.6px',
                color: T.inkMuted, textTransform: 'uppercase', marginBottom: 6,
              }}>Line type</div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 2, padding: 3,
                background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8,
              }}>
                {LINE_TYPE_OPTIONS.map(o => (
                  <LineTypeButton
                    key={o.id}
                    label={o.label}
                    active={soleLine.style === o.style}
                    onClick={() => onSetLineStyle(soleLine.id, o.style)}
                  />
                ))}
              </div>
            </div>
          )}
          {selectedPrims.slice(0, 6).map(p => (
            <PrimRow key={p.id} prim={p} />
          ))}
          {selectedPrims.length > 6 && (
            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 4 }}>
              + {selectedPrims.length - 6} more…
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 11, color: T.inkSoft, lineHeight: 1.5 }}>
            Drag endpoints to re-route. Drag the body to translate. Delete to remove.
          </div>
        </>
      ) : (
        <>
          <Row label="Ridge beams" value={`${ridges}`} />
          <Row label="Valleys"     value={`${valleys}`} />
          <Row label="Hips"        value={`${hips}`} />
          <Row label="Lines"       value={`${lines}`} />
          <Row label="Dims"        value={`${dims}`} />
          <Row label="Texts"       value={`${texts}`} />

          <div style={{
            marginTop: 16, padding: '10px 12px',
            background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6,
            fontSize: 11, color: T.inkSoft, lineHeight: 1.5,
          }}>
            Pick the <strong>Line</strong> tool from the left palette, then choose <strong>Ridge Beam</strong>, <strong>Valley Pad</strong>, or <strong>Hip</strong> from the type picker. A ridge end with a hip rafter becomes a hip; a ridge running to the wall is a gable.
            Click a <strong>soffit edge</strong> with the Select tool to change that wall&apos;s overhang.
            Auto ortho-lock — hold <strong>Shift</strong> to free-draw.
          </div>
        </>
      )}
    </aside>
  );
}

// Modal dialog for the STEM Sketch-style Offset flow. Opens after the user
// clicks a source line; asks for a signed distance (positive / negative
// pick the perpendicular side). Confirm commits a parallel-copy PrimLine
// at that signed distance; Cancel / Esc backs out. The live ghost on the
// canvas is driven by `defaultText` so this component only owns the input
// field, not the preview itself.
function OffsetDialog({
  defaultText, defaultDistance, onChange, onConfirm, onCancel,
}: {
  defaultText: string;
  defaultDistance: number;
  onChange: (next: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 18, 32, 0.35)', zIndex: 10,
    }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        width: 360, padding: 18, background: T.panel,
        border: `1px solid ${T.lineStrong}`, borderRadius: 10,
        boxShadow: T.shadow, fontSize: 12, color: T.ink,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
          color: T.accent, textTransform: 'uppercase', marginBottom: 8,
        }}>Offset shape</div>
        <p style={{ margin: '0 0 12px', color: T.inkSoft, lineHeight: 1.5 }}>
          Make a parallel copy of the selected line. The sign of the distance
          picks the side — positive and negative offset to opposite sides of
          the source. The dashed preview shows which side.
        </p>
        <label style={{
          display: 'block', fontSize: 11, color: T.inkSoft, marginBottom: 4,
        }}>
          Distance (in)
        </label>
        <input
          ref={inputRef}
          type="text"
          value={defaultText}
          placeholder={defaultDistance.toString()}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          style={{
            width: '100%', padding: '6px 8px', fontSize: 13,
            border: `1px solid ${T.line}`, borderRadius: 5,
            background: T.bg, color: T.ink, marginBottom: 12,
          }}
          title="e.g. 12  or  1'6  or  -8 to flip the side"
        />
        <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 14 }}>
          Tip: type a <strong>negative</strong> distance to offset to the other
          side of the line.
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: 600,
            background: T.bg, color: T.ink,
            border: `1px solid ${T.line}`, borderRadius: 5, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '6px 14px', fontSize: 11, fontWeight: 600,
            background: T.accent, color: '#ffffff',
            border: `1px solid ${T.accent}`, borderRadius: 5, cursor: 'pointer',
          }}>Offset</button>
        </div>
      </div>
    </div>
  );
}

// Editor for one eave edge's overhang. The user can type a new value and
// press Enter / blur to commit; "Reset to default" removes the override so
// the edge reverts to `roof.overhang`. The local string state lets the user
// freely edit the number without each keystroke pushing a re-render through
// the project-level mutator.
function EaveEdgePanel({
  wallId, defaultOverhang, currentOverride, onSetOverhang, onClear,
}: {
  wallId: string;
  defaultOverhang: number;
  currentOverride: number | undefined;
  onSetOverhang: (inches: number | null) => void;
  onClear: () => void;
}) {
  const active = currentOverride != null ? currentOverride : defaultOverhang;
  const [text, setText] = useState<string>(active.toString());
  const lastWallRef = useRef<string>(wallId);
  // Re-seed the local input when the user picks a different edge OR when
  // the underlying override changes from elsewhere.
  useEffect(() => {
    if (lastWallRef.current !== wallId || text === '') {
      setText(active.toString());
      lastWallRef.current = wallId;
    }
    // We intentionally don't sync on `text` so the user can type freely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallId, currentOverride]);

  const commit = () => {
    const v = Number.parseFloat(text);
    if (!Number.isFinite(v) || v < 0) {
      setText(active.toString());
      return;
    }
    onSetOverhang(v);
  };

  const isOverridden = currentOverride != null;

  return (
    <>
      <Row label="Default overhang" value={formatImperial(defaultOverhang)} />
      <div style={{ marginTop: 10 }}>
        <label style={{
          display: 'block', fontSize: 11, color: T.inkSoft, marginBottom: 4,
        }}>
          This edge&apos;s overhang (in)
        </label>
        <input
          type="number"
          min={0}
          step={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setText(active.toString()); (e.target as HTMLInputElement).blur(); }
          }}
          style={{
            width: '100%', padding: '5px 8px', fontSize: 12,
            border: `1px solid ${T.line}`, borderRadius: 5,
            background: T.bg, color: T.ink,
          }}
        />
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
        <button
          onClick={() => onSetOverhang(null)}
          disabled={!isOverridden}
          style={{
            flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
            background: T.bg, color: isOverridden ? T.ink : T.inkMuted,
            border: `1px solid ${T.line}`, borderRadius: 5,
            cursor: isOverridden ? 'pointer' : 'default',
          }}
          title="Revert this edge to the default overhang"
        >Reset</button>
        <button
          onClick={onClear}
          style={{
            flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
            background: T.bg, color: T.ink,
            border: `1px solid ${T.line}`, borderRadius: 5, cursor: 'pointer',
          }}
        >Done</button>
      </div>

      <div style={{
        marginTop: 14, fontSize: 11, color: T.inkSoft, lineHeight: 1.5,
      }}>
        Push one section of the soffit out farther than the rest — useful where
        a cross-gable meets the main eave. Wall id: <code style={{ fontSize: 10 }}>{wallId.slice(0, 8)}</code>
      </div>
    </>
  );
}

function PrimRow({ prim }: { prim: SectionPrimitive }) {
  let label = prim.kind as string;
  let detail = '';
  if (prim.kind === 'line') {
    const len = Math.hypot(prim.b.x - prim.a.x, prim.b.y - prim.a.y);
    const styleLabel =
      prim.style === 'ridge'  ? 'Ridge beam' :
      prim.style === 'valley' ? 'Valley'     :
      prim.style === 'hip'    ? 'Hip'        :
      'Line';
    label = styleLabel;
    detail = formatImperial(len);
  } else if (prim.kind === 'text') {
    label = 'Text';
    detail = ((prim as PrimText).content ?? '').slice(0, 14);
  } else if (prim.kind === 'dimLinear') {
    label = 'Dim';
    detail = formatImperial(Math.hypot(prim.b.x - prim.a.x, prim.b.y - prim.a.y));
  }
  return <Row label={label} value={detail} />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '3px 0', borderBottom: `1px dashed ${T.line}`,
      fontSize: 11,
    }}>
      <span style={{ color: T.inkSoft }}>{label}</span>
      <span style={{ color: T.ink, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ── UI bits ────────────────────────────────────────────────────────────────

function LineTypeButton({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        padding: '5px 10px', fontSize: 12, fontWeight: 600,
        background: active ? T.panel : 'transparent',
        color: active ? T.ink : T.inkSoft,
        border: active ? `1px solid ${T.lineStrong}` : '1px solid transparent',
        borderRadius: 6, cursor: 'pointer',
        boxShadow: active ? T.shadow : 'none',
        transition: 'all 120ms',
      }}
    >{label}</button>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.inkSoft }}>
      {label}: {children}
    </label>
  );
}

function EmptyState() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: 440, padding: '28px 32px', background: T.panel,
        border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: T.shadow,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
          color: T.accent, textTransform: 'uppercase', marginBottom: 8,
        }}>No footprint yet</div>
        <h2 style={{ fontSize: 18, color: T.ink, margin: '0 0 8px' }}>
          Draw exterior walls first
        </h2>
        <p style={{ fontSize: 13, color: T.inkSoft, margin: 0, lineHeight: 1.6 }}>
          The roof plan is generated from a closed loop of exterior walls on the
          active floor. Switch to the <em>2D Plan</em> tab and draw the building
          perimeter, then come back here to lay out the roof.
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: 12,
  border: `1px solid ${T.line}`,
  borderRadius: 5,
  background: T.panel,
  color: T.ink,
};

const miniButtonStyle: React.CSSProperties = {
  padding: '5px 12px',
  fontSize: 11,
  fontWeight: 600,
  background: T.panel,
  color: T.ink,
  border: `1px solid ${T.line}`,
  borderRadius: 6,
  cursor: 'pointer',
};
