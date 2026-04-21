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

// ─── Cylinder geometry ────────────────────────────────────────────────────────

// Interior (liquid-contact surface)
const CYL_CX   = 75;           // horizontal center
const INNER_R  = 33;           // inner half-width
const LI       = CYL_CX - INNER_R;   // 42 — left inner wall
const RI       = CYL_CX + INNER_R;   // 108 — right inner wall
const WALL_T   = 5;            // glass wall thickness
const LO       = LI - WALL_T; // 37 — left outer wall
const RO       = RI + WALL_T; // 113 — right outer wall

const CYL_TOP  = 52;           // y of top opening
const CYL_BOT  = 315;          // y of bottom of cylinder body
const CYL_H    = CYL_BOT - CYL_TOP; // 263

// Scale area — ticks and liquid only span this inner range, leaving
// breathing room below the rim and above the base cap
const SCALE_TOP = CYL_TOP + 30;  // 82  — top of graduation marks
const SCALE_BOT = CYL_BOT - 15;  // 300 — bottom of graduation marks
const SCALE_H   = SCALE_BOT - SCALE_TOP; // 218

// Base foot geometry
const BASE_RX  = 50;           // base half-width
const BASE_LO  = CYL_CX - BASE_RX;   // 25
const BASE_RO  = CYL_CX + BASE_RX;   // 125
const SHO_Y    = 323;          // y where shoulder/base begins
const BASE_BOT = 356;          // y of base bottom
const BASE_ERY = 11;           // ellipse ry for base

const SVG_W    = 185;
const SVG_H    = 385;

// Keep these for volToY compatibility
const CYL_X = LI;
const CYL_W = RI - LI;

// Graduated cylinder sizes with their max volume and tick spacing
const SIZES = [
  { label: "10 mL",  max: 10,  majorStep: 1,  minorStep: 0.2 },  // 5 minor per major
  { label: "25 mL",  max: 25,  majorStep: 5,  minorStep: 1   },  // 5 minor per major
  { label: "50 mL",  max: 50,  majorStep: 10, minorStep: 1   },  // 10 minor per major
  { label: "100 mL", max: 100, majorStep: 20, minorStep: 2   },  // 10 minor per major
];

type SizeKey = 0 | 1 | 2 | 3;

interface Target { value: number; label: string; }
interface DisplaceTarget { initial: number; final: number; objectVol: number; label: string; }

function newTarget(sizeIdx: SizeKey): Target {
  const { max, minorStep } = SIZES[sizeIdx];
  const steps = Math.round(max / minorStep);
  // Avoid 0 and max — pick a random inner step
  const t = Math.floor(Math.random() * (steps - 1)) + 1;
  const val = Math.round(t * minorStep * 100) / 100; // avoid float drift
  const label = Number.isInteger(val) ? `${val}.0 mL` : `${val} mL`;
  return { value: val, label };
}

function newDisplaceTarget(sizeIdx: SizeKey): DisplaceTarget {
  const { max, minorStep } = SIZES[sizeIdx];
  const steps = Math.round(max / minorStep);
  // Require final ≥ 28 % of max so the rock is always fully submerged
  const minFinalSteps = Math.ceil(steps * 0.28);

  // initial: 10–45 % of scale
  const minInitSteps = Math.max(2, Math.ceil(minFinalSteps * 0.4));
  const maxInitSteps = Math.floor(steps * 0.45);
  const initSteps = minInitSteps + Math.floor(Math.random() * (maxInitSteps - minInitSteps + 1));
  const initial = Math.round(initSteps * minorStep * 10000) / 10000;

  // object: large enough so final ≥ 28 % of scale, at most 40 % of scale
  const minObjSteps = Math.max(2, minFinalSteps - initSteps);
  const remainSteps = Math.floor((max - initial) / minorStep) - 1;
  const maxObjSteps = Math.min(Math.floor(steps * 0.4), remainSteps);
  const objSteps = minObjSteps + Math.floor(Math.random() * Math.max(1, maxObjSteps - minObjSteps + 1));
  const objectVol = Math.round(objSteps * minorStep * 10000) / 10000;
  const final = Math.round((initial + objectVol) * 10000) / 10000;
  const label = Number.isInteger(objectVol) ? `${objectVol}.0 mL` : `${objectVol} mL`;
  return { initial, final, objectVol, label };
}

// Volume → y position within the padded scale area
function volToY(vol: number, max: number): number {
  return SCALE_BOT - (vol / max) * SCALE_H;
}

// ─── Cylinder SVG ─────────────────────────────────────────────────────────────

function CylinderSVG({ sizeIdx, target, answered, correct, scale = 1.5, referenceLine, showObject = false }: {
  sizeIdx: SizeKey; target: Target; answered: boolean; correct: boolean;
  scale?: number; referenceLine?: number; showObject?: boolean;
}) {
  const { max, majorStep, minorStep } = SIZES[sizeIdx];
  const liquidY = volToY(target.value, max);
  const meniscusDepth = 5;

  // Colors
  const liquidFill = answered
    ? correct ? "rgba(34,197,94,0.48)" : "rgba(220,38,38,0.40)"
    : "rgba(88,168,210,0.52)";
  const liquidLine = answered
    ? correct ? "#16a34a" : "#dc2626"
    : "#1a6fa8";
  const glassWall = "rgba(195,228,242,0.58)";
  const glassEdge = "#6ab4d0";

  // liquidY = bottom of meniscus (the level you read on the scale)
  // wallY   = where liquid contacts the glass walls (meniscusDepth above the reading)
  // cpY     = Bezier control point, overshooting by meniscusDepth so the *actual*
  //           curve midpoint (0.5*wallY + 0.5*cpY) lands exactly on liquidY.
  const wallY = liquidY - meniscusDepth;
  const cpY   = liquidY + meniscusDepth;  // 2*liquidY - wallY

  // Liquid closed path: walls at wallY, meniscus dips to liquidY
  const liquidPath = [
    `M ${LI},${wallY}`,
    `Q ${CYL_CX},${cpY} ${RI},${wallY}`,
    `L ${RI},${CYL_BOT}`,
    `L ${LI},${CYL_BOT}`,
    `Z`,
  ].join(" ");

  // Tick marks — extend LEFT from RO into the cylinder; labels to the right of RO
  const ticks: React.ReactNode[] = [];
  let v = 0;
  while (v <= max + 1e-9) {
    const rv = Math.round(v * 10000) / 10000;
    const y  = volToY(rv, max);
    const isMaj = Math.abs(rv % majorStep) < 1e-9 || Math.abs((rv % majorStep) - majorStep) < 1e-9;
    const tickLen = isMaj ? 20 : 10;
    ticks.push(
      <line key={rv} x1={RO} y1={y} x2={RO - tickLen} y2={y}
        stroke="#445" strokeWidth={isMaj ? 1.5 : 0.9} />
    );
    if (isMaj && rv > 1e-9) {
      ticks.push(
        <text key={`l${rv}`} x={RO + 7} y={y + 4}
          textAnchor="start" fontSize={11.5} fontWeight="700"
          fill="#222" fontFamily="'Courier New', monospace">
          {rv.toFixed(1)}
        </text>
      );
    }
    v = Math.round((v + minorStep) * 10000) / 10000;
  }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width={SVG_W * scale} height={SVG_H * scale}
      style={{ display: "block", maxWidth: "100%" }}>

      {/* ── Base foot ────────────────────────────────── */}
      {/* Shoulder trapezoid connecting cylinder body to base */}
      <path
        d={`M ${LO},${CYL_BOT} L ${BASE_LO},${SHO_Y} L ${BASE_RO},${SHO_Y} L ${RO},${CYL_BOT} Z`}
        fill="rgba(185,222,238,0.55)" stroke={glassEdge} strokeWidth={1.5} />
      {/* Base left/right sides */}
      <line x1={BASE_LO} y1={SHO_Y} x2={BASE_LO} y2={BASE_BOT} stroke={glassEdge} strokeWidth={2.5} />
      <line x1={BASE_RO} y1={SHO_Y} x2={BASE_RO} y2={BASE_BOT} stroke={glassEdge} strokeWidth={2.5} />
      {/* Base fill rect */}
      <rect x={BASE_LO} y={SHO_Y} width={BASE_RX * 2} height={BASE_BOT - SHO_Y}
        fill="rgba(185,222,238,0.42)" />
      {/* Top ring of base (visible as an elliptical ridge) */}
      <ellipse cx={CYL_CX} cy={SHO_Y} rx={BASE_RX} ry={8}
        fill="rgba(195,228,242,0.75)" stroke={glassEdge} strokeWidth={2} />
      {/* Bottom ellipse of base */}
      <ellipse cx={CYL_CX} cy={BASE_BOT} rx={BASE_RX} ry={BASE_ERY}
        fill="rgba(175,215,232,0.88)" stroke={glassEdge} strokeWidth={2.2} />

      {/* ── Liquid ───────────────────────────────────── */}
      <path d={liquidPath} fill={liquidFill} />

      {/* ── Submerged rock ───────────────────────────── */}
      {showObject && (
        <>
          {/* Main rock body — cool-grey angular polygon */}
          <polygon
            points="61,268 65,257 72,251 81,251 89,257 92,267 89,277 81,284 69,283 62,275"
            fill="#7e8888" stroke="#4e5858" strokeWidth={1.5} strokeLinejoin="round" />
          {/* Lit upper-left facet */}
          <polygon
            points="65,257 72,251 81,251 78,260 70,263"
            fill="rgba(255,255,255,0.22)" />
          {/* Shadow lower-right facet */}
          <polygon
            points="89,277 81,284 69,283 71,276 80,273 88,269"
            fill="rgba(0,0,0,0.18)" />
          {/* Specular highlight */}
          <ellipse cx={70} cy={256} rx={4} ry={2.5}
            fill="rgba(255,255,255,0.40)" />
        </>
      )}

      {/* ── Left glass wall ──────────────────────────── */}
      <rect x={LO} y={CYL_TOP} width={WALL_T} height={CYL_BOT - CYL_TOP}
        fill={glassWall} stroke={glassEdge} strokeWidth={1} />
      {/* Glass highlight — thin white streak on inner-left of left wall */}
      <rect x={LO + 1} y={CYL_TOP + 14} width={1.8} height={CYL_H - 28}
        fill="rgba(255,255,255,0.55)" rx={1} />

      {/* ── Right glass wall ─────────────────────────── */}
      <rect x={RI} y={CYL_TOP} width={WALL_T} height={CYL_BOT - CYL_TOP}
        fill={glassWall} stroke={glassEdge} strokeWidth={1} />

      {/* ── Bottom cap ellipse (seals cylinder body) ─── */}
      <ellipse cx={CYL_CX} cy={CYL_BOT} rx={INNER_R + WALL_T / 2} ry={7}
        fill="rgba(185,222,238,0.80)" stroke={glassEdge} strokeWidth={2} />

      {/* ── Top rim ──────────────────────────────────── */}
      <ellipse cx={CYL_CX} cy={CYL_TOP} rx={INNER_R + WALL_T / 2} ry={5}
        fill="rgba(210,238,248,0.6)" stroke={glassEdge} strokeWidth={2.2} />

{/* ── Meniscus surface stroke ───────────────────── */}
      <path
        d={`M ${LI},${wallY} Q ${CYL_CX},${cpY} ${RI},${wallY}`}
        fill="none" stroke={liquidLine} strokeWidth={2.2} />

      {/* ── Tick marks ───────────────────────────────── */}
      {ticks}

      {/* ── "mL" unit label — just inside the top rim ── */}
      <text x={RO + 7} y={CYL_TOP + 14} textAnchor="start"
        fontSize={11} fontWeight="800" fill="#555" fontFamily="system-ui, sans-serif">mL</text>

      {/* ── Dashed read-line at meniscus bottom (the true reading level) ── */}
      {answered && (
        <line
          x1={LI - 5} y1={liquidY}
          x2={RI + 4} y2={liquidY}
          stroke={liquidLine} strokeWidth={1.5} strokeDasharray="5 3" />
      )}

      {/* ── Reference line (initial water level shown on "after" cylinder) ── */}
      {referenceLine != null && (
        <line
          x1={LO - 3} y1={volToY(referenceLine, max)}
          x2={RI + 3} y2={volToY(referenceLine, max)}
          stroke="#f59e0b" strokeWidth={1.8} strokeDasharray="6 3" />
      )}
    </svg>
  );
}

// ─── Displacement display (two cylinders side by side) ───────────────────────

function DisplacementDisplay({ sizeIdx, dt, answered }: {
  sizeIdx: SizeKey; dt: DisplaceTarget; answered: boolean;
}) {
  const beforeTarget: Target = { value: dt.initial,  label: `${dt.initial} mL` };
  const afterTarget:  Target = { value: dt.final,    label: `${dt.final} mL` };
  return (
    <div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "flex-end" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#888",
          textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>Before</div>
        <CylinderSVG sizeIdx={sizeIdx} target={beforeTarget}
          answered={false} correct={false} scale={1.0} />
      </div>
      <div style={{ fontSize: 28, color: "#94a3b8", paddingBottom: 30, alignSelf: "center" }}>→</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#888",
          textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>After</div>
        <CylinderSVG sizeIdx={sizeIdx} target={afterTarget}
          answered={false} correct={false} scale={1.0}
          showObject={true}
          referenceLine={answered ? dt.initial : undefined} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Mode = "read" | "displace";

export default function GraduatedCylinderPage() {
  const { user } = useUser();
  const [sizeIdx,        setSizeIdx]        = useState<SizeKey>(0);
  const [mode,           setMode]           = useState<Mode>("read");
  // Null on SSR to avoid hydration mismatch (Math.random)
  const [target,         setTarget]         = useState<Target | null>(null);
  const [displaceTarget, setDisplaceTarget] = useState<DisplaceTarget | null>(null);
  const [input,    setInput]    = useState("");
  const [answered, setAnswered] = useState(false);
  const [correct,  setCorrect]  = useState(false);
  const [score,    setScore]    = useState(0);
  const [strikes,  setStrikes]  = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTarget(newTarget(0));
    setDisplaceTarget(newDisplaceTarget(0));
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function clearTimer() { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }

  function nextQuestion(si: SizeKey, m: Mode) {
    if (m === "read") setTarget(newTarget(si));
    else setDisplaceTarget(newDisplaceTarget(si));
    setInput(""); setAnswered(false); setCorrect(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function startFresh(si: SizeKey, m: Mode = mode) {
    clearTimer();
    setSizeIdx(si);
    setMode(m);
    if (m === "read") setTarget(newTarget(si));
    else setDisplaceTarget(newDisplaceTarget(si));
    setInput(""); setAnswered(false); setCorrect(false);
    setScore(0); setStrikes(0); setGameOver(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSubmit() {
    if (answered || gameOver) return;
    const val = parseFloat(input);
    if (isNaN(val)) return;
    const { minorStep } = SIZES[sizeIdx];
    const tolerance = minorStep * 0.6;
    let isCorrect = false;
    if (mode === "read") {
      if (!target) return;
      isCorrect = Math.abs(val - target.value) <= tolerance;
    } else {
      if (!displaceTarget) return;
      isCorrect = Math.abs(val - displaceTarget.objectVol) <= tolerance;
    }
    setAnswered(true);
    setCorrect(isCorrect);
    if (isCorrect) {
      const newScore = score + 1;
      setScore(newScore);
      if (user) upsertToolHighScore(user.id, "meas-cylinder", sizeIdx, mode === "read" ? 0 : 1, newScore);
      timerRef.current = setTimeout(() => nextQuestion(sizeIdx, mode), 1200);
    } else {
      const ns = strikes + 1;
      setStrikes(ns);
      if (ns >= 3) {
        timerRef.current = setTimeout(() => setGameOver(true), 1800);
      } else timerRef.current = setTimeout(() => nextQuestion(sizeIdx, mode), 1800);
    }
  }

  const NAV_BTN: React.CSSProperties = {
    padding: "7px 14px", borderRadius: 10, border: "2px solid",
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
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px" }}>

          {/* Header + settings — single combined card */}
          <div style={{ ...CARD, padding: "14px 20px", marginBottom: 16,
            display: "flex", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
            {/* Left: title */}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0,
                whiteSpace: "nowrap" }}>🧪 Graduated Cylinder</h1>
            </div>
            {/* Right: mode + size controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                  textTransform: "uppercase", letterSpacing: "0.5px", minWidth: 38 }}>Mode</span>
                {(["read", "displace"] as Mode[]).map(m => (
                  <button key={m} onClick={() => startFresh(sizeIdx, m)}
                    style={{ ...NAV_BTN,
                      borderColor: mode === m ? "#7c3aed" : "#e0e0e0",
                      background:  mode === m ? "#f5f3ff" : "#f9f9f9",
                      color:       mode === m ? "#7c3aed" : "#666",
                    }}>
                    {m === "read" ? "Read Volume" : "Measure Object"}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                  textTransform: "uppercase", letterSpacing: "0.5px", minWidth: 38 }}>Size</span>
                {SIZES.map((s, i) => (
                  <button key={i} onClick={() => startFresh(i as SizeKey)}
                    style={{ ...NAV_BTN,
                      borderColor: sizeIdx === i ? "#7c3aed" : "#e0e0e0",
                      background:  sizeIdx === i ? "#f5f3ff" : "#f9f9f9",
                      color:       sizeIdx === i ? "#7c3aed" : "#666",
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!(mode === "read" ? target : displaceTarget) ? null : gameOver ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 14 }}>💥</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>Game Over!</h2>
              <p style={{ fontSize: 18, color: "#333", marginBottom: 4 }}>
                Final score: <strong style={{ color: "#7c3aed" }}>{score}</strong>
              </p>
              <p style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 32 }}>
                {score === 0 ? "Keep practicing!" : score < 5 ? "Good start!" : score < 10 ? "Nice work!" : "Lab expert!"}
              </p>
              <button onClick={() => startFresh(sizeIdx)}
                style={{ padding: "14px 40px", background: "#7c3aed", color: "#fff",
                  border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                Play Again
              </button>
            </div>
          ) : (
            <div style={{ ...CARD, padding: "16px 20px 14px" }}>

              {/* Prompt */}
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                {mode === "read" ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                      What is the volume?
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#aaa" }}>
                      Read the bottom of the meniscus (curved liquid surface)
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                      What is the volume of the object?
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#aaa" }}>
                      Subtract the Before reading from the After reading
                    </div>
                  </>
                )}
              </div>

              {/* Cylinder(s) */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                {mode === "read" && target && (
                  <CylinderSVG sizeIdx={sizeIdx} target={target}
                    answered={answered} correct={correct} />
                )}
                {mode === "displace" && displaceTarget && (
                  <DisplacementDisplay sizeIdx={sizeIdx} dt={displaceTarget} answered={answered} />
                )}
              </div>

              {/* Compact bottom strip: input + feedback + score all in one row */}
              {(() => {
                const answerLabel = mode === "read" ? target?.label : displaceTarget?.label;
                return (
                  <div style={{ borderTop: "1.5px solid #f0f0f0", paddingTop: 12,
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {/* Input + Check */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        ref={inputRef}
                        type="number"
                        step={SIZES[sizeIdx].minorStep}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSubmit()}
                        disabled={answered}
                        placeholder={`e.g. ${SIZES[sizeIdx].max / 2}`}
                        style={{ fontSize: 18, fontWeight: 800, width: 110, padding: "7px 10px",
                          border: answered
                            ? `2px solid ${correct ? "#16a34a" : "#dc2626"}`
                            : "2px solid #d1d5db",
                          borderRadius: 8, outline: "none", textAlign: "center",
                          color: "#111", background: "#fff" }}
                        autoFocus
                      />
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#555" }}>mL</span>
                      {!answered && (
                        <button onClick={handleSubmit}
                          style={{ padding: "7px 18px", background: "#7c3aed", color: "#fff",
                            border: "none", borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                          Check
                        </button>
                      )}
                    </div>
                    {/* Feedback */}
                    <div style={{ flex: 1, minWidth: 120 }}>
                      {answered && correct && (
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#16a34a" }}>✓ Correct! {answerLabel}</span>
                      )}
                      {answered && !correct && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>
                          ✗ Answer: <strong style={{ fontFamily: "monospace" }}>{answerLabel}</strong>
                          {mode === "displace" && displaceTarget && (
                            <span style={{ color: "#888", fontWeight: 400 }}>
                              {" "}({displaceTarget.final}−{displaceTarget.initial})
                            </span>
                          )}
                        </span>
                      )}
                      {!answered && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#bbb" }}>
                          Enter a value and press Check
                        </span>
                      )}
                    </div>
                    {/* Score + Strikes */}
                    <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                          textTransform: "uppercase", letterSpacing: "0.5px" }}>Score</span>
                        <span style={{ fontSize: 22, fontWeight: 900, color: "#111", lineHeight: 1 }}>{score}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                          textTransform: "uppercase", letterSpacing: "0.5px" }}>Strikes</span>
                        <div style={{ display: "flex", gap: 5 }}>
                          {[0, 1, 2].map(i => (
                            <div key={i} style={{
                              width: 18, height: 18, borderRadius: "50%",
                              background: i < strikes ? "#dc2626" : "#e5e7eb",
                              border: `2px solid ${i < strikes ? "#b91c1c" : "#d1d5db"}`,
                              transition: "background 250ms",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 9, color: i < strikes ? "#fff" : "transparent", fontWeight: 900,
                            }}>✕</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          ) /* end gameOver ternary */ }
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
