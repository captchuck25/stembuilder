"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type Class, type Assignment } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { roleAtLeast } from "@/lib/roles";
import { LEVELS } from "@/app/tools/code-lab/python/levels";
import { UNITS } from "@/app/tools/block-lab/units";
import { CHALLENGES as TURTLE_CHALLENGES } from "@/app/tools/code-lab/turtle/challenges";
import { runTurtleBackfillOnce } from "@/lib/turtle-backfill";
import SiteHeader from "@/app/components/SiteHeader";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

interface EnrolledClass {
  class: Class;
  assignments: Assignment[];
  // challenge_id strings from turtle_assignments — turtle items live in a separate
  // table from regular assignments, so they ride alongside instead of inside.
  turtleAssignedIds?: string[];
}

interface BridgeAssignment {
  id: string;
  title: string;
  span_feet: number;
  load_lb: number;
  max_cost: number;
  submitted: boolean;
  passed: boolean;
  class_id: string;
}

interface MeasurementAssignment {
  id: string;
  class_id: string;
  class_name: string;
  title: string;
  tool: string;
  config: { mode: string; precision: string; questionCount: number; timerSeconds: number | null; passThreshold: number };
  bestCorrect: number | null;
  attemptCount: number;
  passed: boolean;
}

interface SketchAssignmentRow {
  id: string;
  class_id: string;
  class_name: string;
  title: string;
  challenge_id: string;
  challenge_title: string;
  precision: string;
  precision_label: string;
  passed: boolean;
  attemptCount: number;
}

interface QuizAssignmentRow {
  id: string;
  class_id: string;
  title: string;
  lab: string | null;
  questionCount: number;
  opens_at: string | null;
  closes_at: string | null;
  state: "upcoming" | "open" | "closed";
  config: { attemptsAllowed: number; timerSeconds: number | null; passThreshold: number };
  bestPct: number | null;
  attemptCount: number;
  passed: boolean;
}

const QUIZ_LAB_ICONS: Record<string, string> = {
  "electronics-lab": "💡",
  "block-lab": "🧩",
  "code-lab-python": "🐍",
};

const MEAS_TOOL_LABELS: Record<string, string> = {
  "ruler": "Ruler",
  "dial-caliper": "Dial Caliper",
  "graduated-cylinder": "Graduated Cylinder",
  "triple-beam": "Triple Beam",
};

// tool -> level_idx -> completed challenge count
type ProgressMap = Record<string, Record<number, number>>;

export default function StudentDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [enrolledClasses, setEnrolledClasses] = useState<EnrolledClass[]>([]);
  const [bridgeAssignments, setBridgeAssignments] = useState<BridgeAssignment[]>([]);
  const [measAssignments, setMeasAssignments] = useState<MeasurementAssignment[]>([]);
  const [sketchAssignments, setSketchAssignments] = useState<SketchAssignmentRow[]>([]);
  const [quizAssignments, setQuizAssignments] = useState<QuizAssignmentRow[]>([]);
  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  // challenge_ids the student has a turtle_submissions row for — used to show
  // a "Complete" badge on assigned turtle items.
  const [turtleCompletedIds, setTurtleCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/"); return; }
    getProfile(session?.user?.id).then(profile => {
      if (!profile) { router.push("/onboarding"); return; }
      if (roleAtLeast(profile.role, "teacher")) { router.push("/teachers/dashboard"); return; }
      // Push any localStorage-only turtle tutorial completions up to the server
      // on this dashboard visit — runs at most once per (user, device).
      void runTurtleBackfillOnce(profile.id);
      loadClasses();
    });
  }, [status, session?.user?.id]);

  async function loadClasses() {
    const [classRes, bridgeRes, measRes, sketchRes, quizRes, progressRes, turtleRes] = await Promise.all([
      fetch("/api/student/classes"),
      fetch("/api/student/bridge-assignments"),
      fetch("/api/student/measurement-assignments"),
      fetch("/api/student/stem-sketch-assignments"),
      fetch("/api/student/quiz-assignments"),
      fetch("/api/student/my-progress"),
      fetch("/api/turtle"),
    ]);
    setEnrolledClasses(classRes.ok ? await classRes.json() : []);
    setBridgeAssignments(bridgeRes.ok ? await bridgeRes.json() : []);
    setMeasAssignments(measRes.ok ? await measRes.json() : []);
    setSketchAssignments(sketchRes.ok ? await sketchRes.json() : []);
    setQuizAssignments(quizRes.ok ? await quizRes.json() : []);
    if (turtleRes.ok) {
      const subs: Array<{ challenge_id: string }> = await turtleRes.json();
      setTurtleCompletedIds(new Set(subs.map(s => s.challenge_id)));
    }

    if (progressRes.ok) {
      const rows: { tool: string; level_idx: number; challenge_idx: number | null }[] = await progressRes.json();
      const map: ProgressMap = {};
      for (const row of rows) {
        if (row.challenge_idx === null || row.challenge_idx < 0) continue;
        const key = row.tool === "code-lab-python" ? "code-lab" : row.tool;
        if (!map[key]) map[key] = {};
        map[key][row.level_idx] = (map[key][row.level_idx] ?? 0) + 1;
      }
      setProgressMap(map);
    }
    setLoading(false);
  }

  async function joinClass() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError("");

    const res = await fetch("/api/student/classes/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      setJoinError(data.error ?? "Failed to join class.");
      setJoining(false);
      return;
    }

    setJoinCode("");
    setShowJoin(false);
    loadClasses();
    setJoining(false);
  }

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        {session?.user?.name && (
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{session?.user?.name}</span>
        )}
      </SiteHeader>

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px" }}>

          <div style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 28, flexWrap: "wrap", gap: 16, padding: "22px 28px" }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: 0 }}>My Classes</h1>
              <p style={{ fontSize: 14, color: "#555", margin: "4px 0 0" }}>
                Your enrolled classes and assigned work.
              </p>
            </div>
            <button onClick={() => setShowJoin(true)} style={{
              padding: "12px 24px", borderRadius: 12, background: "#16a34a",
              color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
            }}>
              + Join a Class
            </button>
          </div>

          {showJoin && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
              <div style={{ ...CARD, padding: "36px 32px", width: 400, maxWidth: "90vw" }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 6 }}>Join a Class</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Enter the join code your teacher gave you.
                </p>
                <input
                  autoFocus
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
                  onKeyDown={e => e.key === "Enter" && joinClass()}
                  placeholder="e.g. A3K9PZ"
                  maxLength={6}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: joinError ? "2px solid #dc2626" : "2px solid #e0e0e0",
                    fontSize: 22, fontWeight: 900, letterSpacing: "4px", textAlign: "center",
                    fontFamily: "monospace", outline: "none", boxSizing: "border-box",
                    textTransform: "uppercase", color: "#111", background: "#fff" }}
                />
                {joinError && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{joinError}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={() => { setShowJoin(false); setJoinCode(""); setJoinError(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "2px solid #e0e0e0",
                      background: "#f5f5f5", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#555" }}>
                    Cancel
                  </button>
                  <button onClick={joinClass} disabled={joinCode.length !== 6 || joining}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none",
                      background: joinCode.length === 6 ? "#16a34a" : "#ccc",
                      color: "#fff", fontWeight: 800, fontSize: 14,
                      cursor: joinCode.length === 6 ? "pointer" : "not-allowed" }}>
                    {joining ? "Joining…" : "Join Class"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {enrolledClasses.length === 0 ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🎒</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 8 }}>
                You are not enrolled in any classes yet
              </h2>
              <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
                Ask your teacher for a join code to get started.
              </p>
              <button onClick={() => setShowJoin(true)} style={{
                padding: "12px 28px", borderRadius: 12, background: "#16a34a",
                color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                Enter Join Code
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {enrolledClasses.map(({ class: cls, assignments, turtleAssignedIds }) => {
                const classBridgeAssignments = bridgeAssignments.filter(b => b.class_id === cls.id);
                const classMeasAssignments = measAssignments.filter(m => m.class_id === cls.id);
                const classSketchAssignments = sketchAssignments.filter(s => s.class_id === cls.id);
                const classQuizAssignments = quizAssignments.filter(q => q.class_id === cls.id);
                const turtleIds = turtleAssignedIds ?? [];
                const totalAssignments = assignments.length + classBridgeAssignments.length + classMeasAssignments.length + classSketchAssignments.length + classQuizAssignments.length + turtleIds.length;
                return (
                <div key={cls.id} style={{ ...CARD, padding: "28px 30px" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#111", marginBottom: 4 }}>{cls.name}</div>
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
                    {totalAssignments} assignment{totalAssignments !== 1 ? "s" : ""} assigned
                  </div>

                  {totalAssignments === 0 ? (
                    <div style={{ fontSize: 13, color: "#aaa", fontStyle: "italic" }}>
                      No assignments yet — check back soon.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {/* Python Code Lab */}
                      {assignments.filter((a: Assignment) => a.tool === "code-lab").length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#2563eb",
                            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                            🐍 Python Code Lab
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {assignments.filter((a: Assignment) => a.tool === "code-lab").map((a: Assignment) => {
                              const level = LEVELS[a.level_id];
                              if (!level) return null;
                              const done = progressMap["code-lab"]?.[a.level_id] ?? 0;
                              const total = level.challenges.length;
                              const complete = done >= total && total > 0;
                              return (
                                <Link key={a.id} href={`/tools/code-lab/python?level=${a.level_id}`} style={{ textDecoration: "none" }}>
                                  <div style={{ padding: "14px 20px", borderRadius: 14,
                                    background: complete ? `linear-gradient(135deg, #dcfce722, #dcfce744)` : `linear-gradient(135deg, ${level.color}22, ${level.color}44)`,
                                    border: `2px solid ${complete ? "#16a34a" : level.color}`,
                                    display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ fontSize: 22 }}>
                                      {complete ? "✅" : a.level_id === 0 ? "🐍" : a.level_id === 1 ? "🔁" : "🧠"}
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                                        Level {level.id} — {level.title}
                                      </div>
                                      <div style={{ fontSize: 12, color: "#555" }}>{level.tagline}</div>
                                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ flex: 1, height: 5, borderRadius: 99, background: "#e5e7eb", minWidth: 80 }}>
                                          <div style={{ height: "100%", borderRadius: 99, width: `${total > 0 ? (done / total) * 100 : 0}%`,
                                            background: complete ? "#16a34a" : level.color, transition: "width 300ms" }} />
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: complete ? "#16a34a" : "#555", whiteSpace: "nowrap" }}>
                                          {complete ? "Complete" : `${done}/${total}`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* Block Lab */}
                      {assignments.filter((a: Assignment) => a.tool === "block-lab").length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed",
                            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                            🧩 Block Lab
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {assignments.filter((a: Assignment) => a.tool === "block-lab").map((a: Assignment) => {
                              const unit = UNITS[a.level_id];
                              if (!unit) return null;
                              const done = progressMap["block-lab"]?.[a.level_id] ?? 0;
                              const total = unit.challenges.length;
                              const complete = done >= total && total > 0;
                              return (
                                <Link key={a.id} href="/tools/block-lab" style={{ textDecoration: "none" }}>
                                  <div style={{ padding: "14px 20px", borderRadius: 14,
                                    background: complete ? `linear-gradient(135deg, #dcfce722, #dcfce744)` : `linear-gradient(135deg, ${unit.color}22, ${unit.color}44)`,
                                    border: `2px solid ${complete ? "#16a34a" : unit.color}`,
                                    display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ fontSize: 22 }}>{complete ? "✅" : "🧩"}</div>
                                    <div>
                                      <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                                        Unit {unit.id} — {unit.title}
                                      </div>
                                      <div style={{ fontSize: 12, color: "#555" }}>{unit.tagline}</div>
                                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ flex: 1, height: 5, borderRadius: 99, background: "#e5e7eb", minWidth: 80 }}>
                                          <div style={{ height: "100%", borderRadius: 99, width: `${total > 0 ? (done / total) * 100 : 0}%`,
                                            background: complete ? "#16a34a" : unit.color, transition: "width 300ms" }} />
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: complete ? "#16a34a" : "#555", whiteSpace: "nowrap" }}>
                                          {complete ? "Complete" : `${done}/${total}`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* Turtle */}
                      {turtleIds.length > 0 && (() => {
                        const items = turtleIds
                          .map(id => TURTLE_CHALLENGES.find(c => c.id === id))
                          .filter((c): c is NonNullable<typeof c> => !!c);
                        return (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#059669",
                              textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                              🐢 Python Turtle
                            </div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              {items.map(ch => {
                                const complete = turtleCompletedIds.has(ch.id);
                                const isTutorial = ch.category === "tutorial";
                                return (
                                  <Link key={ch.id} href={`/tools/code-lab/turtle?challenge=${ch.id}`} style={{ textDecoration: "none" }}>
                                    <div style={{ padding: "14px 20px", borderRadius: 14,
                                      background: complete ? "linear-gradient(135deg, #dcfce722, #dcfce744)" : "linear-gradient(135deg, #d1fae522, #a7f3d044)",
                                      border: `2px solid ${complete ? "#16a34a" : "#059669"}`,
                                      display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
                                      <div style={{ fontSize: 22 }}>{complete ? "✅" : isTutorial ? "📘" : "🎨"}</div>
                                      <div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                                          {ch.title}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#555" }}>
                                          {isTutorial ? "Tutorial" : "Creative challenge"}
                                        </div>
                                        {complete && (
                                          <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>✓ Complete</div>
                                        )}
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {/* Bridge Assignments */}
                      {classBridgeAssignments.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#d97706",
                            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                            🌉 Bridge Builder
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {classBridgeAssignments.map(b => (
                              <Link key={b.id} href={`/tools/bridge?assignment=${b.id}`} style={{ textDecoration: "none" }}>
                                <div style={{ padding: "14px 20px", borderRadius: 14,
                                  background: b.passed ? "linear-gradient(135deg, #dcfce722, #dcfce744)" : "linear-gradient(135deg, #fef3c722, #fde68a44)",
                                  border: `2px solid ${b.passed ? "#16a34a" : "#d97706"}`,
                                  display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ fontSize: 22 }}>🌉</div>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                                      {b.title || "Bridge Assignment"}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#555" }}>
                                      {b.span_feet} ft · {b.load_lb / 2000} ton · max ${b.max_cost.toFixed(0)}
                                    </div>
                                    {b.passed && (
                                      <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>✓ Completed</div>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Measurement Lab Assignments */}
                      {classMeasAssignments.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#0d9488",
                            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                            📏 Measurement Lab
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {classMeasAssignments.map(m => (
                              <Link key={m.id} href={`/tools/measurement-lab/${m.tool}?assignment=${m.id}`} style={{ textDecoration: "none" }}>
                                <div style={{ padding: "14px 20px", borderRadius: 14,
                                  background: m.passed ? "linear-gradient(135deg, #dcfce722, #dcfce744)" : "linear-gradient(135deg, #ccfbf122, #99f6e444)",
                                  border: `2px solid ${m.passed ? "#16a34a" : "#0d9488"}`,
                                  display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ fontSize: 22 }}>📏</div>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                                      {m.title || "Measurement Assignment"}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#555" }}>
                                      {MEAS_TOOL_LABELS[m.tool] ?? m.tool} · {m.config.questionCount} questions · goal {m.config.passThreshold}
                                    </div>
                                    {m.passed ? (
                                      <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>
                                        ✓ Completed (best {m.bestCorrect}/{m.config.questionCount})
                                      </div>
                                    ) : m.attemptCount > 0 ? (
                                      <div style={{ fontSize: 11, color: "#b45309", fontWeight: 700, marginTop: 2 }}>
                                        Best {m.bestCorrect}/{m.config.questionCount} · {m.attemptCount} {m.attemptCount === 1 ? "try" : "tries"}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* STEM Sketch Assignments */}
                      {classSketchAssignments.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#0891b2",
                            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                            ✏️ STEM Sketch
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {classSketchAssignments.map(s => (
                              <Link key={s.id} href={`/tools/stem-sketch?assignment=${s.id}`} style={{ textDecoration: "none" }}>
                                <div style={{ padding: "14px 20px", borderRadius: 14,
                                  background: s.passed ? "linear-gradient(135deg, #dcfce722, #dcfce744)" : "linear-gradient(135deg, #cffafe22, #a5f3fc44)",
                                  border: `2px solid ${s.passed ? "#16a34a" : "#0891b2"}`,
                                  display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ fontSize: 22 }}>✏️</div>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                                      {s.title || s.challenge_title || "STEM Sketch Assignment"}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#555" }}>
                                      {s.challenge_title} · measure to {s.precision_label.toLowerCase()}
                                    </div>
                                    {s.passed ? (
                                      <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>
                                        ✓ Fit check passed
                                      </div>
                                    ) : s.attemptCount > 0 ? (
                                      <div style={{ fontSize: 11, color: "#b45309", fontWeight: 700, marginTop: 2 }}>
                                        {s.attemptCount} {s.attemptCount === 1 ? "try" : "tries"} — not passed yet
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Quiz Assignments */}
                      {classQuizAssignments.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#9333ea",
                            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                            📝 Quizzes
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {classQuizAssignments.map(q => {
                              const closed = q.state === "closed";
                              const upcoming = q.state === "upcoming";
                              return (
                                <Link key={q.id} href={`/student/quiz/${q.id}`} style={{ textDecoration: "none" }}>
                                  <div style={{ padding: "14px 20px", borderRadius: 14,
                                    background: q.passed ? "linear-gradient(135deg, #dcfce722, #dcfce744)" : "linear-gradient(135deg, #f3e8ff22, #e9d5ff44)",
                                    border: `2px solid ${q.passed ? "#16a34a" : closed || upcoming ? "#d1d5db" : "#9333ea"}`,
                                    opacity: upcoming ? 0.75 : 1,
                                    display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ fontSize: 22 }}>{QUIZ_LAB_ICONS[q.lab ?? ""] ?? "📝"}</div>
                                    <div>
                                      <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{q.title}</div>
                                      <div style={{ fontSize: 12, color: "#555" }}>
                                        {q.questionCount} questions · goal {q.config.passThreshold}%
                                        {q.config.timerSeconds ? ` · ⏱ ${Math.round(q.config.timerSeconds / 60)} min` : ""}
                                      </div>
                                      {q.passed ? (
                                        <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginTop: 2 }}>
                                          ✓ Passed ({q.bestPct}%)
                                        </div>
                                      ) : q.attemptCount > 0 ? (
                                        <div style={{ fontSize: 11, color: "#b45309", fontWeight: 700, marginTop: 2 }}>
                                          Best {q.bestPct}% · {q.attemptCount} {q.attemptCount === 1 ? "try" : "tries"}
                                        </div>
                                      ) : upcoming ? (
                                        <div style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 700, marginTop: 2 }}>
                                          🕐 Opens {q.opens_at ? new Date(q.opens_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "soon"}
                                        </div>
                                      ) : closed ? (
                                        <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 2 }}>Closed</div>
                                      ) : (
                                        <div style={{ fontSize: 11, color: "#9333ea", fontWeight: 700, marginTop: 2 }}>● Open now — tap to take it</div>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
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
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
