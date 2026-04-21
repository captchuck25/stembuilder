"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import SiteHeader from "@/app/components/SiteHeader";
import { upsertToolHighScore } from "@/lib/achievements";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

// ── Geometry ──────────────────────────────────────────────────────────────────
const SVG_W   = 1421;
const SVG_H   = 740;
const BASE_DY = 120;     // shift base down to make room for pan above pivot
const PIVOT_X = 237.5;   // black dot cx in base.svg
const PIVOT_Y = 84.2 + BASE_DY;  // 204.2 — black dot cy + BASE_DY
const PAN_DX  = 237.5 - 320.5;  // -83   — align red dot x → black dot x
const PAN_DY  = PIVOT_Y - 193.5; // 10.7  — align red dot y → black dot y

const BEAM_X0      = 423;
const BEAM_X1      = 1305;
const BEAM_LEN     = BEAM_X1 - BEAM_X0; // 882 px
const TENS_END_X   = BEAM_X1 - 65;   // 1240
const HUND_END_X   = BEAM_X1 - 105;  // 1200
const ONES_END_X   = BEAM_X1 - 60;   // 1245

// Beam top edges in pan-assembly coords (from SVG paths)
const TENS_TOP  = 23.6;
const HUND_TOP  = 150.5;
const ONES_TOP  = 275.7;
// Rider body centers (top_edge - tip_local_y + half_height)
const TENS_CY   = TENS_TOP - 34 + 20.5;   // ≈ 10.1
const HUND_CY   = HUND_TOP - 34 + 20.5;   // ≈ 137
const ONES_CY   = ONES_TOP - 34.7 + 21;   // ≈ 262


// Pointer tip x within each rider's local coords + the +15 visual offset
const RIDER_OFFSET = 15;
const TENS_TIP_X   = 59.5;
const HUND_TIP_X   = 86.5;
const ONES_TIP_X   = 50.1;
// x where the 0 tick should appear for each beam (directly under the arrow at value=0)
const TENS_TICK_X0  = BEAM_X0 + RIDER_OFFSET + TENS_TIP_X;  // 497.5
const HUND_TICK_X0  = BEAM_X0 + RIDER_OFFSET + HUND_TIP_X;  // 524.5
const ONES_TICK_X0  = BEAM_X0 + RIDER_OFFSET + ONES_TIP_X;  // 488.1

const MAX_ANGLE = 5; // degrees max tilt

// ── Types ─────────────────────────────────────────────────────────────────────
type GameMode = "read" | "balance";
interface Riders  { hundreds: number; tens: number; ones: number; }
interface Target extends Riders { total: number; label: string; }

function newTarget(): Target {
  const hundreds = Math.floor(Math.random() * 6) * 100;
  const tens     = Math.floor(Math.random() * 11) * 10;
  const ones     = Math.round(Math.random() * 100) / 10;
  const total    = Math.round((hundreds + tens + ones) * 10) / 10;
  return { hundreds, tens, ones, total, label: total.toFixed(1) + " g" };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// Position rider left-edge so tip lands on the correct tick mark,
// scaling to the usable length that fits within BEAM_X1.
function riderPos(value: number, max: number, tickX0: number, tipX: number, endX: number): number {
  return tickX0 - tipX + (value / max) * (endX - tickX0);
}

// Inverse-transform SVG coords → pan-assembly coords (accounting for rotation)
function invTransform(svgX: number, svgY: number, angleDeg: number): [number, number] {
  const rad = -angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = svgX - PIVOT_X, dy = svgY - PIVOT_Y;
  return [dx * cos - dy * sin + PIVOT_X - PAN_DX,
          dx * sin + dy * cos + PIVOT_Y - PAN_DY];
}

// ── Beam tick marks (rendered inside rotating group) ──────────────────────────
function BeamTicks({ startX, endX, topY, max, step, majorEvery, fs }: {
  startX: number; endX: number; topY: number; max: number; step: number; majorEvery: number; fs: number;
}) {
  const nodes: React.ReactNode[] = [];
  const count = Math.round(max / step);
  for (let i = 0; i <= count; i++) {
    const v = Math.round(i * step * 10) / 10;
    const x = startX + (i / count) * (endX - startX);
    const isMajor = i % majorEvery === 0;
    const isMid   = majorEvery >= 4 && i % Math.ceil(majorEvery / 2) === 0;
    const h = isMajor ? 21 : isMid ? 15 : 10;
    nodes.push(
      <line key={i} x1={x} y1={topY} x2={x} y2={topY + h}
        stroke="#444" strokeWidth={isMajor ? 1.8 : isMid ? 1.2 : 0.7}
        strokeLinecap="round"/>
    );
    if (isMajor) {
      nodes.push(
        <text key={`l${i}`} x={x} y={topY + fs + 22}
          textAnchor="middle" fontSize={fs} fontWeight="700" fill="#222"
          dominantBaseline="auto"
          fontFamily="Arial, Helvetica, sans-serif">
          {Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}
        </text>
      );
    }
  }
  return <>{nodes}</>;
}

// ── Zoom scope ────────────────────────────────────────────────────────────────
// Shows a magnified circular view of the pointer/indicator area in real time.
// Uses the same coordinate space as the main combined SVG (pre-scale wrapper).
function ZoomScope({ angleDeg }: { angleDeg: number }) {
  const SIZE = 150;
  // Tight viewBox around the pointer gap — "slice" fills the circle for max zoom
  const VX = 1258, VY = 161, VW = 125, VH = 68;
  // Base red line y in combined SVG space (base.svg y + BASE_DY)
  const BASE_RED_Y = 75.1775 + BASE_DY; // 195.2

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
      <svg width={SIZE} height={SIZE}
        viewBox={`${VX} ${VY} ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ borderRadius: "50%", display: "block",
          border: "5px solid #222", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>

        {/* Background */}
        <rect x={VX} y={VY} width={VW} height={VH} fill="#b8bcc2"/>

        {/* Base right housing (simplified) */}
        <rect x={1310} y={VY} width={VX + VW - 1310} height={VH} fill="#c8cdd5"/>
        <rect x={1305} y={VY} width={8} height={VH} fill="#1a1f27"/>

        {/* Base fixed red reference line */}
        <line x1={1365} y1={BASE_RED_Y} x2={1306} y2={BASE_RED_Y}
          stroke="#FF0909" strokeWidth={2.5}/>

        {/* Rotating pan assembly pointer */}
        <g transform={`rotate(${angleDeg}, ${PIVOT_X}, ${PIVOT_Y}) translate(${PAN_DX}, ${PAN_DY})`}>
          <path d="M1305.5 368.5H1341.5V216.5L1398.5 200.5V185.5V170.5L1341.5 152.5V13.5H1305.5V368.5Z"
            fill="#1F2630" stroke="#343A43" strokeWidth="2"/>
          <line x1={1398.5} y1={184.5} x2={1355} y2={184.5}
            stroke="#FF0909" strokeWidth={2.5}/>
        </g>

        {/* Crosshair centre line */}
        <line x1={VX} y1={BASE_RED_Y} x2={VX + VW} y2={BASE_RED_Y}
          stroke="rgba(255,255,255,0.18)" strokeWidth={0.6} strokeDasharray="4 4"/>
      </svg>

      {/* Lens glare */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none",
        background: "radial-gradient(ellipse at 35% 28%, rgba(255,255,255,0.18) 0%, transparent 55%)",
      }}/>

      {/* Scope ring */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none",
        boxShadow: "inset 0 0 18px rgba(0,0,0,0.55)",
      }}/>
    </div>
  );
}

// ── Combined SVG ──────────────────────────────────────────────────────────────
function TripleBeamSVG({ riders, target, mode, answered, onDrag }: {
  riders: Riders;
  target: Target;
  mode: GameMode;
  answered: boolean;
  onDrag?: (beam: keyof Riders, val: number) => void;
}) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<keyof Riders | null>(null);

  const riderSum  = Math.round((riders.hundreds + riders.tens + riders.ones) * 10) / 10;
  const imbalance = target.total - riderSum;
  const isBalanced = Math.abs(imbalance) < 1.0;
  const angleDeg = (mode === "read" || answered) ? 0
    : clamp(-imbalance * 0.02, -MAX_ANGLE, MAX_ANGLE);

  const hX = riderPos(riders.hundreds, 500, HUND_TICK_X0, HUND_TIP_X, HUND_END_X);
  const tX = riderPos(riders.tens,    100, TENS_TICK_X0, TENS_TIP_X, TENS_END_X);
  const oX = riderPos(riders.ones,    10,  ONES_TICK_X0, ONES_TIP_X, ONES_END_X);

  function getSVGXY(clientX: number, clientY: number): [number, number] {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const r = svg.getBoundingClientRect();
    // Convert to viewBox coords, then undo the scale(0.9) translate(100,36) wrapper
    const vx = (clientX - r.left) * (SVG_W / r.width);
    const vy = (clientY - r.top)  * (SVG_H / r.height);
    return [vx / 0.9 - 100, vy / 0.9 - 80];
  }

  function onDown(clientX: number, clientY: number) {
    if (mode !== "balance" || answered) return;
    const [sx, sy] = getSVGXY(clientX, clientY);
    const [px, py] = invTransform(sx, sy, angleDeg);
    if (px < BEAM_X0 - 80 || px > BEAM_X1 + 80) return;
    const dT = Math.abs(py - TENS_CY);
    const dH = Math.abs(py - HUND_CY);
    const dO = Math.abs(py - ONES_CY);
    const minD = Math.min(dT, dH, dO);
    if (minD > 55) return;
    dragRef.current = dT === minD ? "tens" : dH === minD ? "hundreds" : "ones";
  }

  function onMove(clientX: number, clientY: number) {
    if (!dragRef.current || !onDrag) return;
    const [sx, sy] = getSVGXY(clientX, clientY);
    const [px]     = invTransform(sx, sy, angleDeg);
    const beam    = dragRef.current;
    const max     = beam === "hundreds" ? 500 : beam === "tens" ? 100 : 10;
    const step    = beam === "hundreds" ? 100 : beam === "tens" ? 10  : 0.1;
    const tickX0  = beam === "hundreds" ? HUND_TICK_X0 : beam === "tens" ? TENS_TICK_X0 : ONES_TICK_X0;
    const endX    = beam === "hundreds" ? HUND_END_X   : beam === "tens" ? TENS_END_X   : ONES_END_X;
    const usable  = endX - tickX0;
    const raw     = (px - tickX0) / usable * max;
    onDrag(beam, clamp(Math.round(raw / step) * step, 0, max));
  }

  // Indicator ball: moves vertically in panel, green when balanced
  const ballY = 365 + clamp(-imbalance * 0.06, -18, 18);

  return (
    <svg ref={svgRef}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%"
      style={{ display: "block",
        cursor: mode === "balance" && !answered ? "ew-resize" : "default" }}
      onMouseDown={e => { e.preventDefault(); onDown(e.clientX, e.clientY); }}
      onMouseMove={e => onMove(e.clientX, e.clientY)}
      onMouseUp={() => { dragRef.current = null; }}
      onMouseLeave={() => { dragRef.current = null; }}
      onTouchStart={e => onDown(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchEnd={() => { dragRef.current = null; }}
    >
      <defs>
        <linearGradient id="tb_b0" x1="-3" y1="309" x2="1421" y2="309" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D5D8DD"/><stop offset="0.5" stopColor="#BCC2CA"/><stop offset="1" stopColor="#D8DCE1"/>
        </linearGradient>
        <linearGradient id="tb_p0" x1="164.5" y1="124.5" x2="193.5" y2="124.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1F2630"/><stop offset="0.5" stopColor="#2D3642"/><stop offset="1" stopColor="#141A22"/>
        </linearGradient>
        <linearGradient id="tb_p1" x1="1.5" y1="36.5" x2="355.5" y2="36.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D5D8DD"/><stop offset="0.5" stopColor="#BCC2CA"/><stop offset="1" stopColor="#D8DCE1"/>
        </linearGradient>
        <linearGradient id="tb_p2" x1="423" y1="23" x2="1307" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2F0DD"/><stop offset="1" stopColor="#EBE8D0"/>
        </linearGradient>
        <linearGradient id="tb_p3" x1="387.5" y1="1.5" x2="423.5" y2="1.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1F2630"/><stop offset="0.5" stopColor="#2D3642"/><stop offset="1" stopColor="#141A22"/>
        </linearGradient>
        <linearGradient id="tb_p4" x1="423.5" y1="150.5" x2="1305.5" y2="150.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2F0DD"/><stop offset="1" stopColor="#EBE8D0"/>
        </linearGradient>
        <linearGradient id="tb_p5" x1="423" y1="275" x2="1307" y2="275" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2F0DD"/><stop offset="1" stopColor="#EBE8D0"/>
        </linearGradient>
        <linearGradient id="tb_rh" x1="1.5" y1="1.5" x2="172.5" y2="1.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3A8F88"/><stop offset="1" stopColor="#2F746E"/>
        </linearGradient>
        <linearGradient id="tb_rt" x1="1.5" y1="1.5" x2="117.5" y2="1.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3A8F88"/><stop offset="1" stopColor="#2F746E"/>
        </linearGradient>
        <linearGradient id="tb_ro" x1="1.5" y1="1.5" x2="97.9" y2="1.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3A8F88"/><stop offset="1" stopColor="#2F746E"/>
        </linearGradient>
      </defs>

      <rect width={SVG_W} height={SVG_H} fill="#e8e9eb" rx={6}/>

      {/* Scale entire assembly to 90% — translate brings left-clipped pan into view */}
      <g transform="scale(0.9) translate(100, 80)">

      {/* ── ROTATING PAN ASSEMBLY ── */}
      <g style={{ transition: "transform 200ms ease-out" }}
        transform={`rotate(${angleDeg}, ${PIVOT_X}, ${PIVOT_Y}) translate(${PAN_DX}, ${PAN_DY})`}>

        {/* Pan hanging column */}
        <path
          d="M185.5 124.5H172.5C168.082 124.5 164.5 127.565 164.5 131.347V212.653C164.5 216.435 168.082 219.5 172.5 219.5H185.5C189.918 219.5 193.5 216.435 193.5 212.653V131.347C193.5 127.565 189.918 124.5 185.5 124.5Z"
          fill="url(#tb_p0)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Pan dish rim */}
        <path
          d="M178.5 152.5C276.254 152.5 355.5 129.667 355.5 101.5V88H1.5V101.5C1.5 129.667 80.7456 152.5 178.5 152.5Z"
          fill="#343A43" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Pan dish face */}
        <path
          d="M178.5 138.5C276.254 138.5 355.5 115.667 355.5 87.5C355.5 59.3335 276.254 36.5 178.5 36.5C80.7456 36.5 1.5 59.3335 1.5 87.5C1.5 115.667 80.7456 138.5 178.5 138.5Z"
          fill="url(#tb_p1)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Weight object on pan */}
        {target.total > 0 && (() => {
          const cx = 178.5, panY = 87.5;
          const h  = Math.max(14, Math.min(55, 14 + (target.total / 610) * 41));
          const rw = 34, ry = 10;
          return (
            <g>
              <rect x={cx - rw} y={panY - h} width={rw * 2} height={h} fill="#6b7280" stroke="#374151" strokeWidth={1.5}/>
              <ellipse cx={cx} cy={panY - h} rx={rw} ry={ry} fill="#9ca3af" stroke="#374151" strokeWidth={1.5}/>
              <ellipse cx={cx} cy={panY}     rx={rw} ry={ry} fill="#4b5563" stroke="#374151" strokeWidth={1.5}/>
              <rect x={cx - 5} y={panY - h - 10} width={10} height={11} fill="#9ca3af" stroke="#374151" strokeWidth={1}/>
              <ellipse cx={cx} cy={panY - h - 10} rx={9} ry={5} fill="#b0b8c4" stroke="#374151" strokeWidth={1}/>
            </g>
          );
        })()}

        {/* Pointer housing (right) */}
        <path
          d="M1305.5 368.5H1341.5V216.5L1398.5 200.5V185.5V170.5L1341.5 152.5V13.5H1305.5V368.5Z"
          fill="#1F2630" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1={1398.5} y1={184.5} x2={1357.5} y2={184.5} stroke="#FF0909" strokeWidth="3"/>

        {/* Top beam — TENS (0–100 g, 10 g steps) */}
        <path
          d="M1304.81 23.6057H425.352C424.298 23.6057 423.443 24.4608 423.443 25.5155V84.7192C423.443 85.774 424.298 86.629 425.352 86.629H1304.81C1305.87 86.629 1306.72 85.774 1306.72 84.7192V25.5155C1306.72 24.4608 1305.87 23.6057 1304.81 23.6057Z"
          fill="url(#tb_p2)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <BeamTicks startX={TENS_TICK_X0} endX={TENS_END_X} topY={TENS_TOP} max={100} step={10} majorEvery={1} fs={18}/>

        {/* Support column */}
        <path
          d="M423.5 1.5H387.5V153.5H179V217.5H387.5V356.5H423.5V1.5Z"
          fill="url(#tb_p3)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Middle beam — HUNDREDS (0–500 g, 100 g steps) */}
        <path
          d="M1303.7 150.5H425.3C424.306 150.5 423.5 151.358 423.5 152.417V217.583C423.5 218.642 424.306 219.5 425.3 219.5H1303.7C1304.69 219.5 1305.5 218.642 1305.5 217.583V152.417C1305.5 151.358 1304.69 150.5 1303.7 150.5Z"
          fill="url(#tb_p4)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <BeamTicks startX={HUND_TICK_X0} endX={HUND_END_X} topY={HUND_TOP} max={500} step={100} majorEvery={1} fs={22}/>

        {/* Bottom beam — ONES (0–10 g, 0.1 g steps) */}
        <path
          d="M1304.81 275.699H425.352C424.298 275.699 423.443 276.554 423.443 277.609V336.812C423.443 337.867 424.298 338.722 425.352 338.722H1304.81C1305.87 338.722 1306.72 337.867 1306.72 336.812V277.609C1306.72 276.554 1305.87 275.699 1304.81 275.699Z"
          fill="url(#tb_p5)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <BeamTicks startX={ONES_TICK_X0} endX={ONES_END_X} topY={ONES_TOP} max={10} step={0.1} majorEvery={10} fs={16}/>

        {/* ── RIDERS ── */}
        {/* Hundreds rider — middle beam */}
        <g transform={`translate(${hX}, ${HUND_TOP - 34})`}>
          <path d="M158.955 1.5H15.0446C7.5641 1.5 1.5 4.90264 1.5 9.1V31.9C1.5 36.0974 7.5641 39.5 15.0446 39.5H158.955C166.436 39.5 172.5 36.0974 172.5 31.9V9.1C172.5 4.90264 166.436 1.5 158.955 1.5Z"
            fill="url(#tb_rh)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M67.5 10.5H104.741L86.4891 34L67.5 10.5Z"
            fill="#D8DCE1" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </g>

        {/* Tens rider — top beam */}
        <g transform={`translate(${tX}, ${TENS_TOP - 34})`}>
          <path d="M108.312 1.5H10.6881C5.61366 1.5 1.5 4.90264 1.5 9.1V31.9C1.5 36.0974 5.61366 39.5 10.6881 39.5H108.312C113.386 39.5 117.5 36.0974 117.5 31.9V9.1C117.5 4.90264 113.386 1.5 108.312 1.5Z"
            fill="url(#tb_rt)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M40.5 10.5H77.741L59.4891 34L40.5 10.5Z"
            fill="#D8DCE1" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </g>

        {/* Ones rider — bottom beam */}
        <g transform={`translate(${oX}, ${ONES_TOP - 34.7})`}>
          <path d="M90.3055 1.5H9.13919C4.92018 1.5 1.5 4.92018 1.5 9.13919V32.0567C1.5 36.2757 4.92018 39.6959 9.13919 39.6959H90.3055C94.5245 39.6959 97.9447 36.2757 97.9447 32.0567V9.13919C97.9447 4.92018 94.5245 1.5 90.3055 1.5Z"
            fill="url(#tb_ro)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M31.1018 11.2226H68.3429L50.0909 34.7226L31.1018 11.2226Z"
            fill="#D8DCE1" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </g>

      </g>

      {/* ── STATIC BASE (shifted down by BASE_DY) — rendered last so it sits in front ── */}
      <g transform={`translate(0, ${BASE_DY})`}>
        <path
          d="M1419 402.213V444.229V460.462C1419 472.876 1408.99 480.515 1394.96 480.515H61.8833C38.8473 480.515 16.8129 463.327 11.8051 441.364L2.29018 353.991C-4.21997 325.344 31.3356 309.588 45.3575 309.588L206.609 309.588V57.1775H267.502V309.588L1323.5 309.588V2.17753C1323.5 2.17753 1366 -4.82246 1390.5 26.1775C1415 57.1775 1419 309.588 1419 309.588V402.213Z"
          fill="url(#tb_b0)" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Indicator panel */}
        <path
          d="M243.045 343.009H93.1261C91.0165 343.009 89.3065 344.719 89.3065 346.829V383.115C89.3065 385.225 91.0165 386.935 93.1261 386.935H243.045C245.155 386.935 246.865 385.225 246.865 383.115V346.829C246.865 344.719 245.155 343.009 243.045 343.009Z"
          fill="#F6F3E2" stroke="#343A43" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1={170.473} y1={377.386} x2={170.473} y2={352.558} stroke="#343A43" strokeWidth="2" strokeLinecap="round"/>
        <line x1={203.894} y1={377.386} x2={203.894} y2={352.558} stroke="#343A43" strokeWidth="2" strokeLinecap="round"/>
        <line x1={233.894} y1={377.386} x2={233.894} y2={352.558} stroke="#343A43" strokeWidth="2" strokeLinecap="round"/>
        <line x1={137.051} y1={377.386} x2={137.051} y2={352.558} stroke="#343A43" strokeWidth="2" strokeLinecap="round"/>
        <line x1={103.63}  y1={377.386} x2={103.63}  y2={352.558} stroke="#343A43" strokeWidth="2" strokeLinecap="round"/>
        {/* Moving indicator ball */}
        <circle cx={170.473} cy={ballY} r={10}
          fill={isBalanced ? "#16a34a" : "#D92D2D"}
          stroke="#343A43" strokeWidth="3"/>

        {/* Base reference line (right pointer housing) */}
        <line x1={1365.5} y1={75.1775} x2={1324.5} y2={75.1775} stroke="#FF0909" strokeWidth="3"/>
        {/* Pivot circle */}
        <circle cx={237.502} cy={84.1775} r={10} fill="black"/>
      </g>

      </g>{/* end scale wrapper */}
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TripleBeamPage() {
  const { user } = useUser();
  const [gameMode,  setGameMode]  = useState<GameMode>("read");
  const [target,    setTarget]    = useState<Target>({ hundreds: 0, tens: 0, ones: 0, total: 0, label: "0.0 g" });
  const [userRiders, setUserRiders] = useState<Riders>({ hundreds: 0, tens: 0, ones: 0 });
  const [input,     setInput]     = useState("");
  const [answered,  setAnswered]  = useState(false);
  const [correct,   setCorrect]   = useState(false);
  const [score,     setScore]     = useState(0);
  const [strikes,   setStrikes]   = useState(0);
  const [gameOver,  setGameOver]  = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const riderSum = Math.round((userRiders.hundreds + userRiders.tens + userRiders.ones) * 10) / 10;

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }

  function submitAnswer(isCorrect: boolean) {
    if (answered || gameOver) return;
    setAnswered(true);
    setCorrect(isCorrect);
    if (isCorrect) {
      const ns = score + 1;
      setScore(ns);
      if (user) upsertToolHighScore(user.id, "meas-triple-beam", 0, gameMode === "read" ? 0 : 1, ns);
      timerRef.current = setTimeout(nextQuestion, 1400);
    } else {
      const ns = strikes + 1;
      setStrikes(ns);
      if (ns >= 3) timerRef.current = setTimeout(() => setGameOver(true), 1800);
      else         timerRef.current = setTimeout(nextQuestion, 1800);
    }
  }

  function handleSubmit() {
    if (answered || gameOver) return;
    const val = parseFloat(input);
    if (isNaN(val)) return;
    const tolerance = gameMode === "balance" ? 1.5 : 0.05;
    submitAnswer(Math.abs(val - target.total) <= tolerance);
  }

  function nextQuestion() {
    clearTimer();
    const t = newTarget();
    setTarget(t);
    setUserRiders({ hundreds: 0, tens: 0, ones: 0 });
    setInput("");
    setAnswered(false);
    setCorrect(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function startFresh(gm: GameMode = gameMode) {
    clearTimer();
    setGameMode(gm);
    setTarget(newTarget());
    setUserRiders({ hundreds: 0, tens: 0, ones: 0 });
    setInput("");
    setAnswered(false);
    setCorrect(false);
    setScore(0);
    setStrikes(0);
    setGameOver(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleDrag(beam: keyof Riders, val: number) {
    setUserRiders(r => ({ ...r, [beam]: val }));
  }

  // In read mode, display target riders (beam level); in balance mode, display user riders
  const displayRiders = gameMode === "read" ? target : userRiders;

  const zoomRiderSum  = Math.round((displayRiders.hundreds + displayRiders.tens + displayRiders.ones) * 10) / 10;
  const zoomImbalance = target.total - zoomRiderSum;
  const zoomAngle     = (gameMode === "read" || answered) ? 0
    : clamp(-zoomImbalance * 0.02, -MAX_ANGLE, MAX_ANGLE);

  const NAV_BTN: React.CSSProperties = {
    padding: "7px 16px", borderRadius: 10, border: "2px solid",
    fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all 120ms",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <SiteHeader>
        <Link href="/tools/measurement-lab"
          style={{ border: "1px solid #fff", color: "#fff", padding: "8px 14px",
            borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          ← Measurement Lab
        </Link>
      </SiteHeader>

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

          {/* Header */}
          <div style={{ ...CARD, padding: "14px 20px", marginBottom: 16,
            display: "flex", gap: 20, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0 }}>⚖️ Triple Beam Balance</h1>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                textTransform: "uppercase", letterSpacing: "0.5px" }}>Mode</span>
              {(["read", "balance"] as GameMode[]).map(gm => (
                <button key={gm} onClick={() => startFresh(gm)}
                  style={{ ...NAV_BTN,
                    borderColor: gameMode === gm ? "#d97706" : "#e0e0e0",
                    background:  gameMode === gm ? "#fffbeb" : "#f9f9f9",
                    color:       gameMode === gm ? "#d97706" : "#666",
                  }}>
                  {gm === "read" ? "Read the Balance" : "Balance It"}
                </button>
              ))}
            </div>
          </div>

          {gameOver ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 14 }}>💥</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>Game Over!</h2>
              <p style={{ fontSize: 18, color: "#333", marginBottom: 4 }}>
                Final score: <strong style={{ color: "#d97706" }}>{score}</strong>
              </p>
              <p style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 32 }}>
                {score === 0 ? "Keep practicing!" : score < 5 ? "Good start!" : score < 10 ? "Precise work!" : "Mass master!"}
              </p>
              <button onClick={() => startFresh()}
                style={{ padding: "14px 40px", background: "#d97706", color: "#fff",
                  border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                Play Again
              </button>
            </div>
          ) : (
            <div style={{ ...CARD, padding: "24px 24px 20px" }}>

              {/* Prompt */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                {target.total === 0 && score === 0 && strikes === 0 ? (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#888" }}>
                    Choose a mode above to begin
                  </div>
                ) : gameMode === "read" ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                      What is the total mass?
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#aaa" }}>
                      Read all three beams and add the rider positions together
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                      Balance the scale to find the mass of the object
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#aaa" }}>
                      Drag the riders until the indicator turns green, then type your reading below
                    </div>
                  </>
                )}
              </div>

              {/* Balance SVG */}
              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <TripleBeamSVG
                  riders={displayRiders}
                  target={target}
                  mode={gameMode}
                  answered={answered}
                  onDrag={handleDrag}
                />
              </div>

              {/* Answer input — both modes */}
              {target.total > 0 && (
                <div style={{ display: "flex", gap: 16, justifyContent: "center",
                  alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input ref={inputRef}
                      type="number" step={0.1}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSubmit()}
                      disabled={answered}
                      placeholder="e.g. 237.5"
                      style={{ fontSize: 22, fontWeight: 800, width: 160, padding: "10px 14px",
                        border: answered ? `2px solid ${correct ? "#16a34a" : "#dc2626"}` : "2px solid #d1d5db",
                        borderRadius: 10, outline: "none", textAlign: "center",
                        color: "#111", background: "#fff" }}
                      autoFocus
                    />
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>g</span>
                    {!answered && (
                      <button onClick={handleSubmit}
                        style={{ padding: "10px 24px", background: "#d97706", color: "#fff",
                          border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                        Check
                      </button>
                    )}
                  </div>
                  <ZoomScope angleDeg={zoomAngle} />
                </div>
              )}

              {/* Feedback */}
              <div style={{ textAlign: "center", minHeight: 28, marginBottom: 16 }}>
                {answered && correct && (
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#16a34a" }}>
                    ✓ Correct!
                  </span>
                )}
                {answered && !correct && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>
                    ✗ Not quite — try again next round
                  </span>
                )}
              </div>

              {/* Score bar */}
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: 14,
                display: "flex", gap: 32, alignItems: "center", justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                    textTransform: "uppercase", letterSpacing: "0.5px" }}>Score</span>
                  <span style={{ fontSize: 32, fontWeight: 900, color: "#111", lineHeight: 1 }}>{score}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                    textTransform: "uppercase", letterSpacing: "0.5px" }}>Strikes</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: i < strikes ? "#dc2626" : "#e5e7eb",
                        border: `2px solid ${i < strikes ? "#b91c1c" : "#d1d5db"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: i < strikes ? "#fff" : "transparent", fontWeight: 900,
                      }}>✕</div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
