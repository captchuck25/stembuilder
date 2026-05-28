"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";

const ADMIN_ID = "user_3CPUWnRGbb5UjjJRoKQx2nVQGyu";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: "24px 28px",
};

interface Stats {
  users: { total: number; teachers: number; students: number };
  classes: { total: number; enrollments: number };
  activity: { completedChallenges: number; bridgeDesigns: number; turtleSubmissions: number };
  toolCounts: Record<string, number>;
  recentUsers: { name: string; email: string; role: string; created_at: string }[];
}

interface TeacherRow { id: string; name: string; email: string; created_at: string; classCount: number }
interface StudentRow { id: string; name: string; email: string; created_at: string; enrollmentCount: number }
interface ClassRow { id: string; name: string; join_code: string; teacherName: string; teacherEmail: string; studentCount: number; created_at: string }

type Panel = "teachers" | "students" | "classes" | null;

const TOOL_LABELS: Record<string, string> = {
  "code-lab-python": "Python Code Lab",
  "block-lab": "Block Lab",
  "meas-triple-beam": "Triple Beam Balance",
  "meas-dial-caliper": "Dial Caliper",
  "meas-graduated-cylinder": "Graduated Cylinder",
  "meas-ruler": "Ruler",
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [panel, setPanel] = useState<Panel>(null);
  const [teachers, setTeachers] = useState<TeacherRow[] | null>(null);
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadStats() {
    const r = await fetch("/api/admin/stats");
    const d = await r.json();
    setStats(d);
  }

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || session.user.id !== ADMIN_ID) { router.push("/"); return; }
    loadStats().then(() => setLoading(false));
  }, [status, session?.user?.id]);

  async function openPanel(next: Panel) {
    if (panel === next) { setPanel(null); return; }
    setPanel(next);
    if (next === null) return;

    setPanelLoading(true);
    try {
      if (next === "teachers") {
        const r = await fetch("/api/admin/users?role=teacher");
        setTeachers(await r.json());
      } else if (next === "students") {
        const r = await fetch("/api/admin/users?role=student");
        setStudents(await r.json());
      } else if (next === "classes") {
        const r = await fetch("/api/admin/classes");
        setClasses(await r.json());
      }
    } finally {
      setPanelLoading(false);
    }
  }

  async function deleteUser(u: TeacherRow | StudentRow, kind: "teacher" | "student") {
    const extra = kind === "teacher"
      ? `\n\nAll ${("classCount" in u && u.classCount) || 0} of their classes (and every enrollment + assignment + lock inside) will also be deleted.`
      : `\n\nTheir enrollments and all saved work (progress, bridge designs, turtle submissions) will also be deleted.`;
    if (!confirm(`Delete ${kind} "${u.name}" (${u.email})?${extra}\n\nThis cannot be undone.`)) return;

    setDeletingId(u.id);
    try {
      const r = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (!r.ok) { alert(`Delete failed: ${(await r.json()).error ?? r.statusText}`); return; }
      if (kind === "teacher") {
        setTeachers(prev => prev?.filter(t => t.id !== u.id) ?? null);
      } else {
        setStudents(prev => prev?.filter(s => s.id !== u.id) ?? null);
      }
      await loadStats();
      // A teacher delete cascades into classes — invalidate cached class list.
      if (kind === "teacher") setClasses(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteClass(c: ClassRow) {
    if (!confirm(`Delete class "${c.name}" (taught by ${c.teacherName})?\n\nAll ${c.studentCount} enrollments, assignments, and lesson locks for this class will be deleted.\n\nThis cannot be undone.`)) return;

    setDeletingId(c.id);
    try {
      const r = await fetch(`/api/admin/classes/${c.id}`, { method: "DELETE" });
      if (!r.ok) { alert(`Delete failed: ${(await r.json()).error ?? r.statusText}`); return; }
      setClasses(prev => prev?.filter(x => x.id !== c.id) ?? null);
      await loadStats();
    } finally {
      setDeletingId(null);
    }
  }

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  if (!stats) return null;

  const statCards: { label: string; value: number; color: string; icon: string; panel?: Panel }[] = [
    { label: "Total Users", value: stats.users.total, color: "#2563eb", icon: "👥" },
    { label: "Teachers", value: stats.users.teachers, color: "#7c3aed", icon: "🧑‍🏫", panel: "teachers" },
    { label: "Students", value: stats.users.students, color: "#059669", icon: "🎒", panel: "students" },
    { label: "Classes", value: stats.classes.total, color: "#d97706", icon: "🏫", panel: "classes" },
    { label: "Enrollments", value: stats.classes.enrollments, color: "#0891b2", icon: "📋" },
    { label: "Challenges Completed", value: stats.activity.completedChallenges, color: "#16a34a", icon: "✅" },
    { label: "Bridge Designs", value: stats.activity.bridgeDesigns, color: "#b45309", icon: "🌉" },
    { label: "Turtle Submissions", value: stats.activity.turtleSubmissions, color: "#0d9488", icon: "🐢" },
  ];

  const toolEntries = Object.entries(stats.toolCounts).sort((a, b) => b[1] - a[1]);
  const maxToolCount = Math.max(...toolEntries.map(([, v]) => v), 1);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader />

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 40px" }}>

          {/* Header */}
          <div style={{ ...CARD, marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>
              Admin Dashboard
            </h1>
            <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
              Site-wide statistics for STEM Builder
            </p>
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 20, marginBottom: 32 }}>
            {statCards.map(card => {
              const clickable = !!card.panel;
              const open = panel === card.panel;
              return (
                <div
                  key={card.label}
                  onClick={clickable ? () => openPanel(card.panel!) : undefined}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPanel(card.panel!); } } : undefined}
                  style={{
                    ...CARD,
                    padding: "20px 24px",
                    borderLeft: `6px solid ${card.color}`,
                    cursor: clickable ? "pointer" : "default",
                    transition: "transform 120ms ease, box-shadow 120ms ease",
                    transform: open ? "translateY(-2px)" : undefined,
                    boxShadow: open ? `0 12px 28px rgba(0,0,0,0.18)` : CARD.boxShadow,
                    outline: open ? `2px solid ${card.color}` : undefined,
                    outlineOffset: open ? 2 : undefined,
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginTop: 4,
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span>{card.label}</span>
                    {clickable && (
                      <span style={{ fontSize: 11, color: card.color, fontWeight: 800 }}>
                        {open ? "Hide ▴" : "Manage ▾"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expandable management panel */}
          {panel && (
            <div style={{ ...CARD, marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0 }}>
                  {panel === "teachers" ? "All Teachers" : panel === "students" ? "All Students" : "All Classes"}
                </h2>
                <button
                  onClick={() => setPanel(null)}
                  style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8,
                    padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#374151" }}
                >
                  Close ✕
                </button>
              </div>

              {panelLoading ? (
                <div style={{ fontSize: 13, color: "#888", padding: "16px 0" }}>Loading…</div>
              ) : panel === "teachers" ? (
                <UserList
                  rows={teachers ?? []}
                  kind="teacher"
                  deletingId={deletingId}
                  onDelete={(u) => deleteUser(u, "teacher")}
                />
              ) : panel === "students" ? (
                <UserList
                  rows={students ?? []}
                  kind="student"
                  deletingId={deletingId}
                  onDelete={(u) => deleteUser(u, "student")}
                />
              ) : (
                <ClassList
                  rows={classes ?? []}
                  deletingId={deletingId}
                  onDelete={deleteClass}
                />
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 32 }}>
            {/* Tool usage */}
            <div style={{ ...CARD }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 20, margin: "0 0 20px" }}>
                Tool Usage (completed challenges)
              </h2>
              {toolEntries.length === 0 ? (
                <div style={{ fontSize: 13, color: "#aaa" }}>No data yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {toolEntries.map(([tool, count]) => (
                    <div key={tool}>
                      <div style={{ display: "flex", justifyContent: "space-between",
                        fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                        <span>{TOOL_LABELS[tool] ?? tool}</span>
                        <span>{count}</span>
                      </div>
                      <div style={{ height: 8, background: "#f0f0f0", borderRadius: 999 }}>
                        <div style={{ height: "100%", borderRadius: 999, background: "#2563eb",
                          width: `${Math.round((count / maxToolCount) * 100)}%`,
                          transition: "width 600ms ease" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent signups */}
            <div style={{ ...CARD }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", margin: "0 0 20px" }}>
                Recent Sign-ups
              </h2>
              {stats.recentUsers.length === 0 ? (
                <div style={{ fontSize: 13, color: "#aaa" }}>No users yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {stats.recentUsers.map((u, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: 10, background: "#f9f9f9",
                      border: "1px solid #eee" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{u.email}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                          background: u.role === "teacher" ? "#ede9fe" : "#dcfce7",
                          color: u.role === "teacher" ? "#7c3aed" : "#16a34a" }}>
                          {u.role}
                        </span>
                        <span style={{ fontSize: 11, color: "#aaa" }}>
                          {new Date(u.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}

function UserList<T extends { id: string; name: string; email: string; created_at: string }>({
  rows, kind, deletingId, onDelete,
}: {
  rows: T[];
  kind: "teacher" | "student";
  deletingId: string | null;
  onDelete: (u: T) => void;
}) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 13, color: "#aaa", padding: "16px 0" }}>No {kind}s found.</div>;
  }
  const accent = kind === "teacher" ? "#7c3aed" : "#059669";
  const accentBg = kind === "teacher" ? "#ede9fe" : "#dcfce7";
  return (
    <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
      paddingRight: 4 }}>
      {rows.map(u => {
        const meta = (u as unknown as { classCount?: number; enrollmentCount?: number });
        const right = kind === "teacher"
          ? `${meta.classCount ?? 0} class${(meta.classCount ?? 0) === 1 ? "" : "es"}`
          : `${meta.enrollmentCount ?? 0} enrollment${(meta.enrollmentCount ?? 0) === 1 ? "" : "s"}`;
        const isDeleting = deletingId === u.id;
        return (
          <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: 10, background: "#f9f9f9", border: "1px solid #eee", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
              <div style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: accentBg, color: accent, whiteSpace: "nowrap" }}>
              {right}
            </span>
            <span style={{ fontSize: 11, color: "#aaa", whiteSpace: "nowrap" }}>
              {new Date(u.created_at).toLocaleDateString()}
            </span>
            <button
              onClick={() => onDelete(u)}
              disabled={isDeleting}
              style={{ background: isDeleting ? "#f3f4f6" : "#fee2e2", border: "1px solid #fca5a5",
                color: "#b91c1c", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700,
                cursor: isDeleting ? "wait" : "pointer", whiteSpace: "nowrap" }}
            >
              {isDeleting ? "Deleting…" : "Remove"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ClassList({
  rows, deletingId, onDelete,
}: {
  rows: ClassRow[];
  deletingId: string | null;
  onDelete: (c: ClassRow) => void;
}) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 13, color: "#aaa", padding: "16px 0" }}>No classes found.</div>;
  }
  return (
    <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
      paddingRight: 4 }}>
      {rows.map(c => {
        const isDeleting = deletingId === c.id;
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: 10, background: "#f9f9f9", border: "1px solid #eee", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
                <span style={{ fontSize: 11, fontWeight: 700, color: "#888", marginLeft: 8 }}>
                  · join {c.join_code}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Teacher: {c.teacherName} {c.teacherEmail ? `(${c.teacherEmail})` : ""}
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: "#fef3c7", color: "#b45309", whiteSpace: "nowrap" }}>
              {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
            </span>
            <span style={{ fontSize: 11, color: "#aaa", whiteSpace: "nowrap" }}>
              {new Date(c.created_at).toLocaleDateString()}
            </span>
            <button
              onClick={() => onDelete(c)}
              disabled={isDeleting}
              style={{ background: isDeleting ? "#f3f4f6" : "#fee2e2", border: "1px solid #fca5a5",
                color: "#b91c1c", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700,
                cursor: isDeleting ? "wait" : "pointer", whiteSpace: "nowrap" }}
            >
              {isDeleting ? "Deleting…" : "Remove"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
