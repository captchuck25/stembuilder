'use client';
// SVG renderers for circuit parts — each part draws in both pictorial mode
// (friendly, real-looking) and schematic mode (standard symbols).

import React from 'react';
import { Part, PartResult, Pt, WireSegment } from '../engine/types';

export type ToPx = (p: Pt) => { x: number; y: number };

const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// ── Wire ──────────────────────────────────────────────────────────────────────

export function WireView({ part, segments, toPx, schematic, erasable, onErase }: {
  part: Part;
  segments?: WireSegment[];
  toPx: ToPx;
  schematic: boolean;
  erasable: boolean;
  onErase?: (id: string) => void;
}) {
  const A = toPx(part.a);
  const B = toPx(part.b);
  const baseColor = schematic ? '#1f2937' : part.fixed ? '#64748b' : '#b45309';
  const flowing = segments?.some(s => Math.abs(s.current) > 0.01);
  // A student-PLACED broken segment shows its crack openly (they put it there
  // on purpose). Hidden faults are fixed:true and render like healthy wires.
  const cracked = part.broken && !part.fixed;
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const ux = (B.x - A.x) / len;
  const uy = (B.y - A.y) / len;
  // Jumper wires arc over the board — they only touch at their endpoints.
  if (part.jump) {
    const bow = { x: M.x - uy * 22, y: M.y - Math.abs(ux) * 22 - (Math.abs(uy) > 0.5 ? 0 : 0) };
    const d = `M ${A.x} ${A.y} Q ${bow.x} ${bow.y} ${B.x} ${B.y}`;
    const seg = segments?.[0];
    const rev = (seg?.current ?? 0) < 0;
    const dFlow = rev ? `M ${B.x} ${B.y} Q ${bow.x} ${bow.y} ${A.x} ${A.y}` : d;
    return (
      <g style={{ cursor: erasable ? 'pointer' : undefined }}
        onClick={erasable ? e => { e.stopPropagation(); onErase?.(part.id); } : undefined}>
        {erasable && <path d={d} fill="none" stroke="transparent" strokeWidth={18} />}
        <path d={d} fill="none" stroke={schematic ? '#1f2937' : '#b45309'} strokeWidth={schematic ? 3 : 5.5} strokeLinecap="round" />
        {seg && Math.abs(seg.current) > 0.001 && (
          <path d={dFlow} fill="none" stroke={Math.abs(seg.current) > 2 ? '#ef4444' : '#fbbf24'} strokeWidth={3}
            strokeLinecap="round" strokeDasharray="4 9"
            className={Math.abs(seg.current) > 2 ? 'elab-flow elab-flow-fast' : 'elab-flow'} />
        )}
        <circle cx={A.x} cy={A.y} r={4} fill="#92600a" />
        <circle cx={B.x} cy={B.y} r={4} fill="#92600a" />
      </g>
    );
  }
  return (
    <g
      style={{ cursor: erasable ? 'pointer' : undefined }}
      onClick={erasable ? e => { e.stopPropagation(); onErase?.(part.id); } : undefined}
    >
      {/* fat invisible hit area for erasing */}
      {erasable && <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="transparent" strokeWidth={16} />}
      {cracked ? (
        <>
          <line x1={A.x} y1={A.y} x2={M.x - ux * 7} y2={M.y - uy * 7} stroke={baseColor} strokeWidth={schematic ? 3 : 6} strokeLinecap="round" />
          <line x1={M.x + ux * 7} y1={M.y + uy * 7} x2={B.x} y2={B.y} stroke={baseColor} strokeWidth={schematic ? 3 : 6} strokeLinecap="round" />
          {/* jagged break ends */}
          <line x1={M.x - ux * 7 - uy * 6} y1={M.y - uy * 7 + ux * 6} x2={M.x - ux * 3 + uy * 6} y2={M.y - uy * 3 - ux * 6} stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
          <line x1={M.x + ux * 3 - uy * 6} y1={M.y + uy * 3 + ux * 6} x2={M.x + ux * 7 + uy * 6} y2={M.y + uy * 7 - ux * 6} stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
          <text x={M.x} y={M.y - (Math.abs(uy) > 0.5 ? 0 : 14)} dx={Math.abs(uy) > 0.5 ? 16 : 0} textAnchor={Math.abs(uy) > 0.5 ? 'start' : 'middle'} fontSize={10.5} fontWeight={800} fill="#dc2626">broken</text>
        </>
      ) : (
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={baseColor} strokeWidth={schematic ? 3 : 6} strokeLinecap="round" />
      )}
      {flowing && segments!.map((s, i) => {
        if (Math.abs(s.current) < 0.01) return null;
        const from = s.current > 0 ? toPx(s.a) : toPx(s.b);
        const to = s.current > 0 ? toPx(s.b) : toPx(s.a);
        const hot = Math.abs(s.current) > 2;
        return (
          <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke={hot ? '#ef4444' : '#fbbf24'} strokeWidth={schematic ? 2 : 3.5} strokeLinecap="round"
            strokeDasharray="4 9" className={hot ? 'elab-flow elab-flow-fast' : 'elab-flow'} />
        );
      })}
    </g>
  );
}

// ── Battery ───────────────────────────────────────────────────────────────────

export function BatteryView({ part, result, toPx, schematic }: {
  part: Part;
  result?: PartResult;
  toPx: ToPx;
  schematic: boolean;
}) {
  const A = toPx(part.a); // − terminal
  const B = toPx(part.b); // + terminal
  const M = mid(A, B);
  const horizontal = Math.abs(B.x - A.x) >= Math.abs(B.y - A.y);
  const overloaded = Math.abs(result?.current ?? 0) > 2;

  if (schematic) {
    // Standard symbol: short thick line (−), long thin line (+), centered on span
    const dirX = Math.sign(B.x - A.x);
    const dirY = Math.sign(B.y - A.y);
    const gap = 5;
    const sx = M.x - dirX * gap, sy = M.y - dirY * gap; // − plate position
    const lx = M.x + dirX * gap, ly = M.y + dirY * gap; // + plate position
    const px = horizontal ? 0 : 1, py = horizontal ? 1 : 0; // perpendicular
    return (
      <g>
        <line x1={A.x} y1={A.y} x2={sx} y2={sy} stroke="#1f2937" strokeWidth={3} />
        <line x1={lx} y1={ly} x2={B.x} y2={B.y} stroke="#1f2937" strokeWidth={3} />
        <line x1={sx - px * 8} y1={sy - py * 8} x2={sx + px * 8} y2={sy + py * 8} stroke="#1f2937" strokeWidth={5} />
        <line x1={lx - px * 16} y1={ly - py * 16} x2={lx + px * 16} y2={ly + py * 16} stroke="#1f2937" strokeWidth={2.5} />
        <text x={M.x} y={horizontal ? M.y - 24 : M.y - 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#475569">
          {part.voltage ?? 3}V
        </text>
        <text x={B.x + (horizontal ? 0 : 14)} y={B.y - (horizontal ? 10 : -4)} textAnchor="middle" fontSize={13} fontWeight={800} fill="#475569">+</text>
      </g>
    );
  }

  // Pictorial battery pack spanning the two terminals
  const w = horizontal ? Math.abs(B.x - A.x) - 20 : 34;
  const h = horizontal ? 34 : Math.abs(B.y - A.y) - 20;
  const cx = M.x, cy = M.y;
  return (
    <g>
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#475569" strokeWidth={5} strokeLinecap="round" />
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={7}
        fill={overloaded ? '#7f1d1d' : '#1e293b'} stroke={overloaded ? '#ef4444' : '#0f172a'} strokeWidth={2}
        className={overloaded ? 'elab-pulse' : undefined} />
      <rect x={cx - w / 2} y={cy - h / 2 + (horizontal ? h * 0.32 : 0)} width={horizontal ? w : w} height={horizontal ? h * 0.36 : h}
        rx={4} fill="#facc15" opacity={0.9}
        {...(horizontal ? {} : { x: cx - w / 2 + w * 0.32, width: w * 0.36 })} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={13} fontWeight={900} fill="#1e293b">
        {overloaded ? '🔥' : `${part.voltage ?? 3}V`}
      </text>
      {/* terminal posts — big labeled caps so polarity is obvious at a glance */}
      <circle cx={A.x} cy={A.y} r={10} fill="#334155" stroke="#0f172a" strokeWidth={2} />
      <text x={A.x} y={A.y + 5} textAnchor="middle" fontSize={16} fontWeight={900} fill="#fff">−</text>
      <circle cx={B.x} cy={B.y} r={10} fill="#dc2626" stroke="#7f1d1d" strokeWidth={2} />
      <text x={B.x} y={B.y + 5} textAnchor="middle" fontSize={15} fontWeight={900} fill="#fff">+</text>
      {overloaded && (
        <text x={cx} y={cy - h / 2 - 8} textAnchor="middle" fontSize={12} fontWeight={800} fill="#dc2626" className="elab-pulse">
          ⚠️ TOO HOT!
        </text>
      )}
    </g>
  );
}

// ── Bulb ──────────────────────────────────────────────────────────────────────

export function BulbView({ part, result, toPx, schematic, clickable, onToggle }: {
  part: Part;
  result?: PartResult;
  toPx: ToPx;
  schematic: boolean;
  clickable: boolean;
  onToggle?: (id: string) => void;
}) {
  const A = toPx(part.a);
  const B = toPx(part.b);
  const M = mid(A, B);
  const brightness = Math.min(1, result?.brightness ?? 0);
  const lit = brightness > 0.05 && !part.removed;
  const glassY = M.y - (part.removed ? 34 : 16); // lifted out of the socket when unscrewed

  const glassFill = lit
    ? `rgba(253, 224, 71, ${0.25 + 0.6 * brightness})`
    : part.removed ? 'rgba(226,232,240,0.5)' : 'rgba(226,232,240,0.85)';

  if (schematic) {
    const r = 13;
    return (
      <g style={{ cursor: clickable ? 'pointer' : undefined }}
        onClick={clickable ? e => { e.stopPropagation(); onToggle?.(part.id); } : undefined}>
        <line x1={A.x} y1={A.y} x2={M.x - r} y2={M.y} stroke="#1f2937" strokeWidth={3} />
        <line x1={M.x + r} y1={M.y} x2={B.x} y2={B.y} stroke="#1f2937" strokeWidth={3} />
        {lit && <circle cx={M.x} cy={M.y} r={r + 8} fill={`rgba(253,224,71,${0.35 * brightness})`} />}
        <circle cx={M.x} cy={M.y} r={r} fill={lit ? glassFill : '#fff'} stroke="#1f2937" strokeWidth={2.5}
          strokeDasharray={part.removed ? '4 4' : undefined} />
        {!part.removed && (
          <>
            <line x1={M.x - r * 0.7} y1={M.y - r * 0.7} x2={M.x + r * 0.7} y2={M.y + r * 0.7} stroke="#1f2937" strokeWidth={2} />
            <line x1={M.x - r * 0.7} y1={M.y + r * 0.7} x2={M.x + r * 0.7} y2={M.y - r * 0.7} stroke="#1f2937" strokeWidth={2} />
          </>
        )}
        {part.label && <text x={M.x} y={M.y + r + 16} textAnchor="middle" fontSize={11} fontWeight={700} fill="#64748b">{part.label}</text>}
      </g>
    );
  }

  return (
    <g style={{ cursor: clickable ? 'pointer' : undefined }}
      onClick={clickable ? e => { e.stopPropagation(); onToggle?.(part.id); } : undefined}>
      {/* leads + socket */}
      <line x1={A.x} y1={A.y} x2={M.x - 12} y2={M.y} stroke="#475569" strokeWidth={5} strokeLinecap="round" />
      <line x1={M.x + 12} y1={M.y} x2={B.x} y2={B.y} stroke="#475569" strokeWidth={5} strokeLinecap="round" />
      <rect x={M.x - 13} y={M.y - 7} width={26} height={14} rx={4} fill="#94a3b8" stroke="#64748b" strokeWidth={1.5} />
      {/* glow halo */}
      {lit && <circle cx={M.x} cy={glassY - 6} r={30} fill={`rgba(253,224,71,${0.4 * brightness})`} className="elab-soft" />}
      {lit && <circle cx={M.x} cy={glassY - 6} r={44} fill={`rgba(253,224,71,${0.16 * brightness})`} className="elab-soft" />}
      {/* screw base */}
      <rect x={M.x - 7} y={glassY + 4} width={14} height={11} rx={2} fill="#cbd5e1" stroke="#94a3b8" strokeWidth={1.5} />
      <line x1={M.x - 7} y1={glassY + 8} x2={M.x + 7} y2={glassY + 8} stroke="#94a3b8" strokeWidth={1.5} />
      <line x1={M.x - 7} y1={glassY + 11.5} x2={M.x + 7} y2={glassY + 11.5} stroke="#94a3b8" strokeWidth={1.5} />
      {/* glass */}
      <circle cx={M.x} cy={glassY - 8} r={15} fill={glassFill} stroke={part.removed ? '#94a3b8' : '#64748b'} strokeWidth={2}
        strokeDasharray={part.removed ? '4 3' : undefined} />
      {/* filament */}
      <path d={`M ${M.x - 5} ${glassY - 2} L ${M.x - 5} ${glassY - 9} L ${M.x - 2} ${glassY - 6} L ${M.x + 2} ${glassY - 11} L ${M.x + 5} ${glassY - 8} L ${M.x + 5} ${glassY - 2}`}
        fill="none" stroke={lit ? '#f59e0b' : '#94a3b8'} strokeWidth={1.8} />
      {part.removed && (
        <text x={M.x} y={M.y + 26} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#94a3b8">unscrewed</text>
      )}
      {part.label && <text x={M.x} y={M.y + (part.removed ? 40 : 26)} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#64748b">{part.label}</text>}
    </g>
  );
}

// ── Switch ────────────────────────────────────────────────────────────────────

export function SwitchView({ part, toPx, schematic, clickable, onToggle }: {
  part: Part;
  toPx: ToPx;
  schematic: boolean;
  clickable: boolean;
  onToggle?: (id: string) => void;
}) {
  const A = toPx(part.a);
  const B = toPx(part.b);
  const closed = !!part.closed;
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  const ang = Math.atan2(B.y - A.y, B.x - A.x);
  // lever from A toward B; rotated up when open
  const leverAng = closed ? ang : ang - 0.6;
  const leverLen = len * 0.82;
  const tip = { x: A.x + Math.cos(leverAng) * leverLen, y: A.y + Math.sin(leverAng) * leverLen };
  const stroke = schematic ? '#1f2937' : '#475569';
  const horizontal = Math.abs(B.x - A.x) >= Math.abs(B.y - A.y);
  const midX = (A.x + B.x) / 2;
  const midY = (A.y + B.y) / 2;
  return (
    <g style={{ cursor: clickable ? 'pointer' : undefined }}
      onClick={clickable ? e => { e.stopPropagation(); onToggle?.(part.id); } : undefined}>
      {/* generous hit area */}
      <circle cx={midX} cy={midY - (horizontal ? 8 : 0)} r={26} fill="transparent" />
      {!schematic && horizontal && <rect x={Math.min(A.x, B.x) - 6} y={Math.min(A.y, B.y) + 4} width={Math.abs(B.x - A.x) + 12} height={10} rx={4} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth={1} />}
      {!schematic && !horizontal && <rect x={Math.min(A.x, B.x) + 4} y={Math.min(A.y, B.y) - 6} width={10} height={Math.abs(B.y - A.y) + 12} rx={4} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth={1} />}
      <line x1={A.x} y1={A.y} x2={tip.x} y2={tip.y} stroke={closed ? (schematic ? '#1f2937' : '#b45309') : stroke}
        strokeWidth={schematic ? 3 : 5} strokeLinecap="round" />
      <circle cx={A.x} cy={A.y} r={schematic ? 4 : 5.5} fill="#fff" stroke={stroke} strokeWidth={2.5} />
      <circle cx={B.x} cy={B.y} r={schematic ? 4 : 5.5} fill="#fff" stroke={stroke} strokeWidth={2.5} />
      {clickable && (horizontal ? (
        <text x={midX} y={Math.min(A.y, B.y) + 28} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#94a3b8">
          {closed ? 'ON — tap to open' : 'OFF — tap to close'}
        </text>
      ) : (
        <text x={midX - 30} y={midY + 4} textAnchor="end" fontSize={10.5} fontWeight={700} fill="#94a3b8">
          {closed ? 'ON — tap to open' : 'OFF — tap to close'}
        </text>
      ))}
      {part.label && (horizontal ? (
        <text x={midX} y={Math.min(A.y, B.y) - 22} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#64748b">{part.label}</text>
      ) : (
        <text x={midX - 30} y={midY - 12} textAnchor="end" fontSize={11.5} fontWeight={800} fill="#64748b">{part.label}</text>
      ))}
    </g>
  );
}

// ── Resistor ──────────────────────────────────────────────────────────────────

export function ResistorView({ part, toPx, schematic }: {
  part: Part;
  toPx: ToPx;
  schematic: boolean;
}) {
  const A = toPx(part.a);
  const B = toPx(part.b);
  const M = mid(A, B);
  const zig = (cx: number, cy: number, w: number, color: string, sw: number) => {
    const s = w / 6;
    return (
      <path d={`M ${cx - w / 2} ${cy} l ${s * 0.5} -8 l ${s} 16 l ${s} -16 l ${s} 16 l ${s} -16 l ${s} 16 l ${s * 0.5} -8`}
        fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
    );
  };
  if (schematic) {
    return (
      <g>
        <line x1={A.x} y1={A.y} x2={M.x - 26} y2={M.y} stroke="#1f2937" strokeWidth={3} />
        <line x1={M.x + 26} y1={M.y} x2={B.x} y2={B.y} stroke="#1f2937" strokeWidth={3} />
        {zig(M.x, M.y, 52, '#1f2937', 2.5)}
        {part.label && <text x={M.x} y={M.y + 26} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#475569">{part.label}</text>}
      </g>
    );
  }
  return (
    <g>
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#475569" strokeWidth={5} strokeLinecap="round" />
      <rect x={M.x - 30} y={M.y - 12} width={60} height={24} rx={8} fill="#fde68a" stroke="#b45309" strokeWidth={2} />
      {zig(M.x, M.y, 40, '#b45309', 2.5)}
      {part.label && <text x={M.x} y={M.y + 30} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#64748b">{part.label}</text>}
    </g>
  );
}

// ── LED ───────────────────────────────────────────────────────────────────────

export function LEDView({ part, result, toPx, schematic, clickable, onFlip }: {
  part: Part;
  result?: PartResult;
  toPx: ToPx;
  schematic: boolean;
  clickable: boolean;
  onFlip?: (id: string) => void;
}) {
  const A = toPx(part.a); // anode (+, long leg)
  const B = toPx(part.b); // cathode (−, flat side)
  const M = mid(A, B);
  const cur = result?.current ?? 0;
  const lit = cur > 0.001;
  const burned = Math.abs(cur) > 0.05;
  const horizontal = Math.abs(B.x - A.x) >= Math.abs(B.y - A.y);
  const flip = clickable ? (e: React.MouseEvent) => { e.stopPropagation(); onFlip?.(part.id); } : undefined;

  if (schematic) {
    // diode symbol: triangle points anode → cathode, bar at cathode
    const dx = Math.sign(B.x - A.x) || 0;
    const dy = Math.sign(B.y - A.y) || 0;
    const px = -dy, py = dx;
    return (
      <g style={{ cursor: clickable ? 'pointer' : undefined }} onClick={flip}>
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#1f2937" strokeWidth={3} />
        <path d={`M ${M.x - dx * 10 + px * 10} ${M.y - dy * 10 + py * 10} L ${M.x - dx * 10 - px * 10} ${M.y - dy * 10 - py * 10} L ${M.x + dx * 10} ${M.y + dy * 10} Z`}
          fill={lit ? '#fbbf24' : '#fff'} stroke="#1f2937" strokeWidth={2} />
        <line x1={M.x + dx * 10 + px * 10} y1={M.y + dy * 10 + py * 10} x2={M.x + dx * 10 - px * 10} y2={M.y + dy * 10 - py * 10} stroke="#1f2937" strokeWidth={3} />
        {/* light arrows */}
        <path d={`M ${M.x + px * 14} ${M.y + py * 14 - 10} l 6 -6 M ${M.x + px * 14 + 8} ${M.y + py * 14 - 8} l 6 -6`} stroke={lit ? '#f59e0b' : '#94a3b8'} strokeWidth={2} fill="none" />
        {part.label && <text x={M.x} y={Math.max(A.y, B.y) + 24} textAnchor="middle" fontSize={11} fontWeight={700} fill="#64748b">{part.label}</text>}
      </g>
    );
  }

  const domeY = M.y - 14;
  return (
    <g style={{ cursor: clickable ? 'pointer' : undefined }} onClick={flip}>
      {/* legs */}
      <line x1={A.x} y1={A.y} x2={M.x - 7} y2={domeY + 8} stroke="#94a3b8" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={B.x} y1={B.y} x2={M.x + 7} y2={domeY + 8} stroke="#94a3b8" strokeWidth={3.5} strokeLinecap="round" />
      {/* glow */}
      {lit && !burned && <circle cx={M.x} cy={domeY} r={26} fill={`rgba(248,113,113,${0.25 + 0.35 * Math.min(1, result?.brightness ?? 0)})`} className="elab-soft" />}
      {/* dome (flat side toward cathode) */}
      <path d={`M ${M.x - 9} ${domeY + 8} L ${M.x - 9} ${domeY - 2} A 9 9 0 0 1 ${M.x + 9} ${domeY - 2} L ${M.x + 9} ${domeY + 8} Z`}
        fill={burned ? '#78716c' : lit ? '#f87171' : 'rgba(252,165,165,0.7)'}
        stroke={burned ? '#44403c' : '#b91c1c'} strokeWidth={2} />
      <rect x={M.x - 11} y={domeY + 6} width={22} height={4} rx={1.5} fill={burned ? '#57534e' : '#dc2626'} />
      {burned && <text x={M.x} y={domeY - 14} textAnchor="middle" fontSize={15}>💥</text>}
      {/* polarity marks */}
      <text x={A.x + (horizontal ? 0 : -12)} y={A.y + (horizontal ? 18 : 4)} textAnchor="middle" fontSize={11} fontWeight={900} fill="#dc2626">+</text>
      <text x={B.x + (horizontal ? 0 : -12)} y={B.y + (horizontal ? 18 : 4)} textAnchor="middle" fontSize={11} fontWeight={900} fill="#475569">−</text>
      {clickable && (
        <text x={M.x} y={domeY - (burned ? 28 : 16)} textAnchor="middle" fontSize={10} fontWeight={700} fill="#94a3b8">tap to flip</text>
      )}
      {part.label && <text x={M.x} y={Math.max(A.y, B.y) + 30} textAnchor="middle" fontSize={11} fontWeight={800} fill="#64748b">{part.label}</text>}
    </g>
  );
}

// ── Test material (sits between the alligator clips) ──────────────────────────

export function MaterialView({ part, toPx, emoji }: {
  part: Part;
  toPx: ToPx;
  emoji?: string;
}) {
  const A = toPx(part.a);
  const B = toPx(part.b);
  const M = mid(A, B);
  if (part.removed) {
    return (
      <g>
        <ClipJaw at={A} dir={1} />
        <ClipJaw at={B} dir={-1} />
        {/* dashed empty slot where the chip will sit */}
        <rect x={M.x - 34} y={M.y - 15} width={68} height={30} rx={8}
          fill="rgba(245,158,11,0.06)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" />
        {/* label on its own pill below the slot so it never overlaps wires */}
        <rect x={M.x - 62} y={M.y + 22} width={124} height={20} rx={10} fill="#fff" stroke="#e2e8f0" strokeWidth={1.5} />
        <text x={M.x} y={M.y + 36} textAnchor="middle" fontSize={11} fontWeight={800} fill="#b45309">place a material here</text>
      </g>
    );
  }
  return (
    <g>
      <ClipJaw at={A} dir={1} />
      <ClipJaw at={B} dir={-1} />
      <rect x={M.x - 34} y={M.y - 15} width={68} height={30} rx={8} fill="#fff" stroke="#94a3b8" strokeWidth={2} />
      <text x={M.x} y={M.y + 6} textAnchor="middle" fontSize={16}>{emoji ?? '▫️'}</text>
      {part.label && <text x={M.x} y={M.y + 32} textAnchor="middle" fontSize={11} fontWeight={700} fill="#64748b">{part.label}</text>}
    </g>
  );
}

// ── Multimeter probe pen (Circuit Detective) ──────────────────────────────────

/** A handheld test probe whose metal tip touches (x, y). `lean` tilts the
 *  handle (positive = toward the meter on the right). When `leadFrom` (a meter
 *  socket) is given, the lead plugs into the BUTT of the handle and arcs over,
 *  entering along the handle's axis like a real test lead. */
export function ProbePen({ x, y, color = '#dc2626', lean = 38, opacity = 1, badge, leadFrom }: {
  x: number; y: number; color?: string; lean?: number; opacity?: number; badge?: string;
  leadFrom?: { x: number; y: number };
}) {
  const rad = (lean * Math.PI) / 180;
  // butt of the handle in global coords (local (0, -64) rotated by lean)
  const butt = { x: x + 64 * Math.sin(rad), y: y - 64 * Math.cos(rad) };
  const dir = { x: Math.sin(rad), y: -Math.cos(rad) }; // handle axis, tip → butt
  return (
    <g pointerEvents="none" opacity={opacity}>
      {leadFrom && (
        <path
          d={`M ${leadFrom.x} ${leadFrom.y} C ${leadFrom.x} ${leadFrom.y + 46}, ${butt.x + 55 * dir.x} ${butt.y + 55 * dir.y}, ${butt.x} ${butt.y}`}
          fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" opacity={0.8} />
      )}
      <g transform={`translate(${x} ${y}) rotate(${lean})`}>
        {/* metal needle */}
        <line x1={0} y1={-2} x2={0} y2={-18} stroke="#94a3b8" strokeWidth={3.5} strokeLinecap="round" />
        <line x1={0} y1={-2} x2={0} y2={-10} stroke="#e2e8f0" strokeWidth={1.2} strokeLinecap="round" />
        {/* handle */}
        <rect x={-6} y={-64} width={12} height={48} rx={6} fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} />
        {/* grip rings */}
        <line x1={-6} y1={-28} x2={6} y2={-28} stroke="rgba(0,0,0,0.22)" strokeWidth={2.5} />
        <line x1={-6} y1={-34} x2={6} y2={-34} stroke="rgba(0,0,0,0.22)" strokeWidth={2.5} />
      </g>
      {/* contact point + badge */}
      <circle cx={x} cy={y} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5} />
      {badge && (
        <>
          <circle cx={x - 16} cy={y + 12} r={8.5} fill={color} stroke="#fff" strokeWidth={2} />
          <text x={x - 16} y={y + 16} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff">{badge}</text>
        </>
      )}
    </g>
  );
}

/** Where the meter's lead sockets sit, for wiring ProbePen leadFrom. */
export const meterSockets = (x: number, y: number) => ({
  red: { x: x + 52, y: y + 166 },
  black: { x: x + 98, y: y + 166 },
});

// ── Multimeter (Circuit Detective) — the probes' home base ────────────────────

export type MeterState = 'idle' | 'waiting' | 'beep' | 'open';

/** A classic yellow handheld multimeter set to continuity mode. Its screen IS
 *  the test result: green "BEEP!" for continuity, amber "OL" (open loop) for a
 *  break. 150×190 px. */
export function MultimeterView({ x, y, state }: {
  x: number; y: number; state: MeterState;
}) {
  const { red: socketRed, black: socketBlack } = meterSockets(x, y);
  const screen =
    state === 'beep' ? { bg: '#bbf7d0', main: 'BEEP!', sub: '0 Ω — path found', color: '#14532d' }
    : state === 'open' ? { bg: '#fde68a', main: 'OL', sub: 'open loop — no path', color: '#78350f' }
    : state === 'waiting' ? { bg: '#cbd5e1', main: '· · ·', sub: 'place probe 2', color: '#334155' }
    : { bg: '#cbd5e1', main: '— —', sub: 'tap two points', color: '#64748b' };
  return (
    <g pointerEvents="none">
      {/* holster + face */}
      <rect x={x} y={y} width={150} height={190} rx={16} fill="#eab308" stroke="#92600a" strokeWidth={3} />
      <rect x={x + 10} y={y + 10} width={130} height={170} rx={10} fill="#1f2937" />
      {/* screen */}
      <rect x={x + 20} y={y + 20} width={110} height={54} rx={7} fill={screen.bg}
        className={state === 'beep' ? 'elab-pulse' : undefined} stroke="rgba(0,0,0,0.25)" strokeWidth={1.5} />
      <text x={x + 75} y={y + 48} textAnchor="middle" fontSize={state === 'beep' ? 19 : 21} fontWeight={900}
        fontFamily="monospace" fill={screen.color}>{screen.main}</text>
      <text x={x + 75} y={y + 66} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={screen.color}>{screen.sub}</text>
      {/* mode dial pointing at continuity */}
      <circle cx={x + 75} cy={y + 118} r={25} fill="#334155" stroke="#0f172a" strokeWidth={2.5} />
      <line x1={x + 75} y1={y + 118} x2={x + 92} y2={y + 101} stroke="#e2e8f0" strokeWidth={4} strokeLinecap="round" />
      <text x={x + 104} y={y + 96} textAnchor="middle" fontSize={12} fill="#e2e8f0">🔊</text>
      <text x={x + 75} y={y + 155} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#94a3b8" letterSpacing="1">CONTINUITY</text>
      {/* lead sockets */}
      <circle cx={socketRed.x} cy={socketRed.y} r={7} fill="#dc2626" stroke="#fff" strokeWidth={2} />
      <circle cx={socketBlack.x} cy={socketBlack.y} r={7} fill="#1f2937" stroke="#fff" strokeWidth={2} />
    </g>
  );
}

function ClipJaw({ at, dir }: { at: { x: number; y: number }; dir: 1 | -1 }) {
  // little alligator clip pointing inward
  return (
    <g>
      <path d={`M ${at.x} ${at.y} l ${10 * dir} -7 l 0 14 z`} fill="#dc2626" stroke="#991b1b" strokeWidth={1.5} />
      <circle cx={at.x} cy={at.y} r={4} fill="#334155" />
    </g>
  );
}
