'use client';

// Exterior elevations view — N/E/S/W direction picker + SVG drawing.
//
// As of the primitives refactor: the elevation is expressed as a flat
// DrawingPrimitive[] (see engine/elevationPrimitives.ts). This component
// walks the list and renders each primitive. The same primitive list is
// what drafting mode will edit — adding an edit toolbar means wiring the
// existing section tools to operate on `project.elevationDrafting[dir]`.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DrawingPrimitive, HatchPattern, PrimDimLinear, PrimHatch, PrimLine, PrimPolyline,
  PrimText, Project, SectionLineStyle, SectionPolyStyle, ToolId, Vec2,
  formatImperial } from '../engine/types';
import {
  ELEVATION_DIRECTIONS, ElevationDirection, buildElevation,
} from '../engine/elevations';
import {
  buildElevationPrimitives, getElevationPrimitives, isElevationDrafting,
} from '../engine/elevationPrimitives';
import {
  hitTestTopmost, makeUserLine, makeUserText, makeUserDimLinear,
  offsetLineCopy, signedPerpendicularOffset,
  primitiveInBoxSelection, trimLineByClick, trimPolylineByClick,
} from '../engine/sectionEdit';
import { findSnap, SnapResult } from '../engine/sectionSnap';
import { T } from '../engine/theme';

const HATCH_PATTERNS: HatchPattern[] = [
  'lap-siding', 'board-batten', 'brick', 'stone', 'stucco', 'shake',
  'roof-shingles', 'blank',
];

// Generates a fresh primitive id for tools that build hatches inline.
let _hatchSeq = 0;
const nextHatchId = () => `user-hatch-${++_hatchSeq}-${Date.now()}`;
let _expSeq = 0;
const nextExpId = () => `user-exp-${++_expSeq}-${Date.now()}`;

// Selective explode: turn UNFILLED polylines into individual PrimLine
// edges (useful for the roof outline so each slope segment is editable),
// while leaving FILLED polylines, hatches, text, and dims untouched. Filled
// polylines stay polylines so their fill colour survives drafting; the
// user reshapes them via vertex handles instead.
function explodeUnfilled(primitives: DrawingPrimitive[]): DrawingPrimitive[] {
  const out: DrawingPrimitive[] = [];
  for (const p of primitives) {
    const isFilled = p.kind === 'polyline' && p.fill && p.fill !== 'none';
    if (p.kind !== 'polyline' || isFilled) {
      out.push(p);
      continue;
    }
    // Open or unfilled closed polyline → emit one PrimLine per edge.
    for (let i = 0; i < p.verts.length - 1; i++) {
      out.push({
        id: nextExpId(),
        kind: 'line',
        a: p.verts[i],
        b: p.verts[i + 1],
        style: 'normal',
      });
    }
    if (p.closed && p.verts.length > 1) {
      out.push({
        id: nextExpId(),
        kind: 'line',
        a: p.verts[p.verts.length - 1],
        b: p.verts[0],
        style: 'normal',
      });
    }
  }
  return out;
}

// Drawing scale: 1/4" = 1'-0" = 1:48. 96 dpi screen → 96/48 = 2 px per inch.
const PX_PER_INCH_AT_100 = 2;
// Padding around the elevation drawing inside the SVG viewBox, in inches.
const PADDING_IN = 18;

// ── Typed-length parsing (mirrors Canvas2D / the 2D floor planner) ─────────
// "12" → 12in · "12'6" → 12'6" · "120@45" / "10<-30" → length @ angle (deg,
// 0°=east, 90°=north). Length-only → caller uses the cursor direction.
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
  if (num) { const v = parseFloat(num[1]); return v > 0 ? v : null; }
  return null;
}
function parseLengthAngleInput(s: string): { length: number; angle?: number } | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^([^@<]+)[@<](.*)$/);
  if (m) {
    const length = parseLengthInput(m[1].trim());
    if (length == null) return null;
    const angleStr = m[2].trim().replace(/°/g, '').replace(/deg/i, '').trim();
    if (angleStr === '' || angleStr === '-') return { length };
    const angle = parseFloat(angleStr);
    if (isNaN(angle)) return null;
    return { length, angle };
  }
  const length = parseLengthInput(t);
  return length == null ? null : { length };
}

// CAD "aperture" cursor for the line/dimension tools — hollow circle + four
// crosshair ticks, hotspot dead center. Same glyph as the 2D plan view.
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


export default function ElevationsView({ project, onChange, tool, onChangeTool }: {
  project: Project;
  onChange?: (p: Project) => void;
  tool?: ToolId;
  onChangeTool?: (t: ToolId) => void;
}) {
  const [direction, setDirection] = useState<ElevationDirection>('north');
  const [selection, setSelection] = useState<Set<string>>(new Set());

  // ── In-progress tool state ────────────────────────────────────────────
  // Each tool keeps its own anchor(s); the active tool reads/clears them.
  // Switching tools (or pressing Escape) clears everything.
  const [cursor, setCursor]            = useState<Vec2 | null>(null);
  const [snap, setSnap]                = useState<SnapResult | null>(null);
  const [lineAnchor, setLineAnchor]    = useState<Vec2 | null>(null);
  const [dimA, setDimA]                = useState<Vec2 | null>(null);
  const [dimB, setDimB]                = useState<Vec2 | null>(null);
  const [textAnchor, setTextAnchor]    = useState<Vec2 | null>(null);
  const [textInput, setTextInput]      = useState<string>('');
  const [hatchVerts, setHatchVerts]    = useState<Vec2[]>([]);
  const [hatchPattern, setHatchPattern] = useState<HatchPattern>('brick');
  const [offsetSourceId, setOffsetSourceId] = useState<string | null>(null);
  const [offsetDistance, setOffsetDistance] = useState<number>(12); // inches
  // Typed numeric input — line LENGTH (length@angle) while drawing a line, or
  // the OFFSET distance once an offset source is picked. Same UX as the 2D plan.
  const [typedLength, setTypedLength] = useState<string>('');

  const drafting = isElevationDrafting(project, direction);

  // Reset every in-progress tool state. Called on tool change, Escape, and
  // direction change.
  const resetToolState = useCallback(() => {
    setLineAnchor(null);
    setDimA(null);
    setDimB(null);
    setTextAnchor(null);
    setTextInput('');
    setHatchVerts([]);
    setOffsetSourceId(null);
    setTypedLength('');
  }, []);

  // Live end of the line being drawn. When the user has typed a length (or
  // length@angle), the end is computed from the anchor at that distance —
  // angle from the typed value, else from the (ortho-resolved) cursor
  // direction. Otherwise it's just the cursor. Mirrors Canvas2D.effectiveEnd.
  const lineEnd = useMemo<Vec2 | null>(() => {
    if (!lineAnchor) return null;
    const cur = cursor ?? lineAnchor;
    const parsed = parseLengthAngleInput(typedLength);
    if (parsed) {
      let dx: number, dy: number;
      if (parsed.angle != null) {
        const a = -parsed.angle * Math.PI / 180;  // 0°=east, 90°=north (world Y is down)
        dx = Math.cos(a); dy = Math.sin(a);
      } else {
        const ddx = cur.x - lineAnchor.x, ddy = cur.y - lineAnchor.y;
        const L = Math.hypot(ddx, ddy);
        if (L > 0) { dx = ddx / L; dy = ddy / L; } else { dx = 1; dy = 0; }
      }
      return { x: lineAnchor.x + dx * parsed.length, y: lineAnchor.y + dy * parsed.length };
    }
    return cur;
  }, [lineAnchor, cursor, typedLength]);

  // Pan/zoom reset trigger — incrementing this re-mounts the SVG with
  // default pan/zoom (effectively a "Fit" / "100%" since the SVG's own
  // useEffect resets when its viewBox base changes).
  const [viewResetSeq, setViewResetSeq] = useState<number>(0);
  const onFitView = useCallback(() => setViewResetSeq(s => s + 1), []);

  // Scene gives us the drawing extents for the viewBox. The primitive list
  // is what we actually render (procedural OR drafted snapshot).
  const scene = useMemo(() => buildElevation(project, direction), [project, direction]);
  const primitives = useMemo(
    () => getElevationPrimitives(project, direction),
    [project, direction],
  );

  // Single selected hatch (if exactly one is selected) — drives the inline
  // Pattern picker so selecting a hatch instantly surfaces its material and
  // switching the dropdown re-styles it in place.
  const selectedHatch = useMemo<PrimHatch | null>(() => {
    if (selection.size !== 1) return null;
    const [id] = [...selection];
    const p = primitives.find(x => x.id === id);
    return p && p.kind === 'hatch' ? p : null;
  }, [selection, primitives]);

  // Drop selection + in-progress tool state when direction or tool changes.
  useEffect(() => { setSelection(new Set()); resetToolState(); }, [direction, resetToolState]);
  useEffect(() => { resetToolState(); }, [tool, resetToolState]);

  // Drafting toggle: Customize freezes the procedural primitives into
  // project.elevationDrafting[direction]; Reset clears that direction's
  // snapshot so the procedural builder drives it again.
  //
  // EXPLODE on customize, but ONLY for unfilled polylines (roof outline,
  // etc.). FILLED polylines — wall outline, casing+sill, corner boards,
  // gable trim, glass panes, door panels — stay intact so they keep their
  // fill colour. The user edits them by dragging their vertex handles
  // (Select tool → click the shape → drag a corner).
  const onCustomize = useCallback(() => {
    if (!onChange) return;
    const snapshot = buildElevationPrimitives(project, direction);
    const explodedSelectively = explodeUnfilled(snapshot);
    onChange({
      ...project,
      elevationDrafting: {
        ...project.elevationDrafting,
        [direction]: explodedSelectively,
      },
    });
  }, [project, direction, onChange]);

  const onReset = useCallback(() => {
    if (!onChange) return;
    const next = { ...(project.elevationDrafting ?? {}) };
    delete next[direction];
    onChange({ ...project, elevationDrafting: next });
    setSelection(new Set());
  }, [project, direction, onChange]);

  // ── Per-direction undo / redo ─────────────────────────────────────────
  // Stacks store snapshots of just this direction's primitive list. Each
  // setPrimitives call pushes the PREVIOUS list to undo. Ctrl+Z replays
  // from undo, pushing the current list to redo.
  const [undoStack, setUndoStack] = useState<DrawingPrimitive[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingPrimitive[][]>([]);
  // When true, the next setPrimitives skips the undo push (used while
  // applying undo/redo or during a live drag where we don't want every
  // mouse-move tick to flood the stack).
  const suppressUndoRef = useRef<boolean>(false);
  const UNDO_LIMIT = 100;

  // Patch the active direction's primitive list in place.
  const setPrimitives = useCallback((next: DrawingPrimitive[]) => {
    if (!onChange) return;
    if (!suppressUndoRef.current) {
      setUndoStack(s => {
        const grown = [...s, primitives];
        return grown.length > UNDO_LIMIT ? grown.slice(grown.length - UNDO_LIMIT) : grown;
      });
      setRedoStack([]);
    }
    onChange({
      ...project,
      elevationDrafting: {
        ...project.elevationDrafting,
        [direction]: next,
      },
    });
  }, [project, primitives, direction, onChange]);

  // Re-style the currently selected hatch (used by the inline Pattern picker).
  const setSelectedHatchPattern = useCallback((pattern: HatchPattern) => {
    if (!selectedHatch) return;
    setPrimitives(primitives.map(p =>
      p.id === selectedHatch.id ? { ...p, pattern } : p));
  }, [selectedHatch, primitives, setPrimitives]);

  // Drop history when the editing scope changes.
  useEffect(() => { setUndoStack([]); setRedoStack([]); }, [direction]);

  const onUndo = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack;
      const restored = stack[stack.length - 1];
      setRedoStack(r => [...r, primitives]);
      suppressUndoRef.current = true;
      if (onChange) {
        onChange({
          ...project,
          elevationDrafting: {
            ...project.elevationDrafting,
            [direction]: restored,
          },
        });
      }
      suppressUndoRef.current = false;
      return stack.slice(0, -1);
    });
    setSelection(new Set());
  }, [primitives, project, direction, onChange]);

  const onRedo = useCallback(() => {
    setRedoStack(stack => {
      if (stack.length === 0) return stack;
      const restored = stack[stack.length - 1];
      setUndoStack(u => [...u, primitives]);
      suppressUndoRef.current = true;
      if (onChange) {
        onChange({
          ...project,
          elevationDrafting: {
            ...project.elevationDrafting,
            [direction]: restored,
          },
        });
      }
      suppressUndoRef.current = false;
      return stack.slice(0, -1);
    });
    setSelection(new Set());
  }, [primitives, project, direction, onChange]);

  // Live-op bracketing: a drag pushes ONE snapshot at begin, then
  // mouse-move updates are absorbed silently. mouseUp restores normal
  // undo recording.
  const onBeginLiveOp = useCallback(() => {
    setUndoStack(s => {
      const grown = [...s, primitives];
      return grown.length > UNDO_LIMIT ? grown.slice(grown.length - UNDO_LIMIT) : grown;
    });
    setRedoStack([]);
    suppressUndoRef.current = true;
  }, [primitives]);
  const onEndLiveOp = useCallback(() => {
    suppressUndoRef.current = false;
  }, []);

  // ── Tool click dispatcher ─────────────────────────────────────────────
  // Called by the canvas with the snapped world point (or raw cursor if no
  // snap is in range). Each tool advances its state machine and either
  // stays in an in-progress state OR commits a primitive.
  const handleWorldClick = useCallback((world: Vec2) => {
    if (!drafting || !onChange) return;
    const t = tool ?? 'select';

    if (t === 'line') {
      if (!lineAnchor) { setLineAnchor(world); return; }
      const end = lineEnd ?? world;
      if (Math.hypot(end.x - lineAnchor.x, end.y - lineAnchor.y) > 0.5) {
        setPrimitives([...primitives, makeUserLine(lineAnchor, end, 'normal')]);
      }
      setLineAnchor(end);   // chain: keep drawing from the new end (Esc finishes)
      setTypedLength('');
      return;
    }

    if (t === 'dimension') {
      if (!dimA) {
        setDimA(world);
      } else if (!dimB) {
        setDimB(world);
      } else {
        const offset = signedPerpendicularOffset(dimA, dimB, world);
        setPrimitives([...primitives, makeUserDimLinear(dimA, dimB, offset)]);
        setDimA(null); setDimB(null);
      }
      return;
    }

    if (t === 'text') {
      setTextAnchor(world);
      setTextInput('');
      return;
    }

    if (t === 'hatch') {
      // Close the polygon (and fill it) when clicking back near the first
      // vertex — the standard polygon-tool gesture. Otherwise add a vertex.
      if (hatchVerts.length >= 3) {
        const first = hatchVerts[0];
        if (Math.hypot(world.x - first.x, world.y - first.y) <= 12) {
          setPrimitives([...primitives, {
            id: nextHatchId(), kind: 'hatch', verts: hatchVerts, pattern: hatchPattern,
          } as PrimHatch]);
          setHatchVerts([]);
          return;
        }
      }
      setHatchVerts([...hatchVerts, world]);
      return;
    }

    if (t === 'offset') {
      // Click 1 — pick a line. Click 2 — pick the side to offset onto.
      if (!offsetSourceId) {
        const rect = primitives;
        const hit = hitTestTopmost(rect, world, 6 / PX_PER_INCH_AT_100);
        if (hit && hit.kind === 'line') setOffsetSourceId(hit.id);
        return;
      }
      const source = primitives.find(p => p.id === offsetSourceId);
      if (source && source.kind === 'line') {
        // Typed distance wins over the sticky toolbar value; the click side
        // picks which way to offset.
        const dist = parseLengthInput(typedLength) ?? offsetDistance;
        const offset = offsetLineCopy(source, dist, world);
        if (offset) setPrimitives([...primitives, offset]);
      }
      setOffsetSourceId(null);
      setTypedLength('');
      return;
    }

    if (t === 'erase') {
      // Click any shape — line, dimension, text, hatch — and it's removed
      // whole. (Without this branch the palette's Erase tool was a no-op in
      // the elevations view, so drawn dimensions couldn't be deleted.)
      const hit = hitTestTopmost(primitives, world, 6 / PX_PER_INCH_AT_100);
      if (hit) setPrimitives(primitives.filter(p => p.id !== hit.id));
      return;
    }

    if (t === 'trim') {
      // STEM Sketch single-click trim: click any piece of a line OR polyline
      // segment and that piece disappears. Crossings + natural polyline
      // vertices both act as cut points so a closed building outline opens up
      // cleanly when the user lops a single edge off. (Whole-object delete is
      // the Erase tool's job — see the `erase` branch above.)
      const hit = hitTestTopmost(primitives, world, 6 / PX_PER_INCH_AT_100);
      if (!hit) return;
      const target = primitives.find(p => p.id === hit.id);
      if (!target) return;
      let keep: DrawingPrimitive[] | null = null;
      if (target.kind === 'line') {
        const r = trimLineByClick(target, primitives, world);
        if (r) keep = r.keep;
      } else if (target.kind === 'polyline') {
        const r = trimPolylineByClick(target, primitives, world);
        if (r) keep = r.keep as DrawingPrimitive[];
      }
      if (!keep) return;
      const next: DrawingPrimitive[] = [];
      for (const p of primitives) {
        if (p.id === target.id) {
          for (const n of keep) next.push(n);
        } else {
          next.push(p);
        }
      }
      setPrimitives(next);
      return;
    }

    // Select tool (default) — handled by the canvas's own selection logic.
  }, [drafting, onChange, tool, lineAnchor, lineEnd, dimA, dimB, hatchVerts, hatchPattern,
      offsetSourceId, offsetDistance, typedLength, primitives, setPrimitives,
      project]);

  // ── Text commit (Enter from the floating input) ───────────────────────
  const commitText = useCallback(() => {
    if (!textAnchor) return;
    const content = textInput.trim();
    if (content.length === 0) {
      setTextAnchor(null);
      return;
    }
    setPrimitives([...primitives, makeUserText(textAnchor, content, 11)]);
    setTextAnchor(null);
    setTextInput('');
  }, [textAnchor, textInput, primitives, setPrimitives]);

  // ── Hatch commit (Enter or double-click closes the polygon) ──────────
  const commitHatch = useCallback(() => {
    // Strip consecutive near-duplicate verts — a double-click (used to close
    // the polygon) fires two clicks on the same point first.
    const cleaned = hatchVerts.filter((v, i) =>
      i === 0 || Math.hypot(v.x - hatchVerts[i - 1].x, v.y - hatchVerts[i - 1].y) > 1);
    if (cleaned.length < 3) { setHatchVerts([]); return; }
    const hatch: PrimHatch = {
      id: nextHatchId(),
      kind: 'hatch',
      verts: cleaned,
      pattern: hatchPattern,
    };
    setPrimitives([...primitives, hatch]);
    setHatchVerts([]);
  }, [hatchVerts, hatchPattern, primitives, setPrimitives]);

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!drafting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Ignore typing inside our text/distance inputs.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Undo / Redo
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); onUndo(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); onRedo(); return; }
      }
      if (e.key === 'Escape') {
        if (typedLength) { setTypedLength(''); return; }
        setSelection(new Set());
        resetToolState();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0
          && (!tool || tool === 'select')) {
        e.preventDefault();
        const next = primitives.filter(p => !selection.has(p.id));
        setPrimitives(next);
        setSelection(new Set());
        return;
      }
      if (e.key === 'Enter' && tool === 'hatch' && hatchVerts.length >= 3) {
        e.preventDefault();
        commitHatch();
        return;
      }
      // Typed LENGTH while drawing a line (digits / feet-inches / polar). Enter
      // commits at that length and chains from the new end; Backspace edits.
      if (tool === 'line' && lineAnchor) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (lineEnd && Math.hypot(lineEnd.x - lineAnchor.x, lineEnd.y - lineAnchor.y) > 0.5) {
            setPrimitives([...primitives, makeUserLine(lineAnchor, lineEnd, 'normal')]);
            setLineAnchor(lineEnd);
          }
          setTypedLength('');
          return;
        }
        if (e.key === 'Backspace') { e.preventDefault(); setTypedLength(s => s.slice(0, -1)); return; }
        if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === "'" || e.key === '"' ||
            e.key === '@' || e.key === '<' || e.key === '-' || e.key === ' ') {
          e.preventDefault();
          setTypedLength(s => s + e.key);
          return;
        }
      }
      // Typed OFFSET distance once a source line is picked; click picks the side.
      if (tool === 'offset' && offsetSourceId) {
        if (e.key === 'Backspace') { e.preventDefault(); setTypedLength(s => s.slice(0, -1)); return; }
        if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === "'" || e.key === '"') {
          e.preventDefault();
          setTypedLength(s => s + e.key);
          return;
        }
      }
      // Tool shortcuts (only when no modal input is active and no anchor
      // would be lost).
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        const shortcut: Record<string, ToolId> = {
          v: 'select', l: 'line', d: 'dimension',
          t: 'text', x: 'trim', o: 'offset', h: 'hatch', e: 'erase',
        };
        if (shortcut[k] && onChangeTool) onChangeTool(shortcut[k]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drafting, selection, primitives, setPrimitives, tool, hatchVerts,
      lineAnchor, lineEnd, typedLength, offsetSourceId,
      commitHatch, resetToolState, onChangeTool, onUndo, onRedo]);

  // Reset to Select when drafting ends so we never strand the user on a
  // draw tool with no editable target.
  useEffect(() => {
    if (!drafting && tool && tool !== 'select' && onChangeTool) onChangeTool('select');
  }, [drafting, tool, onChangeTool]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg, position: 'relative' }}>
      {/* ─── Toolbar ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', background: T.panel,
        borderBottom: `1px solid ${T.line}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
          color: T.accent, textTransform: 'uppercase',
        }}>Exterior elevation</div>

        <div style={{
          display: 'flex', gap: 2,
          marginLeft: 8, padding: 3, background: T.bg,
          border: `1px solid ${T.line}`, borderRadius: 8,
        }}>
          {ELEVATION_DIRECTIONS.map(d => {
            const active = d.id === direction;
            return (
              <button
                key={d.id}
                onClick={() => setDirection(d.id)}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 600,
                  background: active ? T.panel : 'transparent',
                  color: active ? T.ink : T.inkSoft,
                  border: active ? `1px solid ${T.lineStrong}` : '1px solid transparent',
                  borderRadius: 6, cursor: 'pointer',
                  boxShadow: active ? T.shadow : 'none',
                  transition: 'all 120ms',
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {/* Traditional drafting tools (select / line / dim / text / trim /
            offset / hatch) live on the LEFT-HAND ToolPalette — same as the
            2D plan, section, and roof-plan views. The top toolbar only
            shows tool-specific INLINE CONTROLS below. */}

        {/* Tool-specific inline controls */}
        {/* Selected-hatch material picker — appears the instant a hatch is
            selected (Select tool). Changing it re-styles the hatch in place. */}
        {drafting && selectedHatch && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.inkSoft }}>Hatch:</span>
            <select
              value={selectedHatch.pattern}
              onChange={e => setSelectedHatchPattern(e.target.value as HatchPattern)}
              style={{
                fontSize: 12, padding: '3px 6px', borderRadius: 4,
                border: `1px solid ${T.line}`, background: T.panel, color: T.ink,
              }}
            >
              {HATCH_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {drafting && tool === 'hatch' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.inkSoft }}>Pattern:</span>
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
            {hatchVerts.length >= 3 && (
              <button
                onClick={commitHatch}
                style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 4,
                  background: T.accent, color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >Close ({hatchVerts.length} pts)</button>
            )}
            {hatchVerts.length > 0 && (
              <span style={{ fontSize: 11, color: T.inkSoft }}>
                click the start point or double-click to fill
              </span>
            )}
          </div>
        )}
        {drafting && tool === 'offset' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.inkSoft }}>Distance:</span>
            <input
              type="number"
              value={offsetDistance}
              onChange={e => setOffsetDistance(parseFloat(e.target.value) || 0)}
              style={{
                width: 60, fontSize: 12, padding: '3px 6px', borderRadius: 4,
                border: `1px solid ${T.line}`, background: T.panel, color: T.ink,
              }}
            />
            <span style={{ fontSize: 11, color: T.inkSoft }}>in</span>
          </div>
        )}

        {/* Fit / 100% view buttons — always available regardless of tool. */}
        <button
          onClick={onFitView}
          title="Reset pan + zoom to fit the elevation"
          style={{
            padding: '5px 10px', fontSize: 12, fontWeight: 600,
            background: 'transparent', color: T.inkSoft,
            border: `1px solid ${T.line}`, borderRadius: 6, cursor: 'pointer',
          }}
        >Fit</button>

        {/* Customize / Reset drafting toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!drafting ? (
            <button
              onClick={onCustomize}
              disabled={!onChange || !scene}
              title="Freeze this elevation so you can edit individual primitives."
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                background: T.accent, color: '#fff',
                border: `1px solid ${T.accentInk}`, borderRadius: 6,
                cursor: onChange && scene ? 'pointer' : 'not-allowed',
                opacity: onChange && scene ? 1 : 0.5,
              }}
            >
              Customize this drawing
            </button>
          ) : (
            <>
              <span style={{ fontSize: 11, color: T.warm, fontWeight: 600 }}>
                EDITING — changes saved to this elevation
              </span>
              <button
                onClick={onReset}
                title="Discard edits and revert to the auto-generated drawing."
                style={{
                  padding: '6px 12px', fontSize: 12, fontWeight: 600,
                  background: 'transparent', color: T.inkSoft,
                  border: `1px solid ${T.line}`, borderRadius: 6, cursor: 'pointer',
                }}
              >
                Reset to auto
              </button>
            </>
          )}
          <div style={{ fontSize: 12, color: T.inkSoft }}>1/4" = 1'-0"</div>
        </div>
      </div>

      {/* ─── Canvas ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {scene ? (
          <ElevationSvg
            key={`${direction}-${viewResetSeq}`}
            primitives={primitives}
            ridgeY={scene.ridgeY}
            gradeY={scene.gradeY}
            xMin={scene.xMin}
            xMax={scene.xMax}
            selection={selection}
            tool={tool}
            drafting={drafting}
            onSelectionChange={setSelection}
            cursor={cursor}
            snap={snap}
            onCursorChange={setCursor}
            onSnapChange={setSnap}
            onWorldClick={handleWorldClick}
            lineAnchor={lineAnchor}
            lineEnd={lineEnd}
            typedLength={typedLength}
            dimA={dimA}
            dimB={dimB}
            textAnchor={textAnchor}
            textInput={textInput}
            onTextInputChange={setTextInput}
            onCommitText={commitText}
            onCancelText={() => { setTextAnchor(null); setTextInput(''); }}
            hatchVerts={hatchVerts}
            onCommitHatch={commitHatch}
            offsetSourceId={offsetSourceId}
            onSetPrimitives={setPrimitives}
            onBeginLiveOp={onBeginLiveOp}
            onEndLiveOp={onEndLiveOp}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Length / offset HUD — mirrors the 2D plan view. Shows the live or
          typed value; type a number (or length@angle for a line) then Enter. */}
      {drafting && tool === 'line' && lineAnchor && (
        <div style={HUD_STYLE}>
          <span style={{ color: typedLength ? T.warm : '#fff', fontWeight: typedLength ? 700 : 500 }}>
            {typedLength || (lineEnd ? formatImperial(Math.hypot(lineEnd.x - lineAnchor.x, lineEnd.y - lineAnchor.y)) : '0"')}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)', marginLeft: 10 }}>
            type length or length@angle + ↵ · Shift = free angle · Esc finishes
          </span>
        </div>
      )}
      {drafting && tool === 'offset' && offsetSourceId && (
        <div style={HUD_STYLE}>
          <span style={{ color: typedLength ? T.warm : '#fff', fontWeight: typedLength ? 700 : 500 }}>
            {typedLength || formatImperial(offsetDistance)}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)', marginLeft: 10 }}>
            type a distance, then click the side to offset onto · Esc cancels
          </span>
        </div>
      )}
    </div>
  );
}

const HUD_STYLE: React.CSSProperties = {
  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
  padding: '6px 12px', background: 'rgba(31,37,64,0.92)', color: '#fff',
  fontSize: 12, fontFamily: 'ui-monospace, monospace', borderRadius: 6,
  boxShadow: T.shadow, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5,
};

function EmptyState() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 360,
    }}>
      <div style={{
        maxWidth: 420, padding: '28px 32px', background: T.panel,
        border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: T.shadow,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
          color: T.accent, textTransform: 'uppercase', marginBottom: 8,
        }}>
          Nothing to show yet
        </div>
        <h2 style={{ fontSize: 18, color: T.ink, margin: '0 0 8px' }}>
          Draw at least one wall first
        </h2>
        <p style={{ fontSize: 13, color: T.inkSoft, margin: 0, lineHeight: 1.6 }}>
          The elevation is generated from your 2D plan and the building specs.
          Switch to the 2D Plan tab to draw walls, doors and windows.
        </p>
      </div>
    </div>
  );
}

// ── SVG renderer ──────────────────────────────────────────────────────────

interface ElevationSvgProps {
  primitives: DrawingPrimitive[];
  ridgeY: number;
  gradeY: number;
  xMin: number;
  xMax: number;
  selection: Set<string>;
  tool?: ToolId;
  drafting: boolean;
  onSelectionChange: (s: Set<string>) => void;
  cursor: Vec2 | null;
  snap: SnapResult | null;
  onCursorChange: (c: Vec2 | null) => void;
  onSnapChange: (s: SnapResult | null) => void;
  onWorldClick: (w: Vec2) => void;
  lineAnchor: Vec2 | null;
  lineEnd: Vec2 | null;
  typedLength: string;
  dimA: Vec2 | null;
  dimB: Vec2 | null;
  textAnchor: Vec2 | null;
  textInput: string;
  onTextInputChange: (s: string) => void;
  onCommitText: () => void;
  onCancelText: () => void;
  hatchVerts: Vec2[];
  onCommitHatch: () => void;
  offsetSourceId: string | null;
  onSetPrimitives: (next: DrawingPrimitive[]) => void;
  onBeginLiveOp: () => void;
  onEndLiveOp: () => void;
}

// Endpoint handle size + grab tolerance, in world inches at default zoom.
const HANDLE_SIZE_IN  = 4;
const HANDLE_GRAB_IN  = 6;

function ElevationSvg(props: ElevationSvgProps) {
  const {
    primitives, ridgeY, gradeY, xMin, xMax,
    selection, tool, drafting, onSelectionChange,
    cursor, snap, onCursorChange, onSnapChange, onWorldClick,
    lineAnchor, lineEnd, typedLength, dimA, dimB,
    textAnchor, textInput, onTextInputChange, onCommitText, onCancelText,
    hatchVerts, onCommitHatch, offsetSourceId, onSetPrimitives,
    onBeginLiveOp, onEndLiveOp,
  } = props;
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Base viewBox (drawing extents + padding) ─────────────────────────
  const drawingWidth  = xMax - xMin;
  const drawingHeight = ridgeY - gradeY;
  const baseVbX = xMin - PADDING_IN;
  const baseVbY = gradeY - PADDING_IN;
  const baseVbWidth  = drawingWidth + PADDING_IN * 2;
  const baseVbHeight = drawingHeight + PADDING_IN * 2;
  const flipY = (y: number) => -y;
  const baseVbYSvg = flipY(baseVbY + baseVbHeight);

  // ── Pan / zoom state ────────────────────────────────────────────────
  // `zoom` scales the viewBox window: zoom=2 means we see half as much
  // (drawing appears 2× larger). `panX`/`panY` shift the viewBox origin
  // in SVG units (same as world inches but with Y flipped).
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  // Reset pan/zoom when the drawing extents change significantly (new
  // direction → new viewBox base).
  useEffect(() => {
    setZoom(1); setPanX(0); setPanY(0);
  }, [baseVbX, baseVbYSvg, baseVbWidth, baseVbHeight]);

  // Effective viewBox after pan + zoom.
  const vbWidth  = baseVbWidth  / zoom;
  const vbHeight = baseVbHeight / zoom;
  const vbX      = baseVbX + panX;
  const vbYSvg   = baseVbYSvg + panY;

  // The SVG element FILLS its container and uses preserveAspectRatio
  // "xMidYMid meet", so the viewBox is letterboxed inside the element rect:
  // it scales by the smaller axis ratio and centers, leaving equal margins on
  // the other axis. Every screen↔world mapping must account for that scale +
  // offset, otherwise clicks/snaps drift on the unconstrained axis.
  const fitted = useCallback((): { rect: DOMRect; scale: number; offX: number; offY: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const scale = Math.min(rect.width / vbWidth, rect.height / vbHeight);
    return {
      rect, scale,
      offX: (rect.width  - vbWidth  * scale) / 2,
      offY: (rect.height - vbHeight * scale) / 2,
    };
  }, [vbWidth, vbHeight]);

  const screenToWorld = useCallback((clientX: number, clientY: number): Vec2 | null => {
    const f = fitted();
    if (!f) return null;
    const svgX = (clientX - f.rect.left - f.offX) / f.scale + vbX;
    const svgY = (clientY - f.rect.top  - f.offY) / f.scale + vbYSvg;
    return { x: svgX, y: -svgY };
  }, [fitted, vbX, vbYSvg]);

  // Tolerance in WORLD inches — derived from a constant pixel target.
  const tolWorld = useMemo(() => {
    const svg = svgRef.current;
    if (!svg) return 6 / PX_PER_INCH_AT_100;
    const rect = svg.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return 6 / PX_PER_INCH_AT_100;
    const scale = Math.min(rect.width / vbWidth, rect.height / vbHeight);
    return scale > 0 ? 6 / scale : 6 / PX_PER_INCH_AT_100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vbWidth, vbHeight, primitives]);

  // Apply ortho-lock to a draw point relative to the ACTIVE tool anchor:
  // the line tool's first point, or the dimension tool's first point (before
  // the second is placed). No anchor → returned unchanged.
  const resolveDraw = useCallback((base: Vec2, shiftKey: boolean): Vec2 => {
    let anchor: Vec2 | null = null;
    if (tool === 'line') anchor = lineAnchor;
    else if (tool === 'dimension' && dimA && !dimB) anchor = dimA;
    return anchor ? orthoLock(base, anchor, shiftKey) : base;
  }, [tool, lineAnchor, dimA, dimB]);

  // ── Pan + zoom + box-select interactions ─────────────────────────────
  // `panState` and `boxState` are mutually exclusive — pan = middle button,
  // box-select = left button while the Select tool is active.
  const [panState, setPanState] = useState<{ x0: number; y0: number; px0: number; py0: number } | null>(null);
  const [boxState, setBoxState] = useState<{ start: Vec2; current: Vec2 } | null>(null);
  // Drag state — unifies endpoint, vertex, and translate drags. Endpoint
  // = a line's A or B point; vertex = a polyline/hatch's individual vertex;
  // translate = move the whole selection.
  type Drag =
    | { kind: 'endpoint'; primId: string; endpoint: 'a' | 'b' }
    | { kind: 'vertex'; primId: string; index: number }
    | { kind: 'translate'; startWorld: Vec2; snapshot: DrawingPrimitive[] };
  const [dragHandle, setDragHandle] = useState<Drag | null>(null);
  // Set on the mouse-up that ends a drag, cleared on the next click. Lets
  // us skip the synthetic click that would otherwise re-select primitives.
  const justDraggedRef = useRef<boolean>(false);

  // Mouse wheel → zoom centered on the cursor's world point.
  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    const nextZoom = Math.max(0.2, Math.min(20, zoom * factor));
    // After zoom, keep the world point under the cursor pinned in place.
    // The viewBox is letterboxed (preserveAspectRatio meet), so we solve for
    // the new pan using the NEW fitted scale + centering offset:
    //   clientX - rect.left = offX + (worldSvgX - newVbX) * newScale
    const svg = svgRef.current;
    if (!svg) { setZoom(nextZoom); return; }
    const rect = svg.getBoundingClientRect();
    const newVbW = baseVbWidth  / nextZoom;
    const newVbH = baseVbHeight / nextZoom;
    const newScale = Math.min(rect.width / newVbW, rect.height / newVbH);
    const newOffX = (rect.width  - newVbW * newScale) / 2;
    const newOffY = (rect.height - newVbH * newScale) / 2;
    // newVbX = baseVbX + newPanX, and worldSvgX = world.x.
    const newPanX = world.x - baseVbX - (e.clientX - rect.left - newOffX) / newScale;
    // SVG-Y at cursor = -world.y; newVbYSvg = baseVbYSvg + newPanY.
    const newPanY = (-world.y) - baseVbYSvg - (e.clientY - rect.top - newOffY) / newScale;
    setZoom(nextZoom); setPanX(newPanX); setPanY(newPanY);
  }, [zoom, screenToWorld, baseVbWidth, baseVbHeight, baseVbX, baseVbYSvg]);

  // Mouse down: middle button → start pan. Left button + Select tool →
  // either start endpoint drag (if cursor over a handle), or start
  // box-select (if empty space). Click on a primitive is handled in
  // onClick (toggle selection).
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1) {
      e.preventDefault();
      setPanState({ x0: e.clientX, y0: e.clientY, px0: panX, py0: panY });
      return;
    }
    if (e.button === 0 && drafting && (!tool || tool === 'select')) {
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      const grab = HANDLE_GRAB_IN / zoom;
      // 1) Endpoint / vertex handle hit-test on every selected primitive.
      for (const id of selection) {
        const p = primitives.find(x => x.id === id);
        if (!p) continue;
        if (p.kind === 'line') {
          if (Math.hypot(p.a.x - world.x, p.a.y - world.y) <= grab) {
            onBeginLiveOp();
            setDragHandle({ kind: 'endpoint', primId: p.id, endpoint: 'a' });
            return;
          }
          if (Math.hypot(p.b.x - world.x, p.b.y - world.y) <= grab) {
            onBeginLiveOp();
            setDragHandle({ kind: 'endpoint', primId: p.id, endpoint: 'b' });
            return;
          }
        } else if (p.kind === 'polyline' || p.kind === 'hatch') {
          for (let i = 0; i < p.verts.length; i++) {
            const v = p.verts[i];
            if (Math.hypot(v.x - world.x, v.y - world.y) <= grab) {
              onBeginLiveOp();
              setDragHandle({ kind: 'vertex', primId: p.id, index: i });
              return;
            }
          }
        }
      }
      // 2) If the cursor is over a SELECTED primitive's body (not a handle),
      //    start translating the whole selection.
      const hit = hitTestTopmost(primitives, world, tolWorld);
      if (hit && selection.has(hit.id)) {
        onBeginLiveOp();
        setDragHandle({ kind: 'translate', startWorld: world, snapshot: primitives });
        return;
      }
      // 3) Empty space → start a box-select.
      if (!hit) {
        setBoxState({ start: world, current: world });
      }
    }
  }, [drafting, tool, primitives, selection, tolWorld, zoom, panX, panY,
      screenToWorld, onBeginLiveOp]);

  // Mouse-move: update cursor + snap target; drive pan / box-select /
  // endpoint drag.
  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // ── Pan in progress ─────────────────────────────────────────────
    if (panState) {
      const f = fitted();
      if (!f) return;
      // Screen px → world units uses the fitted scale (same on both axes).
      const dx = (e.clientX - panState.x0) / f.scale;
      const dy = (e.clientY - panState.y0) / f.scale;
      // Cursor moves RIGHT → content should move RIGHT → viewBox shifts LEFT.
      setPanX(panState.px0 - dx);
      setPanY(panState.py0 - dy);
      return;
    }
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    // ── Drag in progress (endpoint / vertex / translate) ──────────
    if (dragHandle) {
      if (dragHandle.kind === 'translate') {
        // Translate all selected primitives by the delta from drag start.
        const dx = world.x - dragHandle.startWorld.x;
        const dy = world.y - dragHandle.startWorld.y;
        const ids = selection;
        const next: DrawingPrimitive[] = dragHandle.snapshot.map(p => {
          if (!ids.has(p.id)) return p;
          switch (p.kind) {
            case 'line':
              return { ...p, a: { x: p.a.x + dx, y: p.a.y + dy }, b: { x: p.b.x + dx, y: p.b.y + dy } };
            case 'polyline':
            case 'hatch':
              return { ...p, verts: p.verts.map(v => ({ x: v.x + dx, y: v.y + dy })) };
            case 'text':
              return { ...p, at: { x: p.at.x + dx, y: p.at.y + dy } };
            case 'dimLinear':
              return { ...p, a: { x: p.a.x + dx, y: p.a.y + dy }, b: { x: p.b.x + dx, y: p.b.y + dy } };
            case 'pitchSymbol':
              return { ...p, anchor: { x: p.anchor.x + dx, y: p.anchor.y + dy } };
            default:
              return p;
          }
        });
        onSetPrimitives(next);
        return;
      }
      // Endpoint / vertex — snap against every other primitive.
      const others = primitives.filter(p => p.id !== dragHandle.primId);
      const dragSnap = findSnap(world, others, tolWorld);
      let target = dragSnap ? dragSnap.point : world;
      onSnapChange(dragSnap);
      // Ortho-lock an endpoint drag to the line's FIXED end so a line that
      // should be level/plumb stays exactly horizontal/vertical.
      if (dragHandle.kind === 'endpoint') {
        const ln = primitives.find(pp => pp.id === dragHandle.primId);
        if (ln && ln.kind === 'line') {
          const fixed = dragHandle.endpoint === 'a' ? ln.b : ln.a;
          target = orthoLock(target, fixed, e.shiftKey);
        }
      }
      const next = primitives.map(p => {
        if (p.id !== dragHandle.primId) return p;
        if (dragHandle.kind === 'endpoint' && p.kind === 'line') {
          return { ...p, [dragHandle.endpoint]: target };
        }
        if (dragHandle.kind === 'vertex' && (p.kind === 'polyline' || p.kind === 'hatch')) {
          const verts = p.verts.slice();
          verts[dragHandle.index] = target;
          return { ...p, verts };
        }
        return p;
      });
      onSetPrimitives(next);
      return;
    }
    // ── Box-select in progress ─────────────────────────────────────
    if (boxState) {
      setBoxState({ ...boxState, current: world });
      return;
    }
    if (drafting && tool && tool !== 'select') {
      const s = findSnap(world, primitives, tolWorld);
      onSnapChange(s);
      // cursor carries the RESOLVED draw point (geometry snap → ortho lock),
      // so the ghost preview and the committed point agree.
      onCursorChange(resolveDraw(s?.point ?? world, e.shiftKey));
    } else {
      onSnapChange(null);
      onCursorChange(world);
    }
  }, [panState, boxState, dragHandle, selection, fitted,
      drafting, tool, primitives, tolWorld, screenToWorld, resolveDraw,
      onCursorChange, onSnapChange, onSetPrimitives]);

  const onMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (panState && e.button === 1) {
      setPanState(null);
      return;
    }
    if (dragHandle && e.button === 0) {
      setDragHandle(null);
      onEndLiveOp();
      justDraggedRef.current = true;
      // Clear the guard on the next tick — after React fires onClick.
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      onSnapChange(null);
      return;
    }
    if (boxState && e.button === 0) {
      // Commit box selection. Right-to-left = crossing (touch);
      // left-to-right = window (fully inside).
      const crossing = boxState.current.x < boxState.start.x;
      const rect = {
        minX: Math.min(boxState.start.x, boxState.current.x),
        maxX: Math.max(boxState.start.x, boxState.current.x),
        minY: Math.min(boxState.start.y, boxState.current.y),
        maxY: Math.max(boxState.start.y, boxState.current.y),
      };
      const ids = new Set<string>();
      for (const p of primitives) {
        if (primitiveInBoxSelection(p, rect, crossing)) ids.add(p.id);
      }
      if (e.shiftKey) {
        const merged = new Set<string>(selection);
        for (const id of ids) merged.add(id);
        onSelectionChange(merged);
      } else {
        onSelectionChange(ids);
      }
      setBoxState(null);
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
    }
  }, [panState, dragHandle, boxState, primitives, selection,
      onSelectionChange, onSnapChange, onEndLiveOp]);

  const onMouseLeave = useCallback(() => {
    onCursorChange(null);
    onSnapChange(null);
    setPanState(null);
    setBoxState(null);
  }, [onCursorChange, onSnapChange]);

  const onClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drafting) return;
    // Skip click if a pan / box-select / endpoint-drag just finished —
    // the synthetic click follows mouse-up and would otherwise replace
    // the selection or fire a tool action at the drag end-point.
    if (panState || boxState || dragHandle || justDraggedRef.current) return;
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    const t = tool ?? 'select';
    // Select tool — handle locally (no commit, just selection change).
    if (t === 'select') {
      const hit = hitTestTopmost(primitives, world, tolWorld);
      const next = new Set<string>();
      if (hit) {
        if (e.shiftKey) {
          for (const id of selection) next.add(id);
          if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
        } else {
          next.add(hit.id);
        }
      } else if (!e.shiftKey) {
        // Empty space click without shift clears selection.
        // (Shift+empty-space leaves it alone for additive box-select.)
      } else {
        for (const id of selection) next.add(id);
      }
      onSelectionChange(next);
      return;
    }
    // Erase deletes whatever is literally under the cursor — use the RAW
    // click point. Snapping it (resolveDraw) would pull the target onto a
    // nearby endpoint, off the thing the user is pointing at (e.g. a
    // dimension's measured corner instead of its dim line).
    if (t === 'erase') { onWorldClick(world); return; }
    // Other tools — dispatch with the snapped point, ortho-locked to the
    // active anchor (Shift disables), so committed lines are exactly H/V.
    const target = resolveDraw(snap ? snap.point : world, e.shiftKey);
    onWorldClick(target);
  }, [drafting, panState, boxState, dragHandle, tool, primitives, selection,
      screenToWorld, tolWorld, snap, resolveDraw, onWorldClick, onSelectionChange]);

  // Resolved "live" endpoint for ghost previews. `cursor` already carries the
  // geometry-snap → ortho-lock resolution (set in onMouseMove), so the ghost
  // line/dim matches exactly where the click will commit.
  const live = cursor;

  // ── Paint order ─────────────────────────────────────────────────────────
  // Z-order is array order, but HATCHES must always sit in the BACK layer:
  // above the wall-shell background, below corner boards, trim, openings,
  // sills, and lines. A user-drawn hatch is appended to the end of the list,
  // which would otherwise paint it on top of everything. Pull every hatch to
  // just after the leading background run (the wall shell — everything before
  // the first hatch), preserving relative order within each band.
  const paintOrder = useMemo(() => {
    const firstHatch = primitives.findIndex(p => p.kind === 'hatch');
    if (firstHatch < 0) return primitives;
    const background = primitives.slice(0, firstHatch);
    const hatches    = primitives.filter(p => p.kind === 'hatch');
    const foreground = primitives.slice(firstHatch).filter(p => p.kind !== 'hatch');
    return [...background, ...hatches, ...foreground];
  }, [primitives]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`${vbX} ${vbYSvg} ${vbWidth} ${vbHeight}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={onClick}
      onDoubleClick={() => {
        if (drafting && tool === 'hatch' && hatchVerts.length >= 3) onCommitHatch();
      }}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
      onContextMenu={e => e.preventDefault()}
      style={{
        display: 'block', width: '100%', height: '100%',
        background: T.panel,
        cursor: panState ? 'grabbing'
              : (drafting && (!tool || tool === 'select')) ? 'default'
              : (drafting && (tool === 'line' || tool === 'dimension')) ? LINE_APERTURE_CURSOR
              : 'crosshair',
        // Disable text selection during pan/box-drag.
        userSelect: panState || boxState ? 'none' : undefined,
      }}
    >
      <HatchDefs />
      {paintOrder.map(p => (
        <PrimitiveNode key={p.id} prim={p} flip={flipY} />
      ))}
      {/* Selection overlay */}
      {primitives.filter(p => selection.has(p.id)).map(p => (
        <SelectionOverlay key={p.id} prim={p} flip={flipY} />
      ))}

      {/* Vertex / endpoint handles for selected primitives. Lines get an
          A and B handle; polylines + hatches get a handle per vert. Hollow
          white squares with an accent border; non-interactive (mouseDown
          hit-tests them via geometry). */}
      {drafting && (!tool || tool === 'select')
        && primitives.filter(p => selection.has(p.id))
        .flatMap(p => {
          const sz = HANDLE_SIZE_IN / zoom;
          const baseProps = {
            fill: '#ffffff',
            stroke: T.accent,
            strokeWidth: 1.2,
            vectorEffect: 'non-scaling-stroke' as const,
            pointerEvents: 'none' as const,
          };
          if (p.kind === 'line') {
            return (['a', 'b'] as const).map(end => {
              const v = p[end];
              const active = dragHandle?.kind === 'endpoint'
                && dragHandle.primId === p.id && dragHandle.endpoint === end;
              return (
                <rect
                  key={`${p.id}-${end}`}
                  x={v.x - sz / 2} y={flipY(v.y) - sz / 2}
                  width={sz} height={sz}
                  {...baseProps}
                  fill={active ? T.accent : '#ffffff'}
                />
              );
            });
          }
          if (p.kind === 'polyline' || p.kind === 'hatch') {
            return p.verts.map((v, i) => {
              const active = dragHandle?.kind === 'vertex'
                && dragHandle.primId === p.id && dragHandle.index === i;
              return (
                <rect
                  key={`${p.id}-v${i}`}
                  x={v.x - sz / 2} y={flipY(v.y) - sz / 2}
                  width={sz} height={sz}
                  {...baseProps}
                  fill={active ? T.accent : '#ffffff'}
                />
              );
            });
          }
          return [];
        })
      }
      {/* Highlight for Offset source / Trim cutting line */}
      {offsetSourceId && (() => {
        const p = primitives.find(x => x.id === offsetSourceId);
        return p ? <SelectionOverlay prim={p} flip={flipY} /> : null;
      })()}
      {/* ── Ghost previews (per active tool, in-progress) ─────────────── */}
      {drafting && tool === 'line' && lineAnchor && (lineEnd ?? live) && (
        <line
          x1={lineAnchor.x}         y1={flipY(lineAnchor.y)}
          x2={(lineEnd ?? live)!.x} y2={flipY((lineEnd ?? live)!.y)}
          stroke={T.accent} strokeWidth={1.5} strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {drafting && tool === 'dimension' && dimA && (dimB || live) && (
        <DimGhost
          a={dimA}
          b={dimB ?? live!}
          offsetPoint={dimB ? (live ?? dimB) : dimB}
          flip={flipY}
        />
      )}
      {drafting && tool === 'hatch' && hatchVerts.length > 0 && (
        <polyline
          points={[
            ...hatchVerts.map(v => `${v.x},${flipY(v.y)}`),
            ...(live ? [`${live.x},${flipY(live.y)}`] : []),
          ].join(' ')}
          fill="none"
          stroke={T.accent} strokeWidth={1.2} strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* Anchor dots for in-progress tools. Radius is in WORLD units but
          divided by zoom so the dot stays a fixed ~4px on screen (px-per-inch
          = PX_PER_INCH_AT_100 × zoom), instead of ballooning when zoomed in. */}
      {[lineAnchor, dimA, dimB].filter((x): x is Vec2 => !!x).map((p, i) => (
        <circle key={`anchor-${i}`} cx={p.x} cy={flipY(p.y)} r={2 / zoom}
          fill={T.accent} stroke="#fff" strokeWidth={0.6}
          vectorEffect="non-scaling-stroke" />
      ))}
      {hatchVerts.map((p, i) => (
        <circle key={`hv-${i}`} cx={p.x} cy={flipY(p.y)} r={1.5 / zoom}
          fill={T.accent} vectorEffect="non-scaling-stroke" />
      ))}

      {/* Snap indicator */}
      {snap && !panState && !boxState && (
        <SnapIndicator point={snap.point} kind={snap.kind} flip={flipY} zoom={zoom} />
      )}

      {/* Box-select rectangle. Right-to-left = green dashed (crossing,
          touch); left-to-right = blue solid (window, fully-inside). */}
      {boxState && (() => {
        const minX = Math.min(boxState.start.x, boxState.current.x);
        const maxX = Math.max(boxState.start.x, boxState.current.x);
        const minY = Math.min(boxState.start.y, boxState.current.y);
        const maxY = Math.max(boxState.start.y, boxState.current.y);
        const crossing = boxState.current.x < boxState.start.x;
        return (
          <rect
            x={minX} y={flipY(maxY)}
            width={maxX - minX} height={maxY - minY}
            fill={crossing ? 'rgba(34,197,94,0.08)' : 'rgba(79,124,255,0.10)'}
            stroke={crossing ? '#22C55E' : T.accent}
            strokeWidth={1}
            strokeDasharray={crossing ? '4 3' : undefined}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        );
      })()}

      {/* Text-tool floating input — positioned in world coords */}
      {drafting && tool === 'text' && textAnchor && (
        <foreignObject
          x={textAnchor.x}
          y={flipY(textAnchor.y) - 12}
          width={200}
          height={28}
          // Counter-rotate so the input doesn't get our viewBox transform.
        >
          <input
            autoFocus
            type="text"
            value={textInput}
            onChange={e => onTextInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onCommitText(); }
              else if (e.key === 'Escape') { e.preventDefault(); onCancelText(); }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 11, padding: '2px 6px',
              border: `1px solid ${T.accent}`, borderRadius: 3,
              background: '#fff', color: T.ink,
              fontFamily: 'ui-sans-serif, system-ui',
              width: '100%', boxSizing: 'border-box',
            }}
            placeholder="Type label…"
          />
        </foreignObject>
      )}
    </svg>
  );
}

// Selection overlay — same geometry as the underlying primitive, drawn with
// a thick accent stroke so the user can see what's selected. No fill.
function SelectionOverlay({ prim, flip }: { prim: DrawingPrimitive; flip: (y: number) => number }) {
  const stroke = T.accent;
  const strokeWidth = 2.5;
  const common = {
    stroke, strokeWidth,
    fill: 'none' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeLinejoin: 'miter' as const,
    pointerEvents: 'none' as const,
  };
  switch (prim.kind) {
    case 'line':
      return <line x1={prim.a.x} y1={flip(prim.a.y)} x2={prim.b.x} y2={flip(prim.b.y)} {...common} />;
    case 'polyline':
    case 'hatch': {
      const points = prim.verts.map(v => `${v.x},${flip(v.y)}`).join(' ');
      const closed = prim.kind === 'hatch' || (prim.kind === 'polyline' && prim.closed);
      return closed
        ? <polygon points={points} {...common} />
        : <polyline points={points} {...common} />;
    }
    case 'text':
      // Halo a 12-inch box around the anchor so text selection is visible.
      return (
        <rect
          x={prim.at.x - 6} y={flip(prim.at.y) - 6}
          width={12} height={12}
          {...common}
        />
      );
    default:
      return null;
  }
}

// ── Hatch <pattern> defs ──────────────────────────────────────────────────
// One <pattern> per material — referenced by url(#hatch-<pattern>) in the
// fill attribute of any hatch primitive. Coords are in inches (matches the
// outer SVG's userSpaceOnUse).
function HatchDefs() {
  const lineProps = {
    // Darker than T.inkMuted so hatch lines read clearly (stepped down twice).
    stroke: '#565c75',
    strokeWidth: 0.3,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  const fillNone = { fill: 'none' };
  return (
    <defs>
      {/* lap-siding — horizontal lines every 6" of exposure */}
      <pattern id="hatch-lap-siding" patternUnits="userSpaceOnUse"
        width={48} height={6}
        patternTransform="scale(1, -1)">
        <line x1={0} y1={0} x2={48} y2={0} {...lineProps} />
      </pattern>

      {/* board-batten — vertical battens every 16" on center */}
      <pattern id="hatch-board-batten" patternUnits="userSpaceOnUse"
        width={16} height={48}
        patternTransform="scale(1, -1)">
        <line x1={0} y1={0} x2={0} y2={48} {...lineProps} />
      </pattern>

      {/* brick — 8" × 2.5" units, half-bond offset every other row */}
      <pattern id="hatch-brick" patternUnits="userSpaceOnUse"
        width={8} height={5}
        patternTransform="scale(1, -1)">
        <rect x={0} y={0}   width={8} height={2.5} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        <rect x={-4} y={2.5} width={8} height={2.5} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        <rect x={4}  y={2.5} width={8} height={2.5} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
      </pattern>

      {/* stone — irregular blocky pattern; 24" × 16" tile */}
      <pattern id="hatch-stone" patternUnits="userSpaceOnUse"
        width={24} height={16}
        patternTransform="scale(1, -1)">
        {/* Row 1 (y 0-8): two large blocks */}
        <rect x={0}  y={0}  width={10} height={8} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        <rect x={10} y={0}  width={14} height={8} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        {/* Row 2 (y 8-16): three smaller blocks, offset */}
        <rect x={0}  y={8}  width={7}  height={8} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        <rect x={7}  y={8}  width={9}  height={8} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        <rect x={16} y={8}  width={8}  height={8} {...fillNone}
          stroke={T.inkMuted} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
      </pattern>

      {/* stucco — sparse dots / specks */}
      <pattern id="hatch-stucco" patternUnits="userSpaceOnUse"
        width={6} height={6}
        patternTransform="scale(1, -1)">
        <circle cx={1.5} cy={1.5} r={0.25} fill={T.inkMuted} />
        <circle cx={4}   cy={3}   r={0.25} fill={T.inkMuted} />
        <circle cx={2}   cy={5}   r={0.25} fill={T.inkMuted} />
      </pattern>

      {/* shake / shingle — 5" wide × 8" exposure, offset rows */}
      <pattern id="hatch-shake" patternUnits="userSpaceOnUse"
        width={10} height={8}
        patternTransform="scale(1, -1)">
        <line x1={0} y1={0} x2={10} y2={0} {...lineProps} />
        <line x1={0} y1={0} x2={0}  y2={8} {...lineProps} />
        <line x1={5} y1={0} x2={5}  y2={8} {...lineProps} />
        <line x1={10} y1={0} x2={10} y2={8} {...lineProps} />
        {/* offset bottom edge of next row */}
        <line x1={2.5} y1={4} x2={2.5} y2={8} {...lineProps} />
        <line x1={7.5} y1={4} x2={7.5} y2={8} {...lineProps} />
        <line x1={0}  y1={4} x2={10} y2={4} {...lineProps} />
      </pattern>

      {/* roof-shingles — asphalt/architectural courses: full-width horizontal
          course lines (6" exposure) with staggered vertical butt-joints
          (12" tabs, offset half a tab each course) */}
      <pattern id="hatch-roof-shingles" patternUnits="userSpaceOnUse"
        width={24} height={12}
        patternTransform="scale(1, -1)">
        {/* opaque white ground so the roof reads clean (the shingle hatch
            fills the roof surface directly — there's no white rect behind it) */}
        <rect x={0} y={0} width={24} height={12} fill="#ffffff" />
        {/* course lines */}
        <line x1={0} y1={0} x2={24} y2={0} {...lineProps} />
        <line x1={0} y1={6} x2={24} y2={6} {...lineProps} />
        {/* butt joints — lower course */}
        <line x1={0}  y1={0} x2={0}  y2={6} {...lineProps} />
        <line x1={12} y1={0} x2={12} y2={6} {...lineProps} />
        {/* butt joints — upper course, offset half a tab */}
        <line x1={6}  y1={6} x2={6}  y2={12} {...lineProps} />
        <line x1={18} y1={6} x2={18} y2={12} {...lineProps} />
      </pattern>
    </defs>
  );
}

// ── Primitive rendering ───────────────────────────────────────────────────

function PrimitiveNode({ prim, flip }: { prim: DrawingPrimitive; flip: (y: number) => number }) {
  switch (prim.kind) {
    case 'line':     return <LineNode p={prim} flip={flip} />;
    case 'polyline': return <PolylineNode p={prim} flip={flip} />;
    case 'hatch':    return <HatchNode p={prim} flip={flip} />;
    case 'text':     return <TextNode p={prim} flip={flip} />;
    case 'dimLinear': return <DimLinearNode p={prim} flip={flip} />;
    // dimChain, pitchSymbol — section-side primitives, not yet emitted by the
    // elevation builder. Add renderers when used.
    default:         return null;
  }
}

function LineNode({ p, flip }: { p: PrimLine; flip: (y: number) => number }) {
  const s = strokeFor(p.style);
  return (
    <line
      x1={p.a.x} y1={flip(p.a.y)}
      x2={p.b.x} y2={flip(p.b.y)}
      stroke={s.color}
      strokeWidth={s.width}
      strokeDasharray={s.dash}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function PolylineNode({ p, flip }: { p: PrimPolyline; flip: (y: number) => number }) {
  const points = p.verts.map(v => `${v.x},${flip(v.y)}`).join(' ');
  const s = strokeFor(p.style);
  const fill = fillColor(p.fill);
  if (p.closed) {
    return (
      <polygon points={points}
        fill={fill}
        stroke={p.noStroke ? 'none' : s.color}
        strokeWidth={p.noStroke ? 0 : s.width}
        strokeDasharray={s.dash}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return (
    <polyline points={points}
      fill="none"
      stroke={s.color}
      strokeWidth={s.width}
      strokeDasharray={s.dash}
      strokeLinejoin="miter"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function HatchNode({ p, flip }: { p: PrimHatch; flip: (y: number) => number }) {
  const points = p.verts.map(v => `${v.x},${flip(v.y)}`).join(' ');
  return (
    <>
      {/* Opaque white backing first, so a hatch laid over another hatch (or
          the wall siding) HIDES what's underneath instead of the two line
          patterns mixing together. Matches the white wall-shell fill, so a
          lone hatch looks unchanged. */}
      <polygon points={points} fill="#ffffff" stroke="none" />
      {/* 'blank' is the backing only — a mask to wipe out a region of hatch. */}
      {p.pattern !== 'blank' && (
        <polygon points={points} fill={`url(#hatch-${p.pattern})`} stroke="none" />
      )}
    </>
  );
}

function TextNode({ p, flip }: { p: PrimText; flip: (y: number) => number }) {
  const color =
    p.color === 'inkSoft'  ? T.inkSoft  :
    p.color === 'inkMuted' ? T.inkMuted :
                             T.ink;
  // SVG textAnchor maps from align: 'left' → 'start', etc.
  const anchor =
    p.align === 'right'  ? 'end'    :
    p.align === 'center' ? 'middle' :
                           'start';
  // SVG dominantBaseline: 'top' is approximated by 'hanging'.
  const baseline =
    p.baseline === 'top'    ? 'hanging' :
    p.baseline === 'middle' ? 'central' :
                              'alphabetic';
  return (
    <text
      x={p.at.x}
      y={flip(p.at.y)}
      fontSize={p.size ?? 10}
      fill={color}
      textAnchor={anchor}
      dominantBaseline={baseline}
      fontFamily="ui-sans-serif, system-ui"
    >
      {p.content}
    </text>
  );
}

// ── Committed linear dimension ───────────────────────────────────────────
// Extension lines + solid dim line at the perpendicular `offset`, 45° arch
// ticks at each end, and the measured length centered + rotated to read along
// the line. Mirrors the floor planner's drawDimension look (renderer.ts) so a
// dim placed in an elevation reads the same as one placed in plan. All geometry
// is computed in the FLIPPED (SVG screen-down) space so the tick/label rotation
// is correct despite the Y-up world.
const DIM_TICK_HALF = 4;    // world inches — half-length of the 45° end tick
const DIM_FONT      = 11;   // world inches — measurement label height

function DimLinearNode({ p, flip }: { p: PrimDimLinear; flip: (y: number) => number }) {
  const { a, b, offset } = p;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  // World-space perpendicular (Y-up), then flip every point into SVG space.
  const nx = -dy / len, ny = dx / len;
  const da = { x: a.x + nx * offset, y: a.y + ny * offset };
  const db = { x: b.x + nx * offset, y: b.y + ny * offset };
  const sA  = { x: a.x,  y: flip(a.y)  };
  const sB  = { x: b.x,  y: flip(b.y)  };
  const sDA = { x: da.x, y: flip(da.y) };
  const sDB = { x: db.x, y: flip(db.y) };

  const angle = Math.atan2(sDB.y - sDA.y, sDB.x - sDA.x);
  const tickDir = angle + Math.PI / 4;
  const tdx = Math.cos(tickDir) * DIM_TICK_HALF;
  const tdy = Math.sin(tickDir) * DIM_TICK_HALF;

  const midX = (sDA.x + sDB.x) / 2;
  const midY = (sDA.y + sDB.y) / 2;
  let textDeg = (angle * 180) / Math.PI;
  if (textDeg > 90 || textDeg < -90) textDeg += 180;   // keep the label upright

  const stroke = { stroke: T.ink, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <g pointerEvents="none">
      {/* Extension lines */}
      <line x1={sA.x} y1={sA.y} x2={sDA.x} y2={sDA.y} strokeWidth={0.8} {...stroke} />
      <line x1={sB.x} y1={sB.y} x2={sDB.x} y2={sDB.y} strokeWidth={0.8} {...stroke} />
      {/* Dim line */}
      <line x1={sDA.x} y1={sDA.y} x2={sDB.x} y2={sDB.y} strokeWidth={1.1} {...stroke} />
      {/* 45° architectural ticks */}
      <line x1={sDA.x - tdx} y1={sDA.y - tdy} x2={sDA.x + tdx} y2={sDA.y + tdy} strokeWidth={1.4} {...stroke} />
      <line x1={sDB.x - tdx} y1={sDB.y - tdy} x2={sDB.x + tdx} y2={sDB.y + tdy} strokeWidth={1.4} {...stroke} />
      {/* Measurement label */}
      <text
        x={midX} y={midY}
        transform={`rotate(${textDeg} ${midX} ${midY})`}
        fontSize={DIM_FONT}
        fontWeight={600}
        fill={T.ink}
        textAnchor="middle"
        dominantBaseline="alphabetic"
        dy={-3}
        fontFamily="ui-sans-serif, system-ui"
      >
        {formatImperial(len)}
      </text>
    </g>
  );
}

// ── Style → stroke attributes ────────────────────────────────────────────

// ── Dim tool ghost (extension lines + dashed dim line + label) ──────────
function DimGhost({ a, b, offsetPoint, flip }: {
  a: Vec2; b: Vec2;
  offsetPoint: Vec2 | null;
  flip: (y: number) => number;
}) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const nx = -dy / len;
  const ny =  dx / len;
  const offset = offsetPoint ? signedPerpendicularOffset(a, b, offsetPoint) : 12;
  const da = { x: a.x + nx * offset, y: a.y + ny * offset };
  const db = { x: b.x + nx * offset, y: b.y + ny * offset };
  return (
    <g pointerEvents="none">
      <line x1={a.x} y1={flip(a.y)} x2={da.x} y2={flip(da.y)}
        stroke={T.accent} strokeWidth={0.8} strokeDasharray="2 3"
        vectorEffect="non-scaling-stroke" />
      <line x1={b.x} y1={flip(b.y)} x2={db.x} y2={flip(db.y)}
        stroke={T.accent} strokeWidth={0.8} strokeDasharray="2 3"
        vectorEffect="non-scaling-stroke" />
      <line x1={da.x} y1={flip(da.y)} x2={db.x} y2={flip(db.y)}
        stroke={T.accent} strokeWidth={1.5} strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke" />
    </g>
  );
}

// ── Snap indicator — screen-px-sized glyph at the snap point ────────────
function SnapIndicator({ point, kind, flip, zoom }: {
  point: Vec2;
  kind: SnapResult['kind'];
  flip: (y: number) => number;
  zoom: number;
}) {
  // Render in screen units via vectorEffect="non-scaling-stroke" + a small
  // fixed world radius. The glyph approximates the canvas-side indicator.
  const x = point.x;
  const y = flip(point.y);
  // World units / zoom → fixed ~8px glyph on screen regardless of zoom.
  const r = 4 / zoom;
  const common = {
    stroke: '#22C55E',
    strokeWidth: 1.4,
    vectorEffect: 'non-scaling-stroke' as const,
    pointerEvents: 'none' as const,
  };
  switch (kind) {
    case 'endpoint':
      return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill="#22C55E" {...common} />;
    case 'midpoint':
      return <polygon points={`${x},${y - r} ${x + r},${y + r * 0.7} ${x - r},${y + r * 0.7}`}
        fill="#22C55E" {...common} />;
    case 'intersection':
      return (
        <g pointerEvents="none">
          <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} {...common} fill="none" />
          <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} {...common} fill="none" />
        </g>
      );
    case 'on-edge':
      return <circle cx={x} cy={y} r={r} fill="none" {...common} />;
    case 'grid':
      return (
        <g pointerEvents="none">
          <line x1={x - r} y1={y} x2={x + r} y2={y} {...common} fill="none" />
          <line x1={x} y1={y - r} x2={x} y2={y + r} {...common} fill="none" />
        </g>
      );
  }
}

// ── Ortho lock ─────────────────────────────────────────────────────────────
// Auto-lock a point to perfectly horizontal/vertical from an anchor when its
// angle is within ORTHO_DEG of an axis. Matches the Roof Plan view's behavior;
// holding Shift disables it for free draw.
const ORTHO_DEG = 7;

function nearestAxisAngle(angle: number): number {
  const a = ((angle % Math.PI) + Math.PI) % Math.PI;   // collapse to [0, π)
  const candidates = [0, Math.PI / 2, Math.PI];
  let best = candidates[0];
  let bestDist = Math.abs(a - candidates[0]);
  for (const c of candidates) {
    const d = Math.abs(a - c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return a - best;
}

function orthoLock(p: Vec2, anchor: Vec2, shiftKey: boolean): Vec2 {
  if (shiftKey) return p;
  const dx = p.x - anchor.x, dy = p.y - anchor.y;
  if (Math.hypot(dx, dy) === 0) return p;
  const fromAxis = nearestAxisAngle(Math.atan2(dy, dx));
  if (Math.abs(fromAxis) * 180 / Math.PI <= ORTHO_DEG) {
    return Math.abs(dx) >= Math.abs(dy) ? { x: p.x, y: anchor.y } : { x: anchor.x, y: p.y };
  }
  return p;
}

function strokeFor(style: SectionLineStyle | SectionPolyStyle): { color: string; width: number; dash?: string } {
  switch (style) {
    case 'thin':    return { color: T.ink,      width: 0.6 };
    case 'thick':   return { color: T.ink,      width: 2 };
    case 'dashed':  return { color: T.inkMuted, width: 0.6, dash: '2 4' };
    case 'dotted':  return { color: T.inkMuted, width: 0.6, dash: '1 2' };
    case 'hidden':  return { color: T.inkMuted, width: 0.6, dash: '4 2' };
    case 'center':  return { color: T.inkMuted, width: 0.6, dash: '6 3 1 3' };
    case 'arrow':
    case 'sheathing':
    case 'solid':
    case 'normal':
    default:        return { color: T.ink,      width: 1 };
  }
}

function fillColor(fill: PrimPolyline['fill']): string {
  switch (fill) {
    case 'trim':  return '#ffffff';
    case 'glass': return '#d6dff3';
    case 'panel': return '#eae6db';
    case 'door':  return '#cdd2d9';   // painted door — light grey
    case 'none':
    default:      return 'none';
  }
}
