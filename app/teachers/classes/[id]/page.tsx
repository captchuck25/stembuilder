"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { type Class, type Assignment, type LessonLock } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { LEVELS } from "@/app/tools/code-lab/python/levels";
import { UNITS } from "@/app/tools/block-lab/units";
import { CHALLENGES as TURTLE_CHALLENGES } from "@/app/tools/code-lab/turtle/challenges";
import { fetchTurtleSubmissionsForStudents, approveTurtleSubmission, type TurtleSubmission } from "@/lib/achievements";
import SiteHeader from "@/app/components/SiteHeader";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const TH: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: 800,
  fontSize: 12,
  color: "#555",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  background: "#f9fafb",
  borderBottom: "2px solid #e5e7eb",
  whiteSpace: "nowrap",
  textAlign: "left",
};

const TD: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#111",
  borderBottom: "1px solid #f0f0f0",
  whiteSpace: "nowrap",
};

const NAME_TD: React.CSSProperties = {
  ...TD,
  position: "sticky",
  left: 0,
  background: "#fff",
  fontWeight: 700,
  zIndex: 1,
  borderRight: "2px solid #e5e7eb",
  minWidth: 200,
};

interface StudentRow {
  id: string;
  name: string;
  email: string;
  completedChallenges: number;
  totalChallenges: number;
}

interface GradebookLevel {
  challengesDone: number;
  challengesTotal: number;
  quizScore: number | null;
  quizTotal: number;
}

interface GradebookStudent {
  id: string;
  name: string;
  email: string;
  levels: Record<number, GradebookLevel>;
}

interface GradebookData {
  students: GradebookStudent[];
  assignedLevelIds: number[];
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = "﻿" + rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClassDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;

  const [cls, setCls] = useState<Class | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [locks, setLocks] = useState<LessonLock[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTool, setSelectedTool] = useState<"code-lab" | "block-lab" | "bridge" | "turtle">("code-lab");
  const [turtleSubs, setTurtleSubs] = useState<TurtleSubmission[]>([]);
  const [grades, setGrades] = useState<Record<string, GradebookData | null>>({});
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/"); return; }
    getProfile(session?.user?.id).then(profile => {
      if (!profile || profile.role !== "teacher") { router.push("/"); return; }
      loadClass();
    });
  }, [status, session?.user?.id]);

  useEffect(() => {
    if (!cls) return;
    if (selectedTool !== "code-lab" && selectedTool !== "block-lab") return;
    if (fetchedRef.current.has(selectedTool)) return;
    fetchedRef.current.add(selectedTool);
    setLoadingGrades(true);
    fetch(`/api/teacher/classes/${classId}/progress?tool=${selectedTool}`)
      .then(r => r.json())
      .then(data => setGrades(prev => ({ ...prev, [selectedTool]: data })))
      .finally(() => setLoadingGrades(false));
  }, [selectedTool, cls]);

  async function loadClass() {
    const res = await fetch(`/api/teacher/classes/${classId}`);
    if (!res.ok) { router.push("/teachers/dashboard"); return; }
    const data = await res.json();
    setCls(data.class);
    setAssignments(data.assignments ?? []);
    setLocks(data.locks ?? []);
    setStudents(data.students ?? []);
    if ((data.studentIds ?? []).length) {
      const subs = await fetchTurtleSubmissionsForStudents(data.studentIds);
      setTurtleSubs(subs);
    }
    setLoading(false);
  }

  async function handleApprove(id: string, approved: boolean | null) {
    await approveTurtleSubmission(id, approved);
    setTurtleSubs(prev => prev.map(s => s.id === id ? { ...s, approved } : s));
  }

  async function toggleLevel(tool: string, levelId: number) {
    if (!cls || saving) return;
    setSaving(true);
    const existing = assignments.find(a => a.tool === tool && a.level_id === levelId);
    if (existing) {
      await fetch(`/api/teacher/assignments?id=${existing.id}`, { method: "DELETE" });
      setAssignments(prev => prev.filter(a => a.id !== existing.id));
      // Remove any locks for this level since it's being unassigned
      const locksToDelete = locks.filter(l => l.tool === tool && l.level_idx === levelId);
      await Promise.all(locksToDelete.map(l => fetch(`/api/teacher/locks?id=${l.id}`, { method: "DELETE" })));
      setLocks(prev => prev.filter(l => !(l.tool === tool && l.level_idx === levelId)));
    } else {
      const res = await fetch("/api/teacher/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: cls.id, tool, levelId }),
      });
      const data = await res.json();
      if (res.ok) setAssignments(prev => [...prev, data].sort((a, b) => a.level_id - b.level_id));
    }
    fetchedRef.current.delete(tool);
    setGrades(prev => { const n = { ...prev }; delete n[tool]; return n; });
    setSaving(false);
  }

  async function toggleLevelLock(tool: string, levelIdx: number) {
    if (!cls || saving) return;
    setLockError(null);
    setSaving(true);
    try {
      const existing = locks.find(
        l => l.tool === tool && l.level_idx === levelIdx && l.challenge_idx === -1,
      );
      if (existing) {
        const res = await fetch(`/api/teacher/locks?id=${existing.id}`, { method: "DELETE" });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? res.statusText); }
        setLocks(prev => prev.filter(l => l.id !== existing.id));
      } else {
        const res = await fetch("/api/teacher/locks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: cls.id, tool, levelIdx, challengeIdx: -1 }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? res.statusText); }
        const data = await res.json();
        setLocks(prev => [...prev, data]);
      }
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Lock failed");
    } finally {
      setSaving(false);
    }
  }

  async function lockAllTool(tool: string) {
    if (!cls || saving) return;

    const allIdxs = tool === "code-lab"
      ? LEVELS.map((_, i) => i)
      : tool === "block-lab"
      ? UNITS.map((_, i) => i)
      : tool === "turtle"
      ? Array.from({ length: TURTLE_CHALLENGES.filter(c => c.category === "challenge").length }, (_, i) => i)
      : [];
    if (!allIdxs.length) return;

    const allLocked = allIdxs.every(idx =>
      locks.some(l => l.tool === tool && l.level_idx === idx && l.challenge_idx === -1),
    );

    setLockError(null);
    setSaving(true);
    try {
      if (allLocked) {
        const toDelete = locks.filter(l => l.tool === tool && l.challenge_idx === -1);
        const results = await Promise.all(
          toDelete.map(l => fetch(`/api/teacher/locks?id=${l.id}`, { method: "DELETE" })),
        );
        const failed = results.find(r => !r.ok);
        if (failed) { const e = await failed.json(); throw new Error(e.error ?? failed.statusText); }
        setLocks(prev => prev.filter(l => !(l.tool === tool && l.challenge_idx === -1)));
      } else {
        const unlockedIdxs = allIdxs.filter(idx =>
          !locks.some(l => l.tool === tool && l.level_idx === idx && l.challenge_idx === -1),
        );
        const responses = await Promise.all(
          unlockedIdxs.map(idx =>
            fetch("/api/teacher/locks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ classId: cls!.id, tool, levelIdx: idx, challengeIdx: -1 }),
            }),
          ),
        );
        const failed = responses.find(r => !r.ok);
        if (failed) { const e = await failed.json(); throw new Error(e.error ?? failed.statusText); }
        const newLocks = await Promise.all(responses.map(r => r.json()));
        setLocks(prev => [...prev, ...newLocks]);
      }
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Lock failed");
    } finally {
      setSaving(false);
    }
  }

  function renderGradebook(
    tool: "code-lab" | "block-lab",
    levelMeta: Array<{ id: number; title: string; color: string }>,
    csvFilename: string,
  ) {
    const data = grades[tool];

    if (loadingGrades && !data) {
      return <div style={{ padding: "32px 0", textAlign: "center", color: "#888", fontSize: 14 }}>Loading gradebook…</div>;
    }
    if (!data || data.assignedLevelIds.length === 0) {
      return (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
          No levels assigned yet. Toggle some levels on the left.
        </div>
      );
    }
    if (data.students.length === 0) {
      return (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
          No students enrolled yet.
        </div>
      );
    }

    const { students: gbStudents, assignedLevelIds } = data;

    function exportCSV() {
      const header = ["Student", "Email"];
      for (const li of assignedLevelIds) {
        const meta = levelMeta[li];
        if (!meta) continue;
        header.push(`${meta.title} — Challenges`, `${meta.title} — Quiz`);
      }
      const rows: string[][] = [header];
      for (const s of gbStudents) {
        const row = [s.name, s.email];
        for (const li of assignedLevelIds) {
          const lv = s.levels[li];
          row.push(
            lv ? `${lv.challengesDone}/${lv.challengesTotal}` : "0/0",
            lv?.quizScore !== null && lv?.quizScore !== undefined ? `${lv.quizScore}/${lv.quizTotal}` : "—",
          );
        }
        rows.push(row);
      }
      downloadCSV(rows, csvFilename);
    }

    return (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={exportCSV}
            style={{ padding: "8px 18px", borderRadius: 10, border: "2px solid #2563eb",
              background: "#eff6ff", color: "#2563eb", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            ↓ Export CSV
          </button>
        </div>
        <div style={{ overflowX: "auto", borderRadius: 12, border: "2px solid #e5e7eb" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: "#f9fafb", zIndex: 2 }}>Student</th>
                {assignedLevelIds.map(li => {
                  const meta = levelMeta[li];
                  if (!meta) return null;
                  return (
                    <th key={li} colSpan={2}
                      style={{ ...TH, borderLeft: `4px solid ${meta.color}`, textAlign: "center", paddingLeft: 16 }}>
                      {meta.title}
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: "#f9fafb", zIndex: 2 }} />
                {assignedLevelIds.map(li => {
                  const meta = levelMeta[li];
                  if (!meta) return null;
                  return [
                    <th key={`${li}-ch`} style={{ ...TH, borderLeft: `4px solid ${meta.color}30`, color: "#666", fontWeight: 700 }}>
                      Challenges
                    </th>,
                    <th key={`${li}-qz`} style={{ ...TH, color: "#666", fontWeight: 700 }}>Quiz</th>,
                  ];
                })}
              </tr>
            </thead>
            <tbody>
              {gbStudents.map((s, si) => (
                <tr key={s.id} style={{ background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ ...NAME_TD, background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <div style={{ fontWeight: 700, color: "#111" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{s.email}</div>
                  </td>
                  {assignedLevelIds.map(li => {
                    const meta = levelMeta[li];
                    if (!meta) return null;
                    const lv = s.levels[li];
                    const chDone = lv?.challengesDone ?? 0;
                    const chTotal = lv?.challengesTotal ?? 0;
                    const chAllDone = chTotal > 0 && chDone === chTotal;
                    const chPartial = chDone > 0 && chDone < chTotal;
                    const quizScore = lv?.quizScore ?? null;
                    const quizTotal = lv?.quizTotal ?? 0;
                    const quizPassed = quizScore !== null && quizTotal > 0 && quizScore >= Math.ceil(quizTotal * 0.7);
                    return [
                      <td key={`${li}-ch`} style={{ ...TD, borderLeft: `4px solid ${meta.color}30` }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                          fontWeight: 700, fontSize: 13,
                          background: chAllDone ? "#dcfce7" : chPartial ? "#fef9c3" : "#f3f4f6",
                          color: chAllDone ? "#166534" : chPartial ? "#854d0e" : "#6b7280",
                        }}>
                          {chDone}/{chTotal}
                        </span>
                      </td>,
                      <td key={`${li}-qz`} style={TD}>
                        {quizScore !== null ? (
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 6,
                            fontWeight: 700, fontSize: 13,
                            background: quizPassed ? "#dcfce7" : "#fee2e2",
                            color: quizPassed ? "#166534" : "#991b1b",
                          }}>
                            {quizScore}/{quizTotal}
                          </span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                        )}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderAssignList(
    tool: "code-lab" | "block-lab",
    items: Array<{ id: number; title: string; tagline: string; color: string; challenges: { title: string }[] }>,
    assignedSet: Set<number>,
  ) {
    return (
      <>
        {items.map((item, idx) => {
          const assigned = assignedSet.has(idx);
          const isLevelLocked = locks.some(
            l => l.tool === tool && l.level_idx === idx && l.challenge_idx === -1,
          );

          return (
            <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* Level info display */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12,
                padding: "11px 13px", borderRadius: 12,
                border: `2px solid ${assigned ? item.color : "#e0e0e0"}`,
                background: assigned ? `${item.color}14` : "#fafafa",
                opacity: saving ? 0.6 : 1, minWidth: 0, position: "relative" }}>
                <div style={{ width: 24, height: 24, borderRadius: 999,
                  background: assigned ? item.color : "#e0e0e0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 12, color: "#fff", fontWeight: 800 }}>
                  {assigned ? "✓" : idx + 1}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#111", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis" }}>
                    {tool === "code-lab" ? "Level" : "Unit"} {item.id} — {item.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#777", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis" }}>{item.tagline}</div>
                </div>
                {isLevelLocked && (
                  <div style={{ fontSize: 14, flexShrink: 0 }}>🔒</div>
                )}
              </div>

              {/* Assign / Unlock / Unassign button */}
              <button
                onClick={() => {
                  if (assigned && isLevelLocked) toggleLevelLock(tool, idx);
                  else toggleLevel(tool, idx);
                }}
                disabled={saving}
                title={assigned && isLevelLocked ? "Unlock this level for students" : assigned ? "Unassign this level" : "Assign this level"}
                style={{ padding: "0 10px", borderRadius: 10, flexShrink: 0, height: 48,
                  border: `2px solid ${assigned && isLevelLocked ? "#16a34a" : assigned ? item.color : "#e5e7eb"}`,
                  background: assigned && isLevelLocked ? "#dcfce7" : assigned ? `${item.color}18` : "#fafafa",
                  cursor: saving ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 800,
                  color: assigned && isLevelLocked ? "#166534" : assigned ? item.color : "#6b7280",
                  lineHeight: 1.3, textAlign: "center", minWidth: 58 }}>
                {assigned && isLevelLocked ? <>🔓<br/>Assign</> : assigned ? <>✓<br/>Assigned</> : <>+<br/>Assign</>}
              </button>
            </div>
          );
        })}
      </>
    );
  }

  if (status === "loading" || loading || !cls) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  const assignedCodeLab  = new Set(assignments.filter(a => a.tool === "code-lab").map(a => a.level_id));
  const assignedBlockLab = new Set(assignments.filter(a => a.tool === "block-lab").map(a => a.level_id));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        <Link href="/teachers/dashboard" style={{ border: "1px solid #fff", color: "#fff",
          padding: "8px 14px", borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </SiteHeader>

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "48px 40px" }}>

          {/* Class header */}
          <div style={{ ...CARD, padding: "22px 28px", marginBottom: 28,
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 10px" }}>{cls.name}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ background: "#f0f4ff", border: "2px solid #c7d7fd", borderRadius: 10,
                  padding: "6px 16px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#3730a3",
                    textTransform: "uppercase", letterSpacing: "0.6px" }}>Join Code</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: "#2563eb",
                    letterSpacing: "3px", fontFamily: "monospace" }}>{cls.join_code}</span>
                </div>
                <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>
                  {students.length} student{students.length !== 1 ? "s" : ""} enrolled
                </span>
              </div>
            </div>
          </div>

          {/* Tool selector */}
          <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
            {([
              { id: "code-lab"  as const, label: "Python Code Lab",  icon: "🐍", color: "#2563eb", desc: "Maze challenges" },
              { id: "block-lab" as const, label: "Block Lab",         icon: "🧩", color: "#7c3aed", desc: "Visual block coding" },
              { id: "bridge"    as const, label: "Bridge Builder",    icon: "🌉", color: "#d97706", desc: "Structural engineering" },
              { id: "turtle"    as const, label: "Turtle Challenges", icon: "🐢", color: "#059669", desc: "Creative drawing review" },
            ] as const).map(tool => {
              const active = selectedTool === tool.id;
              const hasLockControl = tool.id === "code-lab" || tool.id === "block-lab" || tool.id === "turtle";
              const turtleChallengeCount = TURTLE_CHALLENGES.filter(c => c.category === "challenge").length;
              const toolAllIdxs = tool.id === "code-lab" ? LEVELS.map((_, i) => i) : tool.id === "block-lab" ? UNITS.map((_, i) => i) : tool.id === "turtle" ? Array.from({ length: turtleChallengeCount }, (_, i) => i) : [];
              const allToolLocked = hasLockControl && toolAllIdxs.length > 0 && toolAllIdxs.every(idx =>
                locks.some(l => l.tool === tool.id && l.level_idx === idx && l.challenge_idx === -1),
              );
              return (
                <div key={tool.id} onClick={() => setSelectedTool(tool.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px",
                    borderRadius: 16, border: `3px solid ${active ? tool.color : "rgba(255,255,255,0.6)"}`,
                    background: active ? "rgba(255,255,255,0.97)" : "rgba(255,255,255,0.55)",
                    cursor: "pointer", transition: "all 150ms", userSelect: "none",
                    boxShadow: active ? "0 4px 16px rgba(0,0,0,0.15)" : "none" }}>
                  <span style={{ fontSize: 28 }}>{tool.icon}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: active ? tool.color : "#444" }}>{tool.label}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{tool.desc}</div>
                  </div>
                  {!hasLockControl && active && <div style={{ width: 8, height: 8, borderRadius: 999, background: tool.color, marginLeft: 4 }} />}
                  {hasLockControl && (
                    <div onClick={e => { e.stopPropagation(); lockAllTool(tool.id); }}
                      style={{ marginLeft: 4, padding: "5px 11px", borderRadius: 8,
                        border: `2px solid ${allToolLocked ? "#16a34a" : "#dc2626"}`,
                        background: allToolLocked ? "#dcfce7" : "#fee2e2",
                        color: allToolLocked ? "#166534" : "#dc2626",
                        fontWeight: 800, fontSize: 10, cursor: saving ? "not-allowed" : "pointer",
                        lineHeight: 1.3, textAlign: "center", whiteSpace: "nowrap" }}>
                      {allToolLocked ? "🔓 Unlock All" : "🔒 Lock All"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Lock error banner */}
          {lockError && (
            <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10,
              background: "#fee2e2", border: "2px solid #fca5a5",
              color: "#991b1b", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>⚠️ Lock error: {lockError}</span>
              <button onClick={() => setLockError(null)}
                style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer", fontSize: 16, fontWeight: 900 }}>✕</button>
            </div>
          )}

          {/* ── Code Lab panel ─────────────────────────────────────────────────────── */}
          {selectedTool === "code-lab" && (
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 28, alignItems: "start" }}>
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 4 }}>Assign Levels</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Use <strong>+ Assign</strong> to give access. Use the tab&apos;s <strong>🔒 Lock All</strong> to block everything, then click <strong>🔓 Assign</strong> on a level to open it for students.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {renderAssignList("code-lab", LEVELS.map(l => ({ ...l, challenges: l.challenges })), assignedCodeLab)}
                </div>
              </div>

              <div style={{ ...CARD, padding: "26px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#2563eb", marginBottom: 6 }}>Student Progress</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Challenges completed and quiz scores per assigned level.
                </p>
                {renderGradebook(
                  "code-lab",
                  LEVELS.map(l => ({ id: l.id, title: l.title, color: l.color })),
                  `${cls.name} — Python Code Lab.csv`,
                )}
              </div>
            </div>
          )}

          {/* ── Block Lab panel ────────────────────────────────────────────────────── */}
          {selectedTool === "block-lab" && (
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 28, alignItems: "start" }}>
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 4 }}>Assign Units</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Use <strong>+ Assign</strong> to give access. Use the tab&apos;s <strong>🔒 Lock All</strong> to block everything, then click <strong>🔓 Assign</strong> on a unit to open it for students.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {renderAssignList("block-lab", UNITS.map(u => ({ ...u, challenges: u.challenges })), assignedBlockLab)}
                </div>
              </div>

              <div style={{ ...CARD, padding: "26px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed", marginBottom: 6 }}>Student Progress</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Challenges completed and quiz scores per assigned unit.
                </p>
                {renderGradebook(
                  "block-lab",
                  UNITS.map(u => ({ id: u.id, title: u.title, color: u.color })),
                  `${cls.name} — Block Lab.csv`,
                )}
              </div>
            </div>
          )}

          {/* ── Turtle panel ───────────────────────────────────────────────────────── */}
          {selectedTool === "turtle" && (() => {
            const challenges = TURTLE_CHALLENGES.filter(c => c.category === "challenge");
            const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));

            function exportTurtleCSV() {
              const header = ["Student", "Email", ...challenges.map(c => `${c.title} — Status`)];
              const rows: string[][] = [header];
              for (const s of sortedStudents) {
                const row = [s.name, s.email];
                for (const ch of challenges) {
                  const sub = turtleSubs.find(x => x.user_id === s.id && x.challenge_id === ch.id);
                  row.push(
                    !sub ? "No submission"
                    : sub.approved === true ? "Approved"
                    : sub.approved === false ? "Needs revision"
                    : "Pending review",
                  );
                }
                rows.push(row);
              }
              downloadCSV(rows, `${cls!.name} — Turtle Challenges.csv`);
            }

            return (
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: "#059669" }}>Turtle Creative Challenges</h2>
                  <button onClick={exportTurtleCSV}
                    style={{ padding: "8px 18px", borderRadius: 10, border: "2px solid #059669",
                      background: "#ecfdf5", color: "#059669", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    ↓ Export CSV
                  </button>
                </div>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
                  Rows = students (alphabetical). Click ✓ to approve or ✗ to send back for revision.
                </p>

                {students.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
                    No students enrolled yet.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", borderRadius: 12, border: "2px solid #e5e7eb" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={{ ...TH, ...NAME_TD, background: "#f9fafb", zIndex: 2 }}>Student</th>
                          {challenges.map(ch => (
                            <th key={ch.id} style={{ ...TH, textAlign: "center", minWidth: 148 }}>
                              {ch.title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStudents.map((s, si) => (
                          <tr key={s.id} style={{ background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ ...NAME_TD, background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <div style={{ fontWeight: 700, color: "#111" }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{s.email}</div>
                            </td>
                            {challenges.map(ch => {
                              const sub = turtleSubs.find(x => x.user_id === s.id && x.challenge_id === ch.id);
                              if (!sub) {
                                return (
                                  <td key={ch.id} style={{ ...TD, textAlign: "center", verticalAlign: "middle", color: "#ccc" }}>
                                    —
                                  </td>
                                );
                              }
                              const borderColor = sub.approved === true ? "#10b981"
                                : sub.approved === false ? "#dc2626" : "#d1d5db";
                              const statusLabel = sub.approved === true ? "Approved"
                                : sub.approved === false ? "Needs revision" : "Pending";
                              const statusColor = sub.approved === true ? "#166534"
                                : sub.approved === false ? "#991b1b" : "#92400e";
                              const statusBg = sub.approved === true ? "#dcfce7"
                                : sub.approved === false ? "#fee2e2" : "#fef9c3";
                              return (
                                <td key={ch.id} style={{ ...TD, textAlign: "center", verticalAlign: "middle" }}>
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <div style={{ border: `3px solid ${borderColor}`, borderRadius: 8, overflow: "hidden",
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                                      <img src={sub.image_data} alt={s.name} width={108} height={108} style={{ display: "block" }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px",
                                      borderRadius: 999, background: statusBg, color: statusColor }}>
                                      {statusLabel}
                                    </span>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button onClick={() => handleApprove(sub.id, sub.approved === true ? null : true)}
                                        style={{ padding: "4px 10px", borderRadius: 6, border: "none",
                                          background: sub.approved === true ? "#10b981" : "#e5e7eb",
                                          color: sub.approved === true ? "#fff" : "#555",
                                          fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✓</button>
                                      <button onClick={() => handleApprove(sub.id, sub.approved === false ? null : false)}
                                        style={{ padding: "4px 10px", borderRadius: 6, border: "none",
                                          background: sub.approved === false ? "#dc2626" : "#e5e7eb",
                                          color: sub.approved === false ? "#fff" : "#555",
                                          fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✗</button>
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Bridge Builder panel ───────────────────────────────────────────────── */}
          {selectedTool === "bridge" && (
            <div style={{ ...CARD, padding: "48px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🌉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 10 }}>
                Bridge Builder Challenges
              </h2>
              <p style={{ fontSize: 15, color: "#555", maxWidth: 480, margin: "0 auto 16px", lineHeight: 1.6 }}>
                Assigned challenges and student progress tracking for the Bridge Builder are coming soon.
                Students can currently access the tool freely — scored challenges will be added in a future update.
              </p>
              <div style={{ display: "inline-block", padding: "8px 20px", borderRadius: 999,
                background: "#fef3c7", border: "2px solid #fde68a", fontSize: 13,
                fontWeight: 700, color: "#92400e" }}>
                🚧 In Development
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
