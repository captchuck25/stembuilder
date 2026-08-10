"use client";

// Student quiz taking page (M3). Reached from the dashboard's Quizzes section.
// The window and attempt limit are enforced by the submit API — this page
// only mirrors those rules for a friendly experience.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import SiteHeader from "@/app/components/SiteHeader";
import type { QuizQuestion, RevealMode } from "@/lib/quiz";

// Blockly only loads when a block-lab figure actually renders.
const BlockFigure = dynamic(() => import("@/app/tools/block-lab/BlockFigure"), { ssr: false });

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const ACCENT = "#9333ea";

interface TakingQuestion {
  question: string;
  options: [string, string, string, string];
  topic: string;
  difficulty: 1 | 2 | 3;
  blocksFigure?: string;
}

interface Detail {
  assignment: {
    id: string;
    opens_at: string | null;
    closes_at: string | null;
    state: "upcoming" | "open" | "closed";
    config: { attemptsAllowed: number; timerSeconds: number | null; passThreshold: number; revealMode: RevealMode };
  };
  quiz: { title: string; lab: string; questionCount: number };
  attempts: { score: number; total: number; created_at: string }[];
  canTake: boolean;
  questions?: TakingQuestion[];
  review?: { questions: QuizQuestion[]; lastAnswers: number[] };
  error?: string;
}

interface SubmitResult {
  score: number;
  total: number;
  pct: number;
  passed: boolean;
  review?: { questions: QuizQuestion[]; lastAnswers: number[] };
  revealMode: RevealMode;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtTime(s: string) {
  return new Date(s).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtClock(totalS: number) {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Review list — full questions with the student's answers marked. */
function ReviewList({ questions, answers, lab }: { questions: QuizQuestion[]; answers: number[]; lab: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {questions.map((q, i) => {
        const mine = answers[i];
        const right = mine === q.answer;
        return (
          <div key={i} style={{ padding: "14px 18px", borderRadius: 14,
            border: `2.5px solid ${right ? "#86efac" : "#fca5a5"}`, background: right ? "#f0fdf4" : "#fef2f2" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
              {right ? "✅" : "❌"} {i + 1}. {q.question}
            </div>
            {q.blocksFigure && lab === "block-lab" && <BlockFigure dsl={q.blocksFigure} />}
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {q.options.map((o, oi) => (
                <div key={oi} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13,
                  fontWeight: oi === q.answer ? 800 : 500,
                  background: oi === q.answer ? "#dcfce7" : oi === mine ? "#fee2e2" : "#fff",
                  border: `1.5px solid ${oi === q.answer ? "#86efac" : oi === mine ? "#fca5a5" : "#eee"}`,
                  color: "#333" }}>
                  {oi === q.answer ? "✓ " : oi === mine ? "✗ " : ""}{o}
                  {oi === mine && oi !== q.answer && <span style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700 }}> (your answer)</span>}
                </div>
              ))}
            </div>
            {q.explanation && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: "#555", background: "#fff", borderRadius: 8, padding: "8px 12px", border: "1.5px solid #eee" }}>
                💡 {q.explanation}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StudentQuizPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<"intro" | "taking" | "done">("intro");
  // Display order: shuffled question indexes; per-question shuffled option indexes.
  const [qOrder, setQOrder] = useState<number[]>([]);
  const [optOrders, setOptOrders] = useState<number[][]>([]);
  const [chosen, setChosen] = useState<number[]>([]); // original option idx per original question idx, -1 = blank
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") { router.push("/"); return; }
    fetch(`/api/quiz-assignments/${assignmentId}`)
      .then((r) => r.json())
      .then((d: Detail) => {
        if (d.error) setLoadError(d.error);
        else setDetail(d);
      })
      .catch(() => setLoadError("Couldn't load this quiz."));
  }, [status, assignmentId, router]);

  function start() {
    if (!detail?.questions) return;
    const n = detail.questions.length;
    setQOrder(shuffle([...Array(n).keys()]));
    setOptOrders(detail.questions.map(() => shuffle([0, 1, 2, 3])));
    setChosen(new Array(n).fill(-1));
    startedAtRef.current = Date.now();
    if (detail.assignment.config.timerSeconds) setSecondsLeft(detail.assignment.config.timerSeconds);
    setPhase("taking");
  }

  async function submit(auto = false) {
    if (!detail || submittingRef.current) return;
    const blanks = chosen.filter((c) => c === -1).length;
    if (!auto && blanks > 0 && !window.confirm(`You left ${blanks} question${blanks === 1 ? "" : "s"} unanswered — they count as wrong. Submit anyway?`))
      return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/quiz-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          answers: chosen,
          durationS: Math.round((Date.now() - startedAtRef.current) / 1000),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      setResult(data);
      setPhase("done");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed");
      submittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  // Timer: count down, auto-submit at zero.
  useEffect(() => {
    if (phase !== "taking" || secondsLeft === null) return;
    if (secondsLeft <= 0) { void submit(true); return; }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  const answered = useMemo(() => chosen.filter((c) => c !== -1).length, [chosen]);

  const shell = (inner: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "url('/bg-tools-pattern.png') center/420px repeat, #4a4a4a" }}>
      <SiteHeader />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 18px 60px" }}>{inner}</div>
    </div>
  );

  if (loadError) {
    return shell(
      <div style={{ ...CARD, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>🤔</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#111", marginTop: 8 }}>{loadError}</div>
        <button onClick={() => router.push("/student/dashboard")}
          style={{ marginTop: 16, padding: "10px 24px", borderRadius: 999, border: "none", background: "#111", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
          Back to Dashboard
        </button>
      </div>
    );
  }
  if (!detail) {
    return shell(<div style={{ ...CARD, padding: 40, textAlign: "center", color: "#888", fontWeight: 700 }}>Loading quiz…</div>);
  }

  const { assignment, quiz, attempts } = detail;
  const cfg = assignment.config;
  const attemptsLeft = cfg.attemptsAllowed - attempts.length;
  const best = attempts.length ? Math.max(...attempts.map((a) => Math.round((a.score / a.total) * 100))) : null;

  // ── Result screen (right after submitting) ──
  if (phase === "done" && result) {
    return shell(
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ ...CARD, padding: "32px 36px", textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>{result.passed ? "🎉" : "💪"}</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111", margin: "8px 0 4px" }}>
            {result.score} / {result.total} ({result.pct}%)
          </h1>
          <div style={{ fontSize: 14, fontWeight: 800, color: result.passed ? "#15803d" : "#b45309" }}>
            {result.passed ? `Passed — goal was ${cfg.passThreshold}%` : `Goal is ${cfg.passThreshold}% — ${attemptsLeft - 1 > 0 ? "you can try again!" : "keep practicing in the lab!"}`}
          </div>
          {!result.review && (
            <div style={{ fontSize: 12.5, color: "#666", marginTop: 10 }}>
              {result.revealMode === "after_close"
                ? "Correct answers unlock after the quiz window closes."
                : result.revealMode === "never"
                  ? "Your teacher will go over the answers in class."
                  : ""}
            </div>
          )}
          <button onClick={() => router.push("/student/dashboard")}
            style={{ marginTop: 18, padding: "10px 26px", borderRadius: 999, border: "none", background: "#111", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            Back to Dashboard
          </button>
        </div>
        {result.review && (
          <div style={{ ...CARD, padding: "24px 28px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 14px", color: "#111" }}>📖 Review</h2>
            <ReviewList questions={result.review.questions} answers={result.review.lastAnswers} lab={quiz.lab} />
          </div>
        )}
      </div>
    );
  }

  // ── Taking screen ──
  if (phase === "taking" && detail.questions) {
    const qs = detail.questions;
    return shell(
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...CARD, padding: "14px 22px", position: "sticky", top: 10, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>📝 {quiz.title}</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: answered === qs.length ? "#15803d" : "#666" }}>
              {answered}/{qs.length} answered
            </span>
            {secondsLeft !== null && (
              <span style={{ fontSize: 15, fontWeight: 900, fontFamily: "ui-monospace, monospace",
                color: secondsLeft <= 60 ? "#dc2626" : "#111",
                background: secondsLeft <= 60 ? "#fee2e2" : "#f3f4f6", borderRadius: 8, padding: "4px 12px" }}>
                ⏱ {fmtClock(Math.max(0, secondsLeft))}
              </span>
            )}
          </div>
        </div>

        {qOrder.map((qi, displayIdx) => {
          const q = qs[qi];
          return (
            <div key={qi} style={{ ...CARD, padding: "20px 24px" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>
                {displayIdx + 1}. {q.question}
              </div>
              {q.blocksFigure && quiz.lab === "block-lab" && <BlockFigure dsl={q.blocksFigure} />}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {optOrders[qi].map((oi) => {
                  const on = chosen[qi] === oi;
                  return (
                    <button key={oi}
                      onClick={() => setChosen((prev) => { const next = [...prev]; next[qi] = on ? -1 : oi; return next; })}
                      style={{ textAlign: "left", padding: "11px 16px", borderRadius: 12, fontSize: 14, fontWeight: on ? 800 : 600,
                        border: `2.5px solid ${on ? ACCENT : "#e5e7eb"}`, background: on ? "#faf5ff" : "#fff",
                        color: "#222", cursor: "pointer" }}>
                      {on ? "● " : "○ "}{q.options[oi]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{ ...CARD, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#666", fontWeight: 700 }}>
            {answered === qs.length ? "All answered — ready when you are." : `${qs.length - answered} still blank.`}
          </span>
          <button onClick={() => void submit()} disabled={submitting}
            style={{ padding: "12px 30px", borderRadius: 999, border: "none", cursor: submitting ? "wait" : "pointer",
              background: ACCENT, color: "#fff", fontWeight: 900, fontSize: 15 }}>
            {submitting ? "Submitting…" : "Submit Quiz"}
          </button>
        </div>
        {submitError && (
          <div style={{ padding: "10px 16px", borderRadius: 10, background: "#fee2e2", border: "2px solid #fca5a5",
            color: "#991b1b", fontSize: 13, fontWeight: 700 }}>⚠️ {submitError}</div>
        )}
      </div>
    );
  }

  // ── Intro / status screen ──
  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ ...CARD, padding: "32px 36px", textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>📝</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111", margin: "6px 0 4px" }}>{quiz.title}</h1>
        <div style={{ fontSize: 13.5, color: "#666", fontWeight: 600 }}>
          {quiz.questionCount} questions
          {cfg.timerSeconds ? ` · ⏱ ${Math.round(cfg.timerSeconds / 60)} minute limit` : " · untimed"}
          {` · goal ${cfg.passThreshold}%`}
        </div>
        {assignment.closes_at && assignment.state === "open" && (
          <div style={{ fontSize: 12.5, color: "#b45309", fontWeight: 700, marginTop: 6 }}>
            Closes {fmtTime(assignment.closes_at)}
          </div>
        )}

        {best !== null && (
          <div style={{ marginTop: 14, fontSize: 14, fontWeight: 800, color: best >= cfg.passThreshold ? "#15803d" : "#b45309" }}>
            Your best so far: {best}% {best >= cfg.passThreshold ? "✓" : ""}
            <span style={{ color: "#888", fontWeight: 600 }}> · {attempts.length} of {cfg.attemptsAllowed} attempt{cfg.attemptsAllowed === 1 ? "" : "s"} used</span>
          </div>
        )}

        {assignment.state === "upcoming" && (
          <div style={{ marginTop: 16, fontSize: 14, fontWeight: 800, color: "#1d4ed8" }}>
            🕐 Opens {assignment.opens_at ? fmtTime(assignment.opens_at) : "soon"} — check back then!
          </div>
        )}
        {assignment.state === "closed" && (
          <div style={{ marginTop: 16, fontSize: 14, fontWeight: 800, color: "#6b7280" }}>
            This quiz is closed.{attempts.length === 0 ? " No attempts were made." : ""}
          </div>
        )}
        {assignment.state === "open" && !detail.canTake && attempts.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 14, fontWeight: 800, color: "#6b7280" }}>
            All attempts used — nice work today.
          </div>
        )}

        {detail.canTake && (
          <button onClick={start}
            style={{ marginTop: 20, padding: "14px 40px", borderRadius: 999, border: "none",
              background: ACCENT, color: "#fff", fontWeight: 900, fontSize: 16, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(147,51,234,0.4)" }}>
            {attempts.length > 0 ? "Try Again" : "Start Quiz"} →
          </button>
        )}
        {detail.canTake && cfg.timerSeconds && (
          <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>The timer starts when you press Start.</div>
        )}
      </div>

      {detail.review && (
        <div style={{ ...CARD, padding: "24px 28px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 14px", color: "#111" }}>📖 Review your last attempt</h2>
          <ReviewList questions={detail.review.questions} answers={detail.review.lastAnswers} lab={quiz.lab} />
        </div>
      )}
    </div>
  );
}
