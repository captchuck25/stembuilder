"use client";

// Blueprint Lab tab on the teacher class page: create/edit/save assignments
// (brief + adjustable rubric + shell settings), list saved assignments, and
// browse student-saved floor plans. Requires migration 0023.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRIEFS, Brief, DEFAULT_FURNISHINGS, RoomRequirement, sqFtRangeFor } from "@/app/tools/blueprint-lab/engine/rubric";
import {
  GradingRubric, TEACHER_CATEGORY_PRESETS, resolveGradingRubric, rubricForDeliverables, rubricMaxPoints,
} from "@/app/tools/blueprint-lab/engine/gradingRubric";
import {
  SHELLS, formatShellStats, parseShellIds, shellOutline, shellStats, shellVariants,
} from "@/app/tools/blueprint-lab/engine/shells";
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
  rubric: GradingRubric;
  shellMode: "scratch" | "choice" | "fixed";
  shellIds: string[];
  status: "draft" | "assigned";
}

const cloneRubric = (r: GradingRubric): GradingRubric => JSON.parse(JSON.stringify(r));

// Deep-copy a brief template into an editable draft config.
const cloneBrief = (b: Brief): Brief => JSON.parse(JSON.stringify(b));

// Resolve a stored assignment's config against its base brief (config may be
// {} on old rows — fall back to the code template).
function resolveConfig(row: AssignmentRow): Brief {
  const base = BRIEFS.find(b => b.id === row.brief_id) ?? BRIEFS[0];
  const cfg = row.config;
  const brief = cfg && Array.isArray(cfg.rooms) ? { ...cloneBrief(base), ...cfg } as Brief : cloneBrief(base);
  // Normalize legacy range-only configs to the target+tolerance model so the
  // editor always shows one number (target inherited from the template would
  // misstate a stored custom range — recompute from the range itself).
  if (brief.totalSqFt) {
    const derived = brief.targetSqFt ? sqFtRangeFor(brief.targetSqFt, brief.sqFtTolerancePct ?? 10) : null;
    const matches = derived && Math.abs(brief.totalSqFt.min - derived.min) <= 2 && Math.abs(brief.totalSqFt.max - derived.max) <= 2;
    if (!matches) {
      const mid = (brief.totalSqFt.min + brief.totalSqFt.max) / 2;
      brief.targetSqFt = Math.round(mid / 25) * 25;
      brief.sqFtTolerancePct = Math.max(1, Math.round(((brief.totalSqFt.max - brief.totalSqFt.min) / 2 / mid) * 100));
    }
  }
  return brief;
}

const ftLabel = (inches?: number) => inches == null ? "" : String(Math.round((inches / 12) * 10) / 10);

// shell_ids entries belonging to one shape family ('ranch' or 'ranch#2').
const shapeEntries = (ids: string[], shapeId: string) =>
  ids.filter(x => x === shapeId || x.startsWith(`${shapeId}#`));

// Mini SVG preview of a shell outline (optionally a concrete variant).
function ShellPreview({ shellId, sqFt, mirror, ratioScale }: { shellId: string; sqFt: number; mirror?: boolean; ratioScale?: number }) {
  const def = SHELLS.find(s => s.id === shellId);
  if (!def) return null;
  const pts = shellOutline({ shellId, sqFt, mirror, ratioScale });
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
  // Submissions per assignment (expanded on demand).
  interface SubRow {
    id: string; student_id: string; student_name: string;
    status: "submitted" | "returned" | "graded";
    grade_total: number | null; submitted_at: string;
  }
  const [subsOpenId, setSubsOpenId] = useState<string | null>(null);
  const [subs, setSubs] = useState<Record<string, SubRow[]>>({});
  // Paper starter sheets: photocopiable shell worksheets on graph paper.
  const [sheetsBusyId, setSheetsBusyId] = useState<string | null>(null);
  const printStarterSheets = async (row: AssignmentRow) => {
    if (sheetsBusyId) return;
    setSheetsBusyId(row.id);
    try {
      const { buildStarterSheetsPdf } = await import("@/app/tools/blueprint-lab/engine/portfolio");
      const blob = await buildStarterSheetsPdf({
        assignmentTitle: row.title,
        totalSqFt: resolveConfig(row).totalSqFt ?? null,
        shellMode: row.shell_mode,
        shellIds: row.shell_ids ?? [],
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${row.title.replace(/[\\/:*?"<>|]+/g, "-")} — paper starter sheets.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setSheetsBusyId(null);
    }
  };
  const toggleSubs = (aid: string) => {
    if (subsOpenId === aid) { setSubsOpenId(null); return; }
    setSubsOpenId(aid);
    fetch(`/api/teacher/blueprint-submissions?assignmentId=${aid}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: SubRow[]) => setSubs(s => ({ ...s, [aid]: rows })));
  };

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
      rubric: cloneRubric(resolveGradingRubric(null)),
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
      rubric: cloneRubric(resolveGradingRubric(row.config as { gradingRubric?: GradingRubric })),
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
        targetSqFt: 1000,
        sqFtTolerancePct: 10,
        totalSqFt: sqFtRangeFor(1000, 10),
        rooms: [],
        frontDoor: true,
        backDoor: false,
        deliverables: ["floor-plan"],
      },
      rubric: cloneRubric(resolveGradingRubric(null)),
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
          config: { ...draft.config, gradingRubric: draft.rubric },
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

  const sqFtMid = draft?.config.targetSqFt
    ?? (draft?.config.totalSqFt
      ? (draft.config.totalSqFt.min + draft.config.totalSqFt.max) / 2
      : 1000);
  const sqRange = draft?.config.totalSqFt ?? { min: 1000, max: 1000 };

  // Toggle one concrete version of a shape. Choice mode: include/exclude it
  // (all four included → stored as the plain shape id; none left → shape
  // dropped). Fixed mode: radio — the clicked version becomes THE shell.
  const toggleVariant = (shapeId: string, idx: number) => {
    setDraft(d => {
      if (!d) return d;
      if (d.shellMode === "fixed") return { ...d, shellIds: [`${shapeId}#${idx}`] };
      const others = d.shellIds.filter(x => x !== shapeId && !x.startsWith(`${shapeId}#`));
      const choice = parseShellIds(shapeEntries(d.shellIds, shapeId))[0];
      const cur = new Set(choice?.indices ?? [0, 1, 2, 3]);
      if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
      if (cur.size === 0) return { ...d, shellIds: others };
      if (cur.size === 4) return { ...d, shellIds: [...others, shapeId] };
      return { ...d, shellIds: [...others, ...[...cur].sort((a, b) => a - b).map(i => `${shapeId}#${i}`)] };
    });
  };

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
            Total square footage<br />
            <input type="number" value={draft.config.targetSqFt ?? ""} style={{ ...inputStyle, width: 80, marginTop: 4 }}
              onChange={e => {
                const target = Number(e.target.value) || 0;
                const tol = draft.config.sqFtTolerancePct ?? 10;
                setDraft({ ...draft, config: { ...draft.config,
                  targetSqFt: target, sqFtTolerancePct: tol, totalSqFt: sqFtRangeFor(target, tol) } });
              }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#444" }}
            title="How far a design may land from the target and still pass the auto check">
            Allow ±%<br />
            <input type="number" min={1} max={50} value={draft.config.sqFtTolerancePct ?? 10}
              style={{ ...inputStyle, width: 56, marginTop: 4 }}
              onChange={e => {
                const tol = Math.min(50, Math.max(1, Number(e.target.value) || 10));
                const target = draft.config.targetSqFt ?? 1000;
                setDraft({ ...draft, config: { ...draft.config,
                  targetSqFt: target, sqFtTolerancePct: tol, totalSqFt: sqFtRangeFor(target, tol) } });
              }} />
          </label>
          {draft.config.targetSqFt != null && (
            <span style={{ fontSize: 11, color: "#888", paddingBottom: 8 }}>
              passes {sqFtRangeFor(draft.config.targetSqFt, draft.config.sqFtTolerancePct ?? 10).min.toLocaleString()}
              –{sqFtRangeFor(draft.config.targetSqFt, draft.config.sqFtTolerancePct ?? 10).max.toLocaleString()} SF
            </span>
          )}
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
                ? { roomType: t, count: 1, minDims: { a: 240, b: 240 }, minDoors: 2,
                    note: "Draw the garage OUTSIDE the shell — the SF target is for the interior. 1-car ≈ 12' × 20', 2-car ≈ 20' × 20'. Needs its garage door PLUS an interior door into the house. Garage area is not counted in total SF." }
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
              const selected = shapeEntries(draft.shellIds, s.id).length > 0;
              // A shape that needs more area than this brief targets is
              // offered grayed-out (no U-shape studios).
              const tooSmall = sqFtMid < s.minSqFt;
              return (
                <div key={s.id}
                  onClick={() => {
                    if (tooSmall) return;
                    setDraft(d => {
                      if (!d) return d;
                      // Fixed mode preselects Version A; the strip below is a radio.
                      if (d.shellMode === "fixed") return { ...d, shellIds: [`${s.id}#0`] };
                      return { ...d, shellIds: selected
                        ? d.shellIds.filter(x => x !== s.id && !x.startsWith(`${s.id}#`))
                        : [...d.shellIds, s.id] };
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
                    {tooSmall ? `needs ${s.minSqFt.toLocaleString()}+ SF`
                      : selected ? "choose versions below" : "4 versions"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Version narrowing: the exact A–D builds students will be offered
            (and the paper starter sheets will print) — same generator as the
            in-app picker, so dimensions here are the real ones. */}
        {draft.shellMode !== "scratch" && SHELLS.filter(s => shapeEntries(draft.shellIds, s.id).length > 0).map(s => {
          const choice = parseShellIds(shapeEntries(draft.shellIds, s.id))[0];
          const fixed = draft.shellMode === "fixed";
          return (
            <div key={s.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#312e81", margin: "4px 0 6px" }}>
                {s.label}
                <span style={{ fontWeight: 500, color: "#6b7280", marginLeft: 8 }}>
                  {fixed ? "— pick the one version every student starts from"
                    : "— uncheck versions you don’t want offered or printed"}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {shellVariants(s.id, sqRange.min, sqRange.max).map((v, i) => {
                  const included = fixed
                    ? (choice.indices?.includes(i) ?? false)
                    : (choice.indices === null || choice.indices.includes(i));
                  const stats = shellStats(v);
                  return (
                    <div key={i} onClick={() => toggleVariant(s.id, i)}
                      style={{ width: 118, padding: "8px 8px 6px", borderRadius: 10, cursor: "pointer",
                        border: included ? `2px solid ${INDIGO}` : "2px solid #e5e7eb",
                        background: included ? "#eef2ff" : "#fff", opacity: included ? 1 : 0.55,
                        textAlign: "center" }}>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <ShellPreview shellId={s.id} sqFt={v.sqFt} mirror={v.mirror} ratioScale={v.ratioScale} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: included ? "#312e81" : "#666", marginTop: 4 }}>
                        {included ? "✓ " : ""}Version {String.fromCharCode(65 + i)}
                      </div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>
                        {stats ? formatShellStats(stats) : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {draft.shellMode !== "scratch" && draft.shellIds.length === 0 && (
          <div style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>
            Pick at least one shape.
          </div>
        )}

        {/* ── Grading rubric builder ─────────────────────────────────── */}
        <div style={{ fontSize: 13, fontWeight: 800, color: "#312e81", margin: "24px 0 4px" }}>
          Grading rubric
          <span style={{ fontWeight: 600, color: "#6b7280", marginLeft: 8, fontSize: 11.5 }}>
            {rubricMaxPoints(rubricForDeliverables(draft.rubric, draft.config.deliverables))} pts max
            · AUTO rows score themselves; you grade the rest
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: "#777", marginBottom: 10 }}>
          Each category has 4 quality tiers. Edit points and wording freely — categories for
          deliverables this assignment doesn&apos;t include are hidden from students automatically.
        </div>
        {rubricForDeliverables(draft.rubric, draft.config.deliverables).categories.map(cat => {
          const catIndex = draft.rubric.categories.findIndex(c => c.id === cat.id);
          const patchCat = (mut: (c: typeof cat) => typeof cat) =>
            setDraft(d => {
              if (!d) return d;
              const categories = d.rubric.categories.map((c, i) => i === catIndex ? mut(c) : c);
              return { ...d, rubric: { ...d.rubric, categories } };
            });
          return (
            <div key={cat.id} style={{ border: CARD_BORDER, borderRadius: 10, padding: "10px 12px", marginBottom: 8, maxWidth: 720 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <input value={cat.name}
                  onChange={e => patchCat(c => ({ ...c, name: e.target.value }))}
                  style={{ ...inputStyle, width: 260, fontWeight: 700 }} />
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                  background: cat.scoring === "auto" ? "#dcfce7" : "#fff4e0",
                  color: cat.scoring === "auto" ? "#15803d" : "#a05a00",
                }}>{cat.scoring === "auto" ? "AUTO" : "TEACHER"}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => setDraft(d => d ? {
                  ...d, rubric: { ...d.rubric, categories: d.rubric.categories.filter(c => c.id !== cat.id) },
                } : d)}
                  title="Remove category"
                  style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer", fontWeight: 800 }}>✕</button>
              </div>
              {cat.tiers.map((tier, ti) => (
                <div key={ti} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                  <input type="number" value={tier.points}
                    onChange={e => patchCat(c => ({
                      ...c,
                      tiers: c.tiers.map((t, i) => i === ti ? { ...t, points: Number(e.target.value) || 0 } : t),
                    }))}
                    style={{ ...inputStyle, width: 52 }} />
                  <textarea value={tier.descriptor} rows={1}
                    onChange={e => patchCat(c => ({
                      ...c,
                      tiers: c.tiers.map((t, i) => i === ti ? { ...t, descriptor: e.target.value } : t),
                    }))}
                    style={{ ...inputStyle, width: "100%", minHeight: 26, resize: "vertical", fontFamily: "inherit" }} />
                </div>
              ))}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <select value="" style={{ ...inputStyle, width: 260 }}
            onChange={e => {
              const idx = Number(e.target.value);
              if (Number.isNaN(idx)) return;
              const preset = TEACHER_CATEGORY_PRESETS[idx];
              if (!preset) return;
              setDraft(d => d ? {
                ...d,
                rubric: {
                  ...d.rubric,
                  categories: [...d.rubric.categories, {
                    ...JSON.parse(JSON.stringify(preset)),
                    id: `custom-${Date.now().toString(36)}`,
                  }],
                },
              } : d);
            }}>
            <option value="">+ Add teacher-graded category…</option>
            {TEACHER_CATEGORY_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!window.confirm("Replace this assignment's rubric with the latest default template? Your edits to it will be lost.")) return;
              setDraft(d => d ? { ...d, rubric: cloneRubric(resolveGradingRubric(null)) } : d);
            }}
            style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", background: "#fff",
              border: "2px solid #d1d5db", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
            Reset rubric to default
          </button>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#312e81", margin: "10px 0 4px" }}>Bonus / penalty</div>
        {draft.rubric.bonuses.map((b, bi) => (
          <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <input value={b.label}
              onChange={e => setDraft(d => d ? {
                ...d, rubric: { ...d.rubric, bonuses: d.rubric.bonuses.map((x, i) => i === bi ? { ...x, label: e.target.value } : x) },
              } : d)}
              style={{ ...inputStyle, width: 280 }} />
            <input type="number" value={b.points}
              onChange={e => setDraft(d => d ? {
                ...d, rubric: { ...d.rubric, bonuses: d.rubric.bonuses.map((x, i) => i === bi ? { ...x, points: Number(e.target.value) || 0 } : x) },
              } : d)}
              style={{ ...inputStyle, width: 60 }} />
            <button onClick={() => setDraft(d => d ? {
              ...d, rubric: { ...d.rubric, bonuses: d.rubric.bonuses.filter((_, i) => i !== bi) },
            } : d)}
              style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer", fontWeight: 800 }}>✕</button>
          </div>
        ))}
        <button
          onClick={() => setDraft(d => d ? {
            ...d, rubric: { ...d.rubric, bonuses: [...d.rubric.bonuses, {
              id: `bonus-${Date.now().toString(36)}`, label: "Bonus", points: 5, scoring: "teacher" as const }] },
          } : d)}
          style={{ fontSize: 12, fontWeight: 700, color: "#4338ca", background: "#eef2ff",
            border: CARD_BORDER, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
          + Add bonus/penalty (negative points = penalty)
        </button>
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
              <button onClick={() => toggleSubs(a.id)}
                style={{ fontSize: 12, fontWeight: 800, color: "#4338ca", cursor: "pointer",
                  padding: "6px 14px", borderRadius: 999, border: `2px solid ${INDIGO}`,
                  background: subsOpenId === a.id ? "#e0e7ff" : "#fff" }}>
                Submissions{subs[a.id] ? ` (${subs[a.id].length})` : ""}
              </button>
              <Link href={`/tools/blueprint-lab?assignment=${a.id}`} target="_blank"
                style={{ fontSize: 12, fontWeight: 800, color: "#4338ca", textDecoration: "none",
                  padding: "6px 14px", borderRadius: 999, border: `2px solid ${INDIGO}`, background: "#eef2ff" }}>
                Preview
              </Link>
              <button onClick={() => printStarterSheets(a)} disabled={sheetsBusyId === a.id}
                title="Photocopiable design worksheets — the assignment's shells printed to scale on graph paper, so students sketch on paper first"
                style={{ fontSize: 12, fontWeight: 800, color: "#4338ca", cursor: sheetsBusyId === a.id ? "default" : "pointer",
                  padding: "6px 14px", borderRadius: 999, border: `2px solid ${INDIGO}`, background: "#fff" }}>
                {sheetsBusyId === a.id ? "Building…" : "Paper sheets"}
              </button>
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
              {subsOpenId === a.id && (
                <div style={{ flexBasis: "100%", borderTop: "1px solid #eef2ff", paddingTop: 10, marginTop: 4 }}>
                  {!subs[a.id] ? (
                    <div style={{ fontSize: 12, color: "#aaa" }}>Loading submissions…</div>
                  ) : subs[a.id].length === 0 ? (
                    <div style={{ fontSize: 12, color: "#888" }}>No submissions yet.</div>
                  ) : (
                    subs[a.id].map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 12.5 }}>
                        <span style={{ fontWeight: 700, color: "#111", minWidth: 160 }}>{s.student_name}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                          background: s.status === "graded" ? "#dcfce7" : s.status === "returned" ? "#fff4e0" : "#e0e7ff",
                          color: s.status === "graded" ? "#15803d" : s.status === "returned" ? "#a05a00" : "#4338ca",
                        }}>{s.status.toUpperCase()}</span>
                        {s.grade_total != null && (
                          <span style={{ fontWeight: 800, color: "#15803d" }}>{s.grade_total} pts</span>
                        )}
                        <span style={{ color: "#999", fontSize: 11 }}>
                          {new Date(s.submitted_at).toLocaleDateString()}
                        </span>
                        <span style={{ flex: 1 }} />
                        <Link
                          href={`/tools/blueprint-lab?asStudent=${s.student_id}&submissionId=${s.id}`}
                          target="_blank"
                          style={{ fontSize: 11.5, fontWeight: 800, color: "#4338ca", textDecoration: "none",
                            padding: "4px 12px", borderRadius: 999, border: `2px solid ${INDIGO}`, background: "#eef2ff" }}>
                          {s.status === "graded" ? "Review grade" : "Grade →"}
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              )}
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
