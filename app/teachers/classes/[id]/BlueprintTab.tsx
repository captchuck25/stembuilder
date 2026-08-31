"use client";

// Blueprint Lab tab on the teacher class page: create/edit/save assignments
// (brief + adjustable rubric + shell settings), list saved assignments, and
// browse student-saved floor plans. Requires migration 0023.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRIEFS, Brief, DEFAULT_FURNISHINGS, RoomRequirement } from "@/app/tools/blueprint-lab/engine/rubric";
import { SHELLS, formatShellStats, shellStats } from "@/app/tools/blueprint-lab/engine/shells";
import { ROOM_TYPES } from "@/app/tools/blueprint-lab/engine/types";

const INDIGO = "#4f46e5";
const CARD_BORDER = "2px solid #e0e7ff";

interface AssignmentRow {
  id: string;
  title: string;
  brief_id: string;
  config: Partial<Brief>;
  shell_mode: "scratch" | "choice" | "fixed";
  shell_ids: string[];
  status: "draft" | "assigned";
  created_at: string;
  updated_at: string;
}

interface DesignRow {
  id: string; user_id: string; name: string; units: string;
  thumbnail: string | null; updated_at: string; student_name: string;
}

interface Draft {
  id?: string;
  title: string;
  briefId: string;
  config: Brief;
  shellMode: "scratch" | "choice" | "fixed";
  shellIds: string[];
  status: "draft" | "assigned";
}

// Deep-copy a brief template into an editable draft config.
const cloneBrief = (b: Brief): Brief => JSON.parse(JSON.stringify(b));

// Resolve a stored assignment's config against its base brief (config may be
// {} on old rows — fall back to the code template).
function resolveConfig(row: AssignmentRow): Brief {
  const base = BRIEFS.find(b => b.id === row.brief_id) ?? BRIEFS[0];
  const cfg = row.config;
  return cfg && Array.isArray(cfg.rooms) ? { ...cloneBrief(base), ...cfg } as Brief : cloneBrief(base);
}

const ftLabel = (inches?: number) => inches == null ? "" : String(Math.round((inches / 12) * 10) / 10);

// Mini SVG preview of a shell outline.
function ShellPreview({ shellId, sqFt }: { shellId: string; sqFt: number }) {
  const def = SHELLS.find(s => s.id === shellId);
  if (!def) return null;
  const pts = def.outline(sqFt);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      style={{ width: 64, height: 48, display: "block" }}>
      <polygon points={pts.map(p => `${p.x},${p.y}`).join(" ")}
        fill="#c7d2fe" stroke={INDIGO} strokeWidth={(maxX - minX) * 0.02} />
    </svg>
  );
}

const inputStyle: React.CSSProperties = {
  width: 64, fontSize: 13, padding: "4px 6px", borderRadius: 6,
  border: "1.5px solid #c7d2fe", color: "#111", background: "#fff",
};

export default function BlueprintTab({ classId }: { classId: string }) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    fetch(`/api/teacher/blueprint-assignments?classId=${classId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setAssignments);
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/teacher/blueprint-assignments?classId=${classId}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/teacher/blueprint-designs?classId=${classId}`).then(r => r.ok ? r.json() : []),
    ]).then(([a, d]) => { setAssignments(a); setDesigns(d); })
      .finally(() => setLoading(false));
  }, [classId]);

  const startNew = (briefId: string) => {
    const base = BRIEFS.find(b => b.id === briefId) ?? BRIEFS[0];
    setDraft({
      title: base.title,
      briefId: base.id,
      config: cloneBrief(base),
      shellMode: "scratch",
      shellIds: [],
      status: "draft",
    });
    setError(null);
  };

  const startEdit = (row: AssignmentRow) => {
    setDraft({
      id: row.id,
      title: row.title,
      briefId: row.brief_id,
      config: resolveConfig(row),
      shellMode: row.shell_mode,
      shellIds: row.shell_ids ?? [],
      status: row.status,
    });
    setError(null);
  };

  const startNewCustom = () => {
    setDraft({
      title: "Custom assignment",
      briefId: "custom",
      config: {
        id: "custom",
        title: "Custom assignment",
        description: "Teacher-defined design brief.",
        totalSqFt: { min: 800, max: 1200 },
        rooms: [],
        frontDoor: true,
        backDoor: false,
        deliverables: ["floor-plan"],
      },
      shellMode: "scratch",
      shellIds: [],
      status: "draft",
    });
    setError(null);
  };

  const save = async (statusOverride?: "draft" | "assigned") => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/blueprint-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          classId,
          title: draft.title,
          briefId: draft.briefId,
          config: draft.config,
          shellMode: draft.shellMode,
          shellIds: draft.shellIds,
          status: statusOverride ?? draft.status,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? `Save failed (${res.status})`); return; }
      setDraft(null);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this assignment?")) return;
    await fetch(`/api/teacher/blueprint-assignments?id=${id}`, { method: "DELETE" });
    reload();
  };

  const setStatus = async (row: AssignmentRow, status: "draft" | "assigned") => {
    await fetch("/api/teacher/blueprint-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id, classId, title: row.title, briefId: row.brief_id,
        config: row.config, shellMode: row.shell_mode, shellIds: row.shell_ids, status,
      }),
    });
    reload();
  };

  const patchRoom = (i: number, patch: Partial<RoomRequirement>) => {
    setDraft(d => {
      if (!d) return d;
      const rooms = d.config.rooms.map((r, idx) => idx === i ? { ...r, ...patch } : r);
      return { ...d, config: { ...d.config, rooms } };
    });
  };

  const sqFtMid = draft?.config.totalSqFt
    ? (draft.config.totalSqFt.min + draft.config.totalSqFt.max) / 2
    : 1000;

  // ── Editor ──────────────────────────────────────────────────────────────
  if (draft) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: INDIGO, margin: 0, flex: 1 }}>
            {draft.id ? "Edit Assignment" : "New Assignment"}
          </h2>
          <button onClick={() => setDraft(null)}
            style={{ fontSize: 12, fontWeight: 700, color: "#666", background: "none",
              border: "2px solid #ddd", borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => save()} disabled={saving}
            style={{ fontSize: 12, fontWeight: 800, color: "#fff", background: INDIGO,
              border: "none", borderRadius: 999, padding: "8px 18px", cursor: "pointer",
              opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save assignment"}
          </button>
        </div>
        {error && (
          <div style={{ marginBottom: 14, padding: "8px 14px", borderRadius: 8, background: "#fee2e2",
            color: "#991b1b", fontSize: 13, fontWeight: 600 }}>{error}</div>
        )}

        {/* Title + area */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>
            Title<br />
            <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
              style={{ ...inputStyle, width: 280, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>
            Total SF min<br />
            <input type="number" value={draft.config.totalSqFt?.min ?? ""} style={{ ...inputStyle, marginTop: 4 }}
              onChange={e => setDraft({ ...draft, config: { ...draft.config,
                totalSqFt: { min: Number(e.target.value) || 0, max: draft.config.totalSqFt?.max ?? 0 } } })} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>
            Total SF max<br />
            <input type="number" value={draft.config.totalSqFt?.max ?? ""} style={{ ...inputStyle, marginTop: 4 }}
              onChange={e => setDraft({ ...draft, config: { ...draft.config,
                totalSqFt: { min: draft.config.totalSqFt?.min ?? 0, max: Number(e.target.value) || 0 } } })} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#444", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={draft.config.frontDoor}
              onChange={e => setDraft({ ...draft, config: { ...draft.config, frontDoor: e.target.checked } })} />
            Front door
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#444", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={draft.config.backDoor}
              onChange={e => setDraft({ ...draft, config: { ...draft.config, backDoor: e.target.checked } })} />
            Back door
          </label>
        </div>

        {/* Room requirements */}
        <div style={{ fontSize: 13, fontWeight: 800, color: "#312e81", marginBottom: 8 }}>Room requirements</div>
        <div style={{ overflowX: "auto", marginBottom: 10 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, color: "#111", minWidth: 720 }}>
            <thead>
              <tr style={{ color: "#6b7280", fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "4px 10px 4px 0" }}>Room</th>
                <th style={{ padding: "4px 10px" }}>Count</th>
                <th style={{ padding: "4px 10px" }}>Min size (ft × ft)</th>
                <th style={{ padding: "4px 10px" }}>Windows</th>
                <th style={{ padding: "4px 10px" }}>Doors</th>
                <th style={{ padding: "4px 10px" }}>Furnishings</th>
                <th style={{ padding: "4px 10px" }}>Closet</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.config.rooms.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef2ff" }}>
                  <td style={{ padding: "6px 10px 6px 0", fontWeight: 700 }}>{r.roomType}</td>
                  <td style={{ padding: "6px 10px" }}>
                    <input type="number" min={1} value={r.count} style={{ ...inputStyle, width: 48 }}
                      onChange={e => patchRoom(i, { count: Math.max(1, Number(e.target.value) || 1) })} />
                  </td>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    <input type="number" step={0.5} placeholder="—" value={ftLabel(r.minDims?.a)}
                      style={{ ...inputStyle, width: 52 }}
                      onChange={e => {
                        const v = Number(e.target.value);
                        patchRoom(i, { minDims: v > 0 ? { a: v * 12, b: r.minDims?.b ?? v * 12 } : undefined });
                      }} />
                    {" × "}
                    <input type="number" step={0.5} placeholder="—" value={ftLabel(r.minDims?.b)}
                      style={{ ...inputStyle, width: 52 }}
                      onChange={e => {
                        const v = Number(e.target.value);
                        patchRoom(i, { minDims: v > 0 ? { a: r.minDims?.a ?? v * 12, b: v * 12 } : undefined });
                      }} />
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <input type="number" min={0} value={r.minWindows ?? 0} style={{ ...inputStyle, width: 48 }}
                      onChange={e => patchRoom(i, { minWindows: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} />
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <input type="number" min={0} value={r.minDoors ?? 0} style={{ ...inputStyle, width: 48 }}
                      onChange={e => patchRoom(i, { minDoors: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} />
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "center" }}>
                    {DEFAULT_FURNISHINGS[r.roomType] ? (
                      <input type="checkbox" checked={!!r.furniture?.length}
                        title="Require standard furnishings/fixtures for this room type"
                        onChange={e => {
                          patchRoom(i, { furniture: e.target.checked ? DEFAULT_FURNISHINGS[r.roomType] : undefined });
                        }} />
                    ) : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "center" }}>
                    {r.roomType.includes("BEDROOM") ? (
                      <input type="checkbox" checked={!!r.attachedCloset}
                        onChange={e => patchRoom(i, { attachedCloset: e.target.checked || undefined })} />
                    ) : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                  <td style={{ padding: "6px 0" }}>
                    <button onClick={() => setDraft(d => d ? { ...d, config: { ...d.config,
                      rooms: d.config.rooms.filter((_, idx) => idx !== i) } } : d)}
                      title="Remove requirement"
                      style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer", fontWeight: 800 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {draft.config.rooms.some(r => r.roomType === "GARAGE") && (
          <div style={{ margin: "0 0 12px", padding: "7px 12px", borderRadius: 8, maxWidth: 640,
            background: "#eef2ff", color: "#4338ca", fontSize: 12, lineHeight: 1.5 }}>
            Garage: students draw it OUTSIDE the shell — its area doesn&apos;t count toward the
            SF target. Set the min size for 1-car (≈ 12&apos; × 20&apos;) or 2-car (≈ 20&apos; × 20&apos;).
          </div>
        )}
        <div style={{ marginBottom: 22 }}>
          <select value="" style={{ ...inputStyle, width: 220 }}
            onChange={e => {
              const t = e.target.value;
              if (!t) return;
              const row: RoomRequirement = t === "GARAGE"
                ? { roomType: t, count: 1, minDims: { a: 240, b: 240 }, minDoors: 1,
                    note: "Draw the garage OUTSIDE the shell — the SF target is for the interior. 1-car ≈ 12' × 20', 2-car ≈ 20' × 20'. Garage area is not counted in total SF." }
                : { roomType: t, count: 1 };
              setDraft(d => d ? { ...d, config: { ...d.config,
                rooms: [...d.config.rooms, row] } } : d);
            }}>
            <option value="">+ Add room requirement…</option>
            {ROOM_TYPES.filter(t => !draft.config.rooms.some(r => r.roomType === t)).map(t =>
              <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Shell settings */}
        <div style={{ fontSize: 13, fontWeight: 800, color: "#312e81", marginBottom: 8 }}>Perimeter (shell)</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12.5, fontWeight: 600, color: "#444", flexWrap: "wrap" }}>
          {([
            ["scratch", "Design from scratch", "Students draw their own exterior walls"],
            ["choice", "Student picks a shell", "Students choose one of the shapes below"],
            ["fixed", "One fixed shell", "Every student starts from the same shape"],
          ] as const).map(([mode, label, desc]) => (
            <label key={mode} style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer",
              padding: "8px 12px", borderRadius: 10,
              border: draft.shellMode === mode ? `2px solid ${INDIGO}` : "2px solid #e5e7eb",
              background: draft.shellMode === mode ? "#eef2ff" : "#fff" }}>
              <input type="radio" checked={draft.shellMode === mode}
                onChange={() => setDraft({ ...draft, shellMode: mode,
                  shellIds: mode === "fixed" && draft.shellIds.length > 1 ? [draft.shellIds[0]] : draft.shellIds })} />
              <span>{label}<br /><span style={{ fontWeight: 400, color: "#777", fontSize: 11.5 }}>{desc}</span></span>
            </label>
          ))}
        </div>
        {draft.shellMode !== "scratch" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            {SHELLS.map(s => {
              const selected = draft.shellIds.includes(s.id);
              // A shape that needs more area than this brief targets is
              // offered grayed-out (no U-shape studios).
              const tooSmall = sqFtMid < s.minSqFt;
              const stats = shellStats({ shellId: s.id, sqFt: sqFtMid });
              return (
                <div key={s.id}
                  onClick={() => {
                    if (tooSmall) return;
                    setDraft(d => {
                      if (!d) return d;
                      if (d.shellMode === "fixed") return { ...d, shellIds: [s.id] };
                      return { ...d, shellIds: selected ? d.shellIds.filter(x => x !== s.id) : [...d.shellIds, s.id] };
                    });
                  }}
                  title={tooSmall ? `Needs a target of at least ${s.minSqFt.toLocaleString()} SF` : s.describe}
                  style={{ width: 132, padding: "10px 10px 8px", borderRadius: 10,
                    cursor: tooSmall ? "not-allowed" : "pointer", opacity: tooSmall ? 0.4 : 1,
                    border: selected ? `2px solid ${INDIGO}` : "2px solid #e5e7eb",
                    background: selected ? "#eef2ff" : "#fff", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <ShellPreview shellId={s.id} sqFt={sqFtMid} />
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: selected ? "#312e81" : "#555", marginTop: 6 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#888", marginTop: 2 }}>
                    {tooSmall ? `needs ${s.minSqFt.toLocaleString()}+ SF` : stats ? formatShellStats(stats) : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {draft.shellMode !== "scratch" && draft.shellIds.length === 0 && (
          <div style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>
            Pick at least one shape.
          </div>
        )}
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div>
      {/* New from brief */}
      <h2 style={{ fontSize: 18, fontWeight: 900, color: INDIGO, marginBottom: 6 }}>Blueprint Assignments</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Start from a brief, adjust the rubric and perimeter options, then save. Auto-checked
        requirements grade themselves in the student&apos;s Requirements panel.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 26 }}>
        {BRIEFS.map(b => (
          <button key={b.id} onClick={() => startNew(b.id)}
            style={{ borderRadius: 10, border: CARD_BORDER, background: "#eef2ff", cursor: "pointer",
              padding: "12px 16px", textAlign: "left", width: 240 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#312e81" }}>+ {b.title}</div>
            <div style={{ fontSize: 11.5, color: "#666", marginTop: 4, lineHeight: 1.45 }}>{b.description}</div>
          </button>
        ))}
        <button onClick={startNewCustom}
          style={{ borderRadius: 10, border: "2px dashed #c7d2fe", background: "#fff", cursor: "pointer",
            padding: "12px 16px", textAlign: "left", width: 240 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#312e81" }}>+ Create custom</div>
          <div style={{ fontSize: 11.5, color: "#666", marginTop: 4, lineHeight: 1.45 }}>
            Start from a blank rubric — add your own rooms, sizes and shell options.
          </div>
        </button>
      </div>

      {/* Saved assignments */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#aaa", fontSize: 14 }}>Loading…</div>
      ) : assignments.length === 0 ? (
        <div style={{ padding: "14px 16px", borderRadius: 10, background: "#f8faff", border: "1.5px dashed #c7d2fe",
          color: "#888", fontSize: 13, marginBottom: 26 }}>
          No assignments yet — pick a brief above to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
          {assignments.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
              borderRadius: 12, border: CARD_BORDER, background: "#fff", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>
                  {a.title}
                  <span style={{ marginLeft: 10, fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                    background: a.status === "assigned" ? "#dcfce7" : "#f3f4f6",
                    color: a.status === "assigned" ? "#15803d" : "#6b7280" }}>
                    {a.status === "assigned" ? "ASSIGNED" : "DRAFT"}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "#777", marginTop: 3 }}>
                  {(BRIEFS.find(b => b.id === a.brief_id)?.title ?? a.brief_id)}
                  {" · "}
                  {a.shell_mode === "scratch" ? "from scratch"
                    : a.shell_mode === "fixed" ? "fixed shell" : `${(a.shell_ids ?? []).length} shell choices`}
                </div>
              </div>
              <Link href={`/tools/blueprint-lab?assignment=${a.id}`} target="_blank"
                style={{ fontSize: 12, fontWeight: 800, color: "#4338ca", textDecoration: "none",
                  padding: "6px 14px", borderRadius: 999, border: `2px solid ${INDIGO}`, background: "#eef2ff" }}>
                Preview
              </Link>
              <button onClick={() => setStatus(a, a.status === "assigned" ? "draft" : "assigned")}
                style={{ fontSize: 12, fontWeight: 800, cursor: "pointer",
                  color: a.status === "assigned" ? "#6b7280" : "#15803d",
                  padding: "6px 14px", borderRadius: 999,
                  border: `2px solid ${a.status === "assigned" ? "#d1d5db" : "#22c55e"}`,
                  background: a.status === "assigned" ? "#f9fafb" : "#f0fdf4" }}>
                {a.status === "assigned" ? "Unassign" : "Assign"}
              </button>
              <button onClick={() => startEdit(a)}
                style={{ fontSize: 12, fontWeight: 700, color: "#444", cursor: "pointer",
                  padding: "6px 14px", borderRadius: 999, border: "2px solid #d1d5db", background: "#fff" }}>
                Edit
              </button>
              <button onClick={() => remove(a.id)}
                style={{ fontSize: 12, fontWeight: 700, color: "#e11d48", cursor: "pointer",
                  padding: "6px 14px", borderRadius: 999, border: "2px solid #fecdd3", background: "#fff" }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Student designs */}
      <h3 style={{ fontSize: 15, fontWeight: 900, color: INDIGO, margin: "0 0 6px" }}>Student Floor Plans</h3>
      <p style={{ fontSize: 12.5, color: "#666", marginBottom: 14 }}>All floor plans saved by students in this class.</p>
      {designs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "18px 0", color: "#aaa", fontSize: 13 }}>No floor plans saved yet.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {designs.map(d => (
            <div key={d.id} style={{ borderRadius: 12, border: CARD_BORDER,
              background: "#eef2ff", overflow: "hidden", width: 190, flexShrink: 0 }}>
              <div style={{ width: "100%", height: 120, background: "#c7d2fe", overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                {d.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumbnail} alt={d.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <span style={{ fontSize: 32, opacity: 0.3 }}>📐</span>
                )}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#111",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: INDIGO, marginTop: 2 }}>{d.student_name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2, marginBottom: 8 }}>
                  {d.units} · {new Date(d.updated_at).toLocaleDateString()}
                </div>
                <Link href={`/tools/blueprint-lab?asStudent=${d.user_id}&id=${d.id}`} target="_blank"
                  style={{ display: "block", textAlign: "center", fontSize: 12, fontWeight: 800,
                    color: "#4338ca", textDecoration: "none", padding: "5px 10px", borderRadius: 999,
                    border: `2px solid ${INDIGO}`, background: "#eef2ff" }}>
                  👁 Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
