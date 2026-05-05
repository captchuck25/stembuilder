"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import SiteHeader from "@/app/components/SiteHeader";
import { fetchCodeLabProgress, fetchBlockLabProgress, fetchToolScores, fetchBridgeDesigns, deleteBridgeDesign, fetchTurtleSubmissions, fetchStemSketchDesigns, deleteStemSketchDesign, ProgressRow, ScoreRow, BridgeDesign, TurtleSubmission, StemSketchDesign } from "@/lib/achievements";
import { CHALLENGES as TURTLE_CHALLENGES } from "@/app/tools/code-lab/turtle/challenges";

// ─── Static metadata ──────────────────────────────────────────────────────────

const CODE_LEVELS = [
  { id: 1, title: "Commands",      color: "#2563eb", challenges: 10, quizTotal: 6 },
  { id: 2, title: "For Loops",     color: "#16a34a", challenges: 10, quizTotal: 6 },
  { id: 3, title: "If Statements", color: "#dc2626", challenges: 10, quizTotal: 6 },
  { id: 4, title: "While Loops",   color: "#7c3aed", challenges: 10, quizTotal: 6 },
  { id: 5, title: "elif and else", color: "#059669", challenges: 10, quizTotal: 6 },
];

const CYLINDER_SIZES = ["10 mL", "25 mL", "50 mL", "100 mL"];

const MEAS_TOOLS = [
  {
    key: "meas-ruler", label: "Ruler", icon: "📏", href: "/tools/measurement-lab/ruler",
    variants: [
      { li: 0, ci: 0, label: "Inches ½\"" },
      { li: 0, ci: 1, label: "Inches ¼\"" },
      { li: 0, ci: 2, label: "Inches ⅛\"" },
      { li: 0, ci: 3, label: "Inches 1/16\"" },
      { li: 1, ci: 0, label: "Metric cm" },
      { li: 1, ci: 1, label: "Metric 5mm" },
      { li: 1, ci: 2, label: "Metric 2mm" },
      { li: 1, ci: 3, label: "Metric 1mm" },
    ],
  },
  {
    key: "meas-cylinder", label: "Graduated Cylinder", icon: "🧪",
    href: "/tools/measurement-lab/graduated-cylinder",
    variants: [
      ...CYLINDER_SIZES.flatMap((sz, i) => [
        { li: i, ci: 0, label: `${sz} Read` },
        { li: i, ci: 1, label: `${sz} Measure` },
      ]),
    ],
  },
  {
    key: "meas-triple-beam", label: "Triple Beam Balance", icon: "⚖️",
    href: "/tools/measurement-lab/triple-beam",
    variants: [
      { li: 0, ci: 0, label: "Read the Balance" },
      { li: 0, ci: 1, label: "Balance It" },
    ],
  },
  {
    key: "meas-dial-caliper", label: "Dial Caliper", icon: "🔧",
    href: "/tools/measurement-lab/dial-caliper",
    variants: [
      { li: 0, ci: 0, label: "Inches — Read" },
      { li: 0, ci: 1, label: "Inches — Set" },
      { li: 1, ci: 0, label: "mm — Read" },
      { li: 1, ci: 1, label: "mm — Set" },
    ],
  },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: "#aaa",
  textTransform: "uppercase", letterSpacing: "0.7px",
};


// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, href, linkLabel }: {
  icon: string; title: string; href: string; linkLabel: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #f0f0f0" }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#111" }}>
        {icon} {title}
      </h2>
      <Link href={href} style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed",
        textDecoration: "none" }}>
        {linkLabel} →
      </Link>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null || score === 0) {
    return <span style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>—</span>;
  }
  return (
    <span style={{ fontSize: 14, fontWeight: 800, color: "#7c3aed",
      background: "#f5f3ff", padding: "2px 8px", borderRadius: 6 }}>
      {score}
    </span>
  );
}

// ─── Block Lab section ────────────────────────────────────────────────────────

const BLOCK_MODULES = [
  { id: 1, title: "Events & Movement", color: "#2563eb", challenges: 10, quizTotal: 6 },
  { id: 2, title: "Sprites & Interaction", color: "#16a34a", challenges: 0, quizTotal: 0 },
  { id: 3, title: "Loops & Animation", color: "#dc2626", challenges: 0, quizTotal: 0 },
  { id: 4, title: "Conditionals & Logic", color: "#7c3aed", challenges: 0, quizTotal: 0 },
  { id: 5, title: "Variables & Final Mission", color: "#059669", challenges: 0, quizTotal: 0 },
];

function BlockLabSection({ rows }: { rows: ProgressRow[] }) {
  const activeModules = BLOCK_MODULES.filter(m => m.challenges > 0);
  return (
    <div style={{ ...CARD, padding: "20px 24px", marginBottom: 16 }}>
      <SectionHeader icon="🧩" title="Code Lab — Blocks" href="/tools/block-lab" linkLabel="Go to Block Lab" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {activeModules.map((mod, mi) => {
          const moduleRows = rows.filter(r => r.level_idx === mi);
          const challengeRows = moduleRows.filter(r => r.challenge_idx !== null && r.challenge_idx >= 0);
          const done = challengeRows.filter(r => r.completed).length;
          const quizRow = moduleRows.find(r => (r.challenge_idx === null || r.challenge_idx === -1) && r.quiz_score != null);
          const pct = mod.challenges > 0 ? done / mod.challenges : 0;
          const started = done > 0 || quizRow != null;
          return (
            <div key={mi}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%",
                  background: started ? mod.color : "#e5e7eb", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900, color: started ? "#fff" : "#aaa" }}>
                  {mod.id}
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: started ? "#111" : "#aaa", minWidth: 180 }}>
                  {mod.title}
                </span>
                <div style={{ flex: 1, height: 10, background: "#f0f0f0", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct * 100}%`,
                    background: mod.color, borderRadius: 99, transition: "width 600ms" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#888", minWidth: 48, textAlign: "right" }}>
                  {done}/{mod.challenges}
                </span>
                <div style={{ minWidth: 90, textAlign: "right" }}>
                  {quizRow ? (
                    <span style={{ fontSize: 12, fontWeight: 700,
                      color: (quizRow.quiz_score ?? 0) >= mod.quizTotal * 0.8 ? "#16a34a" : "#f59e0b",
                      background: (quizRow.quiz_score ?? 0) >= mod.quizTotal * 0.8 ? "#f0fdf4" : "#fffbeb",
                      padding: "2px 8px", borderRadius: 6 }}>
                      Quiz {quizRow.quiz_score}/{mod.quizTotal}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>Quiz —</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Code Lab section ─────────────────────────────────────────────────────────

function CodeLabSection({ rows }: { rows: ProgressRow[] }) {
  return (
    <div style={{ ...CARD, padding: "20px 24px", marginBottom: 16 }}>
      <SectionHeader icon="💻" title="Code Lab — Python" href="/tools/code-lab/python" linkLabel="Go to Code Lab" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {CODE_LEVELS.map((lv, li) => {
          const levelRows = rows.filter(r => r.level_idx === li);
          const challengeRows = levelRows.filter(r => r.challenge_idx !== null && r.challenge_idx >= 0);
          const done = challengeRows.filter(r => r.completed).length;
          const quizRow = levelRows.find(r => (r.challenge_idx === null || r.challenge_idx === -1) && r.quiz_score != null);
          const pct = lv.challenges > 0 ? done / lv.challenges : 0;
          const started = done > 0 || quizRow != null;

          return (
            <div key={li}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                {/* Level dot */}
                <div style={{ width: 28, height: 28, borderRadius: "50%",
                  background: started ? lv.color : "#e5e7eb", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900, color: started ? "#fff" : "#aaa" }}>
                  {lv.id}
                </div>
                {/* Level name */}
                <span style={{ fontSize: 14, fontWeight: 800, color: started ? "#111" : "#aaa",
                  minWidth: 130 }}>
                  {lv.title}
                </span>
                {/* Progress bar */}
                <div style={{ flex: 1, height: 10, background: "#f0f0f0", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct * 100}%`,
                    background: lv.color, borderRadius: 99, transition: "width 600ms" }} />
                </div>
                {/* Count */}
                <span style={{ fontSize: 12, fontWeight: 700, color: "#888", minWidth: 48, textAlign: "right" }}>
                  {done}/{lv.challenges}
                </span>
                {/* Quiz badge */}
                <div style={{ minWidth: 90, textAlign: "right" }}>
                  {quizRow ? (
                    <span style={{ fontSize: 12, fontWeight: 700,
                      color: (quizRow.quiz_score ?? 0) >= lv.quizTotal * 0.8 ? "#16a34a" : "#f59e0b",
                      background: (quizRow.quiz_score ?? 0) >= lv.quizTotal * 0.8 ? "#f0fdf4" : "#fffbeb",
                      padding: "2px 8px", borderRadius: 6 }}>
                      Quiz {quizRow.quiz_score}/{lv.quizTotal}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>Quiz —</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bridge section ───────────────────────────────────────────────────────────

function BridgeSection({ designs, onDeleted }: { designs: BridgeDesign[]; onDeleted: (id: string) => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirmId) return;
    setDeleting(true);
    await deleteBridgeDesign(confirmId);
    onDeleted(confirmId);
    setConfirmId(null);
    setDeleting(false);
  }

  const confirmDesign = designs.find(d => d.id === confirmId);

  return (
    <div style={{ ...CARD, padding: "20px 24px", marginBottom: 16 }}>
      <SectionHeader icon="🌉" title="Bridge Builder" href="/tools/bridge" linkLabel="Open Builder" />

      {/* Confirmation dialog */}
      {confirmId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", border: "2px solid #1f1f1f", borderRadius: 16,
            padding: "28px 32px", maxWidth: 400, width: "90%", textAlign: "center",
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, color: "#111" }}>
              Delete this bridge?
            </h3>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#555" }}>
              <strong>"{confirmDesign?.name}"</strong> will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => setConfirmId(null)}
                style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #d1d5db",
                  background: "#fff", color: "#111", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ padding: "10px 24px", borderRadius: 8, border: "none",
                  background: deleting ? "#fca5a5" : "#dc2626", color: "#fff",
                  fontWeight: 700, fontSize: 14, cursor: deleting ? "not-allowed" : "pointer" }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {designs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#aaa" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏗️</div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No designs saved yet.</p>
          <Link href="/tools/bridge" style={{ fontSize: 13, color: "#7c3aed", fontWeight: 700,
            textDecoration: "none" }}>Build your first bridge →</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {designs.map(d => {
            const isAssignment = d.name.startsWith('asgn_');
            const displayName = isAssignment ? '🌉 Assignment Bridge' : d.name;
            return (
            <div key={d.id} style={{ background: isAssignment ? "#fffbeb" : "#fafafa",
              border: `2px solid ${isAssignment ? "#fde68a" : "#e5e7eb"}`,
              borderRadius: 12, padding: "14px 18px", transition: "border-color 150ms" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = isAssignment ? "#d97706" : "#7c3aed")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = isAssignment ? "#fde68a" : "#e5e7eb")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Link href={`/tools/bridge?id=${d.id}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#111", marginBottom: 6 }}>
                    {displayName}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "nowrap", alignItems: "center",
                    overflow: "hidden" }}>
                    {d.span_feet != null && <>
                      <span style={{ ...SECTION_LABEL }}>Span</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>{d.span_feet} ft</span>
                    </>}
                    {d.load_lb != null && <>
                      <span style={{ ...SECTION_LABEL }}>Load</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>{d.load_lb.toLocaleString()} lb</span>
                    </>}
                    <span style={{ ...SECTION_LABEL }}>Members</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{(d.members as unknown[]).length}</span>
                    <span style={{ ...SECTION_LABEL }}>Nodes</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{(d.nodes as unknown[]).length}</span>
                    {d.cost != null && <>
                      <span style={{ ...SECTION_LABEL }}>Cost</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#333", whiteSpace: "nowrap" }}>${d.cost.toFixed(2)}</span>
                    </>}
                    {d.passed != null && (
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 6,
                        whiteSpace: "nowrap", flexShrink: 0,
                        background: d.passed ? "#f0fdf4" : "#fef2f2",
                        color: d.passed ? "#16a34a" : "#dc2626",
                      }}>
                        {d.passed ? "✓ Passed" : "✗ Failed"}
                      </span>
                    )}
                  </div>
                  {d.designer_name && (
                    <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>Designer: {d.designer_name}</div>
                  )}
                </Link>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0, marginLeft: 16 }}>
                  <Link href={`/tools/bridge?id=${d.id}`}
                    style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", textDecoration: "none" }}>
                    Open →
                  </Link>
                  <button onClick={() => setConfirmId(d.id)}
                    style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", background: "none",
                      border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 10px",
                      cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Measurement Lab section ──────────────────────────────────────────────────

function MeasurementSection({ scores }: { scores: ScoreRow[] }) {
  function getScore(tool: string, li: number, ci: number): number | null {
    const row = scores.find(r => r.tool === tool && r.level_idx === li && r.challenge_idx === ci);
    return row?.quiz_score ?? null;
  }

  return (
    <div style={{ ...CARD, padding: "20px 24px" }}>
      <SectionHeader icon="📏" title="Measurement Lab" href="/tools/measurement-lab" linkLabel="Go to Lab" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {MEAS_TOOLS.map(tool => {
          // Best score across all variants
          const best = Math.max(0, ...tool.variants.map(v => getScore(tool.key, v.li, v.ci) ?? 0));
          const hasData = tool.variants.some(v => (getScore(tool.key, v.li, v.ci) ?? 0) > 0);

          return (
            <Link key={tool.key} href={tool.href} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fafafa", border: "2px solid #e5e7eb", borderRadius: 12,
                padding: "14px 16px", cursor: "pointer", transition: "border-color 150ms",
                height: "100%", boxSizing: "border-box" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#7c3aed")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#e5e7eb")}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{tool.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#333", marginBottom: 10 }}>
                  {tool.label}
                </div>
                {tool.variants.length === 1 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={SECTION_LABEL}>Best score</span>
                    <ScoreBadge score={hasData ? best : null} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {tool.variants.map(v => {
                      const s = getScore(tool.key, v.li, v.ci);
                      if (s == null || s === 0) return null;
                      return (
                        <div key={`${v.li}-${v.ci}`}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>{v.label}</span>
                          <ScoreBadge score={s} />
                        </div>
                      );
                    })}
                    {!hasData && <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>No scores yet</span>}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Turtle section ───────────────────────────────────────────────────────────

function TurtleSection({ completedIds, submissions }: { completedIds: Set<string>; submissions: TurtleSubmission[] }) {
  const tutorials   = TURTLE_CHALLENGES.filter(c => c.category === "tutorial");
  const challenges  = TURTLE_CHALLENGES.filter(c => c.category === "challenge");
  const tutsDone    = tutorials.filter(t => completedIds.has(t.id)).length;
  const allTutsDone = tutsDone === tutorials.length;
  const pct         = tutorials.length > 0 ? tutsDone / tutorials.length : 0;

  return (
    <div style={{ ...CARD, padding: "20px 24px", marginBottom: 16 }}>
      <SectionHeader icon="🐢" title="Code Lab — Turtle" href="/tools/code-lab/turtle" linkLabel="Go to Turtle" />

      {/* Tutorial progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 10, background: "#f0f0f0", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct * 100}%`,
            background: "#059669", borderRadius: 99, transition: "width 600ms" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#888", whiteSpace: "nowrap" }}>
          {tutsDone}/{tutorials.length} tutorials
        </span>
      </div>

      {/* Tutorial rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {tutorials.map((t, i) => {
          const done = completedIds.has(t.id);
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                background: done ? "#059669" : "#e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 900, color: done ? "#fff" : "#aaa" }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: done ? "#111" : "#aaa" }}>
                {t.title.replace(/^\d+\.\s*/, "")}
              </span>
              {done && (
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800,
                  color: "#059669", background: "#f0fdf4",
                  padding: "2px 8px", borderRadius: 6 }}>
                  Complete
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Creative challenges */}
      <div style={{ borderTop: "2px solid #f0f0f0", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: allTutsDone ? "#111" : "#aaa" }}>
            🎨 Creative Challenges
          </div>
          {!allTutsDone && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af" }}>
              🔒 Complete all tutorials to unlock
            </span>
          )}
        </div>
        {submissions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {challenges.map(ch => {
              const sub = submissions.find(s => s.challenge_id === ch.id);
              if (!sub) return null;
              const isSubmitted = !!sub.submitted_at;
              const borderColor = sub.approved === true ? "#10b981"
                : sub.approved === false ? "#dc2626"
                : isSubmitted ? "#8b5cf6" : "#3b82f6";
              const badge = sub.approved === true
                ? { label: "✓ Approved", bg: "#f0fdf4", color: "#065f46" }
                : sub.approved === false
                ? { label: "✗ Not yet", bg: "#fef2f2", color: "#dc2626" }
                : isSubmitted
                ? { label: "⏳ Pending", bg: "#faf5ff", color: "#7c3aed" }
                : { label: "💾 Saved", bg: "#eff6ff", color: "#2563eb" };
              return (
                <Link key={ch.id} href={`/tools/code-lab/turtle?challenge=${ch.id}`}
                  style={{ textDecoration: "none", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 4 }}>
                  <div style={{ border: `2px solid ${borderColor}`, borderRadius: 8,
                    overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
                    transition: "box-shadow 150ms" }}>
                    <img src={sub.image_data} alt={ch.title} width={90} height={90}
                      style={{ display: "block" }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#555", textAlign: "center",
                    maxWidth: 90, lineHeight: 1.3 }}>{ch.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: badge.color,
                    background: badge.bg, padding: "1px 6px", borderRadius: 4 }}>
                    {badge.label}
                  </span>
                </Link>
              );
            }).filter(Boolean)}
          </div>
        )}
        {allTutsDone && submissions.length === 0 && (
          <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>
            No work saved yet. Head to Turtle to start!
          </p>
        )}
      </div>
    </div>
  );
}

// ─── STEM Sketch section ──────────────────────────────────────────────────────

function StemSketchSection({ designs, onDeleted }: {
  designs: StemSketchDesign[];
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function requestDelete(id: string) {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmId(id);
    confirmTimerRef.current = setTimeout(() => setConfirmId(null), 3000);
  }

  async function handleDelete(id: string) {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmId(null);
    setDeleting(id);
    await deleteStemSketchDesign(id);
    onDeleted(id);
    setDeleting(null);
  }

  return (
    <div style={{ ...CARD, padding: "20px 24px", marginBottom: 16 }}>
      <SectionHeader icon="✏️" title="STEM Sketch" href="/tools/stem-sketch" linkLabel="Open STEM Sketch" />
      {designs.length === 0 ? (
        <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
          No saved designs yet. Open STEM Sketch and save your first design!
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {designs.map(d => (
            <div key={d.id} style={{ borderRadius: 12, border: "2px solid #e5e7eb", background: "#f9fafb",
              overflow: "hidden", width: 200, flexShrink: 0, display: "flex", flexDirection: "column" }}>
              {/* Thumbnail */}
              <div style={{ width: "100%", height: 130, background: "#eef0f6", overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                {d.thumbnail ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={d.thumbnail} alt={d.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <span style={{ fontSize: 36, opacity: 0.25 }}>✏️</span>
                )}
              </div>
              {/* Info + delete */}
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "flex-start",
                justifyContent: "space-between", gap: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#111",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {d.units} · {new Date(d.updated_at).toLocaleDateString()}
                  </div>
                </div>
                {confirmId === d.id ? (
                  <button
                    onClick={() => handleDelete(d.id)}
                    disabled={deleting === d.id}
                    style={{ padding: "4px 10px", borderRadius: 6, border: "2px solid #dc2626",
                      background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 11, flexShrink: 0,
                      cursor: "pointer", whiteSpace: "nowrap" }}>
                    Sure?
                  </button>
                ) : (
                  <button
                    onClick={() => requestDelete(d.id)}
                    disabled={deleting === d.id}
                    style={{ padding: "4px 10px", borderRadius: 6, border: "2px solid #e5e7eb",
                      background: "#fff", color: "#888", fontWeight: 700, fontSize: 11, flexShrink: 0,
                      cursor: deleting === d.id ? "not-allowed" : "pointer", opacity: deleting === d.id ? 0.5 : 1 }}>
                    {deleting === d.id ? "…" : "✕"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AchievementsPage() {
  const { data: session, status } = useSession();
  const [codeLabRows,    setCodeLabRows]    = useState<ProgressRow[]>([]);
  const [blockLabRows,   setBlockLabRows]   = useState<ProgressRow[]>([]);
  const [measScores,     setMeasScores]     = useState<ScoreRow[]>([]);
  const [bridgeDesigns,  setBridgeDesigns]  = useState<BridgeDesign[]>([]);
  const [sketchDesigns,  setSketchDesigns]  = useState<StemSketchDesign[]>([]);
  const [dataLoading,    setDataLoading]    = useState(true);
  const [turtleCompleted,    setTurtleCompleted]    = useState<Set<string>>(new Set());
  const [turtleSubmissions,  setTurtleSubmissions]  = useState<TurtleSubmission[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("turtle_completed");
      if (saved) setTurtleCompleted(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "loading" || !session?.user?.id) { setDataLoading(false); return; }
    const uid = session.user.id;

    Promise.all([
      fetchCodeLabProgress(uid),
      fetchBlockLabProgress(uid),
      fetchToolScores(uid),
      fetchBridgeDesigns(uid),
      fetchTurtleSubmissions(uid),
      fetchStemSketchDesigns(),
    ]).then(([cl, bl, ms, bd, ts, sk]) => {
      setCodeLabRows(cl);
      setBlockLabRows(bl);
      setMeasScores(ms);
      setBridgeDesigns(bd);
      setTurtleSubmissions(ts);
      setSketchDesigns(sk);
      setDataLoading(false);
    });
  }, [status, session?.user?.id]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      fontFamily: "system-ui, sans-serif" }}>
      <SiteHeader />

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 24px" }}>

          {/* Page title */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", margin: "0 0 4px",
              textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
              🏆 My Work
            </h1>
            {session?.user && (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", margin: 0, fontWeight: 600 }}>
                {session.user.name ?? session.user.email}
              </p>
            )}
          </div>

          {/* Not signed in */}
          {status !== "loading" && !session?.user && (
            <div style={{ ...CARD, padding: "60px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 8 }}>
                Sign in to see your progress
              </h2>
              <p style={{ color: "#666", marginBottom: 0 }}>
                Your achievements are saved to your account.
              </p>
            </div>
          )}

          {/* Loading */}
          {status !== "loading" && session?.user && dataLoading && (
            <div style={{ ...CARD, padding: "60px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "#888", fontWeight: 600 }}>Loading your progress…</div>
            </div>
          )}

          {/* Content */}
          {status !== "loading" && session?.user && !dataLoading && (
            <>
              <CodeLabSection rows={codeLabRows} />
              <BlockLabSection rows={blockLabRows} />
              <TurtleSection completedIds={turtleCompleted} submissions={turtleSubmissions} />
              <BridgeSection
                designs={bridgeDesigns}
                onDeleted={id => setBridgeDesigns(prev => prev.filter(d => d.id !== id))}
              />
              <StemSketchSection
                designs={sketchDesigns}
                onDeleted={id => setSketchDesigns(prev => prev.filter(d => d.id !== id))}
              />
              <MeasurementSection scores={measScores} />
            </>
          )}
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
