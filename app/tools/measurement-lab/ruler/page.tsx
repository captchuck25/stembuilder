"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import SiteHeader from "@/app/components/SiteHeader";
import { upsertToolHighScore } from "@/lib/achievements";

// ─── Visual constants ─────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

// ─── Ruler geometry ───────────────────────────────────────────────────────────

const PAD      = 52;   // left/right padding inside SVG viewBox (px)
const OVERHANG = 28;   // ruler body extends this far left of the 0 tick
const INCH_PX  = 126;  // px per inch  → 6" ruler = 756px content
const CM_PX    = 38;   // px per cm    → 20cm ruler = 760px content
const N_IN     = 6;    // ruler length in inches
const N_CM     = 20;   // ruler length in cm
const RY       = 38;   // y of ruler top edge in SVG
const RH       = 108;  // ruler body height
const SVG_H    = RY + RH + 10;

// Tick heights (from top edge, going DOWN into body)
// keyed by simplified denominator for inches
const TICK_IN: Record<number, number> = { 1: 60, 2: 44, 4: 32, 8: 22, 16: 13 };
// keyed by mm subdivision: 10=1cm, 5=5mm, 2=2mm, 1=1mm
const TICK_MM: Record<number, number> = { 10: 60, 5: 28, 2: 28, 1: 28 };

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode     = "inches" | "metric";
type InchPrec = 2 | 4 | 8 | 16;
type MmStep   = 10 | 5 | 2 | 1;

interface Target  { value: number; label: string; }
interface Pointer { x: number; value: number; }

// ─── Math helpers ─────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

function inchLabel(ticks: number, den: number): string {
  const w = Math.floor(ticks / den), n = ticks % den;
  if (n === 0) return `${w}"`;
  const g = gcd(n, den);
  const sn = n / g, sd = den / g;
  return w === 0 ? `${sn}/${sd}"` : `${w} ${sn}/${sd}"`;
}

function valueToX_in(value: number): number { return PAD + value * INCH_PX; }
function valueToX_mm(mm: number): number    { return PAD + (mm / 10) * CM_PX; }

function snapClick(
  svgX: number, mode: Mode, prec: InchPrec, step: MmStep,
): Pointer | null {
  const rel = svgX - PAD;
  if (mode === "inches") {
    const maxRel = N_IN * INCH_PX;
    if (rel < -6 || rel > maxRel + 6) return null;
    const tickPx = INCH_PX / prec;
    const idx = Math.round(rel / tickPx);
    const clamped = Math.max(0, Math.min(N_IN * prec, idx));
    return { x: PAD + clamped * tickPx, value: clamped / prec };
  } else {
    const maxRel = N_CM * CM_PX;
    if (rel < -6 || rel > maxRel + 6) return null;
    const tickPx = (CM_PX / 10) * step;
    const idx = Math.round(rel / tickPx);
    const clamped = Math.max(0, Math.min((N_CM * 10) / step, idx));
    return { x: PAD + clamped * tickPx, value: clamped * step };
  }
}

function newInchTarget(prec: InchPrec): Target {
  const total = N_IN * prec;
  const t = Math.floor(Math.random() * (total - 1)) + 1;
  return { value: t / prec, label: inchLabel(t, prec) };
}

function newMetricTarget(step: MmStep): Target {
  const total = (N_CM * 10) / step;
  const t = Math.floor(Math.random() * (total - 1)) + 1;
  const mm = t * step;
  const cm = mm / 10;
  return { value: mm, label: cm % 1 === 0 ? `${cm} cm` : `${cm.toFixed(1)} cm` };
}

// ─── Ruler SVG ────────────────────────────────────────────────────────────────

function Pointer({ x, color }: { x: number; color: string }) {
  return (
    <g>
      {/* Downward triangle pointing at the ruler top */}
      <polygon
        points={`${x},${RY + 1} ${x - 9},${RY - 13} ${x + 9},${RY - 13}`}
        fill={color}
      />
      {/* Dashed line through ruler body */}
      <line x1={x} y1={RY + 1} x2={x} y2={RY + RH - 2}
        stroke={color} strokeWidth={1.5} strokeDasharray="4 3" />
    </g>
  );
}

function InchRuler({
  prec, userPtr, correctPtr, answered,
  onRulerClick,
}: {
  prec: InchPrec;
  userPtr: Pointer | null;
  correctPtr: Pointer | null;
  answered: boolean;
  onRulerClick: (svgX: number) => void;
}) {
  const W = N_IN * INCH_PX + PAD * 2;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; label: string } | null>(null);

  function getSvgX(e: React.MouseEvent) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (answered) { setHover(null); return; }
    const svgX = getSvgX(e);
    if (svgX === null) return;
    const ptr = snapClick(svgX, "inches", prec, 10);
    if (!ptr) { setHover(null); return; }
    const ticks = Math.round(ptr.value * prec);
    setHover({ x: ptr.x, label: inchLabel(ticks, prec) });
  }

  function handleClick(e: React.MouseEvent) {
    if (answered) return;
    const svgX = getSvgX(e);
    if (svgX !== null) onRulerClick(svgX);
  }

  const tickEls: React.ReactNode[] = [];
  for (let i = 0; i <= N_IN * prec; i++) {
    const x = PAD + (i / prec) * INCH_PX;
    const g = i === 0 ? prec : gcd(i, prec);
    const sd = prec / g;
    const h = TICK_IN[sd] ?? TICK_IN[16];
    const isInch = i % prec === 0;
    tickEls.push(
      <line key={`t${i}`} x1={x} y1={RY} x2={x} y2={RY + h}
        stroke="#3a1a00" strokeWidth={isInch ? 1.8 : 1} />
    );
    if (isInch && i > 0 && i < N_IN * prec) {
      tickEls.push(
        <text key={`n${i}`} x={x} y={RY + RH - 8}
          textAnchor="middle" fontSize={17} fill="#3a1a00" fontWeight="700">
          {i / prec}
        </text>
      );
    }
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${SVG_H}`} width={W} height={SVG_H}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      style={{ cursor: answered ? "default" : "crosshair", display: "block", maxWidth: "100%" }}>
      {/* Ruler body — cream/wood color, extends past 0 and 6 */}
      <rect x={PAD - OVERHANG} y={RY} width={N_IN * INCH_PX + OVERHANG * 2} height={RH}
        fill="#FFFAED" stroke="#A0791A" strokeWidth={1.5} rx={2} />
      {/* 0 label */}
      <text x={PAD} y={RY + RH - 8} textAnchor="middle"
        fontSize={17} fill="#3a1a00" fontWeight="700">0</text>
      {tickEls}
      {/* Hover highlight — blue line only */}
      {hover && !answered && (
        <line x1={hover.x} y1={RY} x2={hover.x} y2={RY + RH}
          stroke="#2563eb" strokeWidth={2.5} opacity={0.5}
          style={{ pointerEvents: "none" }} />
      )}
      {correctPtr && <Pointer x={correctPtr.x} color="#16a34a" />}
      {userPtr && (
        <Pointer
          x={userPtr.x}
          color={!correctPtr ? "#2563eb" : Math.abs(userPtr.x - (correctPtr?.x ?? -999)) < 0.5 ? "#16a34a" : "#dc2626"}
        />
      )}
    </svg>
  );
}

function MetricRuler({
  step, userPtr, correctPtr, answered,
  onRulerClick,
}: {
  step: MmStep;
  userPtr: Pointer | null;
  correctPtr: Pointer | null;
  answered: boolean;
  onRulerClick: (svgX: number) => void;
}) {
  const W = N_CM * CM_PX + PAD * 2;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; label: string } | null>(null);

  function getSvgX(e: React.MouseEvent) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (answered) { setHover(null); return; }
    const svgX = getSvgX(e);
    if (svgX === null) return;
    const ptr = snapClick(svgX, "metric", 2, step);
    if (!ptr) { setHover(null); return; }
    const mm = ptr.value;
    const cm = mm / 10;
    const label = cm % 1 === 0 ? `${cm} cm` : `${cm.toFixed(1)} cm`;
    setHover({ x: ptr.x, label });
  }

  function handleClick(e: React.MouseEvent) {
    if (answered) return;
    const svgX = getSvgX(e);
    if (svgX !== null) onRulerClick(svgX);
  }

  const tickEls: React.ReactNode[] = [];
  const totalMm = N_CM * 10;
  for (let mm = 0; mm <= totalMm; mm++) {
    const x = PAD + (mm / 10) * CM_PX;
    const h = mm % 10 === 0 ? TICK_MM[10] : mm % 5 === 0 ? TICK_MM[5] : mm % 2 === 0 ? TICK_MM[2] : TICK_MM[1];
    const isCm = mm % 10 === 0;
    tickEls.push(
      <line key={`t${mm}`} x1={x} y1={RY} x2={x} y2={RY + h}
        stroke="#0a3a1a" strokeWidth={isCm ? 1.8 : 0.9} />
    );
    if (isCm && mm > 0 && mm < totalMm) {
      tickEls.push(
        <text key={`n${mm}`} x={x} y={RY + RH - 8}
          textAnchor="middle" fontSize={16} fill="#0a3a1a" fontWeight="700">
          {mm / 10}
        </text>
      );
    }
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${SVG_H}`} width={W} height={SVG_H}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      style={{ cursor: answered ? "default" : "crosshair", display: "block", maxWidth: "100%" }}>
      {/* Ruler body — white with green border, extends past 0 and 20 */}
      <rect x={PAD - OVERHANG} y={RY} width={N_CM * CM_PX + OVERHANG * 2} height={RH}
        fill="#F4FBF5" stroke="#1a6a2a" strokeWidth={1.5} rx={2} />
      {/* 0 label */}
      <text x={PAD} y={RY + RH - 8} textAnchor="middle"
        fontSize={16} fill="#0a3a1a" fontWeight="700">0</text>
      {tickEls}
      {/* Hover highlight — green line only */}
      {hover && !answered && (
        <line x1={hover.x} y1={RY} x2={hover.x} y2={RY + RH}
          stroke="#059669" strokeWidth={2.5} opacity={0.5}
          style={{ pointerEvents: "none" }} />
      )}
      {correctPtr && <Pointer x={correctPtr.x} color="#16a34a" />}
      {userPtr && (
        <Pointer
          x={userPtr.x}
          color={!correctPtr ? "#2563eb" : Math.abs(userPtr.x - (correctPtr?.x ?? -999)) < 0.5 ? "#16a34a" : "#dc2626"}
        />
      )}
    </svg>
  );
}

// ─── Settings config ──────────────────────────────────────────────────────────

const INCH_PRECS: { val: InchPrec; label: string }[] = [
  { val: 2,  label: "½\"" },
  { val: 4,  label: "¼\"" },
  { val: 8,  label: "⅛\"" },
  { val: 16, label: "1/16\"" },
];

const MM_STEPS: { val: MmStep; label: string }[] = [
  { val: 10, label: "cm" },
  { val: 5,  label: "5mm" },
  { val: 2,  label: "2mm" },
  { val: 1,  label: "1mm" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RulerGamePage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const [mode,     setMode]     = useState<Mode>("inches");
  const [inchPrec, setInchPrec] = useState<InchPrec>(2);
  const [mmStep,   setMmStep]   = useState<MmStep>(10);

  const [target,     setTarget]     = useState<Target>(() => newInchTarget(2));
  const [userPtr,    setUserPtr]    = useState<Pointer | null>(null);
  const [correctPtr, setCorrectPtr] = useState<Pointer | null>(null);
  const [score,      setScore]      = useState(0);
  const [strikes,    setStrikes]    = useState(0);
  const [gameOver,   setGameOver]   = useState(false);
  const [answered,   setAnswered]   = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const freshTarget = useCallback((m: Mode, p: InchPrec, s: MmStep) =>
    m === "inches" ? newInchTarget(p) : newMetricTarget(s),
  []);

  function startFresh(m: Mode, p: InchPrec, s: MmStep) {
    clearTimer();
    setMode(m); setInchPrec(p); setMmStep(s);
    setTarget(freshTarget(m, p, s));
    setUserPtr(null); setCorrectPtr(null);
    setScore(0); setStrikes(0);
    setGameOver(false); setAnswered(false);
  }

  function nextQuestion(m: Mode, p: InchPrec, s: MmStep) {
    setUserPtr(null); setCorrectPtr(null); setAnswered(false);
    setTarget(freshTarget(m, p, s));
  }

  function handleRulerClick(svgX: number) {
    if (answered || gameOver) return;
    const ptr = snapClick(svgX, mode, inchPrec, mmStep);
    if (!ptr) return;
    setUserPtr(ptr);
    setAnswered(true);

    const correct = Math.abs(ptr.value - target.value) < 0.0001;

    if (correct) {
      const newScore = score + 1;
      setScore(newScore);
      if (userId) {
        const li = mode === "inches" ? 0 : 1;
        const ci = mode === "inches"
          ? INCH_PRECS.findIndex(p => p.val === inchPrec)
          : MM_STEPS.findIndex(s => s.val === mmStep);
        upsertToolHighScore(userId, "meas-ruler", li, ci, newScore);
      }
      // Advance after short delay
      timerRef.current = setTimeout(() => nextQuestion(mode, inchPrec, mmStep), 1200);
    } else {
      // Show correct answer on ruler
      const cx = mode === "inches"
        ? valueToX_in(target.value)
        : valueToX_mm(target.value);
      setCorrectPtr({ x: cx, value: target.value });

      const newStrikes = strikes + 1;
      setStrikes(newStrikes);
      if (newStrikes >= 3) {
        timerRef.current = setTimeout(() => setGameOver(true), 1800);
      } else {
        timerRef.current = setTimeout(() => nextQuestion(mode, inchPrec, mmStep), 1800);
      }
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
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

          {/* Page title card */}
          <div style={{ ...CARD, padding: "18px 24px", marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>📏 Ruler Game</h1>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#555", margin: 0 }}>
              Click the ruler at the correct measurement. 3 strikes and you're out!
            </p>
          </div>

          {/* Settings bar */}
          <div style={{ ...CARD, padding: "14px 20px", marginBottom: 20,
            display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>

            {/* Mode */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>Mode</span>
              {(["inches", "metric"] as Mode[]).map(m => (
                <button key={m} onClick={() => startFresh(m, inchPrec, mmStep)}
                  style={{ ...NAV_BTN,
                    borderColor: mode === m ? "#2563eb" : "#e0e0e0",
                    background:  mode === m ? "#eff6ff"  : "#f9f9f9",
                    color:       mode === m ? "#2563eb"  : "#666",
                  }}>
                  {m === "inches" ? "Inches" : "Metric"}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 28, background: "#e5e7eb" }} />

            {/* Precision */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>Precision</span>
              {mode === "inches"
                ? INCH_PRECS.map(p => (
                  <button key={p.val} onClick={() => startFresh(mode, p.val, mmStep)}
                    style={{ ...NAV_BTN,
                      borderColor: inchPrec === p.val ? "#2563eb" : "#e0e0e0",
                      background:  inchPrec === p.val ? "#eff6ff"  : "#f9f9f9",
                      color:       inchPrec === p.val ? "#2563eb"  : "#666",
                    }}>
                    {p.label}
                  </button>
                ))
                : MM_STEPS.map(s => (
                  <button key={s.val} onClick={() => startFresh(mode, inchPrec, s.val)}
                    style={{ ...NAV_BTN,
                      borderColor: mmStep === s.val ? "#2563eb" : "#e0e0e0",
                      background:  mmStep === s.val ? "#eff6ff"  : "#f9f9f9",
                      color:       mmStep === s.val ? "#2563eb"  : "#666",
                    }}>
                    {s.label}
                  </button>
                ))
              }
            </div>
          </div>

          {/* Main game card */}
          {gameOver ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 14 }}>💥</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>Game Over!</h2>
              <p style={{ fontSize: 18, color: "#333", marginBottom: 4 }}>
                Final score: <strong style={{ color: "#2563eb" }}>{score}</strong>
              </p>
              <p style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 32 }}>
                {score === 0 ? "Keep practicing — you'll get it!" :
                 score < 5  ? "Good start! Try again." :
                 score < 10 ? "Nice work! Can you beat your score?" :
                 "Excellent — you're a measurement pro!"}
              </p>
              <button onClick={() => startFresh(mode, inchPrec, mmStep)}
                style={{ padding: "14px 40px", background: "#2563eb", color: "#fff",
                  border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                Play Again
              </button>
            </div>
          ) : (
            <div style={{ ...CARD, padding: "28px 24px 20px" }}>

              {/* ── Target display ── */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                  textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                  Find this measurement
                </div>
                <div style={{ fontSize: 48, fontWeight: 900, color: "#111",
                  fontFamily: "monospace", letterSpacing: "1px", lineHeight: 1 }}>
                  {target.label}
                </div>
              </div>

              {/* ── Ruler ── */}
              <div style={{ overflowX: "auto", paddingBottom: 4, marginBottom: 12,
                display: "flex", justifyContent: "center" }}>
                {mode === "inches"
                  ? <InchRuler prec={inchPrec} userPtr={userPtr} correctPtr={correctPtr}
                      answered={answered} onRulerClick={handleRulerClick} />
                  : <MetricRuler step={mmStep} userPtr={userPtr} correctPtr={correctPtr}
                      answered={answered} onRulerClick={handleRulerClick} />
                }
              </div>

              {/* ── Feedback message ── */}
              <div style={{ textAlign: "center", minHeight: 28, marginBottom: 20 }}>
                {answered && !correctPtr && (
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#16a34a" }}>✓ Correct!</span>
                )}
                {answered && correctPtr && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>
                    ✗ The answer was <strong style={{ fontFamily: "monospace" }}>{target.label}</strong> — shown in green
                  </span>
                )}
                {!answered && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#aaa" }}>
                    Click the ruler to mark your answer
                  </span>
                )}
              </div>

              {/* ── Score bar ── */}
              <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: 16,
                display: "flex", gap: 32, alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Score</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "#111", lineHeight: 1 }}>{score}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#aaa",
                    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Strikes</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: i < strikes ? "#dc2626" : "#e5e7eb",
                        border: `2px solid ${i < strikes ? "#b91c1c" : "#d1d5db"}`,
                        transition: "background 250ms",
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
