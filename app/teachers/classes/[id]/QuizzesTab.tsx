"use client";

// Quizzes tab of the class console (M2). Pro/trial/district only — the parent
// page hides the tab for free teachers and every API route re-checks the plan.
// Flow: list (assignments + my quizzes) → builder (lab → units → pick/write
// questions → save frozen snapshot) → assign (window + config).

import { useEffect, useMemo, useState } from "react";
import { getBankForUnits, getTopics, type BankQuestion, type QuizLab } from "@/lib/quiz-bank";
import { QUIZ_LABS, windowState, type QuizQuestion, type RevealMode } from "@/lib/quiz";
import { UNITS as ELEC_UNITS } from "@/app/tools/electronics-lab/units";
import { UNITS as BLOCK_UNITS } from "@/app/tools/block-lab/units";
import { LEVELS as PY_LEVELS } from "@/app/tools/code-lab/python/levels";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const ACCENT = "#9333ea";

function unitLabels(lab: QuizLab): string[] {
  if (lab === "electronics-lab") return ELEC_UNITS.map((u, i) => `Unit ${i + 1} — ${u.title}`);
  if (lab === "block-lab") return BLOCK_UNITS.map((u, i) => `Unit ${i + 1} — ${u.title}`);
  return PY_LEVELS.map((l, i) => `Level ${i + 1} — ${l.title}`);
}

interface TeacherQuestionRow {
  id: string;
  lab: QuizLab;
  unit_idx: number;
  question: QuizQuestion;
  forked_from: string | null;
}

interface QuizRow {
  id: string;
  title: string;
  lab: QuizLab;
  unit_idxs: number[];
  questions: QuizQuestion[];
  created_at: string;
}

interface AssignmentRow {
  id: string;
  quiz_id: string;
  opens_at: string | null;
  closes_at: string | null;
  config: { attemptsAllowed: number; timerSeconds: number | null; passThreshold: number; revealMode: RevealMode };
  quiz: { title: string; lab: QuizLab; questionCount: number; deleted_at: string | null } | null;
  attemptStudentCount: number;
}

/** A pickable question: from the curriculum bank or the teacher's library. */
interface Pickable {
  key: string; // bank id or teacher_questions uuid
  source: "bank" | "mine";
  unitIdx: number;
  q: QuizQuestion;
  row?: TeacherQuestionRow; // when source === 'mine'
}

const DIFF_LABEL: Record<1 | 2 | 3, string> = { 1: "Recall", 2: "Apply", 3: "Reason" };
const DIFF_COLOR: Record<1 | 2 | 3, string> = { 1: "#16a34a", 2: "#d97706", 3: "#dc2626" };

function DiffChip({ d }: { d: 1 | 2 | 3 }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: DIFF_COLOR[d], border: `1.5px solid ${DIFF_COLOR[d]}`,
      borderRadius: 99, padding: "1px 7px", whiteSpace: "nowrap" }}>{DIFF_LABEL[d]}</span>
  );
}

/** Lightweight preview of a Block Lab figure DSL (real Blockly renders in the
 *  student taking view — this is just so teachers can read the program). */
function BlocksPreview({ dsl }: { dsl: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, margin: "8px 0", alignItems: "flex-start" }}>
      {dsl.split("\n").map((line, i) => {
        const indent = (line.length - line.trimStart().length) / 2;
        const text = line.trim();
        if (!text) return null;
        const isControl = /^(repeat|while|if|define|else)/.test(text);
        return (
          <span key={i} style={{ marginLeft: indent * 22, padding: "3px 12px", borderRadius: 8,
            background: isControl ? "#7c3aed" : "#2563eb", color: "#fff", fontSize: 12, fontWeight: 700,
            fontFamily: "ui-monospace, monospace" }}>{text}</span>
        );
      })}
    </div>
  );
}

function fmtWindow(opensAt: string | null, closesAt: string | null): string {
  const f = (s: string) => new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (opensAt && closesAt) return `${f(opensAt)} → ${f(closesAt)}`;
  if (opensAt) return `Opens ${f(opensAt)}`;
  if (closesAt) return `Until ${f(closesAt)}`;
  return "Always open";
}

interface ResultsData {
  summary: { studentCount: number; avgBestPct: number; passRate: number; passThreshold: number };
  students: { student_id: string; name: string; bestPct: number; attempts: number; last_at: string; passed: boolean }[];
  questionStats: { idx: number; question: string; topic: string; difficulty: 1 | 2 | 3; answerText: string; missPct: number; wrongCount: number; commonWrong: string | null }[];
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const STATE_BADGE: Record<"upcoming" | "open" | "closed", { label: string; bg: string; fg: string }> = {
  upcoming: { label: "Upcoming", bg: "#eff6ff", fg: "#1d4ed8" },
  open: { label: "● Open now", bg: "#f0fdf4", fg: "#15803d" },
  closed: { label: "Closed", bg: "#f3f4f6", fg: "#6b7280" },
};

const BTN: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 999, border: "none", cursor: "pointer",
  fontWeight: 800, fontSize: 13,
};

const INPUT: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "2px solid #d1d5db", fontSize: 13, fontWeight: 600,
  color: "#111", background: "#fff", width: "100%", boxSizing: "border-box",
};

// Blank editor draft
interface Draft {
  id: string | null;          // teacher_questions uuid when editing own
  forkedFrom: string | null;  // bank id when forking
  unitIdx: number;
  question: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  blocksFigure: string;
}

export default function QuizzesTab({ classId }: { classId: string }) {
  const [view, setView] = useState<"list" | "builder">("list");

  // ── List data ──
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Builder state ──
  const [lab, setLab] = useState<QuizLab | null>(null);
  const [units, setUnits] = useState<Set<number>>(new Set());
  const [myQuestions, setMyQuestions] = useState<TeacherQuestionRow[]>([]);
  const [picked, setPicked] = useState<Map<string, Pickable>>(new Map());
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [diffFilter, setDiffFilter] = useState<0 | 1 | 2 | 3>(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [builderError, setBuilderError] = useState("");

  // ── Question editor ──
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState("");

  // ── Results (M4) ──
  const [expandedAssignId, setExpandedAssignId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ResultsData>>({});
  const [loadingResultsId, setLoadingResultsId] = useState<string | null>(null);

  // ── Assign modal ──
  const [assignQuiz, setAssignQuiz] = useState<QuizRow | null>(null);
  const [assignForm, setAssignForm] = useState({ opensAt: "", closesAt: "", attemptsAllowed: 1, timerMinutes: "", passThreshold: 60, revealMode: "after_close" as RevealMode });
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [qz, asg] = await Promise.all([
          fetch("/api/teacher/quizzes").then((r) => r.json()),
          fetch(`/api/teacher/quiz-assignments?classId=${classId}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (Array.isArray(qz)) setQuizzes(qz);
        if (Array.isArray(asg)) setAssignments(asg);
        if (!Array.isArray(qz) || !Array.isArray(asg)) setListError("Couldn't load quizzes.");
      } catch {
        if (!cancelled) setListError("Couldn't load quizzes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  async function loadMyQuestions(l: QuizLab) {
    const res = await fetch(`/api/teacher/quiz-questions?lab=${l}`);
    const data = await res.json();
    if (Array.isArray(data)) setMyQuestions(data);
  }

  function openBuilder() {
    setView("builder");
    setLab(null);
    setUnits(new Set());
    setPicked(new Map());
    setTopicFilter("all");
    setDiffFilter(0);
    setTitle("");
    setBuilderError("");
  }

  function chooseLab(l: QuizLab) {
    setLab(l);
    setUnits(new Set());
    setPicked(new Map());
    setTopicFilter("all");
    setMyQuestions([]);
    void loadMyQuestions(l);
  }

  // Pickable pool for the selected units, bank + mine, unit order.
  const pool: Pickable[] = useMemo(() => {
    if (!lab || units.size === 0) return [];
    const unitList = [...units].sort((a, b) => a - b);
    const bank = getBankForUnits(lab, unitList).map((b: BankQuestion): Pickable => ({
      key: b.id,
      source: "bank",
      unitIdx: b.unitIdx,
      q: {
        question: b.question, options: b.options, answer: b.answer, explanation: b.explanation,
        topic: b.topic, difficulty: b.difficulty, sourceId: b.id,
        ...(b.blocksFigure ? { blocksFigure: b.blocksFigure } : {}),
      },
    }));
    const mine = myQuestions
      .filter((m) => units.has(m.unit_idx))
      .map((m): Pickable => ({ key: m.id, source: "mine", unitIdx: m.unit_idx, q: { ...m.question, sourceId: m.id }, row: m }));
    return [...bank, ...mine].sort((a, b) => a.unitIdx - b.unitIdx);
  }, [lab, units, myQuestions]);

  const topics = useMemo(() => {
    if (!lab) return [];
    const set = new Set<string>();
    [...units].sort((a, b) => a - b).forEach((u) => getTopics(lab, u).forEach((t) => set.add(t)));
    myQuestions.filter((m) => units.has(m.unit_idx)).forEach((m) => set.add(m.question.topic));
    return [...set];
  }, [lab, units, myQuestions]);

  const visible = pool.filter((p) =>
    (topicFilter === "all" || p.q.topic === topicFilter) &&
    (diffFilter === 0 || p.q.difficulty === diffFilter));

  function togglePick(p: Pickable) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(p.key)) next.delete(p.key);
      else next.set(p.key, p);
      return next;
    });
  }

  function toggleUnit(u: number) {
    setUnits((prev) => {
      const next = new Set(prev);
      if (next.has(u)) {
        next.delete(u);
        // Drop picks from a deselected unit.
        setPicked((pp) => new Map([...pp].filter(([, v]) => v.unitIdx !== u)));
      } else next.add(u);
      return next;
    });
  }

  // ── Editor ──
  function startWrite() {
    const first = [...units].sort((a, b) => a - b)[0] ?? 0;
    setDraft({ id: null, forkedFrom: null, unitIdx: first, question: "", options: ["", "", "", ""],
      answer: 0, explanation: "", topic: "", difficulty: 2, blocksFigure: "" });
    setDraftError("");
  }
  function startFork(p: Pickable) {
    setDraft({ id: null, forkedFrom: p.key, unitIdx: p.unitIdx, question: p.q.question,
      options: [...p.q.options] as Draft["options"], answer: p.q.answer, explanation: p.q.explanation,
      topic: p.q.topic, difficulty: p.q.difficulty, blocksFigure: p.q.blocksFigure ?? "" });
    setDraftError("");
  }
  function startEditMine(p: Pickable) {
    setDraft({ id: p.key, forkedFrom: p.row?.forked_from ?? null, unitIdx: p.unitIdx, question: p.q.question,
      options: [...p.q.options] as Draft["options"], answer: p.q.answer, explanation: p.q.explanation,
      topic: p.q.topic, difficulty: p.q.difficulty, blocksFigure: p.q.blocksFigure ?? "" });
    setDraftError("");
  }

  async function saveDraft() {
    if (!lab || !draft) return;
    if (!draft.question.trim() || draft.options.some((o) => !o.trim())) {
      setDraftError("The question and all four answer choices are required.");
      return;
    }
    setDraftSaving(true);
    setDraftError("");
    const questionPayload = {
      question: draft.question, options: draft.options, answer: draft.answer,
      explanation: draft.explanation, topic: draft.topic || "My questions", difficulty: draft.difficulty,
      ...(draft.blocksFigure.trim() ? { blocksFigure: draft.blocksFigure } : {}),
    };
    try {
      const res = draft.id
        ? await fetch("/api/teacher/quiz-questions", { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: draft.id, question: questionPayload }) })
        : await fetch("/api/teacher/quiz-questions", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lab, unitIdx: draft.unitIdx, question: questionPayload, forkedFrom: draft.forkedFrom }) });
      const row = await res.json();
      if (!res.ok) throw new Error(row.error || "Save failed");
      await loadMyQuestions(lab);
      // Select the saved question (replacing the bank original when forking).
      setPicked((prev) => {
        const next = new Map(prev);
        if (draft.forkedFrom) next.delete(draft.forkedFrom);
        if (draft.id) next.delete(draft.id);
        next.set(row.id, { key: row.id, source: "mine", unitIdx: row.unit_idx, q: { ...row.question, sourceId: row.id }, row });
        return next;
      });
      setDraft(null);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setDraftSaving(false);
    }
  }

  async function deleteMine(p: Pickable) {
    if (!lab) return;
    if (!window.confirm("Delete this question from your library? Saved quizzes keep their copy.")) return;
    await fetch(`/api/teacher/quiz-questions?id=${p.key}`, { method: "DELETE" });
    setPicked((prev) => { const next = new Map(prev); next.delete(p.key); return next; });
    await loadMyQuestions(lab);
  }

  // ── Save quiz ──
  async function saveQuiz() {
    if (!lab || picked.size === 0) return;
    setSaving(true);
    setBuilderError("");
    try {
      const res = await fetch("/api/teacher/quizzes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Quiz",
          lab,
          unitIdxs: [...units],
          questions: [...picked.values()].map((p) => p.q),
        }),
      });
      const row = await res.json();
      if (!res.ok) throw new Error(row.error || "Save failed");
      setQuizzes((prev) => [row, ...prev]);
      setView("list");
    } catch (e) {
      setBuilderError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuiz(q: QuizRow) {
    if (!window.confirm(`Retire "${q.title}"? Existing grades stay visible; it can't be assigned again.`)) return;
    setDeletingId(q.id);
    await fetch(`/api/teacher/quizzes?id=${q.id}`, { method: "DELETE" });
    setQuizzes((prev) => prev.filter((x) => x.id !== q.id));
    setDeletingId(null);
  }

  // ── Assign ──
  function openAssign(q: QuizRow) {
    setAssignQuiz(q);
    setAssignForm({ opensAt: "", closesAt: "", attemptsAllowed: 1, timerMinutes: "", passThreshold: 60, revealMode: "after_close" });
    setAssignError("");
  }

  async function submitAssign() {
    if (!assignQuiz) return;
    setAssigning(true);
    setAssignError("");
    try {
      const timerMin = parseInt(assignForm.timerMinutes, 10);
      const res = await fetch("/api/teacher/quiz-assignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: assignQuiz.id,
          classId,
          opensAt: assignForm.opensAt ? new Date(assignForm.opensAt).toISOString() : null,
          closesAt: assignForm.closesAt ? new Date(assignForm.closesAt).toISOString() : null,
          config: {
            attemptsAllowed: assignForm.attemptsAllowed,
            timerSeconds: Number.isFinite(timerMin) && timerMin > 0 ? timerMin * 60 : null,
            passThreshold: assignForm.passThreshold,
            revealMode: assignForm.revealMode,
          },
        }),
      });
      const row = await res.json();
      if (!res.ok) throw new Error(row.error || "Assign failed");
      setAssignments((prev) => [{ ...row, quiz: { title: assignQuiz.title, lab: assignQuiz.lab, questionCount: assignQuiz.questions.length, deleted_at: null } }, ...prev]);
      setAssignQuiz(null);
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  }

  async function toggleResults(a: AssignmentRow) {
    if (expandedAssignId === a.id) { setExpandedAssignId(null); return; }
    setExpandedAssignId(a.id);
    if (!results[a.id]) {
      setLoadingResultsId(a.id);
      try {
        const res = await fetch(`/api/teacher/quiz-results?assignmentId=${a.id}`);
        const data = await res.json();
        if (res.ok) setResults((prev) => ({ ...prev, [a.id]: data }));
      } finally {
        setLoadingResultsId(null);
      }
    }
  }

  function exportResultsCSV(a: AssignmentRow, r: ResultsData) {
    downloadCSV(
      [
        ["Student", "Best %", "Passed", "Attempts", "Last taken"],
        ...r.students.map((s) => [s.name, String(s.bestPct), s.passed ? "yes" : "no", String(s.attempts), new Date(s.last_at).toLocaleString()]),
      ],
      `${(a.quiz?.title ?? "quiz").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results.csv`,
    );
  }

  async function deleteAssignment(a: AssignmentRow) {
    const warn = a.attemptStudentCount > 0
      ? `Remove this assignment? ${a.attemptStudentCount} student(s) have taken it — their grades for it will be DELETED.`
      : "Remove this assignment?";
    if (!window.confirm(warn)) return;
    await fetch(`/api/teacher/quiz-assignments?id=${a.id}`, { method: "DELETE" });
    setAssignments((prev) => prev.filter((x) => x.id !== a.id));
  }

  // ═══ Render ═══

  if (loading) {
    return <div style={{ ...CARD, padding: 40, textAlign: "center", color: "#888", fontWeight: 700 }}>Loading quizzes…</div>;
  }

  // ── Builder view ──
  if (view === "builder") {
    const labMeta = QUIZ_LABS.find((l) => l.id === lab);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ ...CARD, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: 0 }}>📝 New Quiz</h2>
              <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
                Pick a lab and the units to cover, then choose questions from the bank — or edit them and write your own.
              </p>
            </div>
            <button onClick={() => setView("list")} style={{ ...BTN, background: "#f3f4f6", color: "#374151" }}>← Back</button>
          </div>

          {/* Step 1: lab */}
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {QUIZ_LABS.map((l) => {
              const active = lab === l.id;
              return (
                <button key={l.id} onClick={() => chooseLab(l.id)}
                  style={{ ...BTN, display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
                    border: `2.5px solid ${active ? ACCENT : "#e5e7eb"}`,
                    background: active ? "#faf5ff" : "#fff", color: active ? ACCENT : "#374151" }}>
                  <span style={{ fontSize: 18 }}>{l.icon}</span>{l.label}
                </button>
              );
            })}
          </div>

          {/* Step 2: units (multi-select) */}
          {lab && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#666", marginBottom: 8 }}>
                {labMeta?.unitNoun}s to cover — pick one or several (a Units 1–3 review is one quiz):
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {unitLabels(lab).map((label, u) => {
                  const on = units.has(u);
                  return (
                    <button key={u} onClick={() => toggleUnit(u)}
                      style={{ ...BTN, padding: "7px 14px", fontSize: 12,
                        border: `2px solid ${on ? ACCENT : "#e5e7eb"}`,
                        background: on ? ACCENT : "#fff", color: on ? "#fff" : "#374151" }}>
                      {on ? "✓ " : ""}{label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: questions */}
        {lab && units.size > 0 && (
          <div style={{ ...CARD, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#111" }}>
                Question bank <span style={{ color: "#888", fontWeight: 700 }}>({visible.length} shown · {picked.size} selected)</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} style={{ ...INPUT, width: "auto" }}>
                  <option value="all">All topics</option>
                  {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={diffFilter} onChange={(e) => setDiffFilter(Number(e.target.value) as 0 | 1 | 2 | 3)} style={{ ...INPUT, width: "auto" }}>
                  <option value={0}>All difficulties</option>
                  <option value={1}>Recall</option>
                  <option value={2}>Apply</option>
                  <option value={3}>Reason</option>
                </select>
                <button onClick={startWrite} style={{ ...BTN, background: "#111", color: "#fff" }}>+ Write your own</button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
              {visible.map((p) => {
                const on = picked.has(p.key);
                const open = expandedKey === p.key;
                return (
                  <div key={p.key} style={{ borderRadius: 12, border: `2px solid ${on ? ACCENT : "#e5e7eb"}`,
                    background: on ? "#faf5ff" : "#fff", padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input type="checkbox" checked={on} onChange={() => togglePick(p)}
                        style={{ width: 18, height: 18, marginTop: 2, accentColor: ACCENT, cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedKey(open ? null : p.key)}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{p.q.question}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#6b7280", background: "#f3f4f6", borderRadius: 99, padding: "1px 8px" }}>
                            {labMeta?.unitNoun} {p.unitIdx + 1}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#0369a1", background: "#eff6ff", borderRadius: 99, padding: "1px 8px" }}>{p.q.topic}</span>
                          <DiffChip d={p.q.difficulty} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: p.source === "mine" ? "#a16207" : "#6b7280" }}>
                            {p.source === "mine" ? "✏️ Mine" : "📚 Curriculum"}
                          </span>
                          {p.q.blocksFigure && <span style={{ fontSize: 10, color: "#7c3aed", fontWeight: 800 }}>🧩 figure</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {p.source === "bank"
                          ? <button onClick={() => startFork(p)} title="Copy into your library and edit"
                              style={{ ...BTN, padding: "5px 12px", fontSize: 11, background: "#f3f4f6", color: "#374151" }}>Edit a copy</button>
                          : <>
                              <button onClick={() => startEditMine(p)} style={{ ...BTN, padding: "5px 12px", fontSize: 11, background: "#f3f4f6", color: "#374151" }}>Edit</button>
                              <button onClick={() => deleteMine(p)} style={{ ...BTN, padding: "5px 12px", fontSize: 11, background: "#fef2f2", color: "#b91c1c" }}>Delete</button>
                            </>}
                      </div>
                    </div>
                    {open && (
                      <div style={{ marginTop: 8, marginLeft: 28, fontSize: 12.5 }}>
                        {p.q.blocksFigure && <BlocksPreview dsl={p.q.blocksFigure} />}
                        {p.q.options.map((o, i) => (
                          <div key={i} style={{ padding: "4px 10px", borderRadius: 8, marginBottom: 3,
                            background: i === p.q.answer ? "#f0fdf4" : "#fafafa",
                            border: `1.5px solid ${i === p.q.answer ? "#86efac" : "#eee"}`,
                            color: "#333", fontWeight: i === p.q.answer ? 800 : 500 }}>
                            {i === p.q.answer ? "✓ " : ""}{o}
                          </div>
                        ))}
                        {p.q.explanation && <div style={{ color: "#666", marginTop: 6 }}><b>Why:</b> {p.q.explanation}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              {visible.length === 0 && (
                <div style={{ textAlign: "center", color: "#aaa", padding: "24px 0", fontSize: 13 }}>No questions match these filters.</div>
              )}
            </div>

            {/* Save bar */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, flexWrap: "wrap",
              borderTop: "2px solid #f3f4f6", paddingTop: 14 }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz title (e.g. Units 1–3 Review)"
                style={{ ...INPUT, flex: 1, minWidth: 220 }} />
              <button onClick={saveQuiz} disabled={saving || picked.size === 0}
                style={{ ...BTN, background: picked.size === 0 ? "#d1d5db" : ACCENT, color: "#fff",
                  cursor: picked.size === 0 ? "not-allowed" : "pointer", padding: "10px 24px" }}>
                {saving ? "Saving…" : `Save Quiz (${picked.size} question${picked.size === 1 ? "" : "s"})`}
              </button>
            </div>
            {builderError && <div style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>⚠️ {builderError}</div>}
          </div>
        )}

        {/* Question editor modal */}
        {draft && lab && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ ...CARD, padding: "22px 26px", width: 640, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 900 }}>
                {draft.id ? "Edit question" : draft.forkedFrom ? "Edit a copy (yours to keep)" : "Write a question"}
              </h3>
              <p style={{ fontSize: 11.5, color: "#888", margin: "0 0 12px" }}>
                Saved to your personal library — reuse it in any future quiz. Curriculum questions are never changed.
              </p>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Question</label>
              <textarea value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                rows={2} style={{ ...INPUT, marginBottom: 10, resize: "vertical" }} />
              {draft.options.map((o, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input type="radio" name="answer" checked={draft.answer === i}
                    onChange={() => setDraft({ ...draft, answer: i as Draft["answer"] })}
                    title="Correct answer" style={{ accentColor: "#16a34a", width: 16, height: 16, flexShrink: 0 }} />
                  <input value={o} placeholder={`Choice ${i + 1}${draft.answer === i ? " (correct)" : ""}`}
                    onChange={(e) => {
                      const options = [...draft.options] as Draft["options"];
                      options[i] = e.target.value;
                      setDraft({ ...draft, options });
                    }} style={INPUT} />
                </div>
              ))}
              <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Explanation (shown when answers are revealed)</label>
              <textarea value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                rows={2} style={{ ...INPUT, marginBottom: 10, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Topic</label>
                  <input value={draft.topic} placeholder="e.g. Ohm's Law" onChange={(e) => setDraft({ ...draft, topic: e.target.value })} style={INPUT} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Difficulty</label>
                  <select value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: Number(e.target.value) as Draft["difficulty"] })} style={{ ...INPUT, width: "auto" }}>
                    <option value={1}>Recall</option><option value={2}>Apply</option><option value={3}>Reason</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>{QUIZ_LABS.find((l) => l.id === lab)?.unitNoun}</label>
                  <select value={draft.unitIdx} disabled={!!draft.id}
                    onChange={(e) => setDraft({ ...draft, unitIdx: Number(e.target.value) })} style={{ ...INPUT, width: "auto" }}>
                    {unitLabels(lab).map((label, u) => <option key={u} value={u}>{label}</option>)}
                  </select>
                </div>
              </div>
              {lab === "block-lab" && (
                <>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>
                    Block figure (optional — one block per line, two spaces per indent: repeat 3 / move / turn right…)
                  </label>
                  <textarea value={draft.blocksFigure} onChange={(e) => setDraft({ ...draft, blocksFigure: e.target.value })}
                    rows={3} style={{ ...INPUT, marginBottom: 6, resize: "vertical", fontFamily: "ui-monospace, monospace" }} />
                  {draft.blocksFigure.trim() && <BlocksPreview dsl={draft.blocksFigure} />}
                </>
              )}
              {draftError && <div style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>⚠️ {draftError}</div>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => setDraft(null)} style={{ ...BTN, background: "#f3f4f6", color: "#374151" }}>Cancel</button>
                <button onClick={saveDraft} disabled={draftSaving} style={{ ...BTN, background: ACCENT, color: "#fff" }}>
                  {draftSaving ? "Saving…" : "Save to my library"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {listError && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: "#fee2e2", border: "2px solid #fca5a5",
          color: "#991b1b", fontSize: 13, fontWeight: 700 }}>⚠️ {listError}</div>
      )}

      {/* Assignments for this class */}
      <div style={{ ...CARD, padding: "20px 24px" }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>📋 Assigned to this class</h2>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 14px" }}>
          Students see an assigned quiz on their dashboard while its window is open. Answers reveal per each assignment&apos;s setting.
        </p>
        {assignments.length === 0 ? (
          <div style={{ textAlign: "center", color: "#aaa", padding: "18px 0", fontSize: 13 }}>
            Nothing assigned yet — build a quiz below, then hit Assign.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assignments.map((a) => {
              const st = windowState(a.opens_at, a.closes_at);
              const badge = STATE_BADGE[st];
              const labMeta = QUIZ_LABS.find((l) => l.id === a.quiz?.lab);
              const expanded = expandedAssignId === a.id;
              const r = results[a.id];
              return (
                <div key={a.id} style={{ borderRadius: 12, border: `2px solid ${expanded ? ACCENT : "#e5e7eb"}`, background: "#fafafa" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px" }}>
                    <span style={{ fontSize: 22 }}>{labMeta?.icon ?? "📝"}</span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                        {a.quiz?.title ?? "Quiz"}{a.quiz?.deleted_at && <span style={{ color: "#b91c1c", fontSize: 11 }}> (retired)</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {a.quiz?.questionCount ?? "?"} questions · {fmtWindow(a.opens_at, a.closes_at)}
                        {a.config.timerSeconds ? ` · ⏱ ${Math.round(a.config.timerSeconds / 60)} min` : ""}
                        {` · ${a.config.attemptsAllowed} attempt${a.config.attemptsAllowed === 1 ? "" : "s"}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: badge.fg, background: badge.bg, borderRadius: 99, padding: "4px 12px" }}>{badge.label}</span>
                    <span style={{ fontSize: 12, color: "#666", fontWeight: 700 }}>👤 {a.attemptStudentCount}</span>
                    <button onClick={() => toggleResults(a)}
                      style={{ ...BTN, padding: "6px 16px", fontSize: 12, background: expanded ? ACCENT : "#111", color: "#fff" }}>
                      {expanded ? "Hide results" : "Results"}
                    </button>
                    <button onClick={() => deleteAssignment(a)} style={{ ...BTN, padding: "6px 14px", fontSize: 12, background: "#fef2f2", color: "#b91c1c" }}>Remove</button>
                  </div>

                  {/* Results panel */}
                  {expanded && (
                    <div style={{ padding: "0 16px 16px", borderTop: "2px solid #eee" }}>
                      {loadingResultsId === a.id && !r ? (
                        <div style={{ textAlign: "center", color: "#888", padding: "18px 0", fontWeight: 700, fontSize: 13 }}>Loading results…</div>
                      ) : !r ? (
                        <div style={{ textAlign: "center", color: "#aaa", padding: "18px 0", fontSize: 13 }}>Couldn&apos;t load results.</div>
                      ) : r.students.length === 0 ? (
                        <div style={{ textAlign: "center", color: "#aaa", padding: "18px 0", fontSize: 13 }}>No attempts yet.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 14 }}>
                          {/* Summary + export */}
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            {[
                              { label: "Students", value: String(r.summary.studentCount) },
                              { label: "Class average", value: `${r.summary.avgBestPct}%` },
                              { label: `Passed (≥${r.summary.passThreshold}%)`, value: `${r.summary.passRate}%` },
                            ].map((chip) => (
                              <div key={chip.label} style={{ background: "#fff", border: "2px solid #e5e7eb", borderRadius: 12, padding: "8px 16px" }}>
                                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>{chip.label}</div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: "#111" }}>{chip.value}</div>
                              </div>
                            ))}
                            <div style={{ flex: 1 }} />
                            <button onClick={() => exportResultsCSV(a, r)}
                              style={{ ...BTN, padding: "7px 16px", fontSize: 12, background: "#f3f4f6", color: "#374151" }}>
                              ⬇ CSV
                            </button>
                          </div>

                          {/* Per-student table */}
                          <div style={{ background: "#fff", borderRadius: 12, border: "2px solid #e5e7eb", overflow: "hidden" }}>
                            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                              <thead>
                                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                                  {["Student", "Best", "Attempts", "Last taken", ""].map((h) => (
                                    <th key={h} style={{ padding: "8px 14px", fontWeight: 800, fontSize: 11.5, color: "#555" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {r.students.map((s) => (
                                  <tr key={s.student_id} style={{ borderTop: "1.5px solid #f3f4f6" }}>
                                    <td style={{ padding: "8px 14px", fontWeight: 700, color: "#111" }}>{s.name}</td>
                                    <td style={{ padding: "8px 14px", fontWeight: 900, color: s.passed ? "#15803d" : "#b45309" }}>{s.bestPct}%</td>
                                    <td style={{ padding: "8px 14px", color: "#666" }}>{s.attempts}</td>
                                    <td style={{ padding: "8px 14px", color: "#666" }}>
                                      {new Date(s.last_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                                    </td>
                                    <td style={{ padding: "8px 14px" }}>
                                      {s.passed
                                        ? <span style={{ fontSize: 11, fontWeight: 800, color: "#15803d" }}>✓ Passed</span>
                                        : <span style={{ fontSize: 11, fontWeight: 800, color: "#b45309" }}>Below goal</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Per-question miss rates (sorted hardest-first by the API) */}
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 900, color: "#111", marginBottom: 6 }}>
                              Hardest questions <span style={{ color: "#888", fontWeight: 600 }}>(by each student&apos;s last attempt)</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {r.questionStats.map((qs) => (
                                <div key={qs.idx} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff",
                                  border: `2px solid ${qs.missPct >= 50 ? "#fca5a5" : qs.missPct >= 25 ? "#fcd34d" : "#e5e7eb"}`,
                                  borderRadius: 10, padding: "8px 14px" }}>
                                  <div style={{ minWidth: 60, textAlign: "center" }}>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: qs.missPct >= 50 ? "#dc2626" : qs.missPct >= 25 ? "#b45309" : "#15803d" }}>
                                      {qs.missPct}%
                                    </div>
                                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "#999", textTransform: "uppercase" }}>missed</div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111" }}>{qs.question}</div>
                                    <div style={{ fontSize: 11.5, color: "#666", marginTop: 2 }}>
                                      <span style={{ color: "#0369a1", fontWeight: 700 }}>{qs.topic}</span>
                                      {" · answer: "}<span style={{ color: "#15803d", fontWeight: 700 }}>{qs.answerText}</span>
                                      {qs.commonWrong && <>{" · most-picked wrong: "}<span style={{ color: "#b91c1c", fontWeight: 700 }}>{qs.commonWrong}</span></>}
                                    </div>
                                  </div>
                                  <DiffChip d={qs.difficulty} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My quizzes */}
      <div style={{ ...CARD, padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: 0 }}>🗂 My quizzes</h2>
            <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
              Shared across all your classes — build once, assign anywhere. Saved quizzes are frozen; edit by building a new one.
            </p>
          </div>
          <button onClick={openBuilder} style={{ ...BTN, background: ACCENT, color: "#fff", padding: "10px 22px" }}>+ New Quiz</button>
        </div>
        {quizzes.length === 0 ? (
          <div style={{ textAlign: "center", color: "#aaa", padding: "18px 0", fontSize: 13 }}>
            No quizzes yet. Hit “+ New Quiz” — the question bank has {`347`} ready-made questions to start from.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {quizzes.map((q) => {
              const labMeta = QUIZ_LABS.find((l) => l.id === q.lab);
              return (
                <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  padding: "12px 16px", borderRadius: 12, border: "2px solid #e5e7eb" }}>
                  <span style={{ fontSize: 22 }}>{labMeta?.icon}</span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {labMeta?.label} · {labMeta?.unitNoun}{q.unit_idxs.length > 1 ? "s" : ""} {q.unit_idxs.map((u) => u + 1).join(", ")} · {q.questions.length} questions
                    </div>
                  </div>
                  <button onClick={() => openAssign(q)} style={{ ...BTN, padding: "7px 18px", fontSize: 12, background: "#111", color: "#fff" }}>Assign</button>
                  <button onClick={() => deleteQuiz(q)} disabled={deletingId === q.id}
                    style={{ ...BTN, padding: "7px 14px", fontSize: 12, background: "#fef2f2", color: "#b91c1c" }}>
                    {deletingId === q.id ? "…" : "Retire"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assignQuiz && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...CARD, padding: "22px 26px", width: 520, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 900 }}>Assign “{assignQuiz.title}”</h3>
            <p style={{ fontSize: 11.5, color: "#888", margin: "0 0 14px" }}>
              Set the window so students take it while they&apos;re in the room — it&apos;s enforced on submit, not just hidden.
              Leave a field empty for no limit on that side.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Opens</label>
                <input type="datetime-local" value={assignForm.opensAt}
                  onChange={(e) => setAssignForm({ ...assignForm, opensAt: e.target.value })} style={INPUT} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Closes</label>
                <input type="datetime-local" value={assignForm.closesAt}
                  onChange={(e) => setAssignForm({ ...assignForm, closesAt: e.target.value })} style={INPUT} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Attempts</label>
                <select value={assignForm.attemptsAllowed}
                  onChange={(e) => setAssignForm({ ...assignForm, attemptsAllowed: Number(e.target.value) })} style={{ ...INPUT, width: "auto" }}>
                  {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Timer (min, blank = none)</label>
                <input type="number" min={1} max={120} value={assignForm.timerMinutes} placeholder="—"
                  onChange={(e) => setAssignForm({ ...assignForm, timerMinutes: e.target.value })} style={{ ...INPUT, width: 110 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Pass %</label>
                <input type="number" min={0} max={100} value={assignForm.passThreshold}
                  onChange={(e) => setAssignForm({ ...assignForm, passThreshold: Number(e.target.value) })} style={{ ...INPUT, width: 90 }} />
              </div>
            </div>
            <label style={{ fontSize: 11, fontWeight: 800, color: "#666" }}>Show correct answers</label>
            <select value={assignForm.revealMode}
              onChange={(e) => setAssignForm({ ...assignForm, revealMode: e.target.value as RevealMode })}
              style={{ ...INPUT, width: "100%", marginBottom: 12 }}>
              <option value="after_close">After the window closes (recommended — no answer leaks in class)</option>
              <option value="after_submit">Right after each student submits</option>
              <option value="never">Never — scores only</option>
            </select>
            {assignError && <div style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>⚠️ {assignError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setAssignQuiz(null)} style={{ ...BTN, background: "#f3f4f6", color: "#374151" }}>Cancel</button>
              <button onClick={submitAssign} disabled={assigning} style={{ ...BTN, background: ACCENT, color: "#fff" }}>
                {assigning ? "Assigning…" : "Assign to class"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
