"use client";

// STEM Sketch assignments — teacher-side panel rendered inside the class
// page's STEM Sketch tab, above the designs gallery. Pro-gated: the parent
// only renders this when the plan includes STEM Sketch assignments (the API
// routes independently re-check, same defense-in-depth as Quiz Builder).
//
// Stage 1 challenges ("make what you see"): teacher picks a challenge from
// the code-defined library (lib/stem-sketch/challenges.ts), prints its STL,
// students measure the physical block, model it, and submit from inside the
// tool; results land here.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  PRECISION_LABEL,
  STAGE_META,
  challengesForStage,
  getChallenge,
  challengeReady,
  type SketchStage,
} from "@/lib/stem-sketch/challenges";

interface SketchAssignment {
  id: string;
  title: string;
  challenge_id: string;
  created_at: string;
  submitStudentCount: number;
}

interface ResultRow {
  student_id: string;
  name: string;
  passed: boolean;
  attempts: number;
  last_submission_id: number;
  last_at: string;
}

const TH: React.CSSProperties = {
  padding: "9px 14px", textAlign: "left", fontSize: 12, fontWeight: 800,
  color: "#155e75", whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "9px 14px", fontSize: 13, color: "#111",
  borderTop: "1px solid #cffafe",
};

export default function StemSketchTab({ classId }: { classId: string }) {
  const [assignments, setAssignments] = useState<SketchAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // Which assignment type (level) the teacher is creating — picking a level
  // box filters the challenge list to that stage.
  const [createStage, setCreateStage] = useState<SketchStage | null>(null);
  const [form, setForm] = useState({ title: "", challengeId: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ResultRow[]>>({});
  const [loadingResultsId, setLoadingResultsId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/teacher/stem-sketch-assignments?classId=${encodeURIComponent(classId)}`);
    setAssignments(res.ok ? await res.json() : []);
    setLoading(false);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/stem-sketch-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, title: form.title, challengeId: form.challengeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setFormError(data?.error || `Could not create assignment (HTTP ${res.status})`);
        return;
      }
      const created = await res.json();
      setAssignments(prev => [created, ...prev]);
      setShowForm(false);
      setForm(f => ({ ...f, title: "" }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this assignment? Student submissions for it will no longer be visible.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/teacher/stem-sketch-assignments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) setAssignments(prev => prev.filter(a => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleResults(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!results[id]) {
      setLoadingResultsId(id);
      try {
        const res = await fetch(`/api/teacher/stem-sketch-results?assignmentId=${encodeURIComponent(id)}`);
        const rows = res.ok ? await res.json() : [];
        setResults(prev => ({ ...prev, [id]: rows }));
      } finally {
        setLoadingResultsId(null);
      }
    }
  }

  const selected = getChallenge(form.challengeId);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#0891b2", margin: 0 }}>STEM Sketch Assignments</h2>
          <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
            Print the challenge block, students measure it in real life, model it in STEM Sketch, and submit — the tool checks the fit.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setCreateStage(null); setFormError(""); }}
          style={{ padding: "10px 20px", borderRadius: 10, border: "2px solid #0891b2",
            background: showForm ? "#cffafe" : "#fff", color: "#155e75",
            fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          {showForm ? "✕ Cancel" : "+ New Assignment"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#ecfeff", border: "2px solid #a5f3fc", borderRadius: 14,
          padding: "20px 22px", marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#155e75", marginBottom: 14 }}>
            Create STEM Sketch Assignment — pick a level
          </div>
          {/* Level boxes: the three assignment types */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            {([1, 2, 3] as const).map(lvl => {
              const meta = STAGE_META[lvl];
              const comingSoon = lvl === 3;
              const active = createStage === lvl;
              return (
                <div key={lvl}
                  onClick={() => {
                    if (comingSoon) return;
                    setCreateStage(lvl);
                    const first = challengesForStage(lvl)[0];
                    setForm(f => ({ ...f, challengeId: first?.id ?? "" }));
                  }}
                  style={{ flex: "1 1 200px", minWidth: 200, padding: "12px 14px", borderRadius: 12,
                    border: `2px solid ${active ? "#0891b2" : comingSoon ? "#e5e7eb" : "#a5f3fc"}`,
                    background: active ? "#fff" : comingSoon ? "#f9fafb" : "#f0fdff",
                    cursor: comingSoon ? "default" : "pointer", opacity: comingSoon ? 0.65 : 1,
                    userSelect: "none" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: comingSoon ? "#9ca3af" : "#155e75" }}>
                    {meta.icon} Level {lvl} · {meta.name}
                    {comingSoon && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                      background: "#e5e7eb", color: "#6b7280", borderRadius: 999, padding: "2px 8px" }}>coming soon</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: comingSoon ? "#b0b5bd" : "#557", marginTop: 4, lineHeight: 1.4 }}>
                    {meta.blurb}
                  </div>
                </div>
              );
            })}
          </div>
          {createStage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
              Challenge
              <select
                value={form.challengeId}
                onChange={e => setForm(f => ({ ...f, challengeId: e.target.value }))}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "9px 10px",
                  borderRadius: 8, border: "2px solid #e0e0e0", fontSize: 14, fontWeight: 600 }}>
                {challengesForStage(createStage).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {PRECISION_LABEL[c.precision]}{challengeReady(c) ? "" : " (geometry pending)"}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <div style={{ fontSize: 12, color: "#555", background: "#fff", border: "2px solid #cffafe",
                borderRadius: 10, padding: "10px 14px", lineHeight: 1.5 }}>
                {selected.imagePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.imagePath} alt={`${selected.title} — the printed challenge block`}
                    style={{ display: "block", width: "100%", maxHeight: 150, objectFit: "contain",
                      background: "#fff", borderRadius: 8, border: "1px solid #e0f2fe", marginBottom: 8 }} />
                )}
                {selected.description}
                <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                  <Link href={`/tools/stem-sketch?challenge=${encodeURIComponent(selected.id)}`}
                    target="_blank"
                    title="Open this challenge in STEM Sketch to try it yourself before assigning — nothing is recorded"
                    style={{ color: "#0e7490", fontWeight: 800, textDecoration: "none" }}>
                    ▶ Try it first
                  </Link>
                  <Link href={`/tools/stem-sketch/worksheet?challenge=${encodeURIComponent(selected.id)}`}
                    target="_blank"
                    title="Printable orthographic worksheet — third-angle view boxes at true 1:1 scale with an eighth-inch grid"
                    style={{ color: "#0e7490", fontWeight: 800, textDecoration: "none" }}>
                    🖨 Worksheet
                  </Link>
                  {selected.stlPath && (
                    <a href={selected.stlPath} download
                      style={{ color: "#0e7490", fontWeight: 800, textDecoration: "none" }}>
                      ⬇ Download printable STL
                    </a>
                  )}
                </div>
              </div>
            )}
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
              Title (optional)
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={selected ? `e.g. ${selected.title}` : "Assignment title"}
                maxLength={80}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "9px 12px",
                  borderRadius: 8, border: "2px solid #e0e0e0", fontSize: 14,
                  fontWeight: 600, color: "#111", outline: "none", boxSizing: "border-box" }}
              />
            </label>
            {formError && <div style={{ fontSize: 12, color: "#dc2626" }}>{formError}</div>}
            <button
              onClick={handleCreate}
              disabled={saving}
              style={{ padding: "11px 24px", borderRadius: 10, border: "none",
                background: saving ? "#67e8f9" : "#0891b2",
                color: "#fff", fontWeight: 800, fontSize: 14,
                cursor: saving ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
              {saving ? "Creating…" : "Create Assignment"}
            </button>
          </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#888", fontWeight: 600 }}>Loading…</div>
      ) : assignments.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✏️</div>
          No STEM Sketch assignments yet — click <strong>+ New Assignment</strong> to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {assignments.map(a => {
            const challenge = getChallenge(a.challenge_id);
            const isExpanded = expandedId === a.id;
            const rows = results[a.id] ?? [];
            const isLoadingResults = loadingResultsId === a.id;
            return (
              <div key={a.id} style={{ borderRadius: 14, border: "2px solid #a5f3fc", background: "#ecfeff", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 18px", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#155e75", marginBottom: 4 }}>
                      ✏️ {a.title || challenge?.title || "STEM Sketch Assignment"}
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {challenge ? (
                        <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>
                          {STAGE_META[challenge.stage].icon} Level {challenge.stage} · {STAGE_META[challenge.stage].name} · {challenge.title} · {PRECISION_LABEL[challenge.precision]}
                          {challengeReady(challenge) ? "" : " · geometry pending"}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Challenge retired from library</span>
                      )}
                      <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                        ✓ {a.submitStudentCount} student{a.submitStudentCount !== 1 ? "s" : ""} submitted
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link href={`/tools/stem-sketch?assignment=${a.id}`}
                      target="_blank"
                      style={{ padding: "7px 16px", borderRadius: 8, border: "2px solid #a5f3fc",
                        background: "#fff", color: "#155e75", fontWeight: 700, fontSize: 12,
                        textDecoration: "none" }}>
                      ▶ Try It
                    </Link>
                    <button
                      onClick={() => toggleResults(a.id)}
                      style={{ padding: "7px 16px", borderRadius: 8, border: "2px solid #0891b2",
                        background: isExpanded ? "#0891b2" : "#fff", color: isExpanded ? "#fff" : "#155e75",
                        fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      {isExpanded ? "▲ Hide" : "📊 Results"}
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
                  <div style={{ borderTop: "2px solid #a5f3fc", padding: "20px 18px" }}>
                    {isLoadingResults ? (
                      <div style={{ color: "#888", fontSize: 13 }}>Loading…</div>
                    ) : rows.length === 0 ? (
                      <div style={{ color: "#aaa", fontSize: 13, fontStyle: "italic" }}>No submissions yet.</div>
                    ) : (
                      <div style={{ overflowX: "auto", borderRadius: 10, border: "2px solid #a5f3fc" }}>
                        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
                          <thead>
                            <tr style={{ background: "#cffafe" }}>
                              <th style={{ ...TH }}>Student</th>
                              <th style={{ ...TH, textAlign: "center" }}>Fit Check</th>
                              <th style={{ ...TH, textAlign: "center" }}>Attempts</th>
                              <th style={{ ...TH }}>Last Submission</th>
                              <th style={{ ...TH }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, si) => (
                              <tr key={row.student_id} style={{ background: si % 2 === 0 ? "#fff" : "#ecfeff" }}>
                                <td style={{ ...TD, fontWeight: 700 }}>{row.name}</td>
                                <td style={{ ...TD, textAlign: "center", fontWeight: 800,
                                  color: row.passed ? "#16a34a" : "#dc2626" }}>
                                  {row.passed ? "✓ Passed" : "✗ Not yet"}
                                </td>
                                <td style={{ ...TD, textAlign: "center" }}>{row.attempts}</td>
                                <td style={{ ...TD, fontSize: 12, color: "#666" }}>
                                  {new Date(row.last_at).toLocaleDateString()}
                                </td>
                                <td style={{ ...TD }}>
                                  <Link
                                    href={`/tools/stem-sketch?asStudent=${encodeURIComponent(row.student_id)}&submissionId=${row.last_submission_id}`}
                                    target="_blank"
                                    title={`Open ${row.name}'s submission (read-only)`}
                                    style={{ fontSize: 12, fontWeight: 800, color: "#0e7490",
                                      textDecoration: "none", whiteSpace: "nowrap" }}>
                                    👁 Open
                                  </Link>
                                </td>
                              </tr>
                            ))}
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
  );
}
