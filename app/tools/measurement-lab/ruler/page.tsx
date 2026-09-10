"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import SiteHeader from "@/app/components/SiteHeader";
import { upsertToolHighScore } from "@/lib/achievements";
import {
  CARD, TOOL_META, useMeasurementSession,
  ModeSelector, ScoreHud, SprintBar, ResultScreen,
  AssignmentBanner, AssignmentErrorCard,
} from "../shared";
import { isLeaderboardEligible, LEADERBOARD_SETTINGS } from "../constants";
import {
  gcd, inchLabel, cmLabel, encodeRulerMode, decodeRulerMode,
  parseInchInput, parseCmInput, inchAnswerCorrect, inchAnswerStatus, cmAnswerCorrect,
  inchClasses, metricClasses, makeBag, nextInchTicks, nextMetricMm,
  type RulerTask, type TypedAnswer, type VarietyBag,
} from "./fractions";

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

const BLUE = "#2563eb", GREEN = "#16a34a", RED = "#dc2626";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode     = "inches" | "metric";
type InchPrec = 2 | 4 | 8 | 16;
type MmStep   = 10 | 5 | 2 | 1;

interface Target  { value: number; label: string; }
interface Pointer { x: number; value: number; }
interface Marker  { x: number; color: string; }

// ─── Math helpers ─────────────────────────────────────────────────────────────

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

// Targets rotate through the kinds of mark (whole, half, quarter, …) via a
// shuffle bag so a 1/16" session isn't wall-to-wall sixteenths. One bag per
// (unit, precision); a settings change starts a fresh bag.
interface TargetSource { key: string; bag: VarietyBag }

function bagFor(src: TargetSource | null, m: Mode, p: InchPrec, s: MmStep): TargetSource {
  const key = m === "inches" ? `in:${p}` : `mm:${s}`;
  if (src && src.key === key) return src;
  return { key, bag: makeBag(m === "inches" ? inchClasses(p) : metricClasses(s)) };
}

function newInchTarget(prec: InchPrec, bag: VarietyBag): Target {
  const t = nextInchTicks(prec, N_IN, bag);
  return { value: t / prec, label: inchLabel(t, prec) };
}

function newMetricTarget(step: MmStep, bag: VarietyBag): Target {
  const mm = nextMetricMm(step, N_CM, bag);
  return { value: mm, label: cmLabel(mm) };
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

// Both rulers share the same interaction contract: `markers` are drawn on top,
// and when `interactive` is false the ruler ignores hover/click (Take mode —
// the student reads the arrow instead of placing one).
interface RulerProps {
  markers: Marker[];
  interactive: boolean;
  onRulerClick: (svgX: number) => void;
}

function InchRuler({ prec, markers, interactive, onRulerClick }: RulerProps & { prec: InchPrec }) {
  const W = N_IN * INCH_PX + PAD * 2;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  function getSvgX(e: React.MouseEvent) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!interactive) { setHover(null); return; }
    const svgX = getSvgX(e);
    if (svgX === null) return;
    const ptr = snapClick(svgX, "inches", prec, 10);
    setHover(ptr ? ptr.x : null);
  }

  function handleClick(e: React.MouseEvent) {
    if (!interactive) return;
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
      style={{ cursor: interactive ? "crosshair" : "default", display: "block", maxWidth: "100%" }}>
      {/* Ruler body — cream/wood color, extends past 0 and 6 */}
      <rect x={PAD - OVERHANG} y={RY} width={N_IN * INCH_PX + OVERHANG * 2} height={RH}
        fill="#FFFAED" stroke="#A0791A" strokeWidth={1.5} rx={2} />
      {/* 0 label */}
      <text x={PAD} y={RY + RH - 8} textAnchor="middle"
        fontSize={17} fill="#3a1a00" fontWeight="700">0</text>
      {tickEls}
      {/* Hover highlight — blue line only */}
      {hover !== null && interactive && (
        <line x1={hover} y1={RY} x2={hover} y2={RY + RH}
          stroke={BLUE} strokeWidth={2.5} opacity={0.5}
          style={{ pointerEvents: "none" }} />
      )}
      {markers.map((m, i) => <Pointer key={i} x={m.x} color={m.color} />)}
    </svg>
  );
}

function MetricRuler({ step, markers, interactive, onRulerClick }: RulerProps & { step: MmStep }) {
  const W = N_CM * CM_PX + PAD * 2;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  function getSvgX(e: React.MouseEvent) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!interactive) { setHover(null); return; }
    const svgX = getSvgX(e);
    if (svgX === null) return;
    const ptr = snapClick(svgX, "metric", 2, step);
    setHover(ptr ? ptr.x : null);
  }

  function handleClick(e: React.MouseEvent) {
    if (!interactive) return;
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
      style={{ cursor: interactive ? "crosshair" : "default", display: "block", maxWidth: "100%" }}>
      {/* Ruler body — white with green border, extends past 0 and 20 */}
      <rect x={PAD - OVERHANG} y={RY} width={N_CM * CM_PX + OVERHANG * 2} height={RH}
        fill="#F4FBF5" stroke="#1a6a2a" strokeWidth={1.5} rx={2} />
      {/* 0 label */}
      <text x={PAD} y={RY + RH - 8} textAnchor="middle"
        fontSize={16} fill="#0a3a1a" fontWeight="700">0</text>
      {tickEls}
      {/* Hover highlight — green line only */}
      {hover !== null && interactive && (
        <line x1={hover} y1={RY} x2={hover} y2={RY + RH}
          stroke="#059669" strokeWidth={2.5} opacity={0.5}
          style={{ pointerEvents: "none" }} />
      )}
      {markers.map((m, i) => <Pointer key={i} x={m.x} color={m.color} />)}
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

// ─── Take-mode answer fields ──────────────────────────────────────────────────

const FIELD: React.CSSProperties = {
  fontFamily: "monospace", fontWeight: 900, textAlign: "center",
  color: "#111", background: "#fff", outline: "none", borderRadius: 10,
  padding: 0,
};

function fieldBorder(state: "idle" | "error" | "correct" | "wrong"): string {
  return `3px solid ${state === "correct" ? GREEN : state === "wrong" || state === "error" ? RED : "#d1d5db"}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RulerGamePage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const [mode,     setMode]     = useState<Mode>("inches");
  const [task,     setTask]     = useState<RulerTask>("find");
  const [inchPrec, setInchPrec] = useState<InchPrec>(2);
  const [mmStep,   setMmStep]   = useState<MmStep>(10);

  const sourceRef = useRef<TargetSource | null>(null);
  const [target,     setTarget]     = useState<Target>(() => {
    sourceRef.current = bagFor(null, "inches", 2, 10);
    return newInchTarget(2, sourceRef.current.bag);
  });
  const [userPtr,    setUserPtr]    = useState<Pointer | null>(null);
  const [correctPtr, setCorrectPtr] = useState<Pointer | null>(null);
  const [score,      setScore]      = useState(0);
  const [strikes,    setStrikes]    = useState(0);
  const [gameOver,   setGameOver]   = useState(false);
  const [answered,   setAnswered]   = useState(false);
  const [correct,    setCorrect]    = useState(false);

  // Take-mode typed answer
  const [wholeIn,    setWholeIn]    = useState("");
  const [numIn,      setNumIn]      = useState("");
  const [denIn,      setDenIn]      = useState("");
  const [cmIn,       setCmIn]       = useState("");
  const [inputError, setInputError] = useState(false);
  const [typed,      setTyped]      = useState<TypedAnswer | null>(null);
  const [unsimplified, setUnsimplified] = useState(false); // value matched, fraction not reduced

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const settingsMode = encodeRulerMode(mode, task);
  const settingsPrecision = mode === "inches" ? String(inchPrec) : String(mmStep);
  const boardEligible = isLeaderboardEligible("ruler", settingsMode, settingsPrecision);

  const meas = useMeasurementSession({
    tool: "ruler",
    getTier: () => TOOL_META["ruler"].tier(settingsMode, settingsPrecision),
    getSettings: () => ({ mode: settingsMode, precision: settingsPrecision }),
    onAdvance: () => nextQuestion(mode, inchPrec, mmStep, task),
  });

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Deep-linked assignment: lock settings to its config and restart.
  useEffect(() => {
    if (!meas.assignment) return;
    const cfg = meas.assignment.config;
    const { unit, task: tk } = decodeRulerMode(cfg.mode);
    if (unit === "metric") {
      const step = ([10, 5, 2, 1] as MmStep[]).includes(parseInt(cfg.precision, 10) as MmStep)
        ? parseInt(cfg.precision, 10) as MmStep : 10;
      startFresh("metric", inchPrec, step, tk);
    } else {
      const prec = ([2, 4, 8, 16] as InchPrec[]).includes(parseInt(cfg.precision, 10) as InchPrec)
        ? parseInt(cfg.precision, 10) as InchPrec : 2;
      startFresh("inches", prec, mmStep, tk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meas.assignment]);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const freshTarget = useCallback((m: Mode, p: InchPrec, s: MmStep) => {
    const src = bagFor(sourceRef.current, m, p, s);
    sourceRef.current = src;
    return m === "inches" ? newInchTarget(p, src.bag) : newMetricTarget(s, src.bag);
  }, []);

  function resetQuestionState() {
    setUserPtr(null); setCorrectPtr(null);
    setAnswered(false); setCorrect(false);
    setWholeIn(""); setNumIn(""); setDenIn(""); setCmIn("");
    setInputError(false); setTyped(null); setUnsimplified(false);
  }

  function focusFirstField(tk: RulerTask) {
    if (tk === "take") setTimeout(() => firstFieldRef.current?.focus(), 50);
  }

  function startFresh(m: Mode, p: InchPrec, s: MmStep, tk: RulerTask) {
    clearTimer();
    setMode(m); setInchPrec(p); setMmStep(s); setTask(tk);
    const t = freshTarget(m, p, s);
    setTarget(t);
    meas.noteQuestionShown(t.label);
    resetQuestionState();
    setScore(0); setStrikes(0);
    setGameOver(false);
    focusFirstField(tk);
  }

  function nextQuestion(m: Mode, p: InchPrec, s: MmStep, tk: RulerTask) {
    resetQuestionState();
    const t = freshTarget(m, p, s);
    setTarget(t);
    meas.noteQuestionShown(t.label);
    focusFirstField(tk);
  }

  // Shared post-answer bookkeeping for both the click (Find) and typed (Take)
  // paths: session recording, practice strikes/high score, advance timers.
  function finishAnswer(isCorrect: boolean, answerLabel: string) {
    setAnswered(true);
    setCorrect(isCorrect);
    const res = meas.recordAnswer(isCorrect, { target: target.label, answer: answerLabel });
    const advance = () => nextQuestion(mode, inchPrec, mmStep, task);

    if (meas.playMode === "practice") {
      if (isCorrect) {
        const newScore = score + 1;
        setScore(newScore);
        if (userId) {
          // level slot: 0 inches·find, 1 metric·find, 2 inches·take, 3 metric·take
          const li = (mode === "inches" ? 0 : 1) + (task === "take" ? 2 : 0);
          const ci = mode === "inches"
            ? INCH_PRECS.findIndex(p => p.val === inchPrec)
            : MM_STEPS.findIndex(s => s.val === mmStep);
          upsertToolHighScore(userId, "meas-ruler", li, ci, newScore);
        }
        // Advance after short delay
        timerRef.current = setTimeout(advance, 1200);
      } else {
        const newStrikes = strikes + 1;
        setStrikes(newStrikes);
        if (newStrikes >= 3) {
          timerRef.current = setTimeout(() => setGameOver(true), 1800);
        } else {
          timerRef.current = setTimeout(advance, 1800);
        }
      }
    } else if (!res.sessionOver) {
      // sprint keeps feedback brief so the 60s clock isn't eaten by delays
      const delay = meas.playMode === "sprint" ? (isCorrect ? 700 : 1100) : (isCorrect ? 1200 : 1800);
      timerRef.current = setTimeout(advance, delay);
    }
  }

  // Find mode: click the tick that matches the target.
  function handleRulerClick(svgX: number) {
    if (task !== "find" || answered || gameOver || meas.sessionOver) return;
    const ptr = snapClick(svgX, mode, inchPrec, mmStep);
    if (!ptr) return;
    setUserPtr(ptr);

    const isCorrect = Math.abs(ptr.value - target.value) < 0.0001;
    const clickedLabel = mode === "inches"
      ? inchLabel(Math.round(ptr.value * inchPrec), inchPrec)
      : cmLabel(ptr.value);

    if (!isCorrect) {
      // Show correct answer on ruler (all modes)
      const cx = mode === "inches" ? valueToX_in(target.value) : valueToX_mm(target.value);
      setCorrectPtr({ x: cx, value: target.value });
    }
    finishAnswer(isCorrect, clickedLabel);
  }

  // Take mode: type the reading at the arrow.
  function handleTakeSubmit() {
    if (task !== "take" || answered || gameOver || meas.sessionOver) return;
    let ans: TypedAnswer | null;
    let isCorrect: boolean;
    if (mode === "inches") {
      ans = parseInchInput(wholeIn, numIn, denIn);
      if (!ans) { setInputError(true); return; }
      isCorrect = inchAnswerCorrect(ans, target.value, numIn, denIn);
      setUnsimplified(inchAnswerStatus(ans, target.value, numIn, denIn) === "unsimplified");
    } else {
      ans = parseCmInput(cmIn);
      if (!ans) { setInputError(true); return; }
      isCorrect = cmAnswerCorrect(ans, target.value);
    }
    setTyped(ans);
    finishAnswer(isCorrect, ans.label);
  }

  function onFieldKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); handleTakeSubmit(); }
  }
  function onFieldChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => { setInputError(false); setter(e.target.value); };
  }

  // Markers drawn on the ruler.
  const markers: Marker[] = [];
  if (task === "find") {
    if (correctPtr) markers.push({ x: correctPtr.x, color: GREEN });
    if (userPtr) markers.push({ x: userPtr.x, color: !answered ? BLUE : correct ? GREEN : RED });
  } else {
    const tx = mode === "inches" ? valueToX_in(target.value) : valueToX_mm(target.value);
    markers.push({ x: tx, color: !answered ? BLUE : correct ? GREEN : RED });
  }

  const fieldState = answered ? (correct ? "correct" : "wrong") : inputError ? "error" : "idle";
  const fieldsLocked = answered || gameOver || meas.sessionOver;

  const NAV_BTN: React.CSSProperties = {
    padding: "7px 14px", borderRadius: 10, border: "2px solid",
    fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all 120ms",
  };
  const navStyle = (active: boolean): React.CSSProperties => ({
    ...NAV_BTN,
    borderColor: active ? BLUE : "#e0e0e0",
    background:  active ? "#eff6ff" : "#f9f9f9",
    color:       active ? BLUE : "#666",
  });
  const GROUP_LABEL: React.CSSProperties = {
    fontSize: 12, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px",
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
              {task === "find"
                ? "Find: click the ruler at the measurement you're given."
                : "Take: read the arrow and type the measurement."}
              {meas.playMode === "practice" ? " 3 strikes and you're out!" : ""}
            </p>
          </div>

          <AssignmentErrorCard session={meas} />
          <AssignmentBanner session={meas} />

          {/* Settings bar */}
          {!meas.assignment && (
          <div style={{ ...CARD, padding: "14px 20px", marginBottom: 20,
            display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>

            <ModeSelector session={meas} color={BLUE}
              onSelect={() => startFresh(mode, inchPrec, mmStep, task)} />

            <div style={{ width: 1, height: 28, background: "#e5e7eb" }} />

            {/* Task: Find (click the tick) vs Take (type the reading) */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={GROUP_LABEL}>Task</span>
              {(["find", "take"] as RulerTask[]).map(tk => (
                <button key={tk} onClick={() => startFresh(mode, inchPrec, mmStep, tk)}
                  title={tk === "find" ? "You're given a measurement — click it on the ruler" : "An arrow marks the ruler — type the measurement"}
                  style={navStyle(task === tk)}>
                  {tk === "find" ? "Find" : "Take"}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 28, background: "#e5e7eb" }} />

            {/* Mode */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={GROUP_LABEL}>Mode</span>
              {(["inches", "metric"] as Mode[]).map(m => (
                <button key={m} onClick={() => startFresh(m, inchPrec, mmStep, task)}
                  style={navStyle(mode === m)}>
                  {m === "inches" ? "Inches" : "Metric"}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 28, background: "#e5e7eb" }} />

            {/* Precision */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={GROUP_LABEL}>Precision</span>
              {mode === "inches"
                ? INCH_PRECS.map(p => (
                  <button key={p.val} onClick={() => startFresh(mode, p.val, mmStep, task)}
                    style={navStyle(inchPrec === p.val)}>
                    {p.label}
                  </button>
                ))
                : MM_STEPS.map(s => (
                  <button key={s.val} onClick={() => startFresh(mode, inchPrec, s.val, task)}
                    style={navStyle(mmStep === s.val)}>
                    {s.label}
                  </button>
                ))
              }
            </div>
          </div>
          )}

          {/* Main game card */}
          {meas.sessionOver ? (
            <ResultScreen session={meas} color={BLUE} onPlayAgain={() => meas.restart()} />
          ) : gameOver ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 14 }}>💥</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>Game Over!</h2>
              <p style={{ fontSize: 18, color: "#333", marginBottom: 4 }}>
                Final score: <strong style={{ color: BLUE }}>{score}</strong>
              </p>
              <p style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 32 }}>
                {score === 0 ? "Keep practicing — you'll get it!" :
                 score < 5  ? "Good start! Try again." :
                 score < 10 ? "Nice work! Can you beat your score?" :
                 "Excellent — you're a measurement pro!"}
              </p>
              <button onClick={() => startFresh(mode, inchPrec, mmStep, task)}
                style={{ padding: "14px 40px", background: BLUE, color: "#fff",
                  border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                Play Again
              </button>
            </div>
          ) : (
            <div style={{ ...CARD, padding: "28px 24px 20px" }}>

              {meas.playMode === "sprint" && <SprintBar secondsLeft={meas.sprintSecondsLeft} />}
              {meas.playMode === "sprint" && !boardEligible && (
                <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#b45309",
                  background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8,
                  padding: "6px 10px", marginBottom: 14 }}>
                  Leaderboard sprints are {LEADERBOARD_SETTINGS.ruler!.label} — this run is practice only and won&apos;t count.
                </div>
              )}

              {/* ── Prompt: the target (Find) or the answer fields (Take) ── */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#888",
                  textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                  {task === "find" ? "Find this measurement" : "Take this measurement"}
                </div>

                {task === "find" ? (
                  <div style={{ fontSize: 48, fontWeight: 900, color: "#111",
                    fontFamily: "monospace", letterSpacing: "1px", lineHeight: 1 }}>
                    {target.label}
                  </div>
                ) : mode === "inches" ? (
                  // whole number + stacked fraction, sized like the Find prompt
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <input ref={firstFieldRef} value={wholeIn} onChange={onFieldChange(setWholeIn)}
                      onKeyDown={onFieldKey} disabled={fieldsLocked} aria-label="whole inches"
                      inputMode="numeric" placeholder="0" maxLength={2}
                      style={{ ...FIELD, width: 74, height: 76, fontSize: 40, border: fieldBorder(fieldState) }} />
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <input value={numIn} onChange={onFieldChange(setNumIn)}
                        onKeyDown={onFieldKey} disabled={fieldsLocked} aria-label="numerator"
                        inputMode="numeric" maxLength={2}
                        style={{ ...FIELD, width: 58, height: 36, fontSize: 22, border: fieldBorder(fieldState) }} />
                      <div style={{ width: 62, height: 3, background: "#111", borderRadius: 2 }} />
                      <input value={denIn} onChange={onFieldChange(setDenIn)}
                        onKeyDown={onFieldKey} disabled={fieldsLocked} aria-label="denominator"
                        inputMode="numeric" maxLength={2}
                        style={{ ...FIELD, width: 58, height: 36, fontSize: 22, border: fieldBorder(fieldState) }} />
                    </div>
                    <span style={{ fontSize: 40, fontWeight: 900, color: "#111", fontFamily: "monospace" }}>&quot;</span>
                    {!answered && (
                      <button onClick={handleTakeSubmit}
                        style={{ marginLeft: 10, padding: "12px 26px", background: BLUE, color: "#fff",
                          border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                        Check
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <input ref={firstFieldRef} value={cmIn} onChange={onFieldChange(setCmIn)}
                      onKeyDown={onFieldKey} disabled={fieldsLocked} aria-label="centimetres"
                      inputMode="decimal" placeholder="0.0" maxLength={5}
                      style={{ ...FIELD, width: 150, height: 76, fontSize: 40, border: fieldBorder(fieldState) }} />
                    <span style={{ fontSize: 28, fontWeight: 900, color: "#111", fontFamily: "monospace" }}>cm</span>
                    {!answered && (
                      <button onClick={handleTakeSubmit}
                        style={{ marginLeft: 10, padding: "12px 26px", background: BLUE, color: "#fff",
                          border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                        Check
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Ruler ── */}
              <div style={{ overflowX: "auto", paddingBottom: 4, marginBottom: 12,
                display: "flex", justifyContent: "center" }}>
                {mode === "inches"
                  ? <InchRuler prec={inchPrec} markers={markers}
                      interactive={task === "find" && !answered} onRulerClick={handleRulerClick} />
                  : <MetricRuler step={mmStep} markers={markers}
                      interactive={task === "find" && !answered} onRulerClick={handleRulerClick} />
                }
              </div>

              {/* ── Feedback message ── */}
              <div style={{ textAlign: "center", minHeight: 28, marginBottom: 20 }}>
                {answered && correct && (
                  <span style={{ fontSize: 16, fontWeight: 800, color: GREEN }}>✓ Correct!</span>
                )}
                {answered && !correct && task === "find" && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: RED }}>
                    ✗ The answer was <strong style={{ fontFamily: "monospace" }}>{target.label}</strong> — shown in green
                  </span>
                )}
                {answered && !correct && task === "take" && unsimplified && typed && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: RED }}>
                    ✗ <strong style={{ fontFamily: "monospace" }}>{typed.label}</strong> is the right spot, but the fraction
                    isn&apos;t simplified — the answer is <strong style={{ fontFamily: "monospace" }}>{target.label}</strong>
                  </span>
                )}
                {answered && !correct && task === "take" && !unsimplified && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: RED }}>
                    ✗ The arrow is at <strong style={{ fontFamily: "monospace" }}>{target.label}</strong>
                    {typed && <> — you typed <strong style={{ fontFamily: "monospace" }}>{typed.label}</strong></>}
                  </span>
                )}
                {!answered && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: inputError ? RED : "#aaa" }}>
                    {task === "find"
                      ? "Click the ruler to mark your answer"
                      : inputError
                        ? (mode === "inches" ? "Type a whole number, a fraction, or both" : "Type a number like 3.5")
                        : mode === "inches"
                          ? "Type the measurement at the blue arrow — whole inches and the fraction, then Enter"
                          : "Type the measurement at the blue arrow in centimetres, then Enter"}
                  </span>
                )}
              </div>

              {/* ── Score bar ── */}
              {meas.playMode !== "practice" ? (
                <ScoreHud session={meas} />
              ) : (
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
                        background: i < strikes ? RED : "#e5e7eb",
                        border: `2px solid ${i < strikes ? "#b91c1c" : "#d1d5db"}`,
                        transition: "background 250ms",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: i < strikes ? "#fff" : "transparent", fontWeight: 900,
                      }}>✕</div>
                    ))}
                  </div>
                </div>
              </div>
              )}

            </div>
          )}
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}

// useMeasurementSession reads useSearchParams, which requires a Suspense boundary.
export default function RulerGamePageRoot() {
  return (
    <Suspense fallback={null}>
      <RulerGamePage />
    </Suspense>
  );
}
