"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

// ── Geometry (fixed section.svg viewBox: 0 0 1108 425) ───────────────────────
const SVG_W       = 1108;
const SVG_H       = 425;
const INCH_PX     = 166;       // 998px beam / ~6 inches
const BEAM_ZERO_X = 108;       // x of 0" (fixed jaw measuring face meets beam)
const SLIDER_REF  = 78;        // slider index: left edge of slider body
const SLIDER_ZERO = BEAM_ZERO_X - SLIDER_REF; // = 30px translate at value=0"
const MAX_VALUE   = 4.0;
const MM_PX       = INCH_PX / 25.4; // px per mm ≈ 6.535

// Dial center in slider-assembly.svg coordinate space
const DIAL_CX = 223.708;
const DIAL_CY = 203.007;
const DIAL_R  = 109.66;        // dial face radius

type GameMode = "read" | "set";
type Unit = "in" | "mm";
interface Target { value: number; label: string; }

// Snap a value in inches to the nearest 0.01 mm
function snapMM(v: number) { return Math.round(v * 25.4 * 100) / 100 / 25.4; }

function newTarget(unit: Unit): Target {
  if (unit === "mm") {
    // whole mm 5–95 + 0–99 centimillimetres → 0.01 mm precision, stored as raw float inches
    const wholeMM = Math.floor(Math.random() * 91) + 5;
    const centMM  = Math.floor(Math.random() * 100); // 0.01 mm steps
    const mm      = wholeMM + centMM * 0.01;
    const value   = mm / 25.4; // raw float — no inch rounding
    return { value, label: `${mm.toFixed(2)} mm` };
  }
  const whole    = Math.floor(Math.random() * 4);
  const tenths   = Math.floor(Math.random() * 10);
  const dialTick = Math.floor(Math.random() * 100);
  const value    = Math.min(
    Math.round((whole + tenths * 0.1 + dialTick * 0.001) * 1000) / 1000,
    MAX_VALUE
  );
  return { value, label: value.toFixed(3) + '"' };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function snapTo(v: number, step: number) { return Math.round(v / step) * step; }

// ── Dial face: 100 ticks + labels 0 10 20 … 90 ───────────────────────────────
function DialFace() {
  const nodes: React.ReactNode[] = [];
  const outerR = DIAL_R - 2;
  for (let i = 0; i < 100; i++) {
    const ang  = (i / 100) * 360 - 90;
    const rad  = (ang * Math.PI) / 180;
    const is10 = i % 10 === 0;
    const is5  = i % 5  === 0;
    const len  = is10 ? 13 : is5 ? 8 : 4;
    const r0   = outerR - len;
    const cos  = Math.cos(rad);
    const sin  = Math.sin(rad);
    nodes.push(
      <line key={i}
        x1={DIAL_CX + r0 * cos}    y1={DIAL_CY + r0 * sin}
        x2={DIAL_CX + outerR * cos} y2={DIAL_CY + outerR * sin}
        stroke="#3f4752"
        strokeWidth={is10 ? 2.2 : is5 ? 1.8 : 1}
        strokeLinecap="round"/>
    );
    if (is10) {
      const lr = DIAL_R - 27;
      nodes.push(
        <text key={`l${i}`}
          x={DIAL_CX + lr * cos} y={DIAL_CY + lr * sin}
          textAnchor="middle" dominantBaseline="central"
          fontSize={11} fill="#3f4752"
          fontFamily="Arial, Helvetica, sans-serif">
          {i}
        </text>
      );
    }
  }
  return <>{nodes}</>;
}

// ── Caliper SVG ───────────────────────────────────────────────────────────────
function CaliperSVG({ value, answered, correct, interactive, onDrag, unit }: {
  value: number;
  answered: boolean;
  correct: boolean;
  interactive?: boolean;
  onDrag?: (v: number) => void;
  unit: Unit;
}) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startVal: number } | null>(null);

  const sliderTranslate = SLIDER_ZERO + value * INCH_PX;

  // mm mode: 1 rotation = 1 mm, 100 ticks × 0.01 mm (real metric dial caliper)
  // inch mode: 1 rotation = 0.1", 100 ticks × 0.001"
  const dialTick = unit === "mm"
    ? Math.round(((value * 25.4) % 1) * 100) % 100
    : Math.round((value % 0.1) / 0.001) % 100;
  const needleAngle = dialTick * 3.6; // degrees CW from 12 o'clock
  const needleLen   = DIAL_R - 8;

  const beamReading = Math.floor(value * 10) / 10;
  const dialReading = dialTick * 0.001;

  function getSVGX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return 0;
    const r = svg.getBoundingClientRect();
    return (clientX - r.left) * (SVG_W / r.width);
  }
  function startDrag(clientX: number) {
    if (!interactive || answered) return;
    dragRef.current = { startX: clientX, startVal: value };
  }
  function moveDrag(clientX: number) {
    if (!dragRef.current || !onDrag) return;
    const dx  = (getSVGX(clientX) - getSVGX(dragRef.current.startX)) / INCH_PX;
    const raw = clamp(dragRef.current.startVal + dx, 0, MAX_VALUE);
    onDrag(unit === "mm" ? snapMM(raw) : snapTo(raw, 0.001));
  }
  function endDrag() { dragRef.current = null; }

  return (
    <svg ref={svgRef}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W} height={SVG_H}
      style={{ display: "block", maxWidth: "100%",
        cursor: interactive && !answered ? "ew-resize" : "default" }}
      onMouseDown={e => { e.preventDefault(); startDrag(e.clientX); }}
      onMouseMove={e => moveDrag(e.clientX)}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onTouchStart={e => startDrag(e.touches[0].clientX)}
      onTouchMove={e => { e.preventDefault(); moveDrag(e.touches[0].clientX); }}
      onTouchEnd={endDrag}
    >
      <defs>
        {/* Slider gradients — prefixed sl_ to avoid ID collisions */}
        <linearGradient id="sl_g0" x1="2" y1="1.16144" x2="37.1633" y2="1.16144" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8DCE2"/><stop offset="0.55" stopColor="#CFD4DB"/><stop offset="1" stopColor="#D5D9DF"/>
        </linearGradient>
        <linearGradient id="sl_g1" x1="78.2865" y1="109.437" x2="418" y2="109.437" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8DCE2"/><stop offset="0.55" stopColor="#CFD4DB"/><stop offset="1" stopColor="#D5D9DF"/>
        </linearGradient>
        <linearGradient id="sl_g2" x1="69" y1="221.161" x2="150" y2="221.161" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8DCE2"/><stop offset="0.55" stopColor="#CFD4DB"/><stop offset="1" stopColor="#D5D9DF"/>
        </linearGradient>
        <linearGradient id="sl_g3" x1="110.47" y1="89.7691" x2="336.946" y2="316.245" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F3ECD7"/><stop offset="1" stopColor="#EBE4CE"/>
        </linearGradient>
        <linearGradient id="sl_g4" x1="114.046" y1="93.345" x2="333.37" y2="312.669" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F3ECD7"/><stop offset="1" stopColor="#EBE4CE"/>
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width={SVG_W} height={SVG_H} fill="#f8f9fa" rx={6}/>

      {/* ── FIXED BASE (fixed section.svg) ── */}
      <path
        d="M94 284.992V420.992L56 394.992L2 243.992V119.992H71V88.9921V2.99207C94.2 12.5921 108 41.9921 108 80.9921V138.992H1106V219.992H89V278.992L94 284.992Z"
        fill="#CFD4DB" stroke="#4D5563" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>
      <path d="M74 50.9921H93.4133V107.845H74V50.9921Z" fill="#8D97A3" opacity={0.45}/>

      {/* ── MM SCALE — ticks DOWN from top edge (y=139) into beam ── */}
      <g>
        {Array.from({ length: 101 }, (_, mm) => {
          const x    = BEAM_ZERO_X + mm * MM_PX;
          if (x > 1100) return null;
          const is10 = mm % 10 === 0;
          const is5  = mm % 5  === 0;
          const h    = is10 ? 16 : is5 ? 10 : 5;
          return (
            <line key={mm} x1={x} y1={139} x2={x} y2={139 + h}
              stroke="#4d5563"
              strokeWidth={is10 ? 2 : is5 ? 1.4 : 0.8}
              strokeLinecap="round"/>
          );
        })}
        {/* 10mm labels below the ticks */}
        {[0,10,20,30,40,50,60,70,80,90,100].map(mm => {
          const x = BEAM_ZERO_X + mm * MM_PX;
          if (x > 1100) return null;
          return (
            <text key={mm} x={x} y={165}
              textAnchor="middle" fontSize={11} fontWeight="700" fill="#36414d"
              fontFamily="Arial, Helvetica, sans-serif">{mm}</text>
          );
        })}
        <text x={92} y={165} textAnchor="end" fontSize={11} fontWeight="700" fill="#44515f"
          fontFamily="Arial, Helvetica, sans-serif">mm</text>
      </g>

      {/* ── INCH SCALE — ticks UP from bottom edge (y=220) into beam ── */}
      <g>
        {Array.from({ length: 41 }, (_, i) => {
          const x      = BEAM_ZERO_X + i * (INCH_PX / 10);
          if (x > 1100) return null;
          const isInch = i % 10 === 0;
          const h      = isInch ? 30 : 15;
          return (
            <line key={i} x1={x} y1={220} x2={x} y2={220 - h}
              stroke="#4d5563"
              strokeWidth={isInch ? 2.2 : 1}
              strokeLinecap="round"/>
          );
        })}
        {/* Labels left-aligned to each tick */}
        {Array.from({ length: 41 }, (_, i) => {
          const x      = BEAM_ZERO_X + i * (INCH_PX / 10);
          if (x > 1100) return null;
          const isInch = i % 10 === 0;
          const tenth  = i % 10;
          const label  = isInch ? String(i / 10) : String(tenth);
          return (
            <text key={i} x={x - 2} y={213}
              textAnchor="end"
              fontSize={isInch ? 14 : 9}
              fontWeight={isInch ? "900" : "400"}
              fill={isInch ? "#36414d" : "#52606d"}
              fontFamily="Arial, Helvetica, sans-serif">
              {label}
            </text>
          );
        })}
        <text x={92} y={213} textAnchor="end" fontSize={11} fontWeight="700" fill="#44515f"
          fontFamily="Arial, Helvetica, sans-serif">in</text>
      </g>

      {/* ── DYNAMIC SLIDER (slider-assembly.svg, translated) ── */}
      <g transform={`translate(${sliderTranslate} 0)`}>

        {/* Upper inside jaw */}
        <path
          d="M2 64.9481C2 13.6414 22.8 6.82144 37.1633 2.66144V112.611H79.6533V132.895H2V64.9481Z"
          fill="url(#sl_g0)" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Main slider body */}
        <path
          d="M78.2865 109.437H409.656C414.424 109.437 418 113.013 418 117.78V260.818C418 265.586 414.424 269.162 409.656 269.162H313.702C290.458 269.162 270.791 285.253 263.043 307.305H192.12C195.1 287.637 188.544 269.162 174.241 269.162H86.0344C81.2665 269.162 78.2865 265.586 78.2865 260.818V109.437Z"
          fill="url(#sl_g1)" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Lower outside jaw */}
        <path
          d="M69 283.439L75.5036 276.428V221.161H150V224.146C150 236.085 146.453 247.426 141.723 261.753L102.5 397.661L69 421.661V283.439Z"
          fill="url(#sl_g2)" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Dial outer ring */}
        <path
          d="M223.708 324.589C290.855 324.589 345.289 270.155 345.289 203.007C345.289 135.859 290.855 81.4252 223.708 81.4252C156.56 81.4252 102.126 135.859 102.126 203.007C102.126 270.155 156.56 324.589 223.708 324.589Z"
          fill="#AFB6C1" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Dial inner ring */}
        <path
          d="M223.708 316.245C286.247 316.245 336.946 265.546 336.946 203.007C336.946 140.467 286.247 89.7691 223.708 89.7691C161.168 89.7691 110.47 140.467 110.47 203.007C110.47 265.546 161.168 316.245 223.708 316.245Z"
          fill="url(#sl_g3)" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Dial face */}
        <path
          d="M223.708 312.669C284.272 312.669 333.37 263.571 333.37 203.007C333.37 142.442 284.272 93.345 223.708 93.345C163.143 93.345 114.046 142.442 114.046 203.007C114.046 263.571 163.143 312.669 223.708 312.669Z"
          fill="url(#sl_g4)" opacity={0.98}/>

        {/* Dial ticks + numbers */}
        <DialFace/>

        {/* Needle */}
        <line
          x1={DIAL_CX} y1={DIAL_CY}
          x2={DIAL_CX} y2={DIAL_CY - needleLen}
          stroke="#c92d39" strokeWidth="2" strokeLinecap="round"
          transform={`rotate(${needleAngle}, ${DIAL_CX}, ${DIAL_CY})`}/>

        {/* Needle hub */}
        <path
          d="M223.708 210.159C227.658 210.159 230.86 206.957 230.86 203.007C230.86 199.057 227.658 195.855 223.708 195.855C219.758 195.855 216.556 199.057 216.556 203.007C216.556 206.957 219.758 210.159 223.708 210.159Z"
          fill="#4F5661"/>

        {/* Top knob */}
        <path
          d="M379.024 95.9156H338.497C335.864 95.9156 333.729 98.0503 333.729 100.684V101.876C333.729 104.509 335.864 106.643 338.497 106.643H379.024C381.658 106.643 383.792 104.509 383.792 101.876V100.684C383.792 98.0503 381.658 95.9156 379.024 95.9156Z"
          fill="#66707D" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <path
          d="M379.62 73.2681H337.901C331.976 73.2681 327.173 78.0711 327.173 83.9959V88.7638C327.173 94.6886 331.976 99.4916 337.901 99.4916H379.62C385.545 99.4916 390.348 94.6886 390.348 88.7638V83.9959C390.348 78.0711 385.545 73.2681 379.62 73.2681Z"
          fill="#4F5661" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <g opacity={0.55}>
          {[334.921,340.881,346.841,352.801,358.761,364.721,370.68,376.64,382.6].map((x, i) => (
            <line key={i} x1={x} y1={76.8441} x2={x} y2={98.8956}
              stroke="#3F4752" strokeWidth="3" strokeLinecap="round"/>
          ))}
        </g>

        {/* Bottom wheel */}
        <path
          d="M243.326 324.255H203.99C201.357 324.255 199.223 326.389 199.223 329.023V331.407C199.223 334.04 201.357 336.174 203.99 336.174H243.326C245.959 336.174 248.094 334.04 248.094 331.407V329.023C248.094 326.389 245.959 324.255 243.326 324.255Z"
          fill="#66707D" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <path
          d="M245.114 335.578H202.202C196.936 335.578 192.667 339.848 192.667 345.114V355.842C192.667 361.109 196.936 365.378 202.202 365.378H245.114C250.38 365.378 254.649 361.109 254.649 355.842V345.114C254.649 339.848 250.38 335.578 245.114 335.578Z"
          fill="#4F5661" stroke="#4D5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        <g opacity={0.55}>
          {[201.011,206.97,212.93,218.89,224.85,230.81,236.77,242.73,248.69].map((x, i) => (
            <line key={i} x1={x} y1={337.962} x2={x} y2={362.994}
              stroke="#3F4752" strokeWidth="3" strokeLinecap="round"/>
          ))}
        </g>

        {/* Inside jaw shadow */}
        <path d="M16.56 52.4681H35.9733V109.321H16.56V52.4681Z" fill="#8D97A3" opacity={0.45}/>
      </g>

      {/* ── READING CALLOUT (fixed position, outside slider group) ── */}
      {answered && (
        <g>
          <rect x={8} y={8} width={200} height={60} rx={6}
            fill={correct ? "#f0fdf4" : "#fef2f2"}
            stroke={correct ? "#16a34a" : "#dc2626"} strokeWidth={1.5}/>
          {unit === "in" ? (
            <>
              <text x={18} y={29} fontSize={11} fontWeight="800" fill="#888" fontFamily="system-ui">BEAM</text>
              <text x={18} y={52} fontSize={14} fontWeight="900" fill="#111"
                fontFamily="'Courier New', monospace">{beamReading.toFixed(1)}&quot;</text>
              <text x={108} y={29} fontSize={11} fontWeight="800" fill="#888" fontFamily="system-ui">DIAL</text>
              <text x={108} y={52} fontSize={14} fontWeight="900" fill="#111"
                fontFamily="'Courier New', monospace">+{dialReading.toFixed(3)}&quot;</text>
            </>
          ) : (
            <>
              <text x={18} y={29} fontSize={11} fontWeight="800" fill="#888" fontFamily="system-ui">READING</text>
              <text x={18} y={52} fontSize={14} fontWeight="900" fill="#111"
                fontFamily="'Courier New', monospace">{(Math.round(value * 25.4 * 100) / 100).toFixed(2)} mm</text>
            </>
          )}
        </g>
      )}

    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DialCaliperPage() {
  const { user } = useUser();
  const [gameMode,  setGameMode]  = useState<GameMode>("read");
  const [unit,      setUnit]      = useState<Unit>("in");
  const [target,    setTarget]    = useState<Target>({ value: 0, label: '0.000"' });
  const [userValue, setUserValue] = useState(0);
  const [input,     setInput]     = useState("");
  const [answered,  setAnswered]  = useState(false);
  const [correct,   setCorrect]   = useState(false);
  const [score,     setScore]     = useState(0);
  const [strikes,   setStrikes]   = useState(0);
  const [gameOver,  setGameOver]  = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTarget(newTarget(unit)); }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }

  function nextQuestion(gm: GameMode, u: Unit = unit) {
    setTarget(newTarget(u));
    setUserValue(0);
    setInput("");
    setAnswered(false);
    setCorrect(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function startFresh(gm: GameMode = gameMode, u: Unit = unit) {
    clearTimer();
    setGameMode(gm);
    setUnit(u);
    setTarget(newTarget(u));
    setUserValue(0);
    setInput("");
    setAnswered(false);
    setCorrect(false);
    setScore(0);
    setStrikes(0);
    setGameOver(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSubmit() {
    if (answered || gameOver) return;
    let isCorrect = false;
    if (gameMode === "read") {
      const val = parseFloat(input);
      if (isNaN(val)) return;
      // compare in inches; for mm input convert first, tolerance ±0.5 mm
      const valIn = unit === "mm" ? val / 25.4 : val;
      const tol   = unit === "mm" ? 0.01 / 25.4 : 0.0005;
      isCorrect = Math.abs(valIn - target.value) <= tol;
    } else {
      isCorrect = Math.abs(userValue - target.value) <= (unit === "mm" ? 0.01 / 25.4 : 0.0005);
    }
    setAnswered(true);
    setCorrect(isCorrect);
    if (isCorrect) {
      const ns = score + 1;
      setScore(ns);
      if (user) upsertToolHighScore(user.id, "meas-dial-caliper", unit === "mm" ? 1 : 0, gameMode === "read" ? 0 : 1, ns);
      timerRef.current = setTimeout(() => nextQuestion(gameMode, unit), 1400);
    } else {
      const ns = strikes + 1;
      setStrikes(ns);
      if (ns >= 3) timerRef.current = setTimeout(() => setGameOver(true), 1800);
      else         timerRef.current = setTimeout(() => nextQuestion(gameMode, unit), 1800);
    }
  }

  const handleDrag = useCallback((v: number) => setUserValue(v), []);
  const displayValue = gameMode === "read" ? target.value : (answered ? target.value : userValue);

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

          {/* Header + mode toggle */}
          <div style={{ ...CARD, padding: "14px 20px", marginBottom: 16,
            display: "flex", gap: 20, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0 }}>
              🔩 Dial Caliper
            </h1>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                  textTransform: "uppercase", letterSpacing: "0.5px" }}>Mode</span>
                {(["read", "set"] as GameMode[]).map(gm => (
                  <button key={gm} onClick={() => startFresh(gm, unit)}
                    style={{ ...NAV_BTN,
                      borderColor: gameMode === gm ? "#d97706" : "#e0e0e0",
                      background:  gameMode === gm ? "#fffbeb" : "#f9f9f9",
                      color:       gameMode === gm ? "#d97706" : "#666",
                    }}>
                    {gm === "read" ? "Read the Caliper" : "Set the Caliper"}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                  textTransform: "uppercase", letterSpacing: "0.5px" }}>Unit</span>
                {(["in", "mm"] as Unit[]).map(u => (
                  <button key={u} onClick={() => startFresh(gameMode, u)}
                    style={{ ...NAV_BTN,
                      borderColor: unit === u ? "#2563eb" : "#e0e0e0",
                      background:  unit === u ? "#eff6ff" : "#f9f9f9",
                      color:       unit === u ? "#2563eb" : "#666",
                    }}>
                    {u === "in" ? "Inches" : "Millimeters"}
                  </button>
                ))}
              </div>
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
                {score === 0 ? "Keep practicing!" : score < 5 ? "Good start!" : score < 10 ? "Precise work!" : "Machinist level!"}
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
                {gameMode === "read" ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                      What is the measurement?
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#aaa" }}>
                      {unit === "in"
                        ? "Read the beam for inches + tenths, then add the dial for thousandths"
                        : "Read the mm scale on the beam and enter the measurement in millimeters"}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                      Set the caliper to:
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: "#d97706",
                      fontFamily: "'Courier New', monospace", letterSpacing: 2 }}>
                      {target.label}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#aaa", marginTop: 4 }}>
                      Drag the caliper jaws to match the measurement
                    </div>
                  </>
                )}
              </div>

              {/* Caliper */}
              <div style={{ overflowX: "auto", marginBottom: 4 }}>
                <CaliperSVG
                  value={displayValue}
                  answered={answered}
                  correct={correct}
                  interactive={gameMode === "set"}
                  onDrag={handleDrag}
                  unit={unit}
                />
              </div>
              {/* Drag hint below caliper */}
              {gameMode === "set" && !answered && (
                <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700,
                  color: "#bbb", marginBottom: 12 }}>
                  ← drag to set the measurement →
                </div>
              )}

              {/* Set mode controls */}
              {gameMode === "set" && !answered && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  {/* Increment buttons */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {unit === "mm" ? (
                      // mm mode: ±0.01mm and ±0.1mm, snapped in mm space
                      ([-0.1, -0.01, 0.01, 0.1] as const).map(stepMM => (
                        <button key={stepMM}
                          onClick={() => setUserValue(v => {
                            const curMM  = Math.round(v * 25.4 * 100) / 100;
                            const newMM  = Math.round((curMM + stepMM) * 100) / 100;
                            return clamp(newMM / 25.4, 0, MAX_VALUE);
                          })}
                          style={{
                            padding: "8px 14px", borderRadius: 8,
                            border: "2px solid #d1d5db", background: "#f9fafb",
                            fontWeight: 800, fontSize: 13, cursor: "pointer",
                            color: stepMM < 0 ? "#dc2626" : "#16a34a",
                            fontFamily: "'Courier New', monospace",
                          }}>
                          {stepMM > 0 ? `+${stepMM.toFixed(2)} mm` : `${stepMM.toFixed(2)} mm`}
                        </button>
                      ))
                    ) : (
                      // inch mode: ±0.001" and ±0.010"
                      ([-0.01, -0.001, 0.001, 0.01] as const).map(step => (
                        <button key={step}
                          onClick={() => setUserValue(v => snapTo(clamp(v + step, 0, MAX_VALUE), 0.001))}
                          style={{
                            padding: "8px 14px", borderRadius: 8,
                            border: "2px solid #d1d5db", background: "#f9fafb",
                            fontWeight: 800, fontSize: 13, cursor: "pointer",
                            color: step < 0 ? "#dc2626" : "#16a34a",
                            fontFamily: "'Courier New', monospace",
                          }}>
                          {step > 0 ? `+${step.toFixed(3)}"` : `${step.toFixed(3)}"`}
                        </button>
                      ))
                    )}
                  </div>
                  {/* Check button only — no live value display */}
                  <button onClick={handleSubmit}
                    style={{ padding: "10px 28px", background: "#d97706", color: "#fff",
                      border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                    Check
                  </button>
                </div>
              )}

              {/* Read mode input */}
              {gameMode === "read" && (
                <div style={{ display: "flex", gap: 10, justifyContent: "center",
                  alignItems: "center", marginBottom: 16 }}>
                  <input ref={inputRef}
                    type="number" step={unit === "mm" ? 0.1 : 0.001}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    disabled={answered}
                    placeholder={unit === "mm" ? "e.g. 47.53" : "e.g. 1.347"}
                    style={{ fontSize: 22, fontWeight: 800, width: 160, padding: "10px 14px",
                      border: answered ? `2px solid ${correct ? "#16a34a" : "#dc2626"}` : "2px solid #d1d5db",
                      borderRadius: 10, outline: "none", textAlign: "center",
                      color: "#111", background: "#fff" }}
                    autoFocus
                  />
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>
                    {unit === "mm" ? "mm" : '"'}
                  </span>
                  {!answered && (
                    <button onClick={handleSubmit}
                      style={{ padding: "10px 24px", background: "#d97706", color: "#fff",
                        border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                      Check
                    </button>
                  )}
                </div>
              )}

              {/* Feedback */}
              <div style={{ textAlign: "center", minHeight: 28, marginBottom: 16 }}>
                {answered && correct && (
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#16a34a" }}>
                    ✓ Correct! {target.label}
                  </span>
                )}
                {answered && !correct && gameMode === "read" && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>
                    ✗ The answer was <strong style={{ fontFamily: "monospace" }}>{target.label}</strong>
                  </span>
                )}
                {answered && !correct && gameMode === "set" && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>
                    ✗ Target was {target.label} — you set{" "}
                    {unit === "mm"
                      ? (Math.round(userValue * 25.4 * 100) / 100).toFixed(2) + " mm"
                      : userValue.toFixed(3) + '"'}
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
