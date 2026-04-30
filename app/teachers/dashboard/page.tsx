"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type Class } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import SiteHeader from "@/app/components/SiteHeader";


const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

export default function TeacherDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [creating, setCreating] = useState(false);

  interface LeaderboardRow { rank: number; student_id: string; name: string; email: string; cost: number; assignment_title: string; }
  interface LeaderboardData { overall: LeaderboardRow[]; byAssignment: { title: string; rows: LeaderboardRow[] }[] }
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<"overall" | string>("overall");

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/"); return; }

    // Verify teacher role
    getProfile(session?.user?.id).then(profile => {
      if (!profile) { router.push("/onboarding"); return; }
      if (profile.role !== "teacher") { router.push("/tools/code-lab"); return; }
      loadClasses(session?.user?.id);
    });
  }, [status, session?.user?.id]);

  async function loadClasses(_teacherId: string) {
    const res = await fetch("/api/teacher/classes");
    const data = res.ok ? await res.json() : [];
    const classList: (Class & { studentCount: number })[] = data;
    setClasses(classList);
    const counts: Record<string, number> = {};
    for (const c of classList) counts[c.id] = c.studentCount ?? 0;
    setStudentCounts(counts);
    setLoading(false);
  }

  async function loadOverallLeaderboard() {
    setLoadingLeaderboard(true);
    const res = await fetch("/api/teacher/bridge-overall-leaderboard");
    if (res.ok) setLeaderboardData(await res.json());
    setLoadingLeaderboard(false);
  }

  async function createClass() {
    if (!newClassName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClassName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setClasses(prev => [data, ...prev]);
      setStudentCounts(prev => ({ ...prev, [data.id]: 0 }));
    }
    setNewClassName("");
    setShowCreate(false);
    setCreating(false);
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
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, opacity: 0.85 }}>
            {session.user.name}
          </span>
        )}
      </SiteHeader>

      {/* Main */}
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 40px" }}>

          {/* Page title */}
          <div style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 28, flexWrap: "wrap", gap: 16, padding: "22px 28px" }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: 0 }}>
                Teacher Dashboard
              </h1>
              <p style={{ fontSize: 14, color: "#555", margin: "4px 0 0" }}>
                Manage your classes and track student progress.
              </p>
            </div>
            <button onClick={() => setShowCreate(true)} style={{
              padding: "12px 24px", borderRadius: 12, background: "#2563eb",
              color: "#fff", border: "none", fontWeight: 800, fontSize: 15,
              cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
            }}>
              + New Class
            </button>
          </div>

          {/* Create class modal */}
          {showCreate && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
              <div style={{ ...CARD, padding: "36px 32px", width: 400, maxWidth: "90vw" }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 6 }}>
                  Create a New Class
                </h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  A join code will be generated automatically for your students.
                </p>
                <input
                  autoFocus
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createClass()}
                  placeholder="e.g. Period 3 — Engineering"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e0e0e0",
                    fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box",
                    fontFamily: "system-ui,sans-serif", color: "#111", background: "#fff" }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={() => { setShowCreate(false); setNewClassName(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "2px solid #e0e0e0",
                      background: "#f5f5f5", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#555" }}>
                    Cancel
                  </button>
                  <button onClick={createClass} disabled={!newClassName.trim() || creating}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none",
                      background: newClassName.trim() ? "#2563eb" : "#ccc",
                      color: "#fff", fontWeight: 800, fontSize: 14,
                      cursor: newClassName.trim() ? "pointer" : "not-allowed" }}>
                    {creating ? "Creating…" : "Create Class"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Classes grid */}
          {classes.length === 0 ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🏫</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 8 }}>
                No classes yet
              </h2>
              <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
                Create your first class to get started. Students join with the class code you give them.
              </p>
              <button onClick={() => setShowCreate(true)} style={{
                padding: "12px 28px", borderRadius: 12, background: "#2563eb",
                color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                + Create Your First Class
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 24 }}>
              {classes.map(cls => (
                <div key={cls.id} style={{ ...CARD, padding: "24px 26px" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 4 }}>
                    {cls.name}
                  </div>
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
                    {studentCounts[cls.id] ?? 0} student{studentCounts[cls.id] !== 1 ? "s" : ""} enrolled
                  </div>

                  {/* Join code */}
                  <div style={{ background: "#f0f4ff", border: "2px solid #c7d7fd",
                    borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#3730a3",
                      textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                      Student Join Code
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#2563eb",
                      letterSpacing: "4px", fontFamily: "monospace" }}>
                      {cls.join_code}
                    </div>
                    <div style={{ fontSize: 11, color: "#6366f1", marginTop: 4 }}>
                      Share this code with your students
                    </div>
                  </div>

                  <Link href={`/teachers/classes/${cls.id}`}
                    style={{ display: "block", padding: "10px", borderRadius: 10,
                      background: "#1f1f1f", color: "#fff", textAlign: "center",
                      fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                    View Class →
                  </Link>
                </div>
              ))}
            </div>
          )}
          {/* Overall Bridge Leaderboard */}
          {classes.length > 0 && (
            <div style={{ ...CARD, marginTop: 32, padding: "24px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showLeaderboard ? 20 : 0 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0 }}>
                    🌉 Bridge Leaderboard — All Classes
                  </h2>
                  <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>
                    Individual standings across all your classes, ranked by lowest cost.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!showLeaderboard && leaderboardData === null) loadOverallLeaderboard();
                    setShowLeaderboard(v => !v);
                  }}
                  style={{ padding: "9px 20px", borderRadius: 99, border: "2px solid #1f1f1f",
                    background: showLeaderboard ? "#1f1f1f" : "#fff",
                    color: showLeaderboard ? "#fff" : "#111",
                    fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {showLeaderboard ? "Hide" : "Show Leaderboard"}
                </button>
              </div>

              {showLeaderboard && (
                loadingLeaderboard ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#888", fontWeight: 600 }}>Loading…</div>
                ) : !leaderboardData || (leaderboardData.overall.length === 0) ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
                    No passing bridge submissions yet.
                  </div>
                ) : (() => {
                  const tabs = [{ key: "overall", label: "Overall" }, ...leaderboardData.byAssignment.map(a => ({ key: a.title, label: a.title }))];
                  const activeRows = leaderboardTab === "overall"
                    ? leaderboardData.overall
                    : (leaderboardData.byAssignment.find(a => a.title === leaderboardTab)?.rows ?? []);
                  const showChallenge = leaderboardTab === "overall";
                  return (
                    <div>
                      {/* Tabs */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                        {tabs.map(tab => (
                          <button key={tab.key} onClick={() => setLeaderboardTab(tab.key)}
                            style={{ padding: "7px 16px", borderRadius: 99, border: "2px solid",
                              borderColor: leaderboardTab === tab.key ? "#2563eb" : "#e5e7eb",
                              background: leaderboardTab === tab.key ? "#2563eb" : "#fff",
                              color: leaderboardTab === tab.key ? "#fff" : "#374151",
                              fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      {/* Table */}
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              {["Rank", "Student", showChallenge ? "Best Cost" : "Cost", ...(showChallenge ? ["Challenge"] : [])].map(h => (
                                <th key={h} style={{ padding: "8px 14px", fontWeight: 800, fontSize: 12,
                                  color: "#555", textTransform: "uppercase", letterSpacing: "0.4px",
                                  background: "#f9fafb", borderBottom: "2px solid #e5e7eb",
                                  textAlign: h === "Rank" ? "center" : "left", whiteSpace: "nowrap" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeRows.map(row => (
                              <tr key={row.student_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                                <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800, fontSize: 15 }}>
                                  {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                                </td>
                                <td style={{ padding: "10px 14px" }}>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{row.name}</div>
                                  <div style={{ fontSize: 11, color: "#888" }}>{row.email}</div>
                                </td>
                                <td style={{ padding: "10px 14px", fontWeight: 800, fontSize: 14,
                                  color: row.rank <= 3 ? "#16a34a" : "#111" }}>
                                  ${row.cost.toLocaleString()}
                                </td>
                                {showChallenge && (
                                  <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>
                                    {row.assignment_title}
                                  </td>
                                )}
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
          )}

        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
