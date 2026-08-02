"use client";

// Shared plumbing for the four Measurement Lab games: play modes (practice /
// sprint / assignment), combo scoring, the sprint countdown, assignment
// loading + attempt submission, and the leaderboard UI. Instrument rendering
// and target generation stay in each game page — this module is deliberately
// input-agnostic (the ruler answers by clicking an SVG, the others by typing).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatLeaderboardName } from "./name-format";
import { normalizeAssignmentConfig } from "./constants";
import type { AssignmentConfig, MeasTool } from "./constants";

export { formatLeaderboardName, normalizeAssignmentConfig };
export type { AssignmentConfig, MeasTool };

// ─── Shared visual constants ──────────────────────────────────────────────────

export const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

// ─── Tools, tiers, scoring ────────────────────────────────────────────────────

export type PlayMode = "practice" | "sprint" | "assignment";
export type Tier = 1 | 2 | 3 | 4;

export const SPRINT_SECONDS = 60;
export const BASE_POINTS: Record<Tier, number> = { 1: 10, 2: 20, 3: 30, 4: 50 };

// Consecutive correct answers ramp the multiplier: ×1 (streak 0–4),
// ×2 (5–9), ×3 (10+). A miss resets the streak.
export function comboMultiplier(streak: number): number {
  return 1 + Math.min(2, Math.floor(streak / 5));
}

export interface SettingOption { value: string; label: string }

// Per-tool metadata: dashboard labels + the mode/precision vocabulary stored in
// assignment configs (each game maps these strings onto its internal state),
// and the difficulty tier that drives sprint base points.
export const TOOL_META: Record<MeasTool, {
  label: string;
  icon: string;
  color: string;
  modeLabel: string;
  modes: SettingOption[];
  precisionLabel: string | null;
  precisions: (mode: string) => SettingOption[];
  tier: (mode: string, precision: string) => Tier;
}> = {
  "ruler": {
    label: "Ruler", icon: "📏", color: "#2563eb",
    modeLabel: "Mode",
    modes: [
      { value: "inches", label: "Inches" },
      { value: "metric", label: "Metric" },
    ],
    precisionLabel: "Precision",
    precisions: (mode) => mode === "metric"
      ? [
        { value: "10", label: "cm" },
        { value: "5", label: "5 mm" },
        { value: "2", label: "2 mm" },
        { value: "1", label: "1 mm" },
      ]
      : [
        { value: "2", label: "½\"" },
        { value: "4", label: "¼\"" },
        { value: "8", label: "⅛\"" },
        { value: "16", label: "1/16\"" },
      ],
    tier: (mode, precision) => {
      if (mode === "metric") return precision === "10" ? 1 : precision === "1" ? 3 : 2;
      return precision === "8" ? 2 : precision === "16" ? 3 : 1;
    },
  },
  "dial-caliper": {
    label: "Dial Caliper", icon: "🔩", color: "#d97706",
    modeLabel: "Mode",
    modes: [
      { value: "read", label: "Read the Caliper" },
      { value: "set", label: "Set the Caliper" },
    ],
    precisionLabel: "Unit",
    precisions: () => [
      { value: "in", label: "Inches" },
      { value: "mm", label: "Millimeters" },
    ],
    tier: (mode) => (mode === "set" ? 4 : 3),
  },
  "graduated-cylinder": {
    label: "Graduated Cylinder", icon: "🧪", color: "#7c3aed",
    modeLabel: "Mode",
    modes: [
      { value: "read", label: "Read the Volume" },
      { value: "displace", label: "Displacement" },
    ],
    precisionLabel: "Cylinder",
    precisions: () => [
      { value: "0", label: "10 mL" },
      { value: "1", label: "25 mL" },
      { value: "2", label: "50 mL" },
      { value: "3", label: "100 mL" },
    ],
    tier: (mode, precision) => (mode === "displace" ? 3 : precision === "2" || precision === "3" ? 2 : 1),
  },
  "triple-beam": {
    label: "Triple Beam", icon: "⚖️", color: "#dc2626",
    modeLabel: "Mode",
    modes: [
      { value: "read", label: "Read the Balance" },
      { value: "balance", label: "Balance It" },
    ],
    precisionLabel: null,
    precisions: () => [],
    tier: (mode) => (mode === "balance" ? 3 : 2),
  },
};

export const MEAS_TOOLS = Object.keys(TOOL_META) as MeasTool[];

// ─── Assignment types ─────────────────────────────────────────────────────────

export interface MeasurementAssignment {
  id: string;
  class_id: string;
  title: string;
  tool: MeasTool;
  config: AssignmentConfig;
}

interface MissedEntry { q: number; target: string; answer: string }

// ─── The session hook ─────────────────────────────────────────────────────────
//
// Page integration contract:
//  * call recordAnswer(correct, {target, answer}) wherever the page already
//    decides correctness; skip strikes + upsertToolHighScore when
//    playMode !== "practice"; skip scheduling the advance timeout when the
//    returned sessionOver is true.
//  * call noteQuestionShown(targetLabel) whenever a new question is displayed
//    (in nextQuestion / startFresh) — this drives the per-question assignment
//    timer and remembers the target for timeout misses.
//  * when `assignment` becomes non-null, apply assignment.config to the page's
//    settings and startFresh.
//  * render ResultScreen when sessionOver is true.
//  * the page must be wrapped in <Suspense> (this hook uses useSearchParams).

export function useMeasurementSession(opts: {
  tool: MeasTool;
  getTier: () => Tier;
  onAdvance: () => void;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignment");

  const [playMode, setPlayMode] = useState<PlayMode>("practice");
  const [assignment, setAssignment] = useState<MeasurementAssignment | null>(null);
  const [assignmentError, setAssignmentError] = useState<{ kind: "load" } | { kind: "wrong-tool"; tool: string } | null>(null);

  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const [sprintSecondsLeft, setSprintSecondsLeft] = useState<number | null>(null);
  const [sprintOver, setSprintOver] = useState(false);
  const [runResult, setRunResult] = useState<{ best: number; improved: boolean } | null>(null);

  const [questionIdx, setQuestionIdx] = useState(0); // answered so far (0-based next question)
  const [correctCount, setCorrectCount] = useState(0);
  const [assignmentDone, setAssignmentDone] = useState(false);
  const [questionSecondsLeft, setQuestionSecondsLeft] = useState<number | null>(null);
  const [attemptSave, setAttemptSave] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const pointsRef = useRef(0);
  const missedRef = useRef<MissedEntry[]>([]);
  const startedAtRef = useRef(0);
  const targetLabelRef = useRef("");
  // Mirrors assignmentDone for calls that land in the same tick as a reset
  // (e.g. restart() → onAdvance → noteQuestionShown runs before re-render).
  const doneRef = useRef(false);
  const sprintTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sprintEndRef = useRef(0);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopSprintTimer() {
    if (sprintTimerRef.current) { clearInterval(sprintTimerRef.current); sprintTimerRef.current = null; }
  }
  function stopQuestionTimer() {
    if (questionTimerRef.current) { clearInterval(questionTimerRef.current); questionTimerRef.current = null; }
    setQuestionSecondsLeft(null);
  }
  useEffect(() => () => { stopSprintTimer(); stopQuestionTimer(); }, []);

  // Timer callbacks fire from intervals — route them through a latest-ref so
  // they never see stale state.
  const onSprintEnd = () => {
    stopSprintTimer();
    setSprintSecondsLeft(0);
    setSprintOver(true);
    const finalPoints = pointsRef.current;
    if (finalPoints > 0) {
      setRunResult(null);
      fetch("/api/measurement-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: optsRef.current.tool, points: finalPoints }),
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => { if (data) setRunResult({ best: data.best, improved: data.improved }); })
        .catch(() => {});
    }
  };
  const onSprintEndRef = useRef(onSprintEnd);
  onSprintEndRef.current = onSprintEnd;

  const onQuestionTimeout = () => {
    const res = recordAnswer(false, { answer: "(timeout)" });
    if (!res.sessionOver) optsRef.current.onAdvance();
  };
  const onQuestionTimeoutRef = useRef(onQuestionTimeout);
  onQuestionTimeoutRef.current = onQuestionTimeout;

  function startSprintTimer() {
    stopSprintTimer();
    sprintEndRef.current = Date.now() + SPRINT_SECONDS * 1000;
    setSprintSecondsLeft(SPRINT_SECONDS);
    sprintTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((sprintEndRef.current - Date.now()) / 1000);
      if (remaining <= 0) onSprintEndRef.current();
      else setSprintSecondsLeft(remaining);
    }, 250);
  }

  function startQuestionTimer(seconds: number) {
    stopQuestionTimer();
    const end = Date.now() + seconds * 1000;
    setQuestionSecondsLeft(seconds);
    questionTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining <= 0) {
        stopQuestionTimer();
        onQuestionTimeoutRef.current();
      } else setQuestionSecondsLeft(remaining);
    }, 250);
  }

  // ── Assignment loading from ?assignment= ──
  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/measurement-assignments/${assignmentId}`);
        if (!res.ok) { if (!cancelled) setAssignmentError({ kind: "load" }); return; }
        const data = await res.json();
        const a = data.assignment ?? data;
        if (cancelled) return;
        if (a.tool !== optsRef.current.tool) { setAssignmentError({ kind: "wrong-tool", tool: a.tool }); return; }
        setAssignmentError(null);
        setAssignment({ ...a, config: normalizeAssignmentConfig(a.config) });
        setPlayMode("assignment");
        startedAtRef.current = Date.now();
      } catch {
        if (!cancelled) setAssignmentError({ kind: "load" });
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId]);

  function resetCounters() {
    setPoints(0); pointsRef.current = 0;
    setStreak(0); setBestStreak(0);
    setQuestionIdx(0); setCorrectCount(0);
    missedRef.current = [];
    setAssignmentDone(false);
    doneRef.current = false;
    setAttemptSave("idle");
    setSprintOver(false);
    setRunResult(null);
    startedAtRef.current = Date.now();
  }

  function selectMode(m: "practice" | "sprint") {
    if (assignment) return; // settings are locked to the assignment
    stopSprintTimer();
    stopQuestionTimer();
    setPlayMode(m);
    resetCounters();
    if (m === "sprint") startSprintTimer();
    else setSprintSecondsLeft(null);
  }

  // Restart the current mode (sprint "Play Again" / assignment "Try Again").
  function restart() {
    stopSprintTimer();
    stopQuestionTimer();
    resetCounters();
    if (playMode === "sprint") startSprintTimer();
    optsRef.current.onAdvance();
  }

  function submitAttempt(finalCorrect: number, total: number) {
    if (!assignment) return;
    setAttemptSave("saving");
    const durationS = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    fetch("/api/measurement-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: assignment.id,
        correct: finalCorrect,
        total,
        durationS,
        missed: missedRef.current,
      }),
    })
      .then(res => setAttemptSave(res.ok ? "saved" : "error"))
      .catch(() => setAttemptSave("error"));
  }

  function recordAnswer(correct: boolean, detail?: { target?: string; answer?: string }): { sessionOver: boolean } {
    if (playMode === "practice") {
      if (correct) {
        const s = streak + 1;
        setStreak(s);
        setBestStreak(b => Math.max(b, s));
      } else setStreak(0);
      return { sessionOver: false };
    }

    if (playMode === "sprint") {
      if (sprintOver) return { sessionOver: true };
      if (correct) {
        const gained = BASE_POINTS[optsRef.current.getTier()] * comboMultiplier(streak);
        const np = points + gained;
        setPoints(np);
        pointsRef.current = np;
        const s = streak + 1;
        setStreak(s);
        setBestStreak(b => Math.max(b, s));
      } else setStreak(0);
      return { sessionOver: false };
    }

    // assignment
    if (!assignment || assignmentDone || doneRef.current) return { sessionOver: true };
    stopQuestionTimer();
    const answered = questionIdx + 1;
    const finalCorrect = correctCount + (correct ? 1 : 0);
    if (correct) {
      setCorrectCount(finalCorrect);
    } else {
      missedRef.current.push({
        q: answered,
        target: detail?.target ?? targetLabelRef.current,
        answer: detail?.answer ?? "",
      });
    }
    setQuestionIdx(answered);
    const total = assignment.config.questionCount;
    if (answered >= total) {
      setAssignmentDone(true);
      doneRef.current = true;
      submitAttempt(finalCorrect, total);
      return { sessionOver: true };
    }
    return { sessionOver: false };
  }

  function noteQuestionShown(targetLabel: string) {
    targetLabelRef.current = targetLabel;
    if (playMode === "assignment" && assignment && !doneRef.current && assignment.config.timerSeconds) {
      startQuestionTimer(assignment.config.timerSeconds);
    }
  }

  const sessionOver = sprintOver || assignmentDone;

  return {
    playMode, selectMode, restart,
    assignment, assignmentError,
    points, streak, bestStreak,
    multiplier: comboMultiplier(streak),
    sprintSecondsLeft, sprintOver, runResult,
    questionIdx, correctCount, assignmentDone, questionSecondsLeft, attemptSave,
    sessionOver,
    recordAnswer, noteQuestionShown,
  };
}

export type MeasurementSession = ReturnType<typeof useMeasurementSession>;

// ─── UI components ────────────────────────────────────────────────────────────

const PILL: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 10, border: "2px solid",
  fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all 120ms",
};

const HUD_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: "#aaa",
  textTransform: "uppercase", letterSpacing: "0.5px",
};

export function ModeSelector({ session, color, onSelect }: {
  session: MeasurementSession;
  color: string;
  onSelect?: (mode: "practice" | "sprint") => void;  // page-side reset (startFresh)
}) {
  if (session.assignment) return null;
  const modes: { value: "practice" | "sprint"; label: string }[] = [
    { value: "practice", label: "Practice" },
    { value: "sprint", label: "⏱ Sprint" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={HUD_LABEL}>Play</span>
      {modes.map(m => (
        <button key={m.value} onClick={() => { session.selectMode(m.value); onSelect?.(m.value); }}
          style={{ ...PILL,
            borderColor: session.playMode === m.value ? color : "#e0e0e0",
            background: session.playMode === m.value ? "#f5f5f4" : "#f9f9f9",
            color: session.playMode === m.value ? color : "#666",
          }}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function SprintBar({ secondsLeft }: { secondsLeft: number | null }) {
  if (secondsLeft === null) return null;
  const frac = Math.max(0, Math.min(1, secondsLeft / SPRINT_SECONDS));
  const urgent = secondsLeft <= 10;
  return (
    <div style={{ height: 10, borderRadius: 6, background: "#f0f0f0", overflow: "hidden", marginBottom: 14 }}>
      <div style={{
        height: "100%", width: `${frac * 100}%`,
        background: urgent ? "#dc2626" : "#16a34a",
        transition: "width 250ms linear, background 300ms",
      }} />
    </div>
  );
}

// Score strip for sprint + assignment modes (the practice score/strikes strip
// in each page stays as-is).
export function ScoreHud({ session }: { session: MeasurementSession }) {
  const s = session;
  if (s.playMode === "sprint") {
    const urgent = (s.sprintSecondsLeft ?? 99) <= 10;
    return (
      <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: 14,
        display: "flex", gap: 32, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={HUD_LABEL}>Time</span>
          <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, fontFamily: "monospace",
            color: urgent ? "#dc2626" : "#111" }}>
            {s.sprintSecondsLeft ?? SPRINT_SECONDS}s
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={HUD_LABEL}>Points</span>
          <span style={{ fontSize: 32, fontWeight: 900, color: "#111", lineHeight: 1 }}>{s.points}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={HUD_LABEL}>Combo</span>
          <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1,
            color: s.multiplier >= 3 ? "#d97706" : s.multiplier === 2 ? "#16a34a" : "#111" }}>
            ×{s.multiplier}
          </span>
          {s.streak > 0 && (
            <span style={{ fontSize: 13, fontWeight: 800, color: "#16a34a" }}>{s.streak}🔥</span>
          )}
        </div>
      </div>
    );
  }
  if (s.playMode === "assignment" && s.assignment) {
    const total = s.assignment.config.questionCount;
    return (
      <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: 14,
        display: "flex", gap: 32, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={HUD_LABEL}>Question</span>
          <span style={{ fontSize: 32, fontWeight: 900, color: "#111", lineHeight: 1 }}>
            {Math.min(s.questionIdx + 1, total)}<span style={{ fontSize: 18, color: "#aaa" }}>/{total}</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={HUD_LABEL}>Correct</span>
          <span style={{ fontSize: 32, fontWeight: 900, color: "#16a34a", lineHeight: 1 }}>{s.correctCount}</span>
        </div>
        {s.questionSecondsLeft !== null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={HUD_LABEL}>Time</span>
            <span style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, fontFamily: "monospace",
              color: s.questionSecondsLeft <= 5 ? "#dc2626" : "#111" }}>
              {s.questionSecondsLeft}s
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// Banner shown above the game while an assignment is active.
export function AssignmentBanner({ session }: { session: MeasurementSession }) {
  const a = session.assignment;
  if (!a) return null;
  return (
    <div style={{ ...CARD, padding: "12px 20px", marginBottom: 16,
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      borderColor: "#0d9488" }}>
      <span style={{ fontSize: 20 }}>📋</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: "#111" }}>{a.title}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>
          {a.config.questionCount} questions · goal {a.config.passThreshold}/{a.config.questionCount} correct
          {a.config.timerSeconds ? ` · ${a.config.timerSeconds}s per question` : ""}
        </div>
      </div>
      <Link href="/student/dashboard" style={{ fontSize: 12, fontWeight: 700, color: "#0d9488" }}>
        ← Dashboard
      </Link>
    </div>
  );
}

// Shown when ?assignment= failed to load or points at a different instrument.
export function AssignmentErrorCard({ session }: { session: MeasurementSession }) {
  const err = session.assignmentError;
  if (!err) return null;
  return (
    <div style={{ ...CARD, padding: "16px 22px", marginBottom: 16, borderColor: "#dc2626" }}>
      {err.kind === "wrong-tool" ? (
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
          This assignment is for the {TOOL_META[err.tool as MeasTool]?.label ?? err.tool} game.{" "}
          <Link href={`/tools/measurement-lab/${err.tool}${typeof window !== "undefined" ? window.location.search : ""}`}
            style={{ color: "#0d9488" }}>
            Go there →
          </Link>
        </div>
      ) : (
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
          Couldn&apos;t load this assignment. It may have been removed, or you may need to{" "}
          <Link href="/login" style={{ color: "#0d9488" }}>sign in</Link>.
        </div>
      )}
    </div>
  );
}

export function ResultScreen({ session, color, onPlayAgain }: {
  session: MeasurementSession;
  color: string;
  onPlayAgain: () => void;
}) {
  const s = session;
  if (s.playMode === "sprint") {
    return (
      <div style={{ ...CARD, padding: "56px 40px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>⏱️</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>Time&apos;s Up!</h2>
        <p style={{ fontSize: 18, color: "#333", marginBottom: 4 }}>
          Sprint score: <strong style={{ color }}>{s.points}</strong>
        </p>
        <p style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 8 }}>
          Best combo ×{comboMultiplier(s.bestStreak)} ({s.bestStreak} in a row)
        </p>
        <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 32, minHeight: 18,
          color: s.runResult?.improved ? "#16a34a" : "#888" }}>
          {s.points === 0 ? "Score a point to get on the board!"
            : !s.runResult ? " "
            : s.runResult.improved ? "🏆 New personal best — check the leaderboard!"
            : `Personal best: ${s.runResult.best}`}
        </p>
        <button onClick={onPlayAgain}
          style={{ padding: "14px 40px", background: color, color: "#fff",
            border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          Play Again
        </button>
      </div>
    );
  }

  // assignment
  const a = s.assignment;
  if (!a) return null;
  const total = a.config.questionCount;
  const passed = s.correctCount >= a.config.passThreshold;
  return (
    <div style={{ ...CARD, padding: "56px 40px", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 14 }}>{passed ? "🎉" : "📚"}</div>
      <h2 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>
        {passed ? "Assignment Complete!" : "Keep Practicing!"}
      </h2>
      <p style={{ fontSize: 34, fontWeight: 900, color: passed ? "#16a34a" : "#dc2626", margin: "0 0 4px" }}>
        {s.correctCount}/{total}
      </p>
      <p style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 8 }}>
        Goal: {a.config.passThreshold}/{total} correct
      </p>
      <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 28, minHeight: 16,
        color: s.attemptSave === "error" ? "#dc2626" : "#888" }}>
        {s.attemptSave === "saving" ? "Saving your result…"
          : s.attemptSave === "saved" ? "✓ Result saved — your teacher can see it"
          : s.attemptSave === "error" ? "Couldn't save this attempt — check your connection and try again"
          : " "}
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={onPlayAgain}
          style={{ padding: "14px 36px", background: color, color: "#fff",
            border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          Try Again
        </button>
        <Link href="/student/dashboard"
          style={{ padding: "14px 36px", background: "#f3f4f6", color: "#333",
            border: "2px solid #e5e7eb", borderRadius: 12, fontSize: 16, fontWeight: 800,
            textDecoration: "none", display: "inline-block" }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

// ─── Leaderboards ─────────────────────────────────────────────────────────────

export interface LeaderboardData {
  leaderboardEnabled: boolean;
  boards: Partial<Record<MeasTool, { name: string; points: number }[]>>;
  overall: { name: string; points: number }[];
}

type BoardTab = "overall" | MeasTool;

// Presentational: renders one leaderboard dataset with instrument tabs.
// Used by the hub page (per class) and the teacher class page.
export function LeaderboardBoards({ data, accent = "#0d9488" }: { data: LeaderboardData; accent?: string }) {
  const [tab, setTab] = useState<BoardTab>("overall");
  const rows = tab === "overall" ? data.overall : (data.boards[tab] ?? []);
  const tabs: { value: BoardTab; label: string }[] = [
    { value: "overall", label: "🏆 Overall" },
    ...MEAS_TOOLS.map(t => ({ value: t as BoardTab, label: `${TOOL_META[t].icon} ${TOOL_META[t].label}` })),
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            style={{ ...PILL, padding: "6px 12px", fontSize: 11,
              borderColor: tab === t.value ? accent : "#e0e0e0",
              background: tab === t.value ? "#f0fdfa" : "#f9f9f9",
              color: tab === t.value ? accent : "#666",
            }}>
            {t.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: "#999", padding: "14px 4px" }}>
          No sprint scores yet — play ⏱ Sprint mode in any instrument to get on the board!
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "8px 10px", width: 44, fontSize: 15, fontWeight: 900,
                  color: i === 0 ? "#d97706" : i === 1 ? "#6b7280" : i === 2 ? "#b45309" : "#bbb" }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 14, fontWeight: 700, color: "#111" }}>{r.name}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 15, fontWeight: 900, color: accent }}>
                  {r.points.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Self-fetching hub-page panel: one board card per class the signed-in student
// is enrolled in. Renders nothing when signed out, not enrolled anywhere, or
// every class has leaderboards disabled.
export function StudentLeaderboards() {
  const [boards, setBoards] = useState<{ classId: string; className: string; data: LeaderboardData }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/student/classes");
        if (!res.ok) return;
        const classes: { class: { id: string; name: string } }[] = await res.json();
        const results = await Promise.all(
          classes.map(async c => {
            const r = await fetch(`/api/measurement-leaderboard?classId=${c.class.id}`);
            if (!r.ok) return null;
            const data: LeaderboardData = await r.json();
            if (!data.leaderboardEnabled) return null;
            return { classId: c.class.id, className: c.class.name, data };
          })
        );
        if (!cancelled) setBoards(results.filter((b): b is NonNullable<typeof b> => b !== null));
      } catch { /* signed out or offline — stay hidden */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!boards?.length) return null;
  return (
    <div style={{ marginTop: 32 }}>
      {boards.map(b => (
        <div key={b.classId} style={{ ...CARD, padding: "20px 24px", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", margin: "0 0 12px" }}>
            🏁 Sprint Leaderboard — {b.className}
          </h2>
          <LeaderboardBoards data={b.data} />
        </div>
      ))}
    </div>
  );
}
