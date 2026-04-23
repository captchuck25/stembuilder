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

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || session.user.id !== ADMIN_ID) { router.push("/"); return; }
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); });
  }, [status, session?.user?.id]);

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  if (!stats) return null;

  const statCards = [
    { label: "Total Users", value: stats.users.total, color: "#2563eb", icon: "👥" },
    { label: "Teachers", value: stats.users.teachers, color: "#7c3aed", icon: "🧑‍🏫" },
    { label: "Students", value: stats.users.students, color: "#059669", icon: "🎒" },
    { label: "Classes", value: stats.classes.total, color: "#d97706", icon: "🏫" },
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
            {statCards.map(card => (
              <div key={card.label} style={{ ...CARD, padding: "20px 24px",
                borderLeft: `6px solid ${card.color}` }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginTop: 4 }}>{card.label}</div>
              </div>
            ))}
          </div>

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
