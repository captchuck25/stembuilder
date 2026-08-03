'use client';
// The build surface: an SVG grid where fixed parts live and students drag out
// wires. Purely controlled — parents own the parts array and the solve result.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Part, Pt, SolveResult, ptKey, wirePoints } from '../engine/types';
import { BatteryView, BulbView, MaterialView, SwitchView, WireView } from './parts';

export const CELL = 48;
export const PAD = 34;

export type BoardTool = 'wire' | 'erase' | 'place';

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
  onAddWire?: (a: Pt, b: Pt) => void;
  onErase?: (id: string) => void;
  onToggleSwitch?: (id: string) => void;
  onToggleBulb?: (id: string) => void;
}

export default function CircuitBoard({
  parts, result, schematic = false, tool = 'wire', interactive = true,
  allowUnscrew = false, allowSwitch = true, gridW = 10, gridH = 6,
  materialEmoji = {}, clipEnd, placeSpan, onPlace, onAddWire, onErase, onToggleSwitch, onToggleBulb,
}: CircuitBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: Pt; to: Pt } | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);

  const W = PAD * 2 + gridW * CELL;
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
    const p = toGrid(e.clientX, e.clientY);
    if (!p) return;
    if (tool === 'place') {
      onPlace?.(clampPlace(p));
      return;
    }
    if (tool !== 'wire') return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ from: p, to: p });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const p = toGrid(e.clientX, e.clientY);
    if (tool === 'place' && p) setHover(clampPlace(p));
    if (!drag) return;
    if (p) setDrag(d => (d ? { ...d, to: alignEnd(d.from, p) } : null));
  };
  const handlePointerUp = () => {
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
      if (p.kind === 'wire') for (const pt of wirePoints(p.a, p.b)) bump(ptKey(pt));
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

  // z-order: wires under components, previews on top
  const wires = parts.filter(p => p.kind === 'wire');
  const others = parts.filter(p => p.kind !== 'wire');

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: '100%', maxWidth: W, display: 'block', borderRadius: 14, touchAction: 'none',
        background: schematic ? '#fdfdfc' : '#f8fafc', border: '2px solid #cbd5e1',
        cursor: interactive ? (tool === 'erase' ? 'not-allowed' : 'crosshair') : 'default',
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

      {interactive && gridDots.map(p => {
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
