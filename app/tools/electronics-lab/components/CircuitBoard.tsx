'use client';
// The build surface: an SVG grid where fixed parts live and students drag out
// wires. Purely controlled — parents own the parts array and the solve result.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Part, Pt, SolveResult, ptKey, wirePoints } from '../engine/types';
import { BatteryView, BulbView, LEDView, MaterialView, ProbePen, ResistorView, SwitchView, WireView } from './parts';

/** The breadboard's plastic body, painted under the grid dots (which become
 *  its holes). Strips/rails are real hidden wire parts; x-ray paints where
 *  they run. Layout convention: + rail at y=0, − rail at y=gridH, terminal
 *  strip columns x=1..gridW-1 spanning y=1..gridH-1. */
function BreadboardSkin({ gridW, gridH, xray }: { gridW: number; gridH: number; xray: boolean }) {
  const px = (x: number) => PAD + x * CELL;
  const py = (y: number) => PAD + y * CELL;
  return (
    <g pointerEvents="none">
      <rect x={px(0) - 26} y={py(0) - 26} width={gridW * CELL + 52} height={gridH * CELL + 52} rx={14}
        fill="#e7e5e4" stroke="#a8a29e" strokeWidth={2.5} />
      {/* power rails */}
      <rect x={px(0) - 18} y={py(0) - 13} width={gridW * CELL + 36} height={26} rx={8} fill="#fee2e2" stroke="#fca5a5" strokeWidth={1.5} />
      <rect x={px(0) - 18} y={py(gridH) - 13} width={gridW * CELL + 36} height={26} rx={8} fill="#dbeafe" stroke="#93c5fd" strokeWidth={1.5} />
      <text x={px(0) - 22} y={py(0) + 5} textAnchor="end" fontSize={15} fontWeight={900} fill="#dc2626">+</text>
      <text x={px(gridW) + 22} y={py(0) + 5} textAnchor="start" fontSize={15} fontWeight={900} fill="#dc2626">+</text>
      <text x={px(0) - 22} y={py(gridH) + 5} textAnchor="end" fontSize={15} fontWeight={900} fill="#2563eb">−</text>
      <text x={px(gridW) + 22} y={py(gridH) + 5} textAnchor="start" fontSize={15} fontWeight={900} fill="#2563eb">−</text>
      {/* x-ray: the hidden metal inside */}
      {xray && (
        <g opacity={0.85}>
          <rect x={px(0) - 10} y={py(0) - 5} width={gridW * CELL + 20} height={10} rx={5} fill="rgba(220,38,38,0.35)" stroke="#dc2626" strokeWidth={1.5} />
          <rect x={px(0) - 10} y={py(gridH) - 5} width={gridW * CELL + 20} height={10} rx={5} fill="rgba(37,99,235,0.35)" stroke="#2563eb" strokeWidth={1.5} />
          {Array.from({ length: gridW - 1 }, (_, i) => i + 1).map(x => (
            <rect key={x} x={px(x) - 6} y={py(1) - 8} width={12} height={(gridH - 2) * CELL + 16} rx={6}
              fill="rgba(22,163,74,0.3)" stroke="#16a34a" strokeWidth={1.5} />
          ))}
        </g>
      )}
      {/* hole rings on top of everything the skin draws */}
      {Array.from({ length: gridW + 1 }, (_, x) => (
        <g key={x}>
          <circle cx={px(x)} cy={py(0)} r={3.5} fill="#57534e" />
          <circle cx={px(x)} cy={py(gridH)} r={3.5} fill="#57534e" />
        </g>
      ))}
      {Array.from({ length: gridW - 1 }, (_, i) => i + 1).map(x =>
        Array.from({ length: gridH - 1 }, (_, j) => j + 1).map(y => (
          <circle key={`${x},${y}`} cx={px(x)} cy={py(y)} r={3.5} fill="#57534e" />
        )))}
    </g>
  );
}

export const CELL = 48;
export const PAD = 34;

export type BoardTool = 'wire' | 'erase' | 'place' | 'probe' | 'repair';

interface CircuitBoardProps {
  parts: Part[];
  result: SolveResult;
  schematic?: boolean;
  tool?: BoardTool;
  /** false → display only (no wiring, no erasing; switches/bulbs may still be tappable) */
  interactive?: boolean;
  allowUnscrew?: boolean;
  allowSwitch?: boolean;
  gridW?: number;
  gridH?: number;
  materialEmoji?: Record<string, string>;
  /** Optionally clamp a dragged wire's endpoint (e.g. stop at switch contacts). */
  clipEnd?: (from: Pt, to: Pt) => Pt;
  /** place tool: how many cells wide the pending component is. */
  placeSpan?: number;
  onPlace?: (a: Pt) => void;
  /** probe tool: tap a grid point (Circuit Detective's continuity tester). */
  onProbe?: (p: Pt) => void;
  /** probe tool: grabbable markers (the placed probes). Pointer-down on a
   *  marker's grid point starts a drag instead of placing a new probe. */
  dragMarkers?: { id: string; at: Pt }[];
  onMarkerDrag?: (id: string, at: Pt) => void;
  onMarkerDrop?: (id: string, at: Pt) => void;
  /** repair tool: tap ANY part, fixed or not (Circuit Detective's wrench). */
  onPartTap?: (id: string) => void;
  /** Extra SVG rendered on top (probe markers, highlights). */
  overlay?: React.ReactNode;
  /** Extra horizontal space (px) to the right of the grid, e.g. for the multimeter dock. */
  dockWidth?: number;
  /** Render the breadboard skin (rails/strip holes; x-ray shows the metal). */
  breadboard?: { xray: boolean };
  onFlipLed?: (id: string) => void;
  onAddWire?: (a: Pt, b: Pt) => void;
  onErase?: (id: string) => void;
  onToggleSwitch?: (id: string) => void;
  onToggleBulb?: (id: string) => void;
}

export default function CircuitBoard({
  parts, result, schematic = false, tool = 'wire', interactive = true,
  allowUnscrew = false, allowSwitch = true, gridW = 10, gridH = 6,
  materialEmoji = {}, clipEnd, placeSpan, onPlace, onProbe, dragMarkers, onMarkerDrag, onMarkerDrop,
  onPartTap, overlay, dockWidth = 0, breadboard, onFlipLed,
  onAddWire, onErase, onToggleSwitch, onToggleBulb,
}: CircuitBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: Pt; to: Pt } | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [dragMarkerId, setDragMarkerId] = useState<string | null>(null);
  const lastMarkerPt = useRef<Pt | null>(null);

  const W = PAD * 2 + gridW * CELL + dockWidth;
  const H = PAD * 2 + gridH * CELL;
  const toPx = useCallback((p: Pt) => ({ x: PAD + p.x * CELL, y: PAD + p.y * CELL }), []);

  const toGrid = useCallback((clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    const x = Math.round((sx - PAD) / CELL);
    const y = Math.round((sy - PAD) / CELL);
    return { x: Math.max(0, Math.min(gridW, x)), y: Math.max(0, Math.min(gridH, y)) };
  }, [W, H, gridW, gridH]);

  /** Snap the drag end axis-aligned to the start point, then apply any clip. */
  const alignEnd = (from: Pt, to: Pt): Pt => {
    const aligned = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    return clipEnd ? clipEnd(from, aligned) : aligned;
  };

  const clampPlace = useCallback((p: Pt): Pt => ({
    x: Math.max(0, Math.min(p.x, gridW - (placeSpan ?? 0))), y: p.y,
  }), [gridW, placeSpan]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault(); // stop the browser starting a text selection on drag
    const p = toGrid(e.clientX, e.clientY);
    if (!p) return;
    if (tool === 'place') {
      onPlace?.(clampPlace(p));
      return;
    }
    if (tool === 'probe') {
      const marker = dragMarkers?.find(m => m.at.x === p.x && m.at.y === p.y);
      if (marker) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDragMarkerId(marker.id);
        lastMarkerPt.current = p;
        return;
      }
      onProbe?.(p);
      return;
    }
    if (tool !== 'wire') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ from: p, to: p });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const p = toGrid(e.clientX, e.clientY);
    if (tool === 'place' && p) setHover(clampPlace(p));
    if (tool === 'probe' && p) setHover(p);
    if (dragMarkerId && p) {
      lastMarkerPt.current = p;
      onMarkerDrag?.(dragMarkerId, p);
      return;
    }
    if (!drag) return;
    if (p) setDrag(d => (d ? { ...d, to: alignEnd(d.from, p) } : null));
  };
  const handlePointerUp = () => {
    if (dragMarkerId) {
      if (lastMarkerPt.current) onMarkerDrop?.(dragMarkerId, lastMarkerPt.current);
      setDragMarkerId(null);
    }
    if (drag) {
      const { from, to } = drag;
      if (from.x !== to.x || from.y !== to.y) onAddWire?.(from, to);
    }
    setDrag(null);
  };
  const handlePointerLeave = () => {
    handlePointerUp();
    setHover(null);
  };

  // Junction dots: grid points touched by 2+ distinct parts are electrically joined
  const junctions = useMemo(() => {
    const count = new Map<string, number>();
    const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
    for (const p of parts) {
      if (p.kind === 'material' && p.removed) continue;
      if (p.kind === 'wire' && !p.jump) for (const pt of wirePoints(p.a, p.b)) bump(ptKey(pt));
      else { bump(ptKey(p.a)); bump(ptKey(p.b)); }
    }
    return [...count.entries()].filter(([, n]) => n >= 2).map(([k]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
  }, [parts]);

  const gridDots = useMemo(() => {
    const dots: Pt[] = [];
    for (let x = 0; x <= gridW; x++) for (let y = 0; y <= gridH; y++) dots.push({ x, y });
    return dots;
  }, [gridW, gridH]);

  // z-order: wires under components, previews on top (hidden = breadboard internals)
  const wires = parts.filter(p => p.kind === 'wire' && !p.hidden);
  const others = parts.filter(p => p.kind !== 'wire' && !p.hidden);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: '100%', maxWidth: W, display: 'block', borderRadius: 14, touchAction: 'none',
        background: schematic ? '#fdfdfc' : '#f8fafc', border: '2px solid #cbd5e1',
        cursor: interactive ? (tool === 'erase' ? 'not-allowed' : 'crosshair') : 'default',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <style>{`
        .elab-flow { animation: elabFlow 0.55s linear infinite; }
        .elab-flow-fast { animation-duration: 0.18s; }
        @keyframes elabFlow { to { stroke-dashoffset: -13; } }
        .elab-pulse { animation: elabPulse 0.7s ease-in-out infinite alternate; }
        @keyframes elabPulse { from { opacity: 1; } to { opacity: 0.45; } }
        .elab-soft { transition: opacity 250ms ease; }
      `}</style>

      {breadboard && <BreadboardSkin gridW={gridW} gridH={gridH} xray={breadboard.xray} />}

      {interactive && !breadboard && gridDots.map(p => {
        const px = toPx(p);
        return <circle key={ptKey(p)} cx={px.x} cy={px.y} r={2} fill="#d7dee8" />;
      })}

      {wires.map(p => (
        <WireView key={p.id} part={p} segments={result.wireSegments[p.id]} toPx={toPx} schematic={schematic}
          erasable={interactive && tool === 'erase' && !p.fixed} onErase={onErase} />
      ))}

      {junctions.map(p => {
        const px = toPx(p);
        return <circle key={`j${ptKey(p)}`} cx={px.x} cy={px.y} r={schematic ? 3.5 : 4.5} fill={schematic ? '#1f2937' : '#92600a'} />;
      })}

      {others.map(p => {
        switch (p.kind) {
          case 'battery':
            return <BatteryView key={p.id} part={p} result={result.parts[p.id]} toPx={toPx} schematic={schematic} />;
          case 'bulb':
            return <BulbView key={p.id} part={p} result={result.parts[p.id]} toPx={toPx} schematic={schematic}
              clickable={allowUnscrew} onToggle={onToggleBulb} />;
          case 'switch':
            return <SwitchView key={p.id} part={p} toPx={toPx} schematic={schematic}
              clickable={allowSwitch} onToggle={onToggleSwitch} />;
          case 'material':
            return <MaterialView key={p.id} part={p} toPx={toPx} emoji={p.label ? materialEmoji[p.label] : undefined} />;
          case 'resistor':
            return <ResistorView key={p.id} part={p} toPx={toPx} schematic={schematic} />;
          case 'led':
            return <LEDView key={p.id} part={p} result={result.parts[p.id]} toPx={toPx} schematic={schematic}
              clickable={interactive && !!onFlipLed} onFlip={onFlipLed} />;
          default:
            return null;
        }
      })}

      {/* erase mode: fat invisible hit lines over student-placed components */}
      {interactive && tool === 'erase' && others.filter(p => !p.fixed).map(p => {
        const A = toPx(p.a);
        const B = toPx(p.b);
        return (
          <line key={`e${p.id}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="transparent" strokeWidth={26}
            style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onErase?.(p.id); }} />
        );
      })}

      {/* repair mode: every part (wires included) is tappable */}
      {interactive && tool === 'repair' && parts.filter(p => p.kind !== 'material').map(p => {
        const A = toPx(p.a);
        const B = toPx(p.b);
        return (
          <line key={`r${p.id}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="transparent" strokeWidth={26}
            style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onPartTap?.(p.id); }} />
        );
      })}

      {/* ghost preview for the place tool */}
      {interactive && tool === 'place' && hover && placeSpan != null && (() => {
        const A = toPx(hover);
        const B = toPx({ x: hover.x + placeSpan, y: hover.y });
        return (
          <g pointerEvents="none" opacity={0.65}>
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#f59e0b" strokeWidth={8} strokeLinecap="round" strokeDasharray="8 6" />
            <circle cx={A.x} cy={A.y} r={7} fill="#fff" stroke="#f59e0b" strokeWidth={3} />
            <circle cx={B.x} cy={B.y} r={7} fill="#fff" stroke="#f59e0b" strokeWidth={3} />
          </g>
        );
      })()}

      {/* probe hover: a ghost probe pen follows the cursor (not while dragging one) */}
      {interactive && tool === 'probe' && hover && !dragMarkerId && (() => {
        const A = toPx(hover);
        return (
          <g pointerEvents="none">
            <circle cx={A.x} cy={A.y} r={10} fill="none" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="4 3" />
            <ProbePen x={A.x} y={A.y} color="#0ea5e9" lean={38} opacity={0.45} />
          </g>
        );
      })()}

      {overlay}

      {/* rubber-band preview while dragging a wire */}
      {drag && (drag.from.x !== drag.to.x || drag.from.y !== drag.to.y) && (() => {
        const A = toPx(drag.from);
        const B = toPx(drag.to);
        return (
          <g pointerEvents="none">
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#f59e0b" strokeWidth={6} strokeLinecap="round" opacity={0.55} strokeDasharray="10 6" />
            <circle cx={A.x} cy={A.y} r={6} fill="#f59e0b" opacity={0.7} />
            <circle cx={B.x} cy={B.y} r={6} fill="#f59e0b" opacity={0.7} />
          </g>
        );
      })()}
    </svg>
  );
}
