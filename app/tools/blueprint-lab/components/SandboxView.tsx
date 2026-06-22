'use client';

// Sandbox view — a CAD "paperspace" sheet that composites every generated
// drawing (floor plan, roof plan, elevations, sections) into one aligned
// layout (Row or Projected), with DXF export.
//
// Editing: the elevations & sections are editable "simple line" drawings via
// the LEFT toolbar tools (select / trim / dimension / erase; offset & text
// pending), gated by the "Edit current views" toggle, writing to the per-view
// drafting buckets. The floor plan & roof plan are read-only here. Projection
// guides (infinite H/V lines) are a separate alignment-check layer on
// project.sheet.guides. See engine/sandboxEdit.ts.
//
// Rendering reuses the section/elevation canvas primitive walker
// (`renderSectionPrimitives`); each block gets its own Projector mapping its
// local coords into the shared sheet transform. The composer keeps every
// elevation/section at the same world-Y so grade/plate/ridge datums line up.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HatchPattern, PrimHatch, Project, SectionLineStyle, SectionPrimitive, ToolId, Vec2, makeId } from '../engine/types';
import { Projector, renderSectionPrimitives } from '../engine/sectionPrimitives';
import { Viewport, drawScene, drawSectionCutSymbol } from '../engine/renderer';
import { SheetBlock, SheetBounds, SheetLayoutMode, buildSheet } from '../engine/sheet';
import { buildSheetDxf } from '../engine/dxf';
import { buildSheetPdf } from '../engine/pdf';
import { computeBoxSelection, filletPreview, hitTestLineHandle, hitTestTopmost, makeUserDimLinear, makeUserPrimId, mirrorReflector, signedPerpendicularOffset } from '../engine/sectionEdit';
import { SnapResult, drawSnapIndicator, findSnap } from '../engine/sectionSnap';
import {
  addLine, appendPrim, blockLocalToSheet, blockToSheet, computeExtend, deleteIds, editablePrims, enterEditMode,
  extendLineAt, filletLinesAt, guideSegmentsForBlock, isSandboxEditable, mirrorSelection, moveVertex, pickEditableBlock,
  primSheetVertices, setLineEndpoint, sheetToBlockLocal, translateIds, trimLineAt,
} from '../engine/sandboxEdit';
import { T } from '../engine/theme';

// "Aperture" cursor (circle + crosshair) for drawing tools — matches the 2D
// plan's line cursor so snapping feels the same here.
const APERTURE_CURSOR = (() => {
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
// Eraser cursor for the Erase tool.
const ERASER_CURSOR = (() => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>` +
    `<g fill='none' stroke='#1f2540' stroke-width='1.6' stroke-linejoin='round'>` +
    `<path d='M16 4l8 8-10 10H6l-2-2z'/><path d='M10 10l8 8'/></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 4 24, crosshair`;
})();

function sandboxCursor(panning: boolean, editing: boolean, tool: ToolId): string {
  if (panning) return 'grabbing';
  if (editing) {
    if (tool === 'erase') return ERASER_CURSOR;
    if (tool === 'select') return 'default';
    return APERTURE_CURSOR;     // line / dimension / offset / text / trim
  }
  return 'default';
}

// The left-toolbar tools that EDIT the sheet's views (vs. plain pan). Picking
// any of these implies "edit current views" — so the tool just works, exactly
// like the floor plan, instead of silently doing nothing until a separate
// toggle is flipped.
const SANDBOX_DRAW_TOOLS: ToolId[] = ['line', 'dimension', 'trim', 'extend', 'erase', 'offset', 'text', 'select', 'mirror', 'hatch', 'fillet'];
function isDrawTool(t: ToolId): boolean { return SANDBOX_DRAW_TOOLS.includes(t); }

// Hatch material patterns — same set the Elevations view offers, so the tool
// behaves identically on both surfaces.
const HATCH_PATTERNS: HatchPattern[] = [
  'lap-siding', 'board-batten', 'brick', 'stone', 'stucco', 'shake',
  'roof-shingles', 'blank',
];

// The Line tool's "type" — the regular section dash styles PLUS two PROJECTION
// kinds. Picking a projection type turns the Line tool into the alignment-line
// placer: one click drops an infinite horizontal/vertical construction line
// (snapped to a feature) that other tools can then snap to and intersect, and
// the Erase tool can remove individually — i.e. it's a real line, just folded
// into the same picker instead of living as a separate tool up top.
type SbLineType = SectionLineStyle | 'proj-h' | 'proj-v';
function isProjType(s: SbLineType): s is 'proj-h' | 'proj-v' { return s === 'proj-h' || s === 'proj-v'; }

// Line-style choices for the Line tool — same dash vocabulary as the section /
// roof drafting workspaces, plus the two projection lines at the bottom.
const LINE_STYLE_CHOICES: { id: SbLineType; label: string; dash: string; arrow?: boolean; proj?: boolean }[] = [
  { id: 'solid',  label: 'Solid',  dash: '' },
  { id: 'dashed', label: 'Dashed', dash: '8,4' },
  { id: 'dotted', label: 'Dotted', dash: '1.5,3' },
  { id: 'center', label: 'Center', dash: '12,3,2,3' },
  { id: 'hidden', label: 'Hidden', dash: '4,4' },
  { id: 'arrow',  label: 'Arrow',  dash: '', arrow: true },
  { id: 'proj-h', label: 'Projection — H', dash: '2,3', proj: true },
  { id: 'proj-v', label: 'Projection — V', dash: '2,3', proj: true },
];

// Right-angle lock: constrain a point to perfectly horizontal/vertical from an
// anchor, on whichever axis the cursor is dominant — the Line tool's "ortho"
// default (same as the Specs/Section drafting workspace). Block-local coords.
function applyOrthoFromCursor(anchor: Vec2, p: Vec2): Vec2 {
  return Math.abs(p.x - anchor.x) >= Math.abs(p.y - anchor.y)
    ? { x: p.x, y: anchor.y }    // horizontal
    : { x: anchor.x, y: p.y };   // vertical
}

// Angle within which a line locks onto a candidate direction (parallel/perp to
// the reference line). Matches the Elevations view's ortho-lock tolerance.
const ORTHO_LOCK_DEG = 7;

// Foot of the perpendicular from p onto the infinite line through `anchor` in
// unit direction d — i.e. p constrained to lie on that ray's axis.
function projectOntoDir(anchor: Vec2, p: Vec2, d: Vec2): Vec2 {
  const t = (p.x - anchor.x) * d.x + (p.y - anchor.y) * d.y;
  return { x: anchor.x + d.x * t, y: anchor.y + d.y * t };
}

// Perpendicular distance from p to segment (a,b) — for finding the line a draw
// started on.
function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Unit direction of the editable line/polyline segment nearest `p` (within tol),
// used as the reference axis for parallel/perpendicular angle locks. null when
// nothing's close (→ fall back to plain H/V ortho).
function nearestLineDir(prims: SectionPrimitive[], p: Vec2, tol: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tol;
  const consider = (a: Vec2, b: Vec2) => {
    const d = distToSeg(p, a, b);
    if (d >= bestD) return;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len > 1e-6) { bestD = d; best = { x: dx / len, y: dy / len }; }
  };
  for (const pr of prims) {
    if (pr.kind === 'line') consider(pr.a, pr.b);
    else if (pr.kind === 'polyline' || pr.kind === 'hatch') {
      for (let i = 0; i < pr.verts.length - 1; i++) consider(pr.verts[i], pr.verts[i + 1]);
      // hatch is always a closed region; polyline only when flagged closed.
      const closed = pr.kind === 'hatch' || pr.closed;
      if (closed && pr.verts.length > 1) consider(pr.verts[pr.verts.length - 1], pr.verts[0]);
    }
  }
  return best;
}

// Architectural scale → screen px per world inch at zoom 1.0.
//   1/2"=1'-0" ⇒ 4 px/in,  1/4"=1'-0" ⇒ 2 px/in,  1/8"=1'-0" ⇒ 1 px/in
type ScaleMode = 'half' | 'quarter' | 'eighth';
const SCALE_PX_PER_INCH: Record<ScaleMode, number> = { half: 4, quarter: 2, eighth: 1 };
const SCALE_LABEL: Record<ScaleMode, string> = {
  half: '1/2" = 1\'-0"', quarter: '1/4" = 1\'-0"', eighth: '1/8" = 1\'-0"',
};
const SCALE_ORDER: ScaleMode[] = ['half', 'quarter', 'eighth'];

// PDF-export plot scales. `value` is the paper:real factor (e.g. 1/4" = 1'-0"
// → 0.25"/12" = 1/48). 'fit' auto-fits the sheet to a valid page. Any factor
// that would overflow the PDF 200" page limit is clamped down by buildSheetPdf.
const PDF_SCALES: { label: string; value: number | 'fit' }[] = [
  { label: 'Fit to page', value: 'fit' },
  { label: '1:1 (true size)', value: 1 },
  { label: '1" = 1\'-0" (1:12)', value: 1 / 12 },
  { label: '3/4" = 1\'-0" (1:16)', value: 0.75 / 12 },
  { label: '1/2" = 1\'-0" (1:24)', value: 0.5 / 12 },
  { label: '1/4" = 1\'-0" (1:48)', value: 0.25 / 12 },
  { label: '3/16" = 1\'-0" (1:64)', value: 0.1875 / 12 },
  { label: '1/8" = 1\'-0" (1:96)', value: 0.125 / 12 },
];
// PDF-export line-color overrides (null = keep each primitive's drawn colour).
const PDF_LINE_COLORS: { label: string; value: string | null }[] = [
  { label: 'As drawn', value: null },
  { label: 'Black', value: '#000000' },
  { label: 'White', value: '#ffffff' },   // most visible on a dark CAD background
  { label: 'Blue', value: '#0047ab' },
  { label: 'Red', value: '#c0143c' },
  { label: 'Gray', value: '#555555' },
];
// Reference px-per-inch at which text renders at its nominal (authored) size.
// World-locked text scales by (current px-per-inch ÷ this), so at this scale
// text matches the 2D editor's look (its default is also 2 px/in) and shrinks
// from there as you zoom out. See the draw loop's `textScale`.
const BASE_PX_PER_INCH = 2;
// Zoom range (× the architectural scale's px/in). Max is generous so the user
// can zoom right into a joint/connection detail; min lets the whole sheet fit.
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;
// Projection / construction guide lines — a distinct rose so they read as
// non-drawing alignment helpers.
const GUIDE_COLOR = '#E11D48';

interface VP {
  panX: number; panY: number; zoom: number;
  scaleMode: ScaleMode; width: number; height: number;
}

function pxPerInchOf(vp: VP): number {
  return SCALE_PX_PER_INCH[vp.scaleMode] * vp.zoom;
}

// A primitive block's local coords → screen, via the sheet projector. Plan
// space flips Y; `textScale` world-locks text/ticks. (Rotation, when present,
// is applied by the caller via ctx.rotate — editable blocks are rotation-0.)
function blockProjector(block: SheetBlock, proj: Projector, textScale: number): Projector {
  const flip = block.space === 'plan';
  return {
    px: proj.px,
    zoom: textScale,
    sx: (xIn: number) => proj.sx(xIn + block.offset.x),
    sy: (yIn: number) => proj.sy((flip ? -yIn : yIn) + block.offset.y),
  };
}

// Sheet-world (Y-up inches) → screen pixels.
function makeProjector(vp: VP): Projector {
  const px = pxPerInchOf(vp);
  const cx = vp.panX + vp.width / 2;
  const cy = vp.panY + vp.height / 2;
  return {
    px,
    zoom: vp.zoom,
    sx: (xIn: number) => cx + xIn * px,
    sy: (yIn: number) => cy - yIn * px,
  };
}

// Choose scale + zoom so the whole composite fits ~90% of the viewport,
// centered. Prefer a clean architectural scale at zoom 1.0; only fall back to
// a reduced zoom (at the smallest scale) when even 1/8" doesn't fit.
function fitVp(bounds: SheetBounds, width: number, height: number): VP {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  for (const mode of SCALE_ORDER) {
    const px = SCALE_PX_PER_INCH[mode];
    if (bw * px <= width * 0.92 && bh * px <= height * 0.92) {
      return { scaleMode: mode, zoom: 1, panX: -cx * px, panY: cy * px, width, height };
    }
  }
  const base = SCALE_PX_PER_INCH.eighth;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
    Math.min((width * 0.92) / (bw * base), (height * 0.92) / (bh * base))));
  const px = base * zoom;
  return { scaleMode: 'eighth', zoom, panX: -cx * px, panY: cy * px, width, height };
}

export default function SandboxView({ project, onChange, tool, orthoOn, onBeginLiveOp, onEndLiveOp }: {
  project: Project; onChange: (p: Project) => void;
  tool: ToolId; onChangeTool: (t: ToolId) => void;
  orthoOn: boolean;   // global right-angle lock (StatusBar) — locks the Line tool to H/V
  // Bracket a multi-tick drag so the WHOLE gesture is ONE undo entry (not one
  // per mouse-move). Optional so the component still works in embed/test.
  onBeginLiveOp?: () => void;
  onEndLiveOp?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<VP>({
    panX: 0, panY: 0, zoom: 1, scaleMode: 'quarter', width: 800, height: 600,
  });
  const [panning, setPanning] = useState<{ from: { x: number; y: number }; pan0: { x: number; y: number } } | null>(null);
  const autoFittedRef = useRef(false);
  const shiftRef = useRef(false);   // Shift held → free-draw (disables ortho lock)
  // Click-vs-drag: a drag commits nothing until the pointer moves past this many
  // screen px, so a click with a little jitter doesn't record a phantom move /
  // undo entry. Armed (true) once a real drag begins. Matches the 2D plan.
  const dragArmedRef = useRef(false);
  const DRAG_ARM_PX = 4;
  const [layoutMode, setLayoutMode] = useState<SheetLayoutMode>('row');

  // ── Edit state ──────────────────────────────────────────────────────────────
  // `editing` gates view editing (the "Edit current views" button). The active
  // EDIT tool comes from the left toolbar (`tool`). Projection guides are a
  // separate mode, independent of editing.
  const [editing, setEditing] = useState(false);
  const [lineType, setLineType] = useState<SbLineType>('solid');  // type for the Line tool (dash style OR a projection axis)
  const [mirrorAxis, setMirrorAxis] = useState<'x' | 'y'>('y');   // Mirror tool axis: y = vertical line (flip L/R), x = horizontal (flip top/bottom)
  const [selection, setSelection] = useState<{ blockId: string; ids: string[] } | null>(null);
  const [dimDraft, setDimDraft] = useState<{ blockId: string; a: Vec2; b: Vec2 | null } | null>(null);  // block-local
  const [lineDraft, setLineDraft] = useState<{ blockId: string; a: Vec2; refDir?: Vec2 } | null>(null);  // block-local; refDir = the line it started on, for parallel/perp locks
  const [snap, setSnap] = useState<{ blockId: string; result: SnapResult } | null>(null);               // live snap (block-local)
  const [cursorSheet, setCursorSheet] = useState<Vec2 | null>(null);
  const [drag, setDrag] = useState<{ blockId: string; mode: 'body' | 'a' | 'b' | 'vertex'; primId?: string; vertexIndex?: number; ids: string[]; startLocal: Vec2; base: Project } | null>(null);
  const [marquee, setMarquee] = useState<{ start: Vec2; current: Vec2 } | null>(null);   // sheet-world drag-box selection
  const [extendPreview, setExtendPreview] = useState<{ blockId: string; from: Vec2; to: Vec2 } | null>(null);  // Extend tool hover ghost (block-local)
  const [hatchDraft, setHatchDraft] = useState<{ blockId: string; verts: Vec2[] } | null>(null);  // in-progress hatch polygon (block-local)
  const [hatchPattern, setHatchPattern] = useState<HatchPattern>('brick');
  const [filletFirst, setFilletFirst] = useState<{ blockId: string; id: string; pick: Vec2 } | null>(null);  // first fillet pick (block-local)

  // screen (css px in canvas) → sheet-world; and a world-space pick tolerance.
  const screenToSheet = useCallback((cssX: number, cssY: number): Vec2 => {
    const px = pxPerInchOf(vp);
    const cx = vp.panX + vp.width / 2, cy = vp.panY + vp.height / 2;
    return { x: (cssX - cx) / px, y: (cy - cssY) / px };
  }, [vp]);
  const tolIn = useCallback(() => 8 / pxPerInchOf(vp), [vp]);

  // Snap a block-local point to the nearest endpoint / midpoint / intersection /
  // on-edge of that block's editable primitives. Returns the snapped point and
  // the snap result (for the indicator).
  const snapLocal = useCallback((block: ReturnType<typeof pickEditableBlock>, local: Vec2): { point: Vec2; result: SnapResult | null } => {
    if (!block) return { point: local, result: null };
    const guideSegs = guideSegmentsForBlock(block, project.sheet?.guides ?? []);
    const res = findSnap(local, editablePrims(block, project), tolIn() * 1.5, { guides: guideSegs });
    return { point: res ? res.point : local, result: res };
  }, [project, tolIn]);

  // Resolve a Line tool point (block-local). Priority: a real geometry/guide
  // snap wins; else (right-angle lock on, Shift not held) lock the angle — first
  // to PARALLEL or PERPENDICULAR of the line the draw started on (`refDir`, so a
  // line can go square off an angled roof slope), and otherwise to plain H/V.
  const resolveLinePoint = useCallback((block: NonNullable<ReturnType<typeof pickEditableBlock>>, anchor: Vec2, sheetPt: Vec2, shift: boolean, refDir?: Vec2 | null): Vec2 => {
    const local = sheetToBlockLocal(block, sheetPt);
    const sr = snapLocal(block, local);
    if (sr.result && sr.result.kind !== 'grid') return sr.point;   // snap overrides ortho
    if (!orthoOn || shift) return local;                           // free draw
    if (refDir) {
      const v = { x: local.x - anchor.x, y: local.y - anchor.y };
      const len = Math.hypot(v.x, v.y);
      if (len > 1e-6) {
        const perp = { x: -refDir.y, y: refDir.x };
        let best: Vec2 | null = null;
        let bestAng = (ORTHO_LOCK_DEG * Math.PI) / 180;
        for (const d of [refDir, perp]) {
          const ang = Math.acos(Math.min(1, Math.abs(v.x * d.x + v.y * d.y) / len));
          if (ang < bestAng) { bestAng = ang; best = d; }
        }
        if (best) return projectOntoDir(anchor, local, best);
      }
    }
    return applyOrthoFromCursor(anchor, local);                    // default H/V right-angle lock
  }, [snapLocal, orthoOn]);

  // Drag-box (marquee) selection. A box can land over any editable view, so we
  // test each one (box corners → its local frame) and pick the block with the
  // most lines caught — selection stays single-block (matching drag/delete).
  // Left→right = window (fully inside); right→left = crossing (touch), like the
  // floor plan. Returns the winning block + its hit ids, or null.
  const boxHits = useCallback((startSheet: Vec2, currentSheet: Vec2): { blockId: string; ids: string[] } | null => {
    let best: { blockId: string; ids: string[] } | null = null;
    for (const block of sheetRef.current.blocks) {
      if (!isSandboxEditable(block)) continue;
      const s = sheetToBlockLocal(block, startSheet);
      const c = sheetToBlockLocal(block, currentSheet);
      const { ids } = computeBoxSelection(editablePrims(block, project), s, c);
      if (ids.size && (!best || ids.size > best.ids.length)) best = { blockId: block.id, ids: [...ids] };
    }
    return best;
  }, [project]);

  // Recompute the composite whenever the project (or layout mode) changes — so
  // edits made in any other tab show up here live (without disturbing pan/zoom).
  const sheet = useMemo(() => buildSheet(project, layoutMode), [project, layoutMode]);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const doFit = useCallback(() => {
    const host = containerRef.current;
    if (!host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (w < 20 || h < 20) return;
    const b = sheetRef.current.bounds;
    if (!b) { setVp(v => ({ ...v, width: w, height: h })); return; }
    setVp(fitVp(b, w, h));
  }, []);

  // Re-fit when the layout mode changes (Row ↔ Projected reshape the sheet
  // dramatically, so the previous pan/zoom rarely makes sense).
  useEffect(() => {
    if (autoFittedRef.current) doFit();
  }, [layoutMode, doFit]);

  // Trigger a browser download of a blob.
  const downloadBlob = useCallback((blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (project.name || 'blueprint').replace(/[^\w.-]+/g, '_');
    a.href = url;
    a.download = `${safe}-sandbox.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [project.name]);

  // Export the WHOLE sheet (current layout) as a single DXF for AutoCAD/CAD.
  const onExportDxf = useCallback(() => {
    const dxf = buildSheetDxf(sheetRef.current);
    downloadBlob(new Blob([dxf], { type: 'application/dxf' }), 'dxf');
  }, [downloadBlob]);

  // Export the sheet as a vector PDF (filled, full detail) for CAD/vector tools.
  // Async because jsPDF is dynamically imported. Options (scale / hatches / line
  // colour) live in the popover toggled by the caret next to the button.
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfOptsOpen, setPdfOptsOpen] = useState(false);
  const [pdfScale, setPdfScale] = useState<number | 'fit'>('fit');
  const [pdfHideHatch, setPdfHideHatch] = useState(false);
  const [pdfLineColor, setPdfLineColor] = useState<string | null>(null);
  const onExportPdf = useCallback(async () => {
    setPdfBusy(true);
    setPdfOptsOpen(false);
    try {
      // Only pass a label for explicit architectural scales (not Fit / 1:1,
      // which get their own note text).
      const preset = PDF_SCALES.find(s => s.value === pdfScale);
      const blob = await buildSheetPdf(sheetRef.current, {
        scale: pdfScale,
        scaleLabel: (pdfScale !== 'fit' && pdfScale !== 1) ? preset?.label : undefined,
        hideHatches: pdfHideHatch,
        lineColor: pdfLineColor,
      });
      downloadBlob(blob, 'pdf');
    } finally {
      setPdfBusy(false);
    }
  }, [downloadBlob, pdfScale, pdfHideHatch, pdfLineColor]);

  // Reset all Sandbox view edits → revert the elevations + sections to their
  // auto-generated drawings (clears their drafting snapshots).
  const onResetViews = useCallback(() => {
    const hasEdits = !!(project.elevationDrafting && Object.keys(project.elevationDrafting).length)
      || !!(project.sectionDrafting?.cuts && Object.keys(project.sectionDrafting.cuts).length);
    if (!hasEdits) return;
    if (!window.confirm('Reset edited views to the original auto-generated drawings? Your line edits on the elevations and sections will be discarded.')) return;
    const next = { ...project, elevationDrafting: undefined } as Project;
    if (next.sectionDrafting) next.sectionDrafting = { ...next.sectionDrafting, cuts: undefined };
    setSelection(null);
    onChange(next);
  }, [project, onChange]);

  // Picking an explicit drawing tool (Line / Dimension / Trim / Erase / Offset /
  // Text) from the left toolbar implies "edit current views" — so it works
  // immediately, like the floor plan, instead of silently doing nothing until
  // the toggle is flipped. Select stays neutral (it pans until you're editing).
  // enterEditMode is idempotent, so re-running it is harmless.
  useEffect(() => {
    if (editing) return;
    if (tool === 'select' || !isDrawTool(tool)) return;
    setEditing(true);
    onChange(enterEditMode(project, sheetRef.current.blocks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Snap a guide position to the nearest geometry vertex (across every block)
  // so a projection line latches onto a real feature (fascia, plate, corner…).
  const snapGuide = useCallback((sheetPt: Vec2, axis: 'h' | 'v'): number => {
    const tol = tolIn() * 1.5;
    let best: number | null = null;
    let bestD = tol;
    for (const block of sheetRef.current.blocks) {
      for (const p of (block.primitives ?? [])) {
        for (const v of primSheetVertices(block, p)) {
          const d = Math.hypot(v.x - sheetPt.x, v.y - sheetPt.y);
          if (d < bestD) { bestD = d; best = axis === 'h' ? v.y : v.x; }
        }
      }
    }
    return best ?? (axis === 'h' ? sheetPt.y : sheetPt.x);
  }, [tolIn]);

  const guides = project.sheet?.guides ?? [];
  const setGuides = useCallback((next: typeof guides) => {
    onChange({ ...project, sheet: { ...project.sheet, guides: next } });
  }, [project, onChange]);

  // Size observer: fit once on the first valid size, then just track W/H.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const apply = (w: number, h: number) => {
      if (w < 20 || h < 20) return;
      if (!autoFittedRef.current) {
        autoFittedRef.current = true;
        const b = sheetRef.current.bounds;
        setVp(b ? fitVp(b, w, h) : { panX: 0, panY: 0, zoom: 1, scaleMode: 'quarter', width: w, height: h });
      } else {
        setVp(v => ({ ...v, width: w, height: h }));
      }
    };
    apply(host.clientWidth, host.clientHeight);
    const ro = new ResizeObserver(() => apply(host.clientWidth, host.clientHeight));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Wheel zoom centered on the cursor.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      setVp(s => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * factor));
        const oldPx = SCALE_PX_PER_INCH[s.scaleMode] * s.zoom;
        const newPx = SCALE_PX_PER_INCH[s.scaleMode] * newZoom;
        const worldX = (sx - s.panX - s.width / 2) / oldPx;
        const worldYscr = (sy - s.panY - s.height / 2) / oldPx;
        return {
          ...s, zoom: newZoom,
          panX: sx - s.width / 2 - worldX * newPx,
          panY: sy - s.height / 2 - worldYscr * newPx,
        };
      });
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = vp.width, h = vp.height;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const proj = makeProjector(vp);
    const px = proj.px;

    for (const block of sheet.blocks) {
      // Plate frame rect (screen px) from the block's sheet-world bounds.
      const left = proj.sx(block.sheetBounds.minX) - 10;
      const right = proj.sx(block.sheetBounds.maxX) + 10;
      const top = proj.sy(block.sheetBounds.maxY) - 10;
      const bottom = proj.sy(block.sheetBounds.minY) + 10;

      // Rotation (Projected mode) pivots about the block's sheet-world center.
      // All text is WORLD-LOCKED: it scales with the drawing (∝ px-per-inch),
      // so it grows when you zoom in and becomes unreadably small when you zoom
      // out — like a real to-scale drawing — rather than staying a fixed screen
      // size. `textScale` (= drawing px ÷ a fixed reference) is the factor that
      // makes that happen, applied identically to the primitive walker's `zoom`
      // and (via ctx.scale) to drawScene's otherwise-fixed-px plan text.
      const rot = block.rotationDeg || 0;
      const rotRad = (rot * Math.PI) / 180;
      const scx = proj.sx(block.center.x);
      const scy = proj.sy(block.center.y);
      const textScale = px / BASE_PX_PER_INCH;

      ctx.save();
      if (block.kind === 'plan-scene' && block.level) {
        // Clip to the block's frame so the plan can't bleed over neighbours
        // (set in screen space, before any transform).
        ctx.beginPath();
        ctx.rect(left, top, right - left, bottom - top);
        ctx.clip();
        // Render the plan at a FIXED base scale, then scale the whole thing by
        // `textScale` about the block's screen center. drawScene draws its text
        // at constant px; scaling the canvas makes that text (and the geometry)
        // grow/shrink together with the drawing. Net geometry placement is
        // identical to projecting each point directly — only the text now
        // scales. (Rotation composes in for Projected mode.)
        ctx.translate(scx, scy);
        if (rot) ctx.rotate(rotRad);
        ctx.scale(textScale, textScale);
        const planCx = (block.localBounds.minX + block.localBounds.maxX) / 2;
        const planCy = (block.localBounds.minY + block.localBounds.maxY) / 2;
        const planVp: Viewport = {
          pxPerInch: BASE_PX_PER_INCH,
          pan: {
            x: -planCx * BASE_PX_PER_INCH - vp.width / 2,
            y: -planCy * BASE_PX_PER_INCH - vp.height / 2,
          },
          width: vp.width, height: vp.height,
        };
        drawScene(ctx, block.level, planVp, 12, false, []);
        // Show the section cut lines on the plan so viewers know which line
        // each section was taken from. Drawn in the same (scaled/rotated)
        // context as the plan, so the markers scale and rotate with it.
        for (const cut of project.sectionCuts ?? []) {
          drawSectionCutSymbol(ctx, cut, planVp, false);
        }
      } else if (block.primitives) {
        if (rot) { ctx.translate(scx, scy); ctx.rotate(rotRad); ctx.translate(-scx, -scy); }
        renderSectionPrimitives(ctx, block.primitives, blockProjector(block, proj, textScale));
      }
      ctx.restore();

      // Plate frame + title around every block. The frame is screen-fixed
      // (it's chrome), but the TITLE is world-locked like the drawing text so
      // it scales with the sheet and goes unreadable when zoomed out.
      ctx.save();
      ctx.strokeStyle = T.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(left, top, right - left, bottom - top);
      ctx.setLineDash([]);
      const titleSize = 11 * textScale;
      if (titleSize >= 1) {
        ctx.fillStyle = T.inkSoft;
        ctx.font = `600 ${titleSize}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(block.title, left, top - 4 * textScale);
      }
      ctx.restore();
    }

    // Selection highlight (editable line drawings).
    if (selection) {
      const block = sheet.blocks.find(b => b.id === selection.blockId);
      if (block) {
        const idset = new Set(selection.ids);
        const toScr = (v: Vec2) => { const s = blockLocalToSheet(block, v); return { x: proj.sx(s.x), y: proj.sy(s.y) }; };
        const dot = (s: { x: number; y: number }) => { ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke(); };
        ctx.save();
        ctx.strokeStyle = T.accent;
        ctx.lineWidth = 2;
        for (const p of editablePrims(block, project)) {
          if (!idset.has(p.id)) continue;
          if (p.kind === 'line') {
            const sa = toScr(p.a), sb = toScr(p.b);
            ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
            dot(sa); dot(sb);
          } else if (p.kind === 'polyline' || p.kind === 'hatch') {
            // Highlight the outline + a draggable handle at every vertex.
            const closed = p.kind === 'hatch' || p.closed;
            ctx.beginPath();
            p.verts.forEach((v, i) => { const s = toScr(v); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
            if (closed) ctx.closePath();
            ctx.stroke();
            for (const v of p.verts) dot(toScr(v));
          }
        }
        ctx.restore();
      }
    }

    // Drag-box (marquee) selection: the rectangle plus a live highlight of the
    // lines it would catch. Window (left→right) = solid blue; crossing
    // (right→left) = dashed green — the floor-plan convention.
    if (marquee) {
      const windowMode = marquee.current.x >= marquee.start.x;
      const x0 = proj.sx(marquee.start.x), y0 = proj.sy(marquee.start.y);
      const x1 = proj.sx(marquee.current.x), y1 = proj.sy(marquee.current.y);
      const hit = boxHits(marquee.start, marquee.current);
      if (hit) {
        const block = sheet.blocks.find(b => b.id === hit.blockId);
        if (block) {
          const idset = new Set(hit.ids);
          const toScr = (v: Vec2) => { const s = blockLocalToSheet(block, v); return { x: proj.sx(s.x), y: proj.sy(s.y) }; };
          ctx.save();
          ctx.strokeStyle = windowMode ? '#2563EB' : '#16A34A';
          ctx.lineWidth = 2;
          for (const p of editablePrims(block, project)) {
            if (!idset.has(p.id)) continue;
            if (p.kind === 'line') {
              const a = toScr(p.a), b = toScr(p.b);
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            } else if (p.kind === 'polyline' || p.kind === 'hatch') {
              const closed = p.kind === 'hatch' || p.closed;
              ctx.beginPath();
              p.verts.forEach((v, i) => { const s = toScr(v); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
              if (closed) ctx.closePath();
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
      ctx.save();
      ctx.strokeStyle = windowMode ? '#2563EB' : '#16A34A';
      ctx.fillStyle = windowMode ? 'rgba(37,99,235,0.08)' : 'rgba(22,163,74,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash(windowMode ? [] : [5, 4]);
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.restore();
    }

    // Projection guide lines — infinite H/V across the whole sheet.
    if (guides.length) {
      ctx.save();
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      for (const g of guides) {
        ctx.beginPath();
        if (g.axis === 'h') { const y = proj.sy(g.pos); ctx.moveTo(0, y); ctx.lineTo(vp.width, y); }
        else { const x = proj.sx(g.pos); ctx.moveTo(x, 0); ctx.lineTo(x, vp.height); }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Projection-placement preview — where a new infinite construction line
    // would land (snapped to the nearest feature) for the Line tool's
    // projection types. Brighter than the placed guides so it reads as "about
    // to drop here."
    if (editing && tool === 'line' && isProjType(lineType) && cursorSheet) {
      const axis = lineType === 'proj-h' ? 'h' : 'v';
      const pos = snapGuide(cursorSheet, axis);
      ctx.save();
      ctx.strokeStyle = GUIDE_COLOR;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      if (axis === 'h') { const y = proj.sy(pos); ctx.moveTo(0, y); ctx.lineTo(vp.width, y); }
      else { const x = proj.sx(pos); ctx.moveTo(x, 0); ctx.lineTo(x, vp.height); }
      ctx.stroke();
      ctx.restore();
    }

    // Dimension preview (floor-plan style). Step 1 (end not set): a dashed
    // rubber band from the start to the snapped cursor. Step 2 (end set): a
    // LIVE dimension primitive at the cursor's perpendicular offset — same
    // witness lines / arrows / measured value the committed dim will have.
    if (editing && tool === 'dimension' && dimDraft && cursorSheet) {
      const block = sheet.blocks.find(b => b.id === dimDraft.blockId);
      if (block) {
        const textScale = px / BASE_PX_PER_INCH;
        const cLocal = sheetToBlockLocal(block, cursorSheet);
        if (dimDraft.b === null) {
          const aS = blockLocalToSheet(block, dimDraft.a);
          const bS = blockLocalToSheet(block, snapLocal(block, cLocal).point);
          ctx.save();
          ctx.strokeStyle = T.accent;
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(proj.sx(aS.x), proj.sy(aS.y)); ctx.lineTo(proj.sx(bS.x), proj.sy(bS.y)); ctx.stroke();
          ctx.restore();
        } else {
          const offset = signedPerpendicularOffset(dimDraft.a, dimDraft.b, cLocal);
          ctx.save();
          ctx.globalAlpha = 0.7;
          renderSectionPrimitives(ctx, [makeUserDimLinear(dimDraft.a, dimDraft.b, offset)], blockProjector(block, proj, textScale));
          ctx.restore();
        }
      }
    }

    // Line-tool ghost (anchor → resolved cursor). Mirrors the commit exactly:
    // snap wins, else right-angle lock to H/V (unless Shift), else free.
    if (editing && tool === 'line' && !isProjType(lineType) && lineDraft && cursorSheet) {
      const block = sheet.blocks.find(b => b.id === lineDraft.blockId);
      if (block) {
        const aS = blockLocalToSheet(block, lineDraft.a);
        const bS = blockLocalToSheet(block, resolveLinePoint(block, lineDraft.a, cursorSheet, shiftRef.current, lineDraft.refDir));
        ctx.save();
        ctx.strokeStyle = T.accent;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(proj.sx(aS.x), proj.sy(aS.y)); ctx.lineTo(proj.sx(bS.x), proj.sy(bS.y)); ctx.stroke();
        ctx.restore();
      }
    }

    // Mirror preview: the axis line at the (snapped) cursor + a ghost of the
    // reflected selection, so the user sees exactly where the copy lands.
    if (editing && tool === 'mirror' && selection && cursorSheet) {
      const block = sheet.blocks.find(b => b.id === selection.blockId);
      if (block) {
        const snapped = snapLocal(block, sheetToBlockLocal(block, cursorSheet)).point;
        const pos = mirrorAxis === 'x' ? snapped.y : snapped.x;
        const R = mirrorReflector(mirrorAxis, pos);
        const idset = new Set(selection.ids);
        ctx.save();
        // Axis line (violet, long-dash) across the whole sheet.
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        if (mirrorAxis === 'x') { const y = proj.sy(blockLocalToSheet(block, { x: 0, y: pos }).y); ctx.moveTo(0, y); ctx.lineTo(vp.width, y); }
        else { const x = proj.sx(blockLocalToSheet(block, { x: pos, y: 0 }).x); ctx.moveTo(x, 0); ctx.lineTo(x, vp.height); }
        ctx.stroke();
        // Reflected ghost of the selected lines.
        ctx.strokeStyle = T.accent;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        for (const p of editablePrims(block, project)) {
          if (!idset.has(p.id) || p.kind !== 'line') continue;
          const a = blockLocalToSheet(block, R(p.a)), b = blockLocalToSheet(block, R(p.b));
          ctx.beginPath(); ctx.moveTo(proj.sx(a.x), proj.sy(a.y)); ctx.lineTo(proj.sx(b.x), proj.sy(b.y)); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Extend preview: dashed ghost from the line's current end to the boundary
    // it would reach, with a marker at the landing point.
    if (editing && tool === 'extend' && extendPreview) {
      const block = sheet.blocks.find(b => b.id === extendPreview.blockId);
      if (block) {
        const f = blockLocalToSheet(block, extendPreview.from), t = blockLocalToSheet(block, extendPreview.to);
        const fs = { x: proj.sx(f.x), y: proj.sy(f.y) }, ts = { x: proj.sx(t.x), y: proj.sy(t.y) };
        ctx.save();
        ctx.strokeStyle = '#16A34A';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fs.x, fs.y); ctx.lineTo(ts.x, ts.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(ts.x, ts.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#16A34A'; ctx.fill();
        ctx.restore();
      }
    }

    // Hatch preview: the in-progress polygon (block-local verts → sheet) with a
    // rubber-band edge to the cursor. Matches the Elevations hatch ghost.
    if (editing && tool === 'hatch' && hatchDraft) {
      const block = sheet.blocks.find(b => b.id === hatchDraft.blockId);
      if (block && hatchDraft.verts.length > 0) {
        ctx.save();
        ctx.strokeStyle = T.accent;
        ctx.fillStyle = T.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        hatchDraft.verts.forEach((v, i) => {
          const s = blockLocalToSheet(block, v);
          const p = { x: proj.sx(s.x), y: proj.sy(s.y) };
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        if (cursorSheet) {
          const c = { x: proj.sx(cursorSheet.x), y: proj.sy(cursorSheet.y) };
          ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Vertex dots.
        for (const v of hatchDraft.verts) {
          const s = blockLocalToSheet(block, v);
          ctx.beginPath(); ctx.arc(proj.sx(s.x), proj.sy(s.y), 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    // Fillet preview: highlight the first picked line (amber); when a valid
    // second line in the same block is hovered, ghost the resulting corner.
    if (editing && tool === 'fillet' && filletFirst) {
      const block = sheet.blocks.find(b => b.id === filletFirst.blockId);
      if (block) {
        const prims = editablePrims(block, project);
        const first = prims.find(p => p.id === filletFirst.id);
        const toScr = (p: Vec2) => { const s = blockLocalToSheet(block, p); return { x: proj.sx(s.x), y: proj.sy(s.y) }; };
        if (first && first.kind === 'line') {
          ctx.save();
          const fa = toScr(first.a), fb = toScr(first.b);
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(fb.x, fb.y); ctx.stroke();
          // Hovered second line (same block) → corner ghost.
          let hoverId: string | null = null;
          if (cursorSheet) {
            const hl = sheetToBlockLocal(block, cursorSheet);
            const h = hitTestTopmost(prims, hl, tolIn());
            if (h && h.kind === 'line') hoverId = h.id;
          }
          if (hoverId && hoverId !== filletFirst.id && cursorSheet) {
            const r = filletPreview(prims, filletFirst.id, filletFirst.pick, hoverId, sheetToBlockLocal(block, cursorSheet));
            if (r) {
              const c = toScr(r.corner), k1 = toScr(r.keep1), k2 = toScr(r.keep2);
              ctx.strokeStyle = T.accent;
              ctx.lineWidth = 1.6;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.moveTo(k1.x, k1.y); ctx.lineTo(c.x, c.y);
              ctx.moveTo(k2.x, k2.y); ctx.lineTo(c.x, c.y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
              ctx.fillStyle = T.accent; ctx.fill();
            }
          }
          ctx.restore();
        }
      }
    }

    // Snap indicator (endpoint square / midpoint triangle / intersection X /
    // on-edge circle) at the cursor while editing with a tool.
    if (editing && snap) {
      const block = sheet.blocks.find(b => b.id === snap.blockId);
      if (block) {
        drawSnapIndicator(ctx, snap.result, (p) => {
          const s = blockLocalToSheet(block, p);
          return { x: proj.sx(s.x), y: proj.sy(s.y) };
        });
      }
    }
  }, [vp, sheet, selection, dimDraft, lineDraft, snap, cursorSheet, tool, lineType, mirrorAxis, project, guides, editing, snapGuide, resolveLinePoint, snapLocal, marquee, boxHits, extendPreview, hatchDraft, hatchPattern, filletFirst, tolIn]);

  // ── Pointer handlers ──────────────────────────────────────────────────────
  // Priority: projection-guide placement (if a guide mode is armed) → view
  // editing with the active left-toolbar tool (only when "Edit current views"
  // is on) → pan.
  const startPan = useCallback((sx: number, sy: number) => {
    setPanning({ from: { x: sx, y: sy }, pan0: { x: vp.panX, y: vp.panY } });
  }, [vp.panX, vp.panY]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const sheetPt = screenToSheet(sx, sy);
    const tol = tolIn();

    // Middle mouse, or Alt+left, always pans — so you can still navigate the
    // sheet while the Select tool uses left-drag for a selection box.
    if (e.button === 1 || (e.button === 0 && e.altKey)) { startPan(sx, sy); return; }

    // Distance (sheet inches) from a point to a projection guide's line.
    const guideDist = (g: typeof guides[number]) => g.axis === 'h' ? Math.abs(g.pos - sheetPt.y) : Math.abs(g.pos - sheetPt.x);

    if (editing) {
      // Line tool + a PROJECTION type: drop an infinite construction line
      // (snapped to the nearest feature across the whole sheet). It's global,
      // not tied to a block, so this runs before the block pick.
      if (tool === 'line' && isProjType(lineType)) {
        const axis = lineType === 'proj-h' ? 'h' : 'v';
        setGuides([...guides, { id: makeId('guide'), axis, pos: snapGuide(sheetPt, axis) }]);
        return;
      }
      // Erase: a click on a projection line removes just that line. Checked
      // first (guides span the whole sheet), then falls through to erasing a
      // drawing edge under the cursor.
      if (tool === 'erase') {
        const g = guides.filter(gg => guideDist(gg) <= tol * 1.5).sort((a, b) => guideDist(a) - guideDist(b))[0];
        if (g) { setGuides(guides.filter(x => x.id !== g.id)); return; }
      }

      // Finish an in-progress line in ITS OWN block, even when the cursor has
      // left that block's bounds — so a line can extend past the drawing (e.g.
      // traced along a projection line, or drawn right over one). Resolved with
      // snap-then-ortho; handled before the block pick so it isn't dropped.
      if (tool === 'line' && lineDraft) {
        const lb = sheet.blocks.find(b => b.id === lineDraft.blockId);
        if (lb) {
          onChange(addLine(project, lb, lineDraft.a, resolveLinePoint(lb, lineDraft.a, sheetPt, e.shiftKey, lineDraft.refDir), lineType as SectionLineStyle));
          setLineDraft(null);
          return;
        }
      }

      // Continue an in-progress dimension in ITS OWN block. Same as the floor
      // plan: click start → click end → click the side to set the offset. The
      // end + offset clicks resolve in the start's block even when they land
      // outside it (the offset click is normally off to the side) so the
      // dimension isn't cancelled. End snaps to geometry; offset is the free
      // perpendicular distance from the cursor to the start–end line.
      if (tool === 'dimension' && dimDraft) {
        const db = sheet.blocks.find(b => b.id === dimDraft.blockId);
        if (db) {
          const dlocal = sheetToBlockLocal(db, sheetPt);
          if (dimDraft.b === null) {
            setDimDraft({ ...dimDraft, b: snapLocal(db, dlocal).point });
          } else {
            const offset = signedPerpendicularOffset(dimDraft.a, dimDraft.b, dlocal);
            onChange(appendPrim(project, db, makeUserDimLinear(dimDraft.a, dimDraft.b, offset)));
            setDimDraft(null);
          }
          return;
        }
      }

      // Mirror: reflect the current selection across an X/Y axis line placed at
      // the click (snapped). Operates on the selection's OWN block; produces a
      // mirrored copy and keeps the original. Needs an existing selection.
      if (tool === 'mirror' && selection) {
        const mb = sheet.blocks.find(b => b.id === selection.blockId);
        if (mb) {
          const snapped = snapLocal(mb, sheetToBlockLocal(mb, sheetPt)).point;
          const pos = mirrorAxis === 'x' ? snapped.y : snapped.x;
          const { project: next, newIds } = mirrorSelection(project, mb, new Set(selection.ids), mirrorAxis, pos);
          onChange(next);
          if (newIds.length) setSelection({ blockId: mb.id, ids: newIds });
          return;
        }
      }

      // Continue an in-progress hatch in ITS OWN block — accumulate polygon
      // vertices; click back near the first vertex (≥3 pts) to close + fill.
      // Same gesture as the Elevations hatch tool.
      if (tool === 'hatch' && hatchDraft) {
        const hb = sheet.blocks.find(b => b.id === hatchDraft.blockId);
        if (hb) {
          const snapped = snapLocal(hb, sheetToBlockLocal(hb, sheetPt)).point;
          if (hatchDraft.verts.length >= 3) {
            const first = hatchDraft.verts[0];
            if (Math.hypot(snapped.x - first.x, snapped.y - first.y) <= tol * 1.5) {
              onChange(appendPrim(project, hb, {
                id: makeUserPrimId('user-hatch'), kind: 'hatch', verts: hatchDraft.verts, pattern: hatchPattern,
              } as PrimHatch));
              setHatchDraft(null);
              return;
            }
          }
          setHatchDraft({ ...hatchDraft, verts: [...hatchDraft.verts, snapped] });
          return;
        }
      }

      const block = pickEditableBlock(sheet.blocks, sheetPt);
      if (block) {
        const local = sheetToBlockLocal(block, sheetPt);
        const snapped = snapLocal(block, local).point;   // endpoint/mid/intersection
        const prims = editablePrims(block, project);

        if (tool === 'hatch') {  // first vertex (continuation handled above)
          setHatchDraft({ blockId: block.id, verts: [snapped] });
          return;
        }
        if (tool === 'line') {  // first point (continuation handled above)
          // Capture the line the anchor lands on so the next point can lock
          // parallel/perpendicular to it (e.g. square off an angled roof slope).
          setLineDraft({ blockId: block.id, a: snapped, refDir: nearestLineDir(prims, snapped, tol * 1.5) ?? undefined });
          return;
        }
        if (tool === 'erase') {
          const hit = hitTestTopmost(prims, local, tol);
          if (hit) { onChange(deleteIds(project, block, new Set([hit.id]))); setSelection(null); }
          return;
        }
        if (tool === 'trim') {
          const hit = hitTestTopmost(prims, local, tol);
          // Zoom-aware tip guard: when zoomed in (small pick tolerance) shrink
          // the end-of-line dead zone so a tiny stub near a junction can still
          // be trimmed; never larger than the ½" default.
          if (hit && hit.kind === 'line') onChange(trimLineAt(project, block, hit.id, local, Math.min(0.5, tol)));
          return;
        }
        if (tool === 'extend') {
          // Extend the clicked line's nearer end out to the closest boundary.
          const hit = hitTestTopmost(prims, local, tol);
          if (hit && hit.kind === 'line') { onChange(extendLineAt(project, block, hit.id, local)); setExtendPreview(null); }
          return;
        }
        if (tool === 'fillet') {
          // Two-click corner join WITHIN one view. Pick line 1 (side to keep),
          // then line 2 — both near ends move to the lines' intersection.
          const hit = hitTestTopmost(prims, local, tol);
          if (!hit || hit.kind !== 'line') return;
          if (!filletFirst || filletFirst.blockId !== block.id || filletFirst.id === hit.id) {
            setFilletFirst({ blockId: block.id, id: hit.id, pick: local });
            return;
          }
          onChange(filletLinesAt(project, block, filletFirst.id, filletFirst.pick, hit.id, local));
          setFilletFirst(null);
          return;
        }
        if (tool === 'dimension') {  // first point (continuation handled above)
          setDimDraft({ blockId: block.id, a: snapped, b: null });
          return;
        }
        // Select: endpoint-handle drag, drag the current selection, pick a
        // line, or (on empty space) start a drag-box.
        if (tool === 'select') {
          if (selection && selection.blockId === block.id && selection.ids.length === 1) {
            const sel = prims.find(p => p.id === selection.ids[0]);
            if (sel && sel.kind === 'line') {
              const h = hitTestLineHandle(sel, local, tol * 1.6);
              if (h) { onBeginLiveOp?.(); dragArmedRef.current = false; setDrag({ blockId: block.id, mode: h, primId: sel.id, ids: [sel.id], startLocal: snapped, base: project }); return; }
            } else if (sel && (sel.kind === 'polyline' || sel.kind === 'hatch')) {
              // Grab a vertex of a selected filled outline (wall shell / corner
              // boards / trim) to reshape it — matches the Elevations page.
              const grab = tol * 1.6;
              for (let i = 0; i < sel.verts.length; i++) {
                if (Math.hypot(sel.verts[i].x - local.x, sel.verts[i].y - local.y) <= grab) {
                  onBeginLiveOp?.(); dragArmedRef.current = false;
                  setDrag({ blockId: block.id, mode: 'vertex', primId: sel.id, vertexIndex: i, ids: [sel.id], startLocal: snapped, base: project });
                  return;
                }
              }
            }
          }
          const hit = hitTestTopmost(prims, local, tol);
          if (hit) {
            // Clicking a line already in the selection drags the whole set;
            // otherwise select just that line and drag it.
            const inSel = !!selection && selection.blockId === block.id && selection.ids.includes(hit.id);
            const ids = inSel ? selection!.ids : [hit.id];
            if (!inSel) setSelection({ blockId: block.id, ids });
            onBeginLiveOp?.(); dragArmedRef.current = false;
            setDrag({ blockId: block.id, mode: 'body', ids, startLocal: local, base: project });
            return;
          }
          setMarquee({ start: sheetPt, current: sheetPt });   // empty space → drag-box
          return;
        }
        setSelection(null);
      } else {
        // No editable block under the cursor.
        if (tool === 'select') { setMarquee({ start: sheetPt, current: sheetPt }); return; }
        setSelection(null);
        if (dimDraft) { setDimDraft(null); return; }
        if (lineDraft) { setLineDraft(null); return; }
        if (hatchDraft) { setHatchDraft(null); return; }
      }
    }
    startPan(sx, sy);
  }, [vp.panX, vp.panY, editing, guides, setGuides, snapGuide, tool, lineType, mirrorAxis, sheet, project, onChange, selection, dimDraft, lineDraft, hatchDraft, hatchPattern, filletFirst, snapLocal, resolveLinePoint, screenToSheet, tolIn, startPan, onBeginLiveOp]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const sheetPt = screenToSheet(sx, sy);
    setCursorSheet(sheetPt);
    shiftRef.current = e.shiftKey;

    if (marquee) { setMarquee(m => (m ? { ...m, current: sheetPt } : m)); return; }
    if (drag) {
      const block = sheet.blocks.find(b => b.id === drag.blockId);
      if (!block) return;
      const local = sheetToBlockLocal(block, sheetPt);
      // Don't commit anything until the pointer clears the click-vs-drag
      // threshold — so a click with a little jitter records no move / undo entry.
      if (!dragArmedRef.current) {
        if (Math.hypot(local.x - drag.startLocal.x, local.y - drag.startLocal.y) * pxPerInchOf(vp) < DRAG_ARM_PX) return;
        dragArmedRef.current = true;
      }
      if (drag.mode === 'a' || drag.mode === 'b') {
        onChange(setLineEndpoint(drag.base, block, drag.primId!, drag.mode, snapLocal(block, local).point));
      } else if (drag.mode === 'vertex') {
        onChange(moveVertex(drag.base, block, drag.primId!, drag.vertexIndex!, snapLocal(block, local).point));
      } else {
        onChange(translateIds(drag.base, block, new Set(drag.ids), local.x - drag.startLocal.x, local.y - drag.startLocal.y));
      }
      return;
    }
    if (panning) {
      setVp(v => ({ ...v, panX: panning.pan0.x + (sx - panning.from.x), panY: panning.pan0.y + (sy - panning.from.y) }));
      return;
    }
    // Extend tool: live ghost of where the hovered line would extend to.
    if (editing && tool === 'extend') {
      const block = pickEditableBlock(sheet.blocks, sheetPt);
      let pv: typeof extendPreview = null;
      if (block) {
        const local = sheetToBlockLocal(block, sheetPt);
        const hit = hitTestTopmost(editablePrims(block, project), local, tolIn());
        if (hit && hit.kind === 'line') {
          const ext = computeExtend(project, block, hit.id, local);
          if (ext) pv = { blockId: block.id, from: ext.from, to: ext.point };
        }
      }
      setExtendPreview(pv);
    } else if (extendPreview) setExtendPreview(null);

    // Live snap indicator for the edit tools (suppressed while placing a
    // projection line — that has its own full-length preview).
    if (editing && !(tool === 'line' && isProjType(lineType))) {
      const block = pickEditableBlock(sheet.blocks, sheetPt);
      if (block) {
        const res = snapLocal(block, sheetToBlockLocal(block, sheetPt)).result;
        setSnap(res ? { blockId: block.id, result: res } : null);
      } else setSnap(null);
    } else if (snap) setSnap(null);
  }, [drag, panning, marquee, editing, tool, lineType, sheet, project, onChange, snap, snapLocal, screenToSheet, tolIn, extendPreview, vp]);

  // Mouse-up / leave: commit a drag-box to the selection (an empty box = a
  // plain click on empty space → clear selection), then end any drag/pan.
  const endPan = useCallback(() => {
    if (marquee) {
      const hit = boxHits(marquee.start, marquee.current);
      setSelection(hit ? { blockId: hit.blockId, ids: hit.ids } : null);
      setMarquee(null);
    }
    // Close the drag's live-op so the whole gesture collapses to one undo entry.
    if (drag) onEndLiveOp?.();
    setDrag(null); setPanning(null);
  }, [marquee, boxHits, drag, onEndLiveOp]);

  // Delete removes the selection; Esc clears any draft / selection / guide mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') { setDimDraft(null); setLineDraft(null); setHatchDraft(null); setFilletFirst(null); setSelection(null); setSnap(null); setMarquee(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        const block = sheetRef.current.blocks.find(b => b.id === selection.blockId);
        if (block) { onChange(deleteIds(project, block, new Set(selection.ids))); setSelection(null); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, project, onChange]);

  const empty = !sheet.bounds || sheet.blocks.length === 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 16px', borderBottom: `1px solid ${T.line}`, background: T.panel,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.6px',
          color: T.inkSoft, textTransform: 'uppercase',
        }}>Sandbox · CAD Sheet</span>
        {/* Edit current views — gates editing the elevations & sections with
            the LEFT toolbar tools (Select / Offset / Text / Dimension / Trim /
            Erase). Floor plan & roof stay read-only. */}
        <button
          type="button"
          onClick={() => {
            const turningOn = !editing;
            setEditing(turningOn);
            setSelection(null); setDimDraft(null); setLineDraft(null); setHatchDraft(null); setFilletFirst(null);
            // Explode every editable view into stable, individually-editable
            // lines so the tools act on a consistent id set.
            if (turningOn) onChange(enterEditMode(project, sheetRef.current.blocks));
          }}
          title="Edit the elevations & sections using the left toolbar tools"
          style={{
            ...toolBtn,
            background: editing ? T.accentSoft : T.panel,
            color: editing ? T.accentInk : T.ink,
            border: `1px solid ${editing ? T.accent : T.lineStrong}`,
          }}
        >{editing ? '✎ Editing views' : '✎ Edit current views'}</button>
        <button
          type="button"
          onClick={onResetViews}
          style={toolBtn}
          title="Discard your line edits and restore the original auto-generated elevations & sections"
        >↺ Reset</button>

        {/* Projection lines now live in the Line tool's type picker (pick
            "Projection — H/V"). Erase removes one; this clears them all. */}
        {guides.length > 0 && (
          <button type="button" onClick={() => setGuides([])} style={toolBtn}
            title="Clear all projection lines (erase removes one at a time)">
            ⌁ Clear projections ({guides.length})
          </button>
        )}
        <span style={{ fontSize: 11, color: T.inkMuted }}>
          {editing && tool === 'line' && isProjType(lineType) ? 'click a feature to drop a projection line'
            : editing ? 'editing elevations & sections — left toolbar tools'
            : 'read-only · floor plan & roof not editable'}
        </span>
        <div style={{ flex: 1 }} />
        {/* Layout mode toggle */}
        <div style={{ display: 'flex', gap: 2, background: T.bg, padding: 2, borderRadius: 6, border: `1px solid ${T.line}` }}>
          {(['row', 'projected'] as SheetLayoutMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setLayoutMode(m)}
              title={m === 'row'
                ? 'Reference row — every drawing in one line'
                : 'Projected set — each elevation flanked by its rotated roof plan (above) and floor plan (below)'}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: layoutMode === m ? T.panel : 'transparent',
                color: layoutMode === m ? T.ink : T.inkSoft,
                border: layoutMode === m ? `1px solid ${T.lineStrong}` : '1px solid transparent',
                borderRadius: 5, cursor: 'pointer',
              }}
            >{m === 'row' ? 'Row' : 'Projected'}</button>
          ))}
        </div>
        <span style={{
          fontSize: 11, color: T.ink, fontVariantNumeric: 'tabular-nums',
          padding: '3px 8px', background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6,
        }}>{SCALE_LABEL[vp.scaleMode]} · {Math.round(vp.zoom * 100)}%</span>
        <button type="button" onClick={doFit} style={toolBtn} title="Fit the whole sheet in view">Fit</button>
        <button
          type="button"
          onClick={onExportDxf}
          disabled={empty}
          style={{ ...toolBtn, opacity: empty ? 0.5 : 1, cursor: empty ? 'not-allowed' : 'pointer', fontWeight: 700 }}
          title="Export everything on this sheet as one DXF file (opens in AutoCAD and other CAD tools)"
        >↧ Export DXF</button>
        <div style={{ position: 'relative', display: 'flex' }}>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={empty || pdfBusy}
            style={{
              ...toolBtn, fontWeight: 700,
              borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none',
              opacity: (empty || pdfBusy) ? 0.5 : 1, cursor: (empty || pdfBusy) ? 'not-allowed' : 'pointer',
            }}
            title="Export everything on this sheet as one vector PDF (filled, full detail) for CAD/vector tools"
          >{pdfBusy ? '…' : '↧ Export PDF'}</button>
          <button
            type="button"
            onClick={() => setPdfOptsOpen(o => !o)}
            disabled={empty || pdfBusy}
            style={{
              ...toolBtn, fontWeight: 700, padding: '5px 8px',
              borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
              background: pdfOptsOpen ? T.accentSoft : T.panel,
              color: pdfOptsOpen ? T.accentInk : T.ink,
              opacity: (empty || pdfBusy) ? 0.5 : 1, cursor: (empty || pdfBusy) ? 'not-allowed' : 'pointer',
            }}
            title="PDF export options — scale, hatches, line colour"
          >▾</button>

          {pdfOptsOpen && (
            <>
              {/* click-away backdrop */}
              <div
                onClick={() => setPdfOptsOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
                width: 230, padding: 12, display: 'flex', flexDirection: 'column', gap: 12,
                background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.shadow,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', color: T.inkMuted, textTransform: 'uppercase' }}>
                  PDF export options
                </div>

                {/* Scale */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: T.inkSoft }}>
                  <span style={{ fontWeight: 600 }}>Scale</span>
                  <select
                    value={String(pdfScale)}
                    onChange={e => setPdfScale(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
                    style={{ fontSize: 11, padding: '4px 6px', border: `1px solid ${T.lineStrong}`, borderRadius: 5, background: '#fff', color: T.ink }}
                  >
                    {PDF_SCALES.map(s => (
                      <option key={s.label} value={String(s.value)}>{s.label}</option>
                    ))}
                  </select>
                </label>

                {/* Hatches */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.ink, cursor: 'pointer' }}>
                  <input type="checkbox" checked={pdfHideHatch} onChange={e => setPdfHideHatch(e.target.checked)} />
                  Remove material hatches
                </label>

                {/* Line colour */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: T.inkSoft }}>
                  <span style={{ fontWeight: 600 }}>Line colour</span>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {PDF_LINE_COLORS.map(c => {
                      const active = c.value === pdfLineColor;
                      return (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => setPdfLineColor(c.value)}
                          title={c.label}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '3px 7px', fontSize: 10.5, borderRadius: 5, cursor: 'pointer',
                            background: active ? T.accentSoft : T.panel,
                            color: active ? T.accentInk : T.ink,
                            border: `1px solid ${active ? T.accent : T.lineStrong}`,
                          }}
                        >
                          <span style={{
                            width: 10, height: 10, borderRadius: 2,
                            background: c.value ?? 'transparent',
                            border: c.value ? `1px solid ${T.lineStrong}` : `1px dashed ${T.lineStrong}`,
                          }} />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onExportPdf}
                  disabled={pdfBusy}
                  style={{ ...toolBtn, fontWeight: 700, background: T.accent, color: '#fff', border: `1px solid ${T.accent}`, opacity: pdfBusy ? 0.5 : 1 }}
                >{pdfBusy ? 'Exporting…' : '↧ Export PDF'}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endPan}
          onMouseLeave={endPan}
          style={{ display: 'block', cursor: sandboxCursor(!!panning, editing, tool) }}
        />
        {/* Line-type picker — floats over the sheet while the Line tool is
            active, mirroring the floor-plan / section drafting line choices.
            The two PROJECTION types at the bottom turn the Line tool into the
            infinite-alignment-line placer (one click drops a snapped guide). */}
        {editing && tool === 'line' && (
          <div style={{
            position: 'absolute', left: 12, top: 12,
            display: 'flex', flexDirection: 'column', gap: 2,
            padding: 4, background: T.panel,
            border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.shadow,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', color: T.inkMuted,
              textTransform: 'uppercase', padding: '2px 4px 4px',
            }}>Line type</div>
            {LINE_STYLE_CHOICES.map(c => {
              const active = c.id === lineType;
              const ink = c.proj ? GUIDE_COLOR : (active ? T.accentInk : T.ink);
              return (
                <div key={c.id} style={{ display: 'contents' }}>
                  {c.id === 'proj-h' && (
                    <div style={{ height: 1, background: T.line, margin: '3px 2px' }} />
                  )}
                  <button
                    type="button"
                    onClick={() => setLineType(c.id)}
                    title={c.proj
                      ? `Drop an infinite ${c.id === 'proj-h' ? 'horizontal' : 'vertical'} projection line (click a feature to snap; Erase removes it)`
                      : `Draw new lines as ${c.label.toLowerCase()}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '4px 8px', minWidth: 116,
                      fontSize: 10, fontWeight: 600,
                      background: active ? T.accentSoft : T.panel,
                      color:      active ? T.accentInk  : T.ink,
                      border: `1px solid ${active ? T.accent : T.lineStrong}`,
                      borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <svg width="32" height="8" style={{ flexShrink: 0 }}>
                      <line x1="1" y1="4" x2={c.arrow ? '27' : '31'} y2="4"
                        stroke={ink} strokeWidth="1.2"
                        strokeDasharray={c.dash || undefined} />
                      {c.arrow && <polygon points="31,4 27,2 27,6" fill={ink} />}
                    </svg>
                    <span style={{ flex: 1 }}>{c.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {/* Mirror axis picker — pick the X or Y axis to reflect across, then
            click on the sheet to place that axis line (snaps to features). */}
        {editing && tool === 'mirror' && (
          <div style={{
            position: 'absolute', left: 12, top: 12,
            display: 'flex', flexDirection: 'column', gap: 2,
            padding: 4, background: T.panel,
            border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.shadow,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', color: T.inkMuted,
              textTransform: 'uppercase', padding: '2px 4px 4px',
            }}>Mirror axis</div>
            {([['y', 'Y axis — flip ⇆', 'vertical'], ['x', 'X axis — flip ⇅', 'horizontal']] as ['x' | 'y', string, string][]).map(([ax, lbl]) => {
              const active = ax === mirrorAxis;
              return (
                <button
                  key={ax}
                  type="button"
                  onClick={() => setMirrorAxis(ax)}
                  title={`Reflect the selection across a ${ax === 'y' ? 'vertical' : 'horizontal'} line you click`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 8px', minWidth: 116, fontSize: 10, fontWeight: 600,
                    background: active ? T.accentSoft : T.panel,
                    color: active ? T.accentInk : T.ink,
                    border: `1px solid ${active ? T.accent : T.lineStrong}`,
                    borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                  }}
                >{lbl}</button>
              );
            })}
            <div style={{ fontSize: 9, color: T.inkMuted, padding: '4px 4px 2px', maxWidth: 132, lineHeight: 1.4 }}>
              {selection ? 'click to place the mirror line' : 'select lines first (Select tool)'}
            </div>
          </div>
        )}
        {/* Hatch pattern picker — choose a material, click polygon vertices on a
            view, then click the first vertex (or Esc) to close + fill. Same
            patterns + gesture as the Elevations hatch tool. */}
        {editing && tool === 'hatch' && (
          <div style={{
            position: 'absolute', left: 12, top: 12,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 8px', background: T.panel,
            border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.shadow,
          }}>
            <span style={{ fontSize: 11, color: T.inkSoft }}>Hatch:</span>
            <select
              value={hatchPattern}
              onChange={e => setHatchPattern(e.target.value as HatchPattern)}
              style={{
                fontSize: 12, padding: '3px 6px', borderRadius: 4,
                border: `1px solid ${T.line}`, background: T.panel, color: T.ink,
              }}
            >
              {HATCH_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <span style={{ fontSize: 10, color: T.inkMuted }}>
              {hatchDraft ? `${hatchDraft.verts.length} pts — click start to close` : 'click vertices on a view'}
            </span>
          </div>
        )}
        {editing && tool === 'fillet' && (
          <div style={{
            position: 'absolute', left: 12, top: 12,
            padding: '5px 10px', background: T.panel,
            border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.shadow,
            fontSize: 11, color: T.inkSoft,
          }}>
            {filletFirst ? 'Click the second line — they join where they intersect' : 'Fillet: click the first line (the side to keep)'}
          </div>
        )}
        {empty && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              maxWidth: 420, textAlign: 'center', color: T.inkSoft, fontSize: 13, lineHeight: 1.6,
              background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10,
              padding: '24px 28px', boxShadow: T.shadow,
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>📐</div>
              The Sandbox composites your elevations and section onto one aligned
              CAD sheet. Draw a floor plan with exterior walls first, and they'll
              appear here lined up on shared height datums.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const toolBtn: React.CSSProperties = {
  padding: '5px 12px', fontSize: 11, fontWeight: 600,
  background: T.panel, color: T.ink,
  border: `1px solid ${T.lineStrong}`, borderRadius: 6, cursor: 'pointer',
};
