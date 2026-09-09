"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Tower Builder assignments panel for the teacher class page — the Bridge
// Builder panel's twin (create form, gradebook with drafts/thumbnails,
// per-assignment leaderboard, overall leaderboard), kept in its own file so
// the class page only needs a tab entry and one render line.

const ACCENT = "#0f766e";
const ACCENT_DARK = "#134e4a";
const ACCENT_LIGHT = "#ccfbf1";
const ACCENT_BG = "#f0fdfa";
const ACCENT_HEADER = "#ccfbf1";

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

export interface TowerPanelStudent {
  id: string;
  name: string;
  email: string | null;
  username?: string | null;
}

function studentSubLabel(s: { email?: string | null; username?: string | null }): string {
  return s.email || (s.username ? `@${s.username}` : "");
}
function lastNameKey(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}
function compareByLastName(a: { name: string }, b: { name: string }): number {
  return lastNameKey(a.name).localeCompare(lastNameKey(b.name)) || a.name.localeCompare(b.name);
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

interface TowerAssignment {
  id: string;
  title: string;
  height_feet: number;
  footprint_feet: number;
  load_lb: number;
  max_cost: number;
  completionCount: number;
  created_at: string;
}
interface SubmissionRow { rank: number; student_id: string; name: string; email: string; cost: number; submitted_at: string; }
interface SubmissionCell { cost: number; passed: boolean; thumbnail: string | null; }
interface DraftCell { cost: number; thumbnail: string | null; updated_at: string; }
interface LeaderboardRow { rank: number; student_id: string; name: string; email: string; cost: number; assignment_title: string; }
interface LeaderboardData { overall: LeaderboardRow[]; byAssignment: { title: string; rows: LeaderboardRow[] }[] }

const HEIGHTS = [20, 30, 40, 50, 60] as const;
const FOOTPRINTS = [10, 15, 20] as const;
const LOAD_TONS = [8, 15, 30] as const;

export default function TowerPanel({ classId, students }: { classId: string; students: TowerPanelStudent[] }) {
  const [assignments, setAssignments] = useState<TowerAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", heightFeet: 30, footprintFeet: 15, loadTon: 8, maxCost: "" });
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<Record<string, SubmissionRow[]>>({});
  const [loadingLeaderboardId, setLoadingLeaderboardId] = useState<string | null>(null);
  const [submissionMap, setSubmissionMap] = useState<Record<string, Record<string, SubmissionCell>>>({});
  const [draftMap, setDraftMap] = useState<Record<string, Record<string, DraftCell>>>({});
  const [loadingGradebook, setLoadingGradebook] = useState(true);
  const gradebookLoadedRef = useRef(false);
  const [overall, setOverall] = useState<LeaderboardData | null>(null);
  const [loadingOverall, setLoadingOverall] = useState(false);
  const [showOverall, setShowOverall] = useState(false);
  const [overallTab, setOverallTab] = useState<string>("overall");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teacher/tower-assignments?classId=${classId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: TowerAssignment[]) => { if (!cancelled) setAssignments(rows); })
      .finally(() => { if (!cancelled) setLoadingAssignments(false); });
    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    if (gradebookLoadedRef.current) return;
    gradebookLoadedRef.current = true;
    fetch(`/api/teacher/tower-gradebook?classId=${classId}`)
      .then(r => r.ok ? r.json() : { submissions: [], drafts: [] })
      .then((payload: {
        submissions: Array<{ assignment_id: string; student_id: string; cost: number; passed: boolean; thumbnail: string | null }>;
        drafts: Array<{ assignment_id: string; student_id: string; cost: number; thumbnail: string | null; updated_at: string }>;
      }) => {
        const subs: Record<string, Record<string, SubmissionCell>> = {};
        for (const row of payload.submissions ?? []) {
          if (!subs[row.student_id]) subs[row.student_id] = {};
          subs[row.student_id][row.assignment_id] = { cost: row.cost, passed: row.passed, thumbnail: row.thumbnail };
        }
        setSubmissionMap(subs);
        const drafts: Record<string, Record<string, DraftCell>> = {};
        for (const row of payload.drafts ?? []) {
          if (!drafts[row.student_id]) drafts[row.student_id] = {};
          drafts[row.student_id][row.assignment_id] = { cost: row.cost, thumbnail: row.thumbnail, updated_at: row.updated_at };
        }
        setDraftMap(drafts);
      })
      .finally(() => setLoadingGradebook(false));
  }, [classId]);

  async function handleCreate() {
    const maxCostNum = parseFloat(Number(form.maxCost).toFixed(2));
    if (!form.maxCost || isNaN(maxCostNum) || maxCostNum <= 0) {
      setFormError("Please enter a valid max cost (e.g. 150000).");
      return;
    }
    setFormSaving(true);
    setFormError("");
    const res = await fetch("/api/teacher/tower-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        title: form.title,
        heightFeet: form.heightFeet,
        footprintFeet: form.footprintFeet,
        loadLb: form.loadTon * 2000,
        maxCost: maxCostNum,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setAssignments(prev => [data, ...prev]);
      setShowForm(false);
      setForm({ title: "", heightFeet: 30, footprintFeet: 15, loadTon: 8, maxCost: "" });
    } else {
      const e = await res.json().catch(() => ({}));
      setFormError(e.error ?? "Failed to create assignment");
    }
    setFormSaving(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/teacher/tower-assignments?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setAssignments(prev => prev.filter(a => a.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
    setDeletingId(null);
  }

  async function toggleLeaderboard(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (leaderboards[id]) return;
    setLoadingLeaderboardId(id);
    const res = await fetch(`/api/teacher/tower-submissions?assignmentId=${id}`);
    if (res.ok) { const data = await res.json(); setLeaderboards(prev => ({ ...prev, [id]: data })); }
    setLoadingLeaderboardId(null);
  }

  async function loadOverall() {
    setLoadingOverall(true);
    const res = await fetch("/api/teacher/tower-overall-leaderboard");
    if (res.ok) setOverall(await res.json());
    setLoadingOverall(false);
  }

  function renderGradebook() {
    if (loadingGradebook || loadingAssignments) {
      return <div style={{ padding: "32px 0", textAlign: "center", color: "#888", fontSize: 14 }}>Loading gradebook…</div>;
    }
    if (assignments.length === 0) return null;

    const sorted = [...students].sort(compareByLastName);
    if (sorted.length === 0) {
      return (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎒</div>
          No students enrolled yet.
        </div>
      );
    }

    function exportCSV() {
      const header = ["Student", "Email", ...assignments.map(a => `${a.title || "Tower Assignment"} — Status`), ...assignments.map(a => `${a.title || "Tower Assignment"} — Cost`)];
      const rows: string[][] = [header];
      for (const s of sorted) {
        const row = [s.name, studentSubLabel(s)];
        for (const a of assignments) {
          const cell = submissionMap[s.id]?.[a.id];
          const draft = !cell ? draftMap[s.id]?.[a.id] : undefined;
          row.push(cell ? (cell.passed ? "Submitted (Pass)" : "Submitted (Fail)") : draft ? "In Progress" : "—");
        }
        for (const a of assignments) {
          const cell = submissionMap[s.id]?.[a.id];
          const draft = !cell ? draftMap[s.id]?.[a.id] : undefined;
          const cost = cell?.cost ?? draft?.cost;
          row.push(cost !== undefined ? `$${cost.toFixed(2)}` : "—");
        }
        rows.push(row);
      }
      downloadCSV(rows, `tower-gradebook-${classId}.csv`);
    }

    return (
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, color: "#555" }}>
            {sorted.length} student{sorted.length !== 1 ? "s" : ""} · {assignments.length} assignment{assignments.length !== 1 ? "s" : ""}
          </div>
          <button onClick={exportCSV}
            style={{ padding: "8px 18px", borderRadius: 10, border: `2px solid ${ACCENT}`,
              background: ACCENT_BG, color: ACCENT_DARK, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            ↓ Export CSV
          </button>
        </div>
        <div style={{ overflowX: "auto", borderRadius: 12, border: `2px solid ${ACCENT_LIGHT}` }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: ACCENT_HEADER, zIndex: 2 }}>Student</th>
                {assignments.map(a => (
                  <th key={a.id} colSpan={3}
                    style={{ ...TH, borderLeft: `4px solid ${ACCENT}`, textAlign: "center", paddingLeft: 16, background: "#f0fdfa" }}>
                    <div style={{ color: ACCENT_DARK, fontWeight: 900 }}>{a.title || "Tower Assignment"}</div>
                    <div style={{ fontSize: 10, color: "#888", fontWeight: 600, marginTop: 2 }}>
                      {a.height_feet} ft tall · {a.footprint_feet} ft footprint · {a.load_lb / 2000} ton · ${Number(a.max_cost).toFixed(0)} budget
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: ACCENT_HEADER, zIndex: 2 }} />
                {assignments.map(a => [
                  <th key={`${a.id}-pass`} style={{ ...TH, borderLeft: `4px solid ${ACCENT}30`, color: "#666", fontWeight: 700, background: "#f0fdfa80", textAlign: "center" }}>Result</th>,
                  <th key={`${a.id}-design`} style={{ ...TH, color: "#666", fontWeight: 700, background: "#f0fdfa80", textAlign: "center" }}>Design</th>,
                  <th key={`${a.id}-cost`} style={{ ...TH, color: "#666", fontWeight: 700, background: "#f0fdfa80", textAlign: "right" }}>Cost</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, si) => (
                <tr key={s.id} style={{ background: si % 2 === 0 ? "#fff" : "#f7fdfb" }}>
                  <td style={{ ...NAME_TD, background: si % 2 === 0 ? "#fff" : "#f7fdfb" }}>
                    <div style={{ fontWeight: 700, color: "#111" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{studentSubLabel(s)}</div>
                  </td>
                  {assignments.map(a => {
                    const cell = submissionMap[s.id]?.[a.id];
                    const draft = !cell ? draftMap[s.id]?.[a.id] : undefined;
                    const thumbnail = cell?.thumbnail ?? draft?.thumbnail ?? null;
                    return [
                      <td key={`${a.id}-pass`} style={{ ...TD, borderLeft: `4px solid ${ACCENT}30`, textAlign: "center" }}>
                        {cell ? (
                          <span style={{
                            display: "inline-block", padding: "2px 10px", borderRadius: 6,
                            fontWeight: 800, fontSize: 12,
                            background: cell.passed ? "#dcfce7" : "#fee2e2",
                            color: cell.passed ? "#166534" : "#991b1b",
                          }}>
                            {cell.passed ? "✓ Pass" : "✗ Fail"}
                          </span>
                        ) : draft ? (
                          <span style={{
                            display: "inline-block", padding: "2px 10px", borderRadius: 6,
                            fontWeight: 800, fontSize: 12,
                            background: ACCENT_LIGHT, color: ACCENT_DARK,
                          }} title={`Last saved ${new Date(draft.updated_at).toLocaleString()}`}>
                            🛠 In Progress
                          </span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                        )}
                      </td>,
                      <td key={`${a.id}-design`} style={{ ...TD, textAlign: "center" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          {thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbnail} alt="Tower design"
                              style={{ width: 96, height: 56, objectFit: "contain", display: "inline-block",
                                borderRadius: 4, border: `1px solid ${ACCENT_LIGHT}`, background: "#fff" }} />
                          ) : (cell || draft) ? (
                            <span style={{ color: "#ccc", fontSize: 11, fontStyle: "italic" }}>no preview</span>
                          ) : (
                            <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                          )}
                          <Link
                            href={`/tools/tower?assignment=${a.id}&asStudent=${s.id}`}
                            target="_blank"
                            title={`Open ${s.name}'s work for projection (read-only)`}
                            style={{ fontSize: 11, fontWeight: 800, color: ACCENT_DARK,
                              textDecoration: "none", padding: "3px 10px",
                              borderRadius: 999, border: `2px solid ${ACCENT}`,
                              background: ACCENT_BG, whiteSpace: "nowrap" }}>
                            👁 Open
                          </Link>
                        </div>
                      </td>,
                      <td key={`${a.id}-cost`} style={{ ...TD, textAlign: "right" }}>
                        {cell ? (
                          <span style={{
                            fontWeight: 700, fontSize: 13,
                            color: cell.cost <= Number(a.max_cost) ? "#166534" : "#991b1b",
                          }}>
                            ${cell.cost.toFixed(2)}
                          </span>
                        ) : draft ? (
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#888" }} title="In-progress design cost">
                            ${draft.cost.toFixed(2)}
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

  const inputStyle: React.CSSProperties = {
    display: "block", width: "100%", marginTop: 4, padding: "9px 12px",
    borderRadius: 8, border: "2px solid #e0e0e0", fontSize: 14,
    fontWeight: 600, color: "#111", outline: "none", boxSizing: "border-box",
  };
  const selectStyle: React.CSSProperties = {
    display: "block", width: "100%", marginTop: 4, padding: "9px 10px",
    borderRadius: 8, border: "2px solid #e0e0e0", fontSize: 14, fontWeight: 600,
  };
  const MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <>
      <div style={{ ...CARD, padding: "28px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: ACCENT, margin: 0 }}>Tower Assignments</h2>
            <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
              Students open the tower builder with pre-set height, footprint, crush load, and cost targets.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setFormError(""); }}
            style={{ padding: "10px 20px", borderRadius: 10, border: `2px solid ${ACCENT}`,
              background: showForm ? ACCENT_LIGHT : "#fff", color: ACCENT_DARK,
              fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {showForm ? "✕ Cancel" : "+ New Assignment"}
          </button>
        </div>

        {showForm && (
          <div style={{ background: ACCENT_BG, border: `2px solid ${ACCENT_LIGHT}`, borderRadius: 14,
            padding: "20px 22px", marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: ACCENT_DARK, marginBottom: 14 }}>Create Tower Assignment</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                Title (optional)
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Radio Tower Challenge"
                  maxLength={80}
                  style={inputStyle}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                  Height
                  <select value={form.heightFeet}
                    onChange={e => setForm(f => ({ ...f, heightFeet: Number(e.target.value) }))}
                    style={selectStyle}>
                    {HEIGHTS.map(h => <option key={h} value={h}>{h} ft</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                  Footprint
                  <select value={form.footprintFeet}
                    onChange={e => setForm(f => ({ ...f, footprintFeet: Number(e.target.value) }))}
                    style={selectStyle}>
                    {FOOTPRINTS.map(w => <option key={w} value={w}>{w} ft</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                  Crush Load
                  <select value={form.loadTon}
                    onChange={e => setForm(f => ({ ...f, loadTon: Number(e.target.value) }))}
                    style={selectStyle}>
                    {LOAD_TONS.map(t => <option key={t} value={t}>{t} Ton</option>)}
                  </select>
                </label>
              </div>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                Max Total Cost ($)
                <input
                  value={form.maxCost}
                  onChange={e => { setForm(f => ({ ...f, maxCost: e.target.value })); setFormError(""); }}
                  placeholder="e.g. 150000"
                  type="number"
                  min={0.01}
                  step={0.01}
                  style={{ ...inputStyle, border: formError ? "2px solid #dc2626" : "2px solid #e0e0e0" }}
                />
                <span style={{ display: "block", marginTop: 4, fontSize: 11, fontWeight: 500, color: "#888" }}>
                  Site cost alone (foundation &amp; crane) is ${(form.footprintFeet * 2000 + form.heightFeet * 500).toLocaleString()} for this height and footprint, before any steel.
                </span>
              </label>
              {formError && <div style={{ fontSize: 12, color: "#dc2626" }}>{formError}</div>}
              <button
                onClick={handleCreate}
                disabled={formSaving}
                style={{ padding: "11px 24px", borderRadius: 10, border: "none",
                  background: formSaving ? "#5eead4" : ACCENT,
                  color: "#fff", fontWeight: 800, fontSize: 14,
                  cursor: formSaving ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
                {formSaving ? "Creating…" : "Create Assignment"}
              </button>
            </div>
          </div>
        )}

        {renderGradebook()}

        {assignments.length > 0 && (
          <div style={{ borderTop: `2px solid ${ACCENT_LIGHT}`, margin: "4px 0 24px", opacity: 0.6 }} />
        )}

        {loadingAssignments ? null : assignments.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗼</div>
            No tower assignments yet — click <strong>+ New Assignment</strong> to create one.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {assignments.map(a => {
              const isExpanded = expandedId === a.id;
              const leaderboard = leaderboards[a.id] ?? [];
              const isLoadingLb = loadingLeaderboardId === a.id;
              return (
                <div key={a.id} style={{ borderRadius: 14, border: `2px solid ${ACCENT_LIGHT}`, background: ACCENT_BG, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 18px", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: ACCENT_DARK, marginBottom: 4 }}>
                        {a.title || "Tower Assignment"}
                      </div>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Height: {a.height_feet} ft</span>
                        <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Footprint: {a.footprint_feet} ft</span>
                        <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Crush load: {a.load_lb / 2000} ton</span>
                        <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Budget: ${Number(a.max_cost).toFixed(2)}</span>
                        <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                          ✓ {a.completionCount} student{a.completionCount !== 1 ? "s" : ""} passed
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => window.open(`/tools/tower?assignment=${a.id}&demo=teacher`, "_blank")}
                        title="Try this assignment yourself — nothing is saved or submitted"
                        style={{ padding: "7px 16px", borderRadius: 8, border: "2px solid #2563eb",
                          background: "#fff", color: "#1d4ed8",
                          fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        ▶ Demo
                      </button>
                      <button
                        onClick={() => toggleLeaderboard(a.id)}
                        style={{ padding: "7px 16px", borderRadius: 8, border: `2px solid ${ACCENT}`,
                          background: isExpanded ? ACCENT : "#fff", color: isExpanded ? "#fff" : ACCENT_DARK,
                          fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        {isExpanded ? "▲ Hide" : "🏆 Leaderboard"}
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={deletingId === a.id}
                        style={{ padding: "7px 16px", borderRadius: 8, border: "2px solid #fca5a5",
                          background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: 12,
                          cursor: deletingId === a.id ? "not-allowed" : "pointer",
                          opacity: deletingId === a.id ? 0.6 : 1 }}>
                        {deletingId === a.id ? "Deleting…" : "✕ Delete"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: `2px solid ${ACCENT_LIGHT}`, padding: "20px 18px" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: ACCENT_DARK, marginBottom: 14 }}>
                        🏆 Leaderboard — {a.title || "Tower Assignment"}
                      </div>
                      {isLoadingLb ? (
                        <div style={{ color: "#888", fontSize: 13 }}>Loading…</div>
                      ) : leaderboard.length === 0 ? (
                        <div style={{ color: "#aaa", fontSize: 13, fontStyle: "italic" }}>No submissions yet.</div>
                      ) : (
                        <div style={{ overflowX: "auto", borderRadius: 10, border: `2px solid ${ACCENT_LIGHT}` }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
                            <thead>
                              <tr style={{ background: ACCENT_HEADER }}>
                                <th style={{ ...TH, width: 48, textAlign: "center" }}>Rank</th>
                                <th style={{ ...TH }}>Student</th>
                                <th style={{ ...TH, textAlign: "right" }}>Cost</th>
                                <th style={{ ...TH, textAlign: "right" }}>vs Budget</th>
                              </tr>
                            </thead>
                            <tbody>
                              {leaderboard.map((row, si) => {
                                const savings = Number(a.max_cost) - row.cost;
                                const savingsPct = Number(a.max_cost) > 0 ? (savings / Number(a.max_cost) * 100) : 0;
                                return (
                                  <tr key={row.student_id} style={{ background: si % 2 === 0 ? "#fff" : ACCENT_BG }}>
                                    <td style={{ ...TD, textAlign: "center", fontSize: 18 }}>
                                      {MEDALS[si] ?? `#${row.rank}`}
                                    </td>
                                    <td style={{ ...TD }}>
                                      <div style={{ fontWeight: 700, color: "#111" }}>{row.name}</div>
                                      <div style={{ fontSize: 11, color: "#888" }}>{row.email}</div>
                                    </td>
                                    <td style={{ ...TD, textAlign: "right", fontWeight: 800, color: si === 0 ? ACCENT : "#111" }}>
                                      ${row.cost.toFixed(2)}
                                    </td>
                                    <td style={{ ...TD, textAlign: "right" }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: savings >= 0 ? "#16a34a" : "#dc2626" }}>
                                        {savings >= 0 ? `-$${savings.toFixed(2)}` : `+$${Math.abs(savings).toFixed(2)}`}
                                        <span style={{ fontSize: 10, color: "#888", marginLeft: 4 }}>
                                          ({savingsPct.toFixed(0)}% saved)
                                        </span>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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

      {/* Overall Tower Leaderboard — all teacher classes */}
      <div style={{ ...CARD, marginTop: 24, padding: "24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showOverall ? 20 : 0 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: ACCENT, margin: 0 }}>Overall Tower Leaderboard</h2>
            <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
              Individual standings across all your classes, ranked by lowest cost.
            </p>
          </div>
          <button
            onClick={() => {
              if (!showOverall && overall === null) loadOverall();
              setShowOverall(v => !v);
            }}
            style={{ padding: "9px 20px", borderRadius: 99, border: `2px solid ${ACCENT}`,
              background: showOverall ? ACCENT : "#fff",
              color: showOverall ? "#fff" : ACCENT_DARK,
              fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            {showOverall ? "Hide" : "Show Leaderboard"}
          </button>
        </div>

        {showOverall && (
          loadingOverall ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#888", fontWeight: 600 }}>Loading…</div>
          ) : !overall || overall.overall.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
              No passing tower submissions yet.
            </div>
          ) : (() => {
            const tabs = [{ key: "overall", label: "Overall" }, ...overall.byAssignment.map(a => ({ key: a.title, label: a.title }))];
            const activeRows = overallTab === "overall"
              ? overall.overall
              : (overall.byAssignment.find(a => a.title === overallTab)?.rows ?? []);
            const showChallenge = overallTab === "overall";
            return (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {tabs.map(tab => (
                    <button key={tab.key} onClick={() => setOverallTab(tab.key)}
                      style={{ padding: "7px 16px", borderRadius: 99, border: "2px solid",
                        borderColor: overallTab === tab.key ? ACCENT : "#e5e7eb",
                        background: overallTab === tab.key ? ACCENT : "#fff",
                        color: overallTab === tab.key ? "#fff" : "#374151",
                        fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div style={{ overflowX: "auto", borderRadius: 10, border: `2px solid ${ACCENT_LIGHT}` }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
                    <thead>
                      <tr style={{ background: ACCENT_HEADER }}>
                        <th style={{ ...TH, width: 48, textAlign: "center" }}>Rank</th>
                        <th style={{ ...TH }}>Student</th>
                        {showChallenge && <th style={{ ...TH }}>Challenge</th>}
                        <th style={{ ...TH, textAlign: "right" }}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRows.map((row, si) => (
                        <tr key={row.student_id} style={{ background: si % 2 === 0 ? "#fff" : ACCENT_BG }}>
                          <td style={{ ...TD, textAlign: "center", fontSize: 18 }}>{MEDALS[si] ?? `#${row.rank}`}</td>
                          <td style={{ ...TD }}>
                            <div style={{ fontWeight: 700, color: "#111" }}>{row.name}</div>
                            <div style={{ fontSize: 11, color: "#888" }}>{row.email}</div>
                          </td>
                          {showChallenge && <td style={{ ...TD, color: "#555" }}>{row.assignment_title}</td>}
                          <td style={{ ...TD, textAlign: "right", fontWeight: 800, color: si === 0 ? ACCENT : "#111" }}>
                            ${row.cost.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()
        )}
      </div>
    </>
  );
}
